import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('t_role_permission')
export class RolePermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @Column({ name: 'permission_id' })
  permissionId: number;
}
