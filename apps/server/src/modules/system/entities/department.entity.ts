import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('t_department')
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dept_code' })
  deptCode: string;

  @Column({ name: 'dept_name' })
  deptName: string;

  @Column({ name: 'parent_id', type: 'int', default: 0 })
  parentId: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '负责人' })
  leader: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '联系电话' })
  phone: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
