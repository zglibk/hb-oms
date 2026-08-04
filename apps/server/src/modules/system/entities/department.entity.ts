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

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
