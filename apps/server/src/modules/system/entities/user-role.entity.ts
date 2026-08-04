import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('t_user_role')
export class UserRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'role_id' })
  roleId: number;
}
