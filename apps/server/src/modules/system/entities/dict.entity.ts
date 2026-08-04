import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
