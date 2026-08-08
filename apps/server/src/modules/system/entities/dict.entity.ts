import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('t_dict')
export class Dict {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dict_type' })
  dictType: string;

  @Column({ name: 'dict_label' })
  dictLabel: string;

  @Column({ name: 'dict_value' })
  dictValue: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ nullable: true })
  remark: string;

  /** 上级字典值（级联用，如产线归属车间的 dict_value） */
  @Column({ name: 'parent_value', type: 'varchar', length: 64, nullable: true })
  parentValue: string | null;

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
