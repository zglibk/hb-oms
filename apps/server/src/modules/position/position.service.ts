import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  EXPORT_ROW_LIMIT,
  POSITION_NATURE,
  POSITION_NATURE_OPTIONS,
  positionNatureLabel,
} from '@hb-oms/shared';
import { Position } from './entities/position.entity';
import { JobLevel } from './entities/job-level.entity';
import { Department } from '../system/entities/department.entity';
import {
  CreatePositionDto,
  PositionOptionQueryDto,
  QueryPositionDto,
  UpdatePositionDto,
} from './dto/position.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { NumberGeneratorService } from '../../common/services/number-generator.service';

/** 岗位编码前缀：POS + 3 位流水（POS001…），全局递增不按部门分组 */
const POSITION_CODE_PREFIX = 'POS';
const POSITION_CODE_WIDTH = 3;

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(Position)
    private readonly repo: Repository<Position>,
    private readonly numberGen: NumberGeneratorService,
  ) {}

  async findList(query: QueryPositionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('p');

    if (query.status != null) qb.andWhere('p.status = :st', { st: query.status });
    if (query.positionNature) qb.andWhere('p.positionNature = :pn', { pn: query.positionNature });
    if (query.jobLevelId != null) qb.andWhere('p.jobLevelId = :jl', { jl: query.jobLevelId });
    if (query.onlyCommon) qb.andWhere('p.deptId IS NULL');
    else if (query.deptId != null) qb.andWhere('p.deptId = :did', { did: query.deptId });
    if (query.keyword) {
      qb.andWhere('(p.positionCode LIKE :kw OR p.positionName LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    qb.orderBy('p.sort', 'ASC')
      .addOrderBy('p.positionCode', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const list = await this.attachCounts(rows);
    return { list, total, page, pageSize };
  }

  /**
   * 下拉专用：只回启用岗位。
   *
   * **跨页引用型只读接口，刻意只要求登录**（§2.1）：给员工建档的 HR 未必有
   * 「基础数据」菜单，挂 basic:position 会让人事档案的岗位下拉直接 403。
   * 投影收窄到下拉需要的字段，编制人数/备注/审计信息不外露。
   *
   * 传了 deptId 就回「该部门岗位 + 通用岗位（dept_id 为空）」——通用岗位必须带上，
   * 否则「文员」「司机」这类跨部门岗位在任何部门下都选不到。
   */
  async findOptions(query: PositionOptionQueryDto) {
    const qb = this.repo
      .createQueryBuilder('p')
      .select(['p.id', 'p.positionCode', 'p.positionName', 'p.deptId', 'p.positionNature'])
      .where('p.status = 1');
    if (query.deptId != null) {
      qb.andWhere('(p.deptId = :did OR p.deptId IS NULL)', { did: query.deptId });
    }
    return qb.orderBy('p.sort', 'ASC').addOrderBy('p.positionCode', 'ASC').getMany();
  }

  async findOne(id: number) {
    const row = await this.mustGet(id);
    const [one] = await this.attachCounts([row]);
    return one;
  }

  /** 新增：编码由服务端自动采番，客户端传了也不采信 */
  async create(dto: CreatePositionDto, user: CurrentUserPayload) {
    const payload = await this.normalize(dto);
    const positionCode = await this.generateCode();
    const saved = await this.repo.save(
      this.repo.create({ ...payload, positionCode, ...auditOnCreate(user) }),
    );
    return { id: saved.id, positionCode };
  }

  /**
   * 编辑：**编码不可改**（恒取库中值）。
   * 编码是唯一业务键，自动生成后就没有手工改的理由；放开反而会让
   * 「按编码对账」的外部台账对不上号。要换编码只能删了重建。
   */
  async update(id: number, dto: UpdatePositionDto, user: CurrentUserPayload) {
    const row = await this.mustGet(id);
    const payload = await this.normalize(dto);
    await this.repo.update(id, {
      ...payload,
      positionCode: row.positionCode,
      ...auditOnUpdate(user),
    });
    return { id, positionCode: row.positionCode };
  }

  /**
   * 删除：**被员工引用时禁止**（§5.5 基础数据被业务引用后限制删除）。
   * 岗位一删，引用它的员工档案岗位就成了悬空 id，履历也查不出原来是什么岗，
   * 故一律拦下并引导改用「停用」——停用同样不再进下拉，但历史完好。
   */
  async remove(id: number) {
    const row = await this.mustGet(id);
    const used = await this.countEmployees(id);
    if (used.total > 0) {
      throw new BadRequestException(this.buildInUseMessage(row.positionName, used));
    }
    await this.repo.delete(id);
    return { id };
  }

  /**
   * 批量删除：**逐条尝试、不因一条失败整批回滚**。
   *
   * 与「整批校验通过才落库」的导入不同——删除各行互相独立，
   * 用户勾了 20 个其中 3 个在用，把 17 个删掉并说清哪 3 个没删更有用。
   */
  async removeBatch(ids: number[]) {
    const uniq = [...new Set(ids.filter((v) => Number.isInteger(v) && v > 0))];
    if (!uniq.length) throw new BadRequestException('请选择要删除的岗位');

    const rows = await this.repo.find({ where: { id: In(uniq) } });
    const found = new Map(rows.map((r) => [r.id, r]));

    const deleted: number[] = [];
    const failed: string[] = [];
    for (const id of uniq) {
      const row = found.get(id);
      if (!row) {
        failed.push(`#${id}：岗位不存在（可能已被他人删除）`);
        continue;
      }
      const used = await this.countEmployees(id);
      if (used.total > 0) {
        const detail = [
          used.active ? `在职 ${used.active} 人` : '',
          used.left ? `离职 ${used.left} 人` : '',
        ].filter(Boolean).join('、');
        failed.push(`「${row.positionName}」已被 ${detail} 引用，未删除（可改为停用）`);
        continue;
      }
      await this.repo.delete(id);
      deleted.push(id);
    }
    return { deleted: deleted.length, failed };
  }

  /** 导出当前筛选结果（列序与页面一致，便于对照） */
  async exportExcel(query: QueryPositionDto): Promise<Buffer> {
    const all = await this.findList({ ...query, page: 1, pageSize: EXPORT_ROW_LIMIT + 1 });
    // 空结果与超限一律拒绝，不给空表也不静默截断（与其余导出同口径）
    if (!all.list.length) {
      throw new BadRequestException('当前筛选条件下没有岗位可导出，请调整筛选条件后重试');
    }
    if (all.list.length > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(
        `当前筛选结果 ${all.total} 行，超过单次导出上限 ${EXPORT_ROW_LIMIT} 行，请缩小筛选范围后重试`,
      );
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = '海宝五金 OMS';
    wb.created = new Date();
    const ws = wb.addWorksheet('岗位');

    ws.columns = [
      { header: '岗位编码', key: 'positionCode', width: 14 },
      { header: '岗位名称', key: 'positionName', width: 18 },
      { header: '所属部门', key: 'deptName', width: 16 },
      { header: '岗位性质', key: 'nature', width: 12 },
      { header: '职级', key: 'jobLevelName', width: 14 },
      { header: '编制人数', key: 'headcount', width: 10 },
      { header: '在岗人数', key: 'employeeCount', width: 10 },
      { header: '排序', key: 'sort', width: 8 },
      { header: '状态', key: 'statusText', width: 8 },
      { header: '备注', key: 'remark', width: 28 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    for (const p of all.list as any[]) {
      ws.addRow({
        positionCode: p.positionCode,
        positionName: p.positionName,
        // 通用岗位（无部门）导出为「通用岗位」，与页面显示一致
        deptName: p.deptName || '通用岗位',
        nature: positionNatureLabel(p.positionNature),
        jobLevelName: p.jobLevelName || '',
        headcount: p.headcount ?? '不限',
        employeeCount: p.employeeCount ?? 0,
        sort: p.sort,
        statusText: p.status === 1 ? '启用' : '停用',
        remark: p.remark || '',
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /** 导入模板：不含岗位编码（编码由系统采番） */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('岗位导入');
    ws.columns = [
      { header: '岗位名称*', width: 20 },
      { header: '所属部门', width: 18 },
      { header: '岗位性质', width: 12 },
      { header: '职级', width: 14 },
      { header: '编制人数', width: 10 },
      { header: '排序', width: 8 },
      { header: '备注', width: 28 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow(['质检员', '品检部', '普通岗', '中级', 5, 10, '示例行，导入前请删除']);

    const tip = wb.addWorksheet('填写说明');
    tip.columns = [{ width: 16 }, { width: 90 }];
    [
      ['岗位编码', '不用填，保存时由系统自动生成（POS + 3 位流水）'],
      ['岗位名称', '必填'],
      ['所属部门', '填部门名称；留空 = 通用岗位（任何部门都能选到）'],
      ['岗位性质', '普通岗 / 管理岗 / 技术岗，留空按「普通岗」'],
      ['职级', '填职级名称，且必须属于该岗位性质对应的序列，如「管理岗」只能填 班组长级/主管级/经理级/高管级'],
      ['编制人数', '留空 = 不限编'],
      ['导入规则', '整批校验通过才落库；任一行有错会返回逐行错误清单，不会部分入库'],
      ['重复处理', '默认「岗位名称+所属部门」重复即报错；勾选「覆盖更新」后改为更新已有岗位的其余字段'],
    ].forEach((r) => tip.addRow(r));
    tip.getColumn(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * 批量导入：**整批校验通过才落库**（沿用项目既有导入约定，与客户导入一致）。
   * 部分成功会让用户改完错行重提时把成功的行又导一遍。
   */
  async importFromExcel(buffer: Buffer, overwrite: boolean, user: CurrentUserPayload) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('无法解析 Excel 文件，请使用下载的模板另存为 .xlsx 后再上传');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel 中没有工作表');

    const depts = await this.repo.manager.getRepository(Department).find();
    const deptByName = new Map(depts.map((d) => [d.deptName.trim(), d.id]));
    const levels = await this.repo.manager.getRepository(JobLevel).find();
    const natureByLabel = new Map(POSITION_NATURE_OPTIONS.map((o) => [o.label, o.value]));

    const text = (v: any) => String(v?.text ?? v?.result ?? v ?? '').trim();
    const errors: string[] = [];
    const parsed: Array<{ payload: CreatePositionDto; key: string }> = [];
    const seen = new Set<string>();

    ws.eachRow((row, idx) => {
      if (idx === 1) return; // 表头
      const [name, deptName, natureLabel, levelName, headcount, sort, remark] =
        [1, 2, 3, 4, 5, 6, 7].map((c) => text(row.getCell(c)));
      if (!name && !deptName && !levelName) return; // 整行空，跳过

      const at = `第 ${idx} 行`;
      if (!name) { errors.push(`${at}：岗位名称必填`); return; }

      let deptId: number | undefined;
      if (deptName) {
        const hit = deptByName.get(deptName);
        if (!hit) { errors.push(`${at}：部门「${deptName}」不存在`); return; }
        deptId = hit;
      }

      const positionNature = natureLabel
        ? natureByLabel.get(natureLabel)
        : POSITION_NATURE.NORMAL;
      if (!positionNature) {
        errors.push(`${at}：岗位性质「${natureLabel}」无效，只能是 普通岗 / 管理岗 / 技术岗`);
        return;
      }

      let jobLevelId: number | undefined;
      if (levelName) {
        const hit = levels.find(
          (l) => l.levelName === levelName && l.positionNature === positionNature,
        );
        if (!hit) {
          errors.push(
            `${at}：「${positionNatureLabel(positionNature)}」序列下没有职级「${levelName}」`,
          );
          return;
        }
        jobLevelId = hit.id;
      }

      const key = `${name}#${deptId ?? 0}`;
      if (seen.has(key)) { errors.push(`${at}：与前面的行重复（岗位名称 + 所属部门）`); return; }
      seen.add(key);

      parsed.push({
        key,
        payload: {
          positionName: name,
          deptId,
          positionNature,
          jobLevelId,
          headcount: headcount ? Number(headcount) : undefined,
          sort: sort ? Number(sort) : 0,
          remark: remark || undefined,
        },
      });
    });

    if (!parsed.length && !errors.length) throw new BadRequestException('Excel 中没有可导入的数据行');

    // 与库中已有岗位判重（同名同部门）
    const existing = await this.repo.find();
    const existByKey = new Map(existing.map((p) => [`${p.positionName}#${p.deptId ?? 0}`, p]));
    if (!overwrite) {
      for (const p of parsed) {
        const hit = existByKey.get(p.key);
        if (hit) {
          errors.push(`岗位「${p.payload.positionName}」已存在（编码 ${hit.positionCode}），如需更新请勾选「覆盖更新」`);
        }
      }
    }

    if (errors.length) {
      throw new BadRequestException({ message: `导入未执行：${errors.length} 处问题`, errors });
    }

    let created = 0;
    let updated = 0;
    for (const p of parsed) {
      const hit = existByKey.get(p.key);
      const normalized = await this.normalize(p.payload as CreatePositionDto);
      if (hit) {
        await this.repo.update(hit.id, { ...normalized, ...auditOnUpdate(user) });
        updated += 1;
      } else {
        const positionCode = await this.generateCode();
        await this.repo.save(
          this.repo.create({ ...normalized, positionCode, ...auditOnCreate(user) }),
        );
        created += 1;
      }
    }
    return { total: parsed.length, created, updated };
  }

  /* ==================== 内部 ==================== */

  /** 在岗人数：一条 GROUP BY 聚合出全部，别按行查成 N+1 */
  private async attachCounts(rows: Position[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const counts = await this.repo.manager.query(
      `SELECT position_id AS positionId, COUNT(*) AS c
         FROM t_employee
        WHERE position_id IN (${placeholders}) AND job_status = 1
        GROUP BY position_id`,
      ids,
    );
    const countMap = new Map<number, number>(
      counts.map((c: any) => [Number(c.positionId), Number(c.c)]),
    );

    const deptIds = [...new Set(rows.map((r) => r.deptId).filter((x): x is number => !!x))];
    const deptMap = new Map<number, string>();
    if (deptIds.length) {
      const ph = deptIds.map(() => '?').join(',');
      const depts = await this.repo.manager.query(
        `SELECT id, dept_name AS deptName FROM t_department WHERE id IN (${ph})`,
        deptIds,
      );
      for (const d of depts) deptMap.set(Number(d.id), d.deptName);
    }

    // 职级名：**不过滤停用职级**——停用只是不再进下拉，已挂在岗位上的仍要显示得出名字
    const levelIds = [...new Set(rows.map((r) => r.jobLevelId).filter((x): x is number => !!x))];
    const levelMap = new Map<number, string>();
    if (levelIds.length) {
      const lph = levelIds.map(() => '?').join(',');
      const levels = await this.repo.manager.query(
        `SELECT id, level_name AS levelName FROM t_job_level WHERE id IN (${lph})`,
        levelIds,
      );
      for (const l of levels) levelMap.set(Number(l.id), l.levelName);
    }

    return rows.map((p) => ({
      ...p,
      deptName: p.deptId ? deptMap.get(p.deptId) ?? null : null,
      jobLevelName: p.jobLevelId ? levelMap.get(p.jobLevelId) ?? null : null,
      /** 在岗人数（只数在职员工），与 headcount 对照看是否超编 */
      employeeCount: countMap.get(p.id) ?? 0,
    }));
  }

  /**
   * 引用该岗位的员工数，**在职与离职分开数**。
   *
   * 删除守卫要的是「有没有人引用」，离职档案同样引用着 position_id，
   * 删了岗位它们的履历就查不出当年是什么岗，所以离职的也要拦。
   * 但列表的「在岗」只数在职（见 attachCounts），两处口径不同——
   * 提示文案必须把这两个数分开报，否则会出现
   * 「列表显示在岗：否，点删除却说被 3 名员工使用」这种自相矛盾。
   */
  private async countEmployees(positionId: number): Promise<{
    total: number;
    active: number;
    left: number;
  }> {
    const rows = await this.repo.manager.query(
      `SELECT SUM(job_status = 1) AS active, SUM(job_status <> 1) AS \`left\`
         FROM t_employee WHERE position_id = ?`,
      [positionId],
    );
    const active = Number(rows?.[0]?.active ?? 0);
    const left = Number(rows?.[0]?.left ?? 0);
    return { total: active + left, active, left };
  }

  /** 删除被拒时的中文提示：把在职/离职拆开说清楚，避免与列表的「在岗」口径打架 */
  private buildInUseMessage(positionName: string, c: { active: number; left: number }) {
    const parts: string[] = [];
    if (c.active) parts.push(`在职 ${c.active} 人`);
    if (c.left) parts.push(`离职 ${c.left} 人`);
    const detail = parts.join('、');
    const why = c.active
      ? '请先把这些员工调到其他岗位'
      : '离职档案仍要留住当年的岗位信息，故同样不能删';
    return `岗位「${positionName}」已被 ${detail} 引用，不能删除——${why}；如需下线请把状态改为「停用」`;
  }

  /**
   * 岗位编码采番：`POS` + 3 位流水（§5.4 单号一律走 NumberGeneratorService）。
   *
   * 存量岗位是从旧字典搬来的（stamping / qc 之类），编码格式与此不同、原样保留——
   * 编码是业务键，为了统一格式去重编老数据得不偿失。
   *
   * 采番只保证计数器不重复，万一与历史编码撞上就取下一个（正常不会发生）。
   */
  private async generateCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const seq = await this.numberGen.generatePaddedSequence(
        POSITION_CODE_PREFIX,
        POSITION_CODE_WIDTH,
      );
      const code = `${POSITION_CODE_PREFIX}${seq}`;
      const exists = await this.repo.findOne({ where: { positionCode: code }, select: ['id'] });
      if (!exists) return code;
    }
    throw new BadRequestException('岗位编码连续生成冲突，请稍后重试');
  }

  private async normalize(dto: CreatePositionDto) {
    const positionName = (dto.positionName ?? '').trim();
    if (!positionName) throw new BadRequestException('岗位名称必填');

    // 所属部门填了就得存在，否则岗位会挂到一个查不出名字的部门上
    let deptId: number | null = dto.deptId ?? null;
    if (deptId) {
      const dept = await this.repo.manager
        .getRepository(Department)
        .findOne({ where: { id: deptId } });
      if (!dept) throw new BadRequestException('所属部门不存在');
    } else {
      deptId = null;
    }

    const positionNature = dto.positionNature || POSITION_NATURE.NORMAL;

    /**
     * 职级必须与岗位性质**同属一个序列**——职级本就是「序列内的等级」，
     * 给管理岗配一个「助理工程师」是自相矛盾的。前端已按性质过滤下拉，
     * 这里是服务端兜底（API 直调同样挡住）。
     */
    let jobLevelId: number | null = dto.jobLevelId ?? null;
    if (jobLevelId) {
      const level = await this.repo.manager
        .getRepository(JobLevel)
        .findOne({ where: { id: jobLevelId } });
      if (!level) throw new BadRequestException('职级不存在');
      if (level.positionNature !== positionNature) {
        throw new BadRequestException(
          `职级「${level.levelName}」属于「${positionNatureLabel(level.positionNature)}」序列，`
            + `与本岗位的「${positionNatureLabel(positionNature)}」不符，请重新选择`,
        );
      }
    } else {
      jobLevelId = null;
    }

    return {
      positionName,
      deptId,
      positionNature,
      jobLevelId,
      headcount: dto.headcount ?? null,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
      remark: dto.remark?.trim() || null,
    };
  }

  private async mustGet(id: number): Promise<Position> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('岗位不存在');
    return row;
  }
}
