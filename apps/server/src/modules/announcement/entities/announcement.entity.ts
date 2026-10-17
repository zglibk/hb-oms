import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 通知公告正文。草稿可修改；一经发布（含定时发布）即锁定，只允许撤回。 */
@Entity('t_announcement')
export class Announcement {
  @PrimaryGeneratedColumn({ comment: '主键' })
  id: number;

  @Column({ type: 'varchar', length: 128, comment: '公告标题' })
  title: string;

  @Column({ type: 'varchar', length: 255, comment: '公告摘要' })
  summary: string;

  @Column({ type: 'text', comment: '纯文本正文' })
  content: string;

  @Column({ type: 'varchar', length: 16, default: 'normal', comment: '级别：normal普通 important重要 urgent紧急' })
  level: string;

  @Column({ name: 'requires_reply', type: 'tinyint', default: 0, comment: '是否要求回复：1是 0否' })
  requiresReply: number;

  @Column({ type: 'varchar', length: 16, default: 'draft', comment: '状态：draft草稿 published已发布 withdrawn已撤回' })
  status: string;

  @Column({ name: 'publish_at', type: 'datetime', comment: '计划发布时间' })
  publishAt: Date;

  @Column({ name: 'expire_at', type: 'datetime', nullable: true, comment: '失效时间；NULL为永久有效' })
  expireAt: Date | null;

  @Column({ name: 'activated_at', type: 'datetime', nullable: true, comment: '实际激活并生成首批接收人的时间' })
  activatedAt: Date | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '创建人ID' })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true, comment: '创建人姓名快照' })
  creatorName: string | null;

  @Column({ name: 'updated_by', type: 'int', nullable: true, comment: '最后更新人ID' })
  updaterId: number | null;

  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true, comment: '最后更新人姓名快照' })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
