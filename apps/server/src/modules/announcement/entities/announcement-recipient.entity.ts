import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 系统生成的按人接收/首次查看簿记，唯一键保证同一公告每人只有一条。 */
@Entity('t_announcement_recipient')
export class AnnouncementRecipient {
  @PrimaryGeneratedColumn({ comment: '主键' })
  id: number;

  @Column({ name: 'announcement_id', type: 'int', comment: '公告ID' })
  announcementId: number;

  @Column({ name: 'user_id', type: 'int', comment: '接收用户ID' })
  userId: number;

  @Column({ name: 'viewed_at', type: 'datetime', nullable: true, comment: '首次查看时间' })
  viewedAt: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true, comment: '普通公告已读或要求回复公告首次回复时间' })
  completedAt: Date | null;

  @Column({ name: 'view_username', type: 'varchar', length: 64, nullable: true, comment: '首次查看时账号快照' })
  viewUsername: string | null;

  @Column({ name: 'view_real_name', type: 'varchar', length: 64, nullable: true, comment: '首次查看时人员姓名快照' })
  viewRealName: string | null;

  @Column({ name: 'view_dept_name', type: 'varchar', length: 128, nullable: true, comment: '首次查看时部门名称快照' })
  viewDeptName: string | null;

  @Column({ name: 'view_role_names', type: 'varchar', length: 512, nullable: true, comment: '首次查看时角色名称快照' })
  viewRoleNames: string | null;

  @CreateDateColumn({ name: 'created_at', comment: '接收时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
