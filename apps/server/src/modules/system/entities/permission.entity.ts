import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('t_permission')
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'perm_code' })
  permCode: string;

  @Column({ name: 'perm_name' })
  permName: string;

  /** 权限类型：1菜单 2按钮 3接口 */
  @Column({ name: 'perm_type', type: 'tinyint' })
  permType: number;

  @Column({ name: 'parent_id', type: 'int', default: 0 })
  parentId: number;

  @Column({ name: 'menu_path', type: 'varchar', nullable: true })
  menuPath: string | null;

  @Column({ type: 'varchar', nullable: true })
  component: string | null;

  @Column({ name: 'api_pattern', type: 'varchar', nullable: true })
  apiPattern: string | null;

  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
