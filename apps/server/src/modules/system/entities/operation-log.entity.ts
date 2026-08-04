import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('t_operation_log')
export class OperationLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'user_name', type: 'varchar', nullable: true })
  userName: string | null;

  @Column({ type: 'varchar', nullable: true })
  module: string | null;

  @Column({ type: 'varchar', nullable: true })
  action: string | null;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  method: string | null;

  @Column({ type: 'varchar', nullable: true })
  url: string | null;

  @Column({ type: 'varchar', nullable: true })
  ip: string | null;

  @Column({ type: 'text', nullable: true })
  params: string | null;

  /** 关联业务类型：order/plan/subcontract/material 等 */
  @Column({ name: 'biz_type', type: 'varchar', length: 32, nullable: true })
  bizType: string | null;

  /** 关联业务对象 ID */
  @Column({ name: 'biz_id', type: 'int', nullable: true })
  bizId: number | null;

  @Column({ type: 'tinyint', nullable: true })
  result: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
