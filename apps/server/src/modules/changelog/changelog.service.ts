import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Changelog } from './entities/changelog.entity';
import { SaveChangelogDto } from './dto/save-changelog.dto';

/**
 * 更新日志服务
 * - findAll()：前台公开查询，仅返回启用记录
 * - findAllForAdmin()：后台管理查询，返回全部记录
 * - create/update/remove：后台管理 CRUD
 */
@Injectable()
export class ChangelogService {
  constructor(
    @InjectRepository(Changelog)
    private readonly repo: Repository<Changelog>,
  ) {}

  /** 前台展示：仅启用记录，按发布日期+排序倒序 */
  findAll(): Promise<Changelog[]> {
    return this.repo.find({
      where: { status: 1 },
      order: { releasedAt: 'DESC', sort: 'DESC' },
    });
  }

  /** 后台管理：全部记录，按发布日期+排序倒序 */
  findAllForAdmin(): Promise<Changelog[]> {
    return this.repo.find({
      order: { releasedAt: 'DESC', sort: 'DESC' },
    });
  }

  create(dto: SaveChangelogDto): Promise<Changelog> {
    return this.repo.save(
      this.repo.create({
        version: dto.version,
        title: dto.title ?? null,
        content: dto.content,
        releasedAt: dto.releasedAt,
        category: dto.category ?? null,
        sort: dto.sort ?? 0,
        status: dto.status ?? 1,
      }),
    );
  }

  async update(id: number, dto: SaveChangelogDto): Promise<Changelog> {
    const exist = await this.repo.findOne({ where: { id } });
    if (!exist) throw new NotFoundException('更新日志不存在');
    await this.repo.update(id, {
      version: dto.version,
      title: dto.title ?? null,
      content: dto.content,
      releasedAt: dto.releasedAt,
      category: dto.category ?? null,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
    });
    return this.repo.findOneOrFail({ where: { id } });
  }

  async remove(id: number): Promise<void> {
    const exist = await this.repo.findOne({ where: { id } });
    if (!exist) throw new NotFoundException('更新日志不存在');
    await this.repo.delete(id);
  }
}
