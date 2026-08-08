import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('t_role')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_code' })
  roleCode: string;

  @Column({ name: 'role_name' })
  roleName: string;

  /** 数据范围：1全部 2本部门 3本部门及下级 4本人 5自定义 */
  @Column({ name: 'data_scope', type: 'tinyint', default: 4 })
  dataScope: number;

  @Column({ name: 'is_builtin', type: 'tinyint', default: 0 })
  isBuiltin: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ nullable: true })
  remark: string;

  @Column({ name: 'creator_id', type: 'int', nullable: true })
  creatorId: number | null;

  /** 创建人姓名快照（审计用，停用/删除用户后仍可追溯） */
  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true })
  creatorName: string | null;

  /** 最后更新人 ID（审计用） */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updaterId: number | null;

  /** 最后更新人姓名快照 */
  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
