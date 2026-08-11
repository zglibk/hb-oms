import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Position } from './entities/position.entity';
import { Department } from '../system/entities/department.entity';
import {
  CreatePositionDto,
  PositionOptionQueryDto,
  QueryPositionDto,
  UpdatePositionDto,
} from './dto/position.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(Position)
    private readonly repo: Repository<Position>,
  ) {}

  async findList(query: QueryPositionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('p');

    if (query.status != null) qb.andWhere('p.status = :st', { st: query.status });
    if (query.isManager != null) qb.andWhere('p.isManager = :im', { im: query.isManager });
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
      .select(['p.id', 'p.positionCode', 'p.positionName', 'p.deptId', 'p.isManager'])
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

  async create(dto: CreatePositionDto, user: CurrentUserPayload) {
    const payload = await this.normalize(dto);
    await this.assertCodeFree(payload.positionCode);
    const saved = await this.repo.save(
      this.repo.create({ ...payload, ...auditOnCreate(user) }),
    );
    return { id: saved.id };
  }

  async update(id: number, dto: UpdatePositionDto, user: CurrentUserPayload) {
    await this.mustGet(id);
    const payload = await this.normalize(dto);
    await this.assertCodeFree(payload.positionCode, id);
    await this.repo.update(id, { ...payload, ...auditOnUpdate(user) });
    return { id };
  }

  /**
   * 删除：**被员工引用时禁止**（§5.5 基础数据被业务引用后限制删除）。
   * 岗位一删，引用它的员工档案岗位就成了悬空 id，履历也查不出原来是什么岗，
   * 故一律拦下并引导改用「停用」——停用同样不再进下拉，但历史完好。
   */
  async remove(id: number) {
    const row = await this.mustGet(id);
    const used = await this.countEmployees(id);
    if (used > 0) {
      throw new BadRequestException(
        `岗位「${row.positionName}」已被 ${used} 名员工使用，不能删除；如需停用请把状态改为「停用」`,
      );
    }
    await this.repo.delete(id);
    return { id };
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

    return rows.map((p) => ({
      ...p,
      deptName: p.deptId ? deptMap.get(p.deptId) ?? null : null,
      /** 在岗人数（只数在职员工），与 headcount 对照看是否超编 */
      employeeCount: countMap.get(p.id) ?? 0,
    }));
  }

  private async countEmployees(positionId: number): Promise<number> {
    const rows = await this.repo.manager.query(
      'SELECT COUNT(*) AS c FROM t_employee WHERE position_id = ?',
      [positionId],
    );
    return Number(rows?.[0]?.c ?? 0);
  }

  private async normalize(dto: CreatePositionDto) {
    const positionCode = (dto.positionCode ?? '').trim();
    const positionName = (dto.positionName ?? '').trim();
    if (!positionCode) throw new BadRequestException('岗位编码必填');
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

    return {
      positionCode,
      positionName,
      deptId,
      jobLevel: dto.jobLevel?.trim() || null,
      isManager: dto.isManager ?? 0,
      headcount: dto.headcount ?? null,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
      remark: dto.remark?.trim() || null,
    };
  }

  /** 编码唯一（uk_position_code 兜底，此处给中文提示） */
  private async assertCodeFree(positionCode: string, excludeId?: number) {
    const exist = await this.repo.findOne({
      where: excludeId ? { positionCode, id: Not(excludeId) } : { positionCode },
    });
    if (exist) {
      throw new BadRequestException(`岗位编码「${positionCode}」已被「${exist.positionName}」占用`);
    }
  }

  private async mustGet(id: number): Promise<Position> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('岗位不存在');
    return row;
  }
}
