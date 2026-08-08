import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  /**
   * 权限性质：0操作 1查看(只读)。缺省由清单的 accessTypeOf() 推导
   * （菜单=查看、按钮=操作）。角色权限树按此打标签、「仅授只读」按此筛选，
   * RoleService 的同页读权限补齐也按此识别。
   */
  @Column({ name: 'access_type', type: 'tinyint', default: 0 })
  accessType: number;

  @Column({ name: 'creator_id', type: 'int', nullable: true })
  creatorId: number | null;

  /** 创建人姓名快照（清单同步写入的行记为「系统同步」） */
  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true })
  creatorName: string | null;

  /** 最后更新人 ID */
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
