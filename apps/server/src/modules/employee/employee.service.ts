import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JOB_STATUS, birthDateFromIdCard } from '@hb-oms/shared';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto, QueryEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly repo: Repository<Employee>,
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
    if (query.empType) qb.andWhere('e.empType = :et', { et: query.empType });
    if (query.position) qb.andWhere('e.position = :pos', { pos: query.position });
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

  async create(dto: CreateEmployeeDto, user: CurrentUserPayload) {
    const payload = this.normalizePayload(dto);
    await this.assertUnique(payload.empNo, payload.idCard);
    if (payload.supervisorId) await this.assertSupervisor(payload.supervisorId);
    const entity = this.repo.create({ ...payload, ...auditOnCreate(user) });
    const saved = await this.repo.save(entity);
    return { id: saved.id };
  }

  async update(id: number, dto: UpdateEmployeeDto, user: CurrentUserPayload) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('员工不存在');

    const merged: CreateEmployeeDto = {
      empNo: dto.empNo ?? item.empNo,
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
      position: dto.position !== undefined ? dto.position : item.position ?? undefined,
      supervisorId:
        dto.supervisorId !== undefined ? dto.supervisorId : item.supervisorId ?? undefined,
      status: dto.status ?? item.status,
      remark: dto.remark !== undefined ? dto.remark : item.remark ?? undefined,
    };

    const payload = this.normalizePayload(merged);
    await this.assertUnique(payload.empNo, payload.idCard, id);
    if (payload.supervisorId) {
      if (payload.supervisorId === id) throw new BadRequestException('直属主管不能是本人');
      await this.assertSupervisor(payload.supervisorId);
    }
    await this.repo.update(id, { ...payload, ...auditOnUpdate(user) });
    return { id };
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

    return rows.map((e) => ({
      ...e,
      deptName: e.deptId ? deptMap.get(e.deptId) ?? null : null,
      supervisorName: e.supervisorId ? supMap.get(e.supervisorId) ?? null : null,
    }));
  }

  private normalizePayload(dto: CreateEmployeeDto) {
    const empNo = (dto.empNo || '').trim();
    const empName = (dto.empName || '').trim();
    if (!empNo) throw new BadRequestException('请填写员工编号');
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
      position: dto.position?.trim() || null,
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
