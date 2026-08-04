import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('t_role_dept')
export class RoleDept {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @Column({ name: 'dept_id' })
  deptId: number;
}
