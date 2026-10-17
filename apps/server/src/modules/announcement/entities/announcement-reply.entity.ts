import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 公告回复是不可变追加流水：提交后不提供修改、删除接口。 */
@Entity('t_announcement_reply')
export class AnnouncementReply {
  @PrimaryGeneratedColumn({ comment: '主键' })
  id: number;

  @Column({ name: 'announcement_id', type: 'int', comment: '公告ID' })
  announcementId: number;

  @Column({ name: 'recipient_id', type: 'int', comment: '接收记录ID' })
  recipientId: number;

  @Column({ name: 'user_id', type: 'int', comment: '回复用户ID' })
  userId: number;

  @Column({ type: 'varchar', length: 64, comment: '回复时账号快照' })
  username: string;

  @Column({ name: 'real_name', type: 'varchar', length: 64, comment: '回复时人员姓名快照' })
  realName: string;

  @Column({ name: 'dept_name', type: 'varchar', length: 128, nullable: true, comment: '回复时部门名称快照' })
  deptName: string | null;

  @Column({ name: 'role_names', type: 'varchar', length: 512, nullable: true, comment: '回复时角色名称快照' })
  roleNames: string | null;

  @Column({ type: 'varchar', length: 16, default: 'public', comment: '回复范围：public公开 private非公开' })
  scope: string;

  @Column({ type: 'text', comment: '回复内容' })
  content: string;

  @CreateDateColumn({ name: 'created_at', comment: '回复时间' })
  createdAt: Date;
}
