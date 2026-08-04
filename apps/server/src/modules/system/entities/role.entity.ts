import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
