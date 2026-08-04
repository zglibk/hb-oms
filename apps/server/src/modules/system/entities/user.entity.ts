import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('t_user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ select: false })
  password: string;

  @Column({ name: 'real_name' })
  realName: string;

  /** 性别：0未知 1男 2女 */
  @Column({ type: 'tinyint', default: 0 })
  gender: number;

  @Column({ name: 'dept_id', type: 'int', nullable: true })
  deptId: number | null;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'login_fail_count', type: 'tinyint', default: 0 })
  loginFailCount: number;

  @Column({ name: 'locked_until', type: 'datetime', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'must_change_pwd', type: 'tinyint', default: 0 })
  mustChangePwd: number;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  /**
   * 会话撤销水位线（安全审查 P1）：签发时间早于此刻的 token 一律失效。
   * 改密、重置密码、停用账号、管理员强制下线时置为当前时间，
   * 用于「一次性撤销该用户的全部会话」（含尚未过期的 refresh token）。
   */
  @Column({
    name: 'token_invalid_before',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  tokenInvalidBefore: Date | null;

  @Column({ nullable: true })
  remark: string;

  @Column({ nullable: true })
  avatar: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
