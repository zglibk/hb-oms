import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 系统更新日志实体
 * 对应 t_changelog 表：记录每个版本的更新条目，前台展示页 + 后台管理 CRUD。
 */
@Entity('t_changelog')
export class Changelog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  version: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @Column({ type: 'json' })
  content: string[];

  @Column({ name: 'released_at', type: 'date' })
  releasedAt: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  category: string | null;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
