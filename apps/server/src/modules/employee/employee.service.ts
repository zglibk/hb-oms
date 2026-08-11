import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  EMP_PLANT_CODES,
  EMP_SEQ_WIDTH,
  JOB_STATUS,
  birthDateFromIdCard,
  buildEmpNo,
  empCodePrefix,
  empPlantLabel,
  empYearFlag,
  needsEmpNoReissue,
} from '@hb-oms/shared';
import { Employee } from './entities/employee.entity';
import { Department } from '../system/entities/department.entity';
import { CreateEmployeeDto, QueryEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import { NumberGeneratorService } from '../../common/services/number-generator.service';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly repo: Repository<Employee>,
    private readonly numberGen: NumberGeneratorService,
  ) {}

  async findList(query: QueryEmployeeDto) {
    if (query.forSupervisor) {
      return this.repo.find({
        select: ['id', 'empNo', 'empName', 'deptId'],
        where: { jobStatus: JOB_STATUS.ACTIVE, status: 1 },
        order: { empNo: 'ASC' },
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo.createQueryBuilder('e');

    if (query.status != null) qb.andWhere('e.status = :st', { st: query.status });
    if (query.jobStatus != null) qb.andWhere('e.jobStatus = :js', { js: query.jobStatus });
    if (query.deptId != null) qb.andWhere('e.deptId = :did', { did: query.deptId });
    if (query.plantCode) qb.andWhere('e.plantCode = :pc', { pc: query.plantCode });
    if (query.empType) qb.andWhere('e.empType = :et', { et: query.empType });
    if (query.positionId != null) qb.andWhere('e.positionId = :pos', { pos: query.positionId });
    if (query.keyword) {
      qb.andWhere(
        '(e.empNo LIKE :kw OR e.empName LIKE :kw OR e.phone LIKE :kw OR e.idCard LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    qb.orderBy('e.empNo', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const enriched = await this.attachNames(rows);
    return { list: enriched, total, page, pageSize };
  }

  async findOne(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('员工不存在');
    const [one] = await this.attachNames([item]);
    return one;
  }

  /**
   * 新增员工：编号由系统按《员工编码管理规则》**自动生成**，不接受手工传入。
   * 生成编号需要三项前置信息（厂区/入职日期/部门），缺一即拒绝并说明原因。
   */
  async create(dto: CreateEmployeeDto, user: CurrentUserPayload) {
    const payload = this.normalizePayload(dto);
    const empNo = await this.generateEmpNo({
      plantCode: payload.plantCode,
      hireDate: payload.hireDate,
      deptId: payload.deptId,
      empType: payload.empType,
    });
    await this.assertUnique(empNo, payload.idCard);
    if (payload.supervisorId) await this.assertSupervisor(payload.supervisorId);
    const entity = this.repo.create({ ...payload, empNo, ...auditOnCreate(user) });
    const saved = await this.repo.save(entity);
    return { id: saved.id, empNo };
  }

  async update(id: number, dto: UpdateEmployeeDto, user: CurrentUserPayload) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('员工不存在');

    const merged: CreateEmployeeDto = {
      // 编号**终身固定不变**（规则四.1）：调岗、升职、跨厂区调动一律沿用原号，
      // 故这里恒取库中值、无视 dto.empNo。唯一例外是下面的「试用转正换发正式码」。
      empNo: item.empNo,
      plantCode: dto.plantCode !== undefined ? dto.plantCode : item.plantCode ?? undefined,
      empName: dto.empName ?? item.empName,
      gender: dto.gender ?? item.gender,
      idCard: dto.idCard !== undefined ? dto.idCard : item.idCard ?? undefined,
      birthDate: dto.birthDate !== undefined ? dto.birthDate : this.dateStr(item.birthDate),
      phone: dto.phone !== undefined ? dto.phone : item.phone ?? undefined,
      address: dto.address !== undefined ? dto.address : item.address ?? undefined,
      emergencyContact:
        dto.emergencyContact !== undefined ? dto.emergencyContact : item.emergencyContact ?? undefined,
      nativePlace: dto.nativePlace !== undefined ? dto.nativePlace : item.nativePlace ?? undefined,
      ethnicity: dto.ethnicity !== undefined ? dto.ethnicity : item.ethnicity ?? undefined,
      maritalStatus:
        dto.maritalStatus !== undefined ? dto.maritalStatus : item.maritalStatus ?? undefined,
      politicalStatus:
        dto.politicalStatus !== undefined ? dto.politicalStatus : item.politicalStatus ?? undefined,
      education: dto.education !== undefined ? dto.education : item.education ?? undefined,
      educationType:
        dto.educationType !== undefined ? dto.educationType : item.educationType ?? undefined,
      major: dto.major !== undefined ? dto.major : item.major ?? undefined,
      graduateSchool:
        dto.graduateSchool !== undefined ? dto.graduateSchool : item.graduateSchool ?? undefined,
      graduateDate:
        dto.graduateDate !== undefined ? dto.graduateDate : this.dateStr(item.graduateDate),
      empType: dto.empType ?? item.empType,
      hireDate: dto.hireDate !== undefined ? dto.hireDate : this.dateStr(item.hireDate),
      probationMonths:
        dto.probationMonths !== undefined ? dto.probationMonths : item.probationMonths ?? undefined,
      contractEndDate:
        dto.contractEndDate !== undefined ? dto.contractEndDate : this.dateStr(item.contractEndDate),
      jobStatus: dto.jobStatus ?? item.jobStatus,
      leaveDate: dto.leaveDate !== undefined ? dto.leaveDate : this.dateStr(item.leaveDate),
      leaveReason: dto.leaveReason !== undefined ? dto.leaveReason : item.leaveReason ?? undefined,
      deptId: dto.deptId !== undefined ? dto.deptId : item.deptId ?? undefined,
      teamGroup: dto.teamGroup !== undefined ? dto.teamGroup : item.teamGroup ?? undefined,
      positionId: dto.positionId !== undefined ? dto.positionId : item.positionId ?? undefined,
      supervisorId:
        dto.supervisorId !== undefined ? dto.supervisorId : item.supervisorId ?? undefined,
      status: dto.status ?? item.status,
      remark: dto.remark !== undefined ? dto.remark : item.remark ?? undefined,
    };

    const payload = this.normalizePayload(merged);

    /**
     * 换发编号（规则五）：非正式人员（实习生 S / 临时工 L / 学徒 A / 派遣工 P）
     * 转正后注销原前缀编号、重新核发标准 10 位正式码，原编号归档留存。
     * 判据是**前缀是否变化**，故 实习生 → 学徒 这类横向变更同样可换发，
     * 避免出现「编号前缀与用工属性对不上」。
     *
     * 这是**唯一**允许改编号的场景，且必须由前端显式传 regenerateEmpNo
     * （用户在弹窗里确认过），不做静默改号——编号是对外标识，
     * 悄悄换掉会让工牌、考勤、薪资对不上账。
     *
     * 年份标识位仍取**员工本人的入职日期**：转正不是重新入职，工龄连续。
     */
    let empNo = payload.empNo;
    if (dto.regenerateEmpNo) {
      if (!needsEmpNoReissue(item.empType, payload.empType)) {
        const p = empCodePrefix(payload.empType);
        throw new BadRequestException(
          `用工属性变更前后编号前缀一致（${p ? `均为 ${p}` : '均为无前缀正式工'}），无需换发编号`,
        );
      }
      empNo = await this.generateEmpNo({
        plantCode: payload.plantCode,
        hireDate: payload.hireDate,
        deptId: payload.deptId,
        empType: payload.empType,
      });
    }

    await this.assertUnique(empNo, payload.idCard, id);
    if (payload.supervisorId) {
      if (payload.supervisorId === id) throw new BadRequestException('直属主管不能是本人');
      await this.assertSupervisor(payload.supervisorId);
    }
    await this.repo.update(id, { ...payload, empNo, ...auditOnUpdate(user) });
    return { id, empNo, empNoChanged: empNo !== item.empNo };
  }

  async remove(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('员工不存在');
    await this.repo
      .createQueryBuilder()
      .update(Employee)
      .set({ supervisorId: null as unknown as number })
      .where('supervisor_id = :id', { id })
      .execute();
    await this.repo.delete(id);
    return { id };
  }

  private async attachNames(rows: Employee[]) {
    if (!rows.length) return [];
    const deptIds = [...new Set(rows.map((r) => r.deptId).filter((x): x is number => !!x))];
    const supIds = [...new Set(rows.map((r) => r.supervisorId).filter((x): x is number => !!x))];

    const deptMap = new Map<number, string>();
    if (deptIds.length) {
      const placeholders = deptIds.map(() => '?').join(',');
      const depts = await this.repo.manager.query(
        `SELECT id, dept_name AS deptName FROM t_department WHERE id IN (${placeholders})`,
        deptIds,
      );
      for (const d of depts) deptMap.set(Number(d.id), d.deptName);
    }

    const supMap = new Map<number, string>();
    if (supIds.length) {
      const supers = await this.repo.find({
        select: ['id', 'empName'],
        where: { id: In(supIds) },
      });
      for (const s of supers) supMap.set(s.id, s.empName);
    }

    // 岗位名（t_position 主数据）：与部门同款解析，**不过滤停用岗位**——
    // 岗位停用只是不再进下拉，已挂在员工身上的历史岗位仍要显示得出名字
    const posIds = [...new Set(rows.map((r) => r.positionId).filter((x): x is number => !!x))];
    const posMap = new Map<number, string>();
    if (posIds.length) {
      const placeholders = posIds.map(() => '?').join(',');
      const positions = await this.repo.manager.query(
        `SELECT id, position_name AS positionName FROM t_position WHERE id IN (${placeholders})`,
        posIds,
      );
      for (const p of positions) posMap.set(Number(p.id), p.positionName);
    }

    return rows.map((e) => ({
      ...e,
      deptName: e.deptId ? deptMap.get(e.deptId) ?? null : null,
      supervisorName: e.supervisorId ? supMap.get(e.supervisorId) ?? null : null,
      positionName: e.positionId ? posMap.get(e.positionId) ?? null : null,
    }));
  }

  /**
   * 按《员工编码管理规则》生成编号：厂区(2) + 年份标识(2) + 部门(3) + 流水号(3)，
   * 非正式人员（实习生/临时工）带 S/L 前缀。
   *
   * 流水号走 `NumberGeneratorService`（MySQL 计数表 + LAST_INSERT_ID 原子自增，§5.4），
   * 计数键为「厂区+年份标识+部门」——新员工每年 1 月 1 日年份标识一变即换了计数键，
   * 流水号自然从 001 重来，无需额外的跨年重置逻辑。
   *
   * 三项前置信息缺一不可，各自给出可操作的中文提示（别让用户对着「生成失败」猜）。
   */
  private async generateEmpNo(params: {
    plantCode: string | null;
    hireDate: string | null;
    deptId: number | null;
    empType: string;
  }): Promise<string> {
    const plantCode = (params.plantCode ?? '').trim();
    if (!plantCode) throw new BadRequestException('请选择厂区（员工编号第 1-2 位）');
    if (!EMP_PLANT_CODES.includes(plantCode)) {
      throw new BadRequestException(`厂区编码「${plantCode}」不在规则允许范围内`);
    }

    const yearFlag = empYearFlag(params.hireDate);
    if (!yearFlag) {
      throw new BadRequestException('请填写入职日期（员工编号第 3-4 位年份标识由它决定）');
    }

    if (!params.deptId) throw new BadRequestException('请选择所属部门（员工编号第 5-7 位）');
    const dept = await this.repo.manager
      .getRepository(Department)
      .findOne({ where: { id: params.deptId } });
    if (!dept) throw new BadRequestException('所属部门不存在');
    const deptCode = (dept.hrCode ?? '').trim();
    if (!deptCode) {
      throw new BadRequestException(
        `部门「${dept.deptName}」还没有配置人事编码，请先到「基础数据 → 部门信息」为它填 3 位人事编码`,
      );
    }

    // 极小概率与历史手工编号撞号（存量档案的编号不是本规则生成的），撞了就取下一个流水号
    for (let attempt = 0; attempt < 5; attempt++) {
      const seq = await this.nextSeq(plantCode, yearFlag, deptCode, dept.deptName);
      const empNo = buildEmpNo({ plantCode, yearFlag, deptCode, seq, empType: params.empType });
      const exists = await this.repo.findOne({ where: { empNo }, select: ['id'] });
      if (!exists) return empNo;
    }
    throw new BadRequestException('员工编号连续生成冲突，请稍后重试或联系管理员检查历史编号');
  }

  /** 取「厂区+年份+部门」组合内的下一个流水号，超 999 给出可读提示 */
  private async nextSeq(
    plantCode: string,
    yearFlag: string,
    deptCode: string,
    deptName: string,
  ): Promise<number> {
    const key = `EMP:${plantCode}${yearFlag}${deptCode}`;
    try {
      return Number(await this.numberGen.generatePaddedSequence(key, EMP_SEQ_WIDTH));
    } catch {
      // generatePaddedSequence 超上限抛的是普通 Error，转成面向用户的中文业务异常（§4.3）
      throw new BadRequestException(
        `「${empPlantLabel(plantCode)} / ${deptName}」在该年份的流水号已用满 999 位，` +
          '需人事、财务、生产三方评审后调整编码规则',
      );
    }
  }

  private normalizePayload(dto: CreateEmployeeDto) {
    const empNo = (dto.empNo || '').trim();
    const empName = (dto.empName || '').trim();
    if (!empName) throw new BadRequestException('请填写姓名');
    if (!dto.empType) throw new BadRequestException('请选择用工属性');

    const idCard = dto.idCard?.trim() ? dto.idCard.trim().toUpperCase() : null;
    let birthDate = dto.birthDate || null;
    if (!birthDate && idCard) birthDate = birthDateFromIdCard(idCard);

    const jobStatus = dto.jobStatus ?? JOB_STATUS.ACTIVE;
    let leaveDate = dto.leaveDate || null;
    let status = dto.status ?? 1;

    if (jobStatus === JOB_STATUS.LEFT) {
      if (!leaveDate) throw new BadRequestException('离职时请填写离职日期');
      status = 0;
    } else {
      leaveDate = null;
    }

    if (dto.hireDate && leaveDate && leaveDate < dto.hireDate) {
      throw new BadRequestException('离职日期不能早于入职日期');
    }

    return {
      empNo,
      // 厂区：跨厂区调动只改这一列，**编号里的厂区位仍是入职时的厂区、不跟着改**——
      // 编号终身固定是规则四.1 的硬要求，两者不一致是设计如此，不是 bug
      plantCode: dto.plantCode?.trim() || null,
      empName,
      gender: dto.gender ?? 0,
      idCard,
      birthDate,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      emergencyContact: dto.emergencyContact?.trim() || null,
      nativePlace: dto.nativePlace?.trim() || null,
      ethnicity: dto.ethnicity?.trim() || null,
      maritalStatus: dto.maritalStatus?.trim() || null,
      politicalStatus: dto.politicalStatus?.trim() || null,
      education: dto.education?.trim() || null,
      educationType: dto.educationType || null,
      major: dto.major?.trim() || null,
      graduateSchool: dto.graduateSchool?.trim() || null,
      graduateDate: this.normalizeMonthDate(dto.graduateDate),
      empType: dto.empType,
      hireDate: dto.hireDate || null,
      probationMonths: dto.probationMonths ?? null,
      contractEndDate: dto.contractEndDate || null,
      jobStatus,
      leaveDate,
      leaveReason: jobStatus === JOB_STATUS.LEFT ? dto.leaveReason?.trim() || null : null,
      deptId: dto.deptId ?? null,
      teamGroup: dto.teamGroup?.trim() || null,
      positionId: dto.positionId ?? null,
      supervisorId: dto.supervisorId ?? null,
      status,
      remark: dto.remark?.trim() || null,
    };
  }

  private dateStr(v: string | Date | null | undefined): string | undefined {
    if (!v) return undefined;
    if (typeof v === 'string') return v.slice(0, 10);
    return v.toISOString().slice(0, 10);
  }

  /** 毕业时间按月录入：归一为当月首日 YYYY-MM-01 */
  private normalizeMonthDate(v: string | null | undefined): string | null {
    if (!v) return null;
    const s = v.trim();
    if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 7)}-01`;
    return null;
  }

  private async assertUnique(empNo: string, idCard: string | null | undefined, excludeId?: number) {
    const byNo = await this.repo.findOne({ where: { empNo } });
    if (byNo && byNo.id !== excludeId) {
      throw new ConflictException(`员工编号「${empNo}」已存在`);
    }
    if (idCard) {
      const byCard = await this.repo.findOne({ where: { idCard } });
      if (byCard && byCard.id !== excludeId) {
        throw new ConflictException('该身份证号已建档');
      }
    }
  }

  private async assertSupervisor(supervisorId: number) {
    const s = await this.repo.findOne({ where: { id: supervisorId } });
    if (!s) throw new BadRequestException('直属主管不存在');
    if (s.jobStatus !== JOB_STATUS.ACTIVE) {
      throw new BadRequestException('直属主管须为在职员工');
    }
  }
}
