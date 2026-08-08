import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Department } from '../entities/department.entity';
import { User } from '../entities/user.entity';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import {
  auditOnCreate,
  auditOnUpdate,
} from '../../../common/utils/audit.util';

@Injectable()
export class DeptService {
  constructor(
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** 部门树（含负责人/电话/状态，部门信息页与各处部门选择共用） */
  async tree() {
    const all = await this.deptRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
    const build = (parentId: number): any[] =>
      all
        .filter((d) => d.parentId === parentId)
        .map((d) => ({ ...d, children: build(d.id) }));
    return build(0);
  }

  async findAll() {
    return this.deptRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  /** 部门编码唯一校验（uk_dept_code 兜底，此处给中文提示） */
  private async assertCodeUnique(deptCode: string, excludeId?: number) {
    const exist = await this.deptRepo.findOne({
      where: excludeId ? { deptCode, id: Not(excludeId) } : { deptCode },
    });
    if (exist) throw new BadRequestException(`部门编码「${deptCode}」已存在（${exist.deptName}）`);
  }

  async create(data: Partial<Department>, user: CurrentUserPayload) {
    if (!data.deptName?.trim()) throw new BadRequestException('部门名称必填');
    if (!data.deptCode?.trim()) throw new BadRequestException('部门编码必填');
    await this.assertCodeUnique(data.deptCode.trim());
    if (data.parentId) {
      const parent = await this.deptRepo.findOne({ where: { id: data.parentId } });
      if (!parent) throw new BadRequestException('上级部门不存在');
    }
    const dept = this.deptRepo.create({
      ...auditOnCreate(user),
      deptCode: data.deptCode.trim(),
      deptName: data.deptName.trim(),
      parentId: data.parentId ?? 0,
      sort: data.sort ?? 0,
      leader: data.leader ?? null,
      phone: data.phone ?? null,
      status: data.status ?? 1,
    });
    const saved = await this.deptRepo.save(dept);
    return { id: saved.id };
  }

  async update(id: number, data: Partial<Department>, user: CurrentUserPayload) {
    const dept = await this.deptRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    if (data.deptCode && data.deptCode.trim() !== dept.deptCode) {
      await this.assertCodeUnique(data.deptCode.trim(), id);
    }
    if (data.parentId != null && data.parentId !== dept.parentId) {
      if (data.parentId === id) throw new BadRequestException('上级部门不能选择自己');
      // 防成环：新上级不能是自己的子孙
      const descendants = await this.collectDescendantIds(id);
      if (descendants.has(data.parentId)) {
        throw new BadRequestException('上级部门不能选择自己的下级部门');
      }
    }
    await this.deptRepo.update(id, {
      ...auditOnUpdate(user),
      deptCode: data.deptCode?.trim() ?? dept.deptCode,
      deptName: data.deptName?.trim() ?? dept.deptName,
      parentId: data.parentId ?? dept.parentId,
      sort: data.sort ?? dept.sort,
      leader: data.leader !== undefined ? data.leader : dept.leader,
      phone: data.phone !== undefined ? data.phone : dept.phone,
      status: data.status ?? dept.status,
    });
    return { id };
  }

  async remove(id: number) {
    const dept = await this.deptRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    const children = await this.deptRepo.count({ where: { parentId: id } });
    if (children > 0) throw new BadRequestException(`「${dept.deptName}」存在 ${children} 个下级部门，请先删除下级`);
    const users = await this.userRepo.count({ where: { deptId: id } });
    if (users > 0) throw new BadRequestException(`「${dept.deptName}」下仍有 ${users} 个账号，请先调整账号所属部门`);
    await this.deptRepo.delete(id);
    return { id };
  }

  private async collectDescendantIds(rootId: number): Promise<Set<number>> {
    const all = await this.deptRepo.find();
    const result = new Set<number>();
    const walk = (pid: number) => {
      all.filter((d) => d.parentId === pid).forEach((d) => {
        result.add(d.id);
        walk(d.id);
      });
    };
    walk(rootId);
    return result;
  }
}
