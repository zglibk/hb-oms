import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Changelog } from './entities/changelog.entity';
import { User } from '../system/entities/user.entity';
import { SaveChangelogDto } from './dto/save-changelog.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';

/**
 * 更新日志服务
 * - findAll()：前台公开查询，仅返回启用记录
 * - findAllForAdmin()：后台管理查询，返回全部记录
 * - findUnseen()/markSeen()：首页「系统更新」弹窗的未读查询与已读登记
 * - create/update/remove：后台管理 CRUD
 */
@Injectable()
export class ChangelogService {
  constructor(
    @InjectRepository(Changelog)
    private readonly repo: Repository<Changelog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 本人尚未看过的更新日志（仅启用记录，排序同前台展示）。
   *
   * 水位线 `t_user.changelog_seen_id` 为空（新账号 / 功能上线前的老账号）时
   * **只弹最新一个版本**——把历史版本全摊给新人看没有意义。
   * 返回 `latestId` 供前端关闭弹窗时回传：以「看到的那一批」为准登记已读，
   * 弹窗开着期间新发布的条目下次进首页照样会弹。
   */
  async findUnseen(userId: number): Promise<{ list: Changelog[]; latestId: number }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, changelogSeenId: true },
    });
    const order = { releasedAt: 'DESC', sort: 'DESC', id: 'DESC' } as const;
    let list: Changelog[];
    if (user?.changelogSeenId == null) {
      const newest = await this.repo.findOne({ where: { status: 1 }, order });
      list = newest
        ? await this.repo.find({ where: { status: 1, version: newest.version }, order })
        : [];
    } else {
      list = await this.repo.find({
        where: { status: 1, id: MoreThan(user.changelogSeenId) },
        order,
      });
    }
    const latestId = list.reduce((m, r) => Math.max(m, r.id), 0);
    return { list, latestId };
  }

  /**
   * 登记已读：水位线只升不降（`GREATEST`），防多个标签页先后关闭把水位线拉回去。
   * 属系统簿记，只动水位线（及自动的 updated_at），不写 updated_by——
   * 否则「最后更新人」会被看弹窗这个动作洗掉（§5.5）。
   */
  async markSeen(userId: number, id: number): Promise<void> {
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ changelogSeenId: () => 'GREATEST(COALESCE(changelog_seen_id, 0), :id)' })
      .setParameter('id', id)
      .where('id = :userId', { userId })
      .execute();
  }

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

  create(dto: SaveChangelogDto, user: CurrentUserPayload): Promise<Changelog> {
    return this.repo.save(
      this.repo.create({
        ...auditOnCreate(user),
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

  async update(
    id: number,
    dto: SaveChangelogDto,
    user: CurrentUserPayload,
  ): Promise<Changelog> {
    const exist = await this.repo.findOne({ where: { id } });
    if (!exist) throw new NotFoundException('更新日志不存在');
    await this.repo.update(id, {
      ...auditOnUpdate(user),
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
