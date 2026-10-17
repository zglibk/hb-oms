import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ADMIN_ROLE_CODE,
  ANNOUNCEMENT_LEVEL_OPTIONS,
  ANNOUNCEMENT_REPLY_SCOPE,
  ANNOUNCEMENT_STATUS,
  EXPORT_ROW_LIMIT,
  SUPER_ADMIN_USERNAME,
} from '@hb-oms/shared';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnCreate, auditOnUpdate } from '../../common/utils/audit.util';
import {
  createWorkbook,
  dateTimeText,
  styleSheet,
} from '../../common/utils/excel.util';
import { User } from '../system/entities/user.entity';
import { Announcement } from './entities/announcement.entity';
import { AnnouncementRecipient } from './entities/announcement-recipient.entity';
import { AnnouncementReply } from './entities/announcement-reply.entity';
import {
  AckAnnouncementDto,
  CreateAnnouncementReplyDto,
  PublishAnnouncementDto,
  QueryAnnouncementAdminDto,
  QueryAnnouncementHistoryDto,
  QueryAnnouncementReplyDto,
  SaveAnnouncementDraftDto,
} from './dto/announcement.dto';
import { AnnouncementStreamService } from './announcement-stream.service';

interface IdentitySnapshot {
  username: string;
  realName: string;
  deptName: string | null;
  roleNames: string | null;
}

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(AnnouncementRecipient)
    private readonly recipientRepo: Repository<AnnouncementRecipient>,
    @InjectRepository(AnnouncementReply)
    private readonly replyRepo: Repository<AnnouncementReply>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly stream: AnnouncementStreamService,
  ) {}

  isManager(user: CurrentUserPayload): boolean {
    return user.username === SUPER_ADMIN_USERNAME || user.roleCodes?.includes(ADMIN_ROLE_CODE);
  }

  private assertManager(user: CurrentUserPayload): void {
    if (!this.isManager(user)) throw new ForbiddenException('仅管理员或超级管理员可管理通知公告');
  }

  private cleanDraft(dto: SaveAnnouncementDraftDto) {
    const now = new Date();
    // MySQL DATETIME 不存毫秒；默认立即发布若保留毫秒，往返后可能被驱动舍入到下一秒，
    // 导致紧接着点“发布”被误判成定时公告。默认值先对齐到整秒。
    now.setMilliseconds(0);
    const publishAt = dto.publishAt ? new Date(dto.publishAt) : now;
    if (Number.isNaN(publishAt.getTime())) throw new BadRequestException('发布时间格式不正确');
    let expireAt: Date | null;
    if (dto.expireAt === null) {
      expireAt = null;
    } else if (dto.expireAt) {
      expireAt = new Date(dto.expireAt);
      if (Number.isNaN(expireAt.getTime())) throw new BadRequestException('失效时间格式不正确');
    } else {
      expireAt = new Date(publishAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    }
    if (expireAt && expireAt <= publishAt) throw new BadRequestException('失效时间必须晚于发布时间');
    const title = dto.title.trim();
    const summary = dto.summary.trim();
    const content = dto.content.trim();
    if (!title || !summary || !content) throw new BadRequestException('标题、摘要和正文不能为空');
    return {
      title,
      summary,
      content,
      level: dto.level,
      requiresReply: dto.requiresReply ? 1 : 0,
      publishAt,
      expireAt,
    };
  }

  async createDraft(dto: SaveAnnouncementDraftDto, user: CurrentUserPayload): Promise<Announcement> {
    this.assertManager(user);
    return this.announcementRepo.save(
      this.announcementRepo.create({
        ...this.cleanDraft(dto),
        ...auditOnCreate(user),
        status: ANNOUNCEMENT_STATUS.DRAFT,
        activatedAt: null,
      }),
    );
  }

  async updateDraft(id: number, dto: SaveAnnouncementDraftDto, user: CurrentUserPayload): Promise<Announcement> {
    this.assertManager(user);
    const row = await this.requireAnnouncement(id);
    if (row.status !== ANNOUNCEMENT_STATUS.DRAFT) {
      throw new BadRequestException('公告已发布或已撤回，内容不可修改；如需调整请重新创建');
    }
    await this.announcementRepo.update(id, { ...this.cleanDraft(dto), ...auditOnUpdate(user) });
    return this.announcementRepo.findOneOrFail({ where: { id } });
  }

  async deleteDraft(id: number, user: CurrentUserPayload): Promise<void> {
    this.assertManager(user);
    const row = await this.requireAnnouncement(id);
    if (row.status !== ANNOUNCEMENT_STATUS.DRAFT) throw new BadRequestException('仅草稿可以删除');
    await this.announcementRepo.delete(id);
  }

  async publish(
    id: number,
    dto: PublishAnnouncementDto | undefined,
    user: CurrentUserPayload,
  ): Promise<Announcement> {
    this.assertManager(user);
    dto = dto ?? {};
    const row = await this.requireAnnouncement(id);
    if (row.status !== ANNOUNCEMENT_STATUS.DRAFT) throw new BadRequestException('仅草稿可以发布');

    const publishAt = dto.publishAt ? new Date(dto.publishAt) : row.publishAt;
    const expireAt = dto.expireAt === null || dto.expireAt === ''
      ? null
      : dto.expireAt
        ? new Date(dto.expireAt)
        : row.expireAt;
    if (Number.isNaN(publishAt.getTime()) || (expireAt && Number.isNaN(expireAt.getTime()))) {
      throw new BadRequestException('发布或失效时间格式不正确');
    }
    if (expireAt && expireAt <= publishAt) throw new BadRequestException('失效时间必须晚于发布时间');

    await this.announcementRepo.update(id, {
      status: ANNOUNCEMENT_STATUS.PUBLISHED,
      publishAt,
      expireAt,
      activatedAt: null,
      ...auditOnUpdate(user),
    });
    if (publishAt <= new Date()) await this.activateOne(id);
    return this.announcementRepo.findOneOrFail({ where: { id } });
  }

  async withdraw(id: number, user: CurrentUserPayload): Promise<void> {
    this.assertManager(user);
    const row = await this.requireAnnouncement(id);
    if (row.status !== ANNOUNCEMENT_STATUS.PUBLISHED) throw new BadRequestException('仅已发布公告可以撤回');
    await this.announcementRepo.update(id, {
      status: ANNOUNCEMENT_STATUS.WITHDRAWN,
      ...auditOnUpdate(user),
    });
    this.stream.broadcast('withdrawn');
  }

  async findAdminList(query: QueryAnnouncementAdminDto, user: CurrentUserPayload) {
    this.assertManager(user);
    const pageSize = Math.min(query.pageSize || 20, 100);
    const qb = this.announcementRepo.createQueryBuilder('a');
    if (query.keyword?.trim()) {
      qb.andWhere('(a.title LIKE :kw OR a.summary LIKE :kw)', { kw: `%${query.keyword.trim()}%` });
    }
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.level) qb.andWhere('a.level = :level', { level: query.level });
    if (typeof query.requiresReply === 'boolean') {
      qb.andWhere('a.requires_reply = :rr', { rr: query.requiresReply ? 1 : 0 });
    }
    const total = await qb.getCount();
    const list = await qb
      .addSelect('(SELECT COUNT(*) FROM t_announcement_recipient ar WHERE ar.announcement_id = a.id)', 'recipientCount')
      .addSelect('(SELECT COUNT(*) FROM t_announcement_recipient ar WHERE ar.announcement_id = a.id AND ar.viewed_at IS NOT NULL)', 'viewedCount')
      .addSelect('(SELECT COUNT(*) FROM t_announcement_recipient ar WHERE ar.announcement_id = a.id AND ar.completed_at IS NOT NULL)', 'completedCount')
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .offset(((query.page || 1) - 1) * pageSize)
      .limit(pageSize)
      .getRawAndEntities();
    return {
      list: list.entities.map((row, i) => ({
        ...row,
        recipientCount: Number(list.raw[i]?.recipientCount ?? 0),
        viewedCount: Number(list.raw[i]?.viewedCount ?? 0),
        completedCount: Number(list.raw[i]?.completedCount ?? 0),
        displayStatus: this.displayStatus(row),
      })),
      total,
    };
  }

  /** 激活到点的定时公告。单实例先用内存广播，多实例时由 Redis 接管事件通知。 */
  @Interval(5_000)
  async activateScheduled(): Promise<void> {
    const due = await this.announcementRepo
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .where('a.status = :status', { status: ANNOUNCEMENT_STATUS.PUBLISHED })
      .andWhere('a.activated_at IS NULL')
      .andWhere('a.publish_at <= NOW()')
      .limit(100)
      .getRawMany<{ id: number }>();
    for (const row of due) await this.activateOne(Number(row.id));
  }

  private async activateOne(id: number): Promise<void> {
    const activated = await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(Announcement, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (!row || row.status !== ANNOUNCEMENT_STATUS.PUBLISHED || row.activatedAt || row.publishAt > now) {
        return false;
      }
      row.activatedAt = now;
      await manager.save(row);
      if (!row.expireAt || row.expireAt > now) await this.insertEnabledRecipients(manager, id);
      return true;
    });
    if (activated) this.stream.broadcast('activated');
  }

  private async insertEnabledRecipients(manager: EntityManager, announcementId: number): Promise<void> {
    const users = await manager.find(User, { select: { id: true }, where: { status: 1 } });
    if (!users.length) return;
    await manager
      .createQueryBuilder()
      .insert()
      .into(AnnouncementRecipient)
      .values(users.map((u) => ({ announcementId, userId: u.id })))
      .orIgnore()
      .execute();
  }

  /** 有效期内新建/重新启用账号首次访问接口时自动补为接收人。 */
  private async ensureCurrentRecipients(userId: number): Promise<void> {
    await this.dataSource.query(
      `INSERT IGNORE INTO t_announcement_recipient (announcement_id, user_id, created_at, updated_at)
       SELECT a.id, ?, NOW(), NOW()
       FROM t_announcement a
       JOIN t_user u ON u.id = ? AND u.status = 1
       WHERE a.status = ? AND a.activated_at IS NOT NULL AND a.publish_at <= NOW()
         AND (a.expire_at IS NULL OR a.expire_at > NOW())`,
      [userId, userId, ANNOUNCEMENT_STATUS.PUBLISHED],
    );
  }

  async findPending(user: CurrentUserPayload) {
    await this.ensureCurrentRecipients(user.id);
    const list = await this.dataSource.query(
      `SELECT a.id, a.title, a.summary, a.level, a.requires_reply AS requiresReply,
              a.publish_at AS publishAt, a.expire_at AS expireAt, a.creator_name AS creatorName,
              ar.viewed_at AS viewedAt, ar.completed_at AS completedAt
       FROM t_announcement a
       JOIN t_announcement_recipient ar ON ar.announcement_id = a.id AND ar.user_id = ?
       WHERE a.status = ? AND a.activated_at IS NOT NULL AND ar.completed_at IS NULL
         AND (a.requires_reply = 1 OR a.expire_at IS NULL OR a.expire_at > NOW())
       ORDER BY FIELD(a.level, 'urgent', 'important', 'normal'), a.publish_at DESC, a.id DESC`,
      [user.id, ANNOUNCEMENT_STATUS.PUBLISHED],
    );
    return { list: list.map((r: any) => this.userRow(r, true)), unreadCount: list.length };
  }

  async findHistory(query: QueryAnnouncementHistoryDto, user: CurrentUserPayload) {
    await this.ensureCurrentRecipients(user.id);
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const [countRows, rows] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) AS total FROM t_announcement a
         JOIN t_announcement_recipient ar ON ar.announcement_id = a.id AND ar.user_id = ?
         WHERE a.status = ? AND a.activated_at IS NOT NULL`,
        [user.id, ANNOUNCEMENT_STATUS.PUBLISHED],
      ),
      this.dataSource.query(
        `SELECT a.id, a.title, a.summary, a.level, a.requires_reply AS requiresReply,
                a.publish_at AS publishAt, a.expire_at AS expireAt, a.creator_name AS creatorName,
                ar.viewed_at AS viewedAt, ar.completed_at AS completedAt,
                CASE WHEN ar.completed_at IS NULL AND
                  (a.requires_reply = 1 OR a.expire_at IS NULL OR a.expire_at > NOW()) THEN 1 ELSE 0 END AS isUnread
         FROM t_announcement a
         JOIN t_announcement_recipient ar ON ar.announcement_id = a.id AND ar.user_id = ?
         WHERE a.status = ? AND a.activated_at IS NOT NULL
         ORDER BY a.publish_at DESC, a.id DESC LIMIT ? OFFSET ?`,
        [user.id, ANNOUNCEMENT_STATUS.PUBLISHED, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      list: rows.map((r: any) => this.userRow(r, Number(r.isUnread) === 1)),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async findDetail(id: number, user: CurrentUserPayload) {
    await this.ensureCurrentRecipients(user.id);
    const announcement = await this.requireAnnouncement(id);
    const manager = this.isManager(user);
    if (!manager && (announcement.status !== ANNOUNCEMENT_STATUS.PUBLISHED || !announcement.activatedAt)) {
      throw new NotFoundException('通知公告不存在或已撤回');
    }
    const recipient = await this.recipientRepo.findOne({ where: { announcementId: id, userId: user.id } });
    if (!manager && !recipient) throw new NotFoundException('通知公告不存在或已撤回');
    return {
      ...announcement,
      requiresReply: announcement.requiresReply === 1,
      isUnread: recipient ? this.isRecipientUnread(announcement, recipient) : false,
      viewedAt: recipient?.viewedAt ?? null,
      completedAt: recipient?.completedAt ?? null,
      canManage: manager,
      canReply: Boolean(
        announcement.requiresReply === 1
        && announcement.status === ANNOUNCEMENT_STATUS.PUBLISHED
        && announcement.activatedAt
        && recipient,
      ),
      displayStatus: this.displayStatus(announcement),
    };
  }

  async markViewed(id: number, user: CurrentUserPayload): Promise<void> {
    await this.ensureCurrentRecipients(user.id);
    const announcement = await this.userAnnouncement(id, user.id);
    const snapshot = await this.identitySnapshot(user.id);
    // 快照与首次查看时间必须在一条 SQL 中落库：并发打开详情时，只允许首个请求写身份快照。
    await this.dataSource.query(
      `UPDATE t_announcement_recipient
       SET view_username = ?,
           view_real_name = ?,
           view_dept_name = ?,
           view_role_names = ?,
           completed_at = IF(? = 0, COALESCE(completed_at, NOW()), completed_at),
           viewed_at = NOW(),
           updated_at = NOW()
       WHERE id = ? AND viewed_at IS NULL`,
      [
        snapshot.username,
        snapshot.realName,
        snapshot.deptName,
        snapshot.roleNames,
        announcement.row.requiresReply,
        announcement.recipient.id,
      ],
    );
    if (!announcement.row.requiresReply) {
      // 兼容曾只记录查看时间但未完成的存量行；不触碰已经固化的首次身份快照。
      await this.dataSource.query(
        `UPDATE t_announcement_recipient
         SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [announcement.recipient.id],
      );
    }
    this.stream.notifyUser(user.id, 'viewed');
  }

  async ack(dto: AckAnnouncementDto, user: CurrentUserPayload): Promise<void> {
    await this.ensureCurrentRecipients(user.id);
    const snapshot = await this.identitySnapshot(user.id);
    const ids = [...new Set(dto.ids.map(Number))];
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    // 先用 viewed_at IS NULL 竞争首次查看写入权，只有一个并发请求能固化身份快照。
    await this.dataSource.query(
      `UPDATE t_announcement_recipient ar
       JOIN t_announcement a ON a.id = ar.announcement_id
       SET ar.view_username = ?,
           ar.view_real_name = ?,
           ar.view_dept_name = ?,
           ar.view_role_names = ?,
           ar.completed_at = NOW(),
           ar.viewed_at = NOW(),
           ar.updated_at = NOW()
       WHERE ar.user_id = ? AND ar.announcement_id IN (${placeholders})
         AND a.status = ? AND a.activated_at IS NOT NULL AND a.requires_reply = 0
         AND (a.expire_at IS NULL OR a.expire_at > NOW())
         AND ar.viewed_at IS NULL`,
      [snapshot.username, snapshot.realName, snapshot.deptName, snapshot.roleNames, user.id, ...ids, ANNOUNCEMENT_STATUS.PUBLISHED],
    );
    await this.dataSource.query(
      `UPDATE t_announcement_recipient ar
       JOIN t_announcement a ON a.id = ar.announcement_id
       SET ar.completed_at = COALESCE(ar.completed_at, NOW()), ar.updated_at = NOW()
       WHERE ar.user_id = ? AND ar.announcement_id IN (${placeholders})
         AND a.status = ? AND a.activated_at IS NOT NULL AND a.requires_reply = 0
         AND (a.expire_at IS NULL OR a.expire_at > NOW())`,
      [user.id, ...ids, ANNOUNCEMENT_STATUS.PUBLISHED],
    );
    this.stream.notifyUser(user.id, 'acknowledged');
  }

  async findReplies(id: number, query: QueryAnnouncementReplyDto, user: CurrentUserPayload) {
    await this.ensureCurrentRecipients(user.id);
    const announcement = await this.requireAnnouncement(id);
    const manager = this.isManager(user);
    if (!manager) await this.userAnnouncement(id, user.id);
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const qb = this.replyRepo.createQueryBuilder('r').where('r.announcement_id = :id', { id });
    if (!manager) {
      qb.andWhere('(r.scope = :publicScope OR r.user_id = :userId)', {
        publicScope: ANNOUNCEMENT_REPLY_SCOPE.PUBLIC,
        userId: user.id,
      });
    }
    const total = await qb.getCount();
    const list = await qb
      .orderBy('r.created_at', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();
    return {
      list,
      total,
      page,
      pageSize,
      canManage: manager,
      requiresReply: announcement.requiresReply === 1,
    };
  }

  async createReply(id: number, dto: CreateAnnouncementReplyDto, user: CurrentUserPayload) {
    await this.ensureCurrentRecipients(user.id);
    const { row, recipient } = await this.userAnnouncement(id, user.id);
    if (!row.requiresReply) throw new BadRequestException('该通知公告无需回复');
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('回复内容不能为空');
    const snapshot = await this.identitySnapshot(user.id);
    const reply = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(AnnouncementReply, {
        announcementId: id,
        recipientId: recipient.id,
        userId: user.id,
        username: snapshot.username,
        realName: snapshot.realName,
        deptName: snapshot.deptName,
        roleNames: snapshot.roleNames,
        scope: dto.scope,
        content,
      });
      await manager.query(
        `UPDATE t_announcement_recipient
         SET view_username = ?,
             view_real_name = ?,
             view_dept_name = ?,
             view_role_names = ?,
             completed_at = NOW(),
             viewed_at = NOW(),
             updated_at = NOW()
         WHERE id = ? AND viewed_at IS NULL`,
        [snapshot.username, snapshot.realName, snapshot.deptName, snapshot.roleNames, recipient.id],
      );
      await manager.query(
        `UPDATE t_announcement_recipient
         SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [recipient.id],
      );
      return saved;
    });
    this.stream.notifyUser(user.id, 'replied');
    return reply;
  }

  async findViewRecords(id: number, user: CurrentUserPayload) {
    this.assertManager(user);
    await this.requireAnnouncement(id);
    const list = await this.recipientRepo.find({
      where: { announcementId: id },
      order: { viewedAt: 'ASC', id: 'ASC' },
    });
    return list.filter((r) => r.viewedAt).map((r, index) => ({
      index: index + 1,
      username: r.viewUsername,
      realName: r.viewRealName,
      deptName: r.viewDeptName,
      roleNames: r.viewRoleNames,
      viewedAt: r.viewedAt,
    }));
  }

  async replyExportCount(id: number, user: CurrentUserPayload): Promise<number> {
    this.assertManager(user);
    await this.requireAnnouncement(id);
    return this.replyRepo.count({ where: { announcementId: id } });
  }

  async exportReplies(id: number, user: CurrentUserPayload): Promise<{ buffer: Buffer; title: string }> {
    this.assertManager(user);
    const announcement = await this.requireAnnouncement(id);
    const rows = await this.replyRepo.find({ where: { announcementId: id }, order: { createdAt: 'ASC', id: 'ASC' } });
    if (!rows.length) throw new BadRequestException('当前公告没有回复记录可导出');
    if (rows.length > EXPORT_ROW_LIMIT) {
      throw new BadRequestException(`当前公告有 ${rows.length} 条回复，超过单次导出上限 ${EXPORT_ROW_LIMIT} 条`);
    }
    const wb = createWorkbook();
    const ws = wb.addWorksheet('回复记录');
    ws.columns = [
      { header: '序号' }, { header: '账号' }, { header: '人员' }, { header: '部门' },
      { header: '角色' }, { header: '回复范围' }, { header: '回复内容' }, { header: '回复时间' },
    ];
    rows.forEach((r, index) => ws.addRow([
      index + 1,
      r.username,
      r.realName,
      r.deptName || '',
      r.roleNames || '',
      r.scope === ANNOUNCEMENT_REPLY_SCOPE.PUBLIC ? '公开' : '非公开',
      r.content,
      dateTimeText(r.createdAt),
    ]));
    styleSheet(ws, { centerColumns: [1, 6] });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, title: announcement.title.replace(/[\\/:*?"<>|]/g, '_') };
  }

  private async userAnnouncement(id: number, userId: number): Promise<{ row: Announcement; recipient: AnnouncementRecipient }> {
    const row = await this.requireAnnouncement(id);
    if (row.status !== ANNOUNCEMENT_STATUS.PUBLISHED || !row.activatedAt) {
      throw new NotFoundException('通知公告不存在或已撤回');
    }
    const recipient = await this.recipientRepo.findOne({ where: { announcementId: id, userId } });
    if (!recipient) throw new NotFoundException('通知公告不存在或已撤回');
    return { row, recipient };
  }

  private async requireAnnouncement(id: number): Promise<Announcement> {
    const row = await this.announcementRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('通知公告不存在');
    return row;
  }

  private async identitySnapshot(userId: number): Promise<IdentitySnapshot> {
    const rows = await this.dataSource.query(
      `SELECT u.username, u.real_name AS realName, d.dept_name AS deptName,
              GROUP_CONCAT(DISTINCT r.role_name ORDER BY r.sort, r.id SEPARATOR '、') AS roleNames
       FROM t_user u
       LEFT JOIN t_department d ON d.id = u.dept_id
       LEFT JOIN t_user_role ur ON ur.user_id = u.id
       LEFT JOIN t_role r ON r.id = ur.role_id AND r.status = 1
       WHERE u.id = ? GROUP BY u.id, u.username, u.real_name, d.dept_name`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('用户不存在');
    return {
      username: row.username,
      realName: row.realName || row.username,
      deptName: row.deptName || null,
      roleNames: row.roleNames || null,
    };
  }

  private isRecipientUnread(row: Announcement, recipient: AnnouncementRecipient): boolean {
    if (recipient.completedAt) return false;
    if (row.requiresReply) return true;
    return !row.expireAt || row.expireAt > new Date();
  }

  private userRow(row: any, isUnread: boolean) {
    return {
      ...row,
      requiresReply: Number(row.requiresReply) === 1,
      isUnread,
      levelLabel: ANNOUNCEMENT_LEVEL_OPTIONS.find((o) => o.value === row.level)?.label ?? row.level,
    };
  }

  private displayStatus(row: Announcement): string {
    if (row.status === ANNOUNCEMENT_STATUS.DRAFT) return '草稿';
    if (row.status === ANNOUNCEMENT_STATUS.WITHDRAWN) return '已撤回';
    const now = new Date();
    if (!row.activatedAt || row.publishAt > now) return '定时发布';
    if (row.expireAt && row.expireAt <= now) return '已失效';
    return '发布中';
  }
}
