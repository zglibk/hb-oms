import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../entities/department.entity';

@Injectable()
export class DeptService {
  constructor(
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
  ) {}

  /** 部门树 */
  async tree() {
    const all = await this.deptRepo.find({ order: { sort: 'ASC' } });
    const build = (parentId: number): any[] =>
      all
        .filter((d) => d.parentId === parentId)
        .map((d) => ({ ...d, children: build(d.id) }));
    return build(0);
  }

  async findAll() {
    return this.deptRepo.find({ order: { sort: 'ASC' } });
  }

  async create(data: Partial<Department>) {
    const dept = this.deptRepo.create({
      deptCode: data.deptCode,
      deptName: data.deptName,
      parentId: data.parentId ?? 0,
      sort: data.sort ?? 0,
      status: 1,
    });
    const saved = await this.deptRepo.save(dept);
    return { id: saved.id };
  }

  async update(id: number, data: Partial<Department>) {
    const dept = await this.deptRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    await this.deptRepo.update(id, {
      deptName: data.deptName ?? dept.deptName,
      parentId: data.parentId ?? dept.parentId,
      sort: data.sort ?? dept.sort,
      status: data.status ?? dept.status,
    });
    return { id };
  }

  async remove(id: number) {
    const children = await this.deptRepo.count({ where: { parentId: id } });
    if (children > 0) throw new NotFoundException('请先删除子部门');
    await this.deptRepo.delete(id);
    return { id };
  }
}
