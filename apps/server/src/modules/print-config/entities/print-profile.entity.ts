import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { PrintDocumentType, PrintProfileConfig } from '../print-config.types';

@Entity('t_print_profile')
export class PrintProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, comment: '纸型名称' })
  name: string;

  @Column({ name: 'document_type', type: 'varchar', length: 32, comment: '单据类型：delivery_note/inbound_note' })
  documentType: PrintDocumentType;

  @Column({ type: 'tinyint', default: 1, comment: '状态：1启用 0停用' })
  status: number;

  @Column({ name: 'is_builtin', type: 'tinyint', default: 0, comment: '是否内置回退纸型' })
  isBuiltin: number;

  @Column({ name: 'draft_config', type: 'json', comment: '未发布草稿配置' })
  draftConfig: PrintProfileConfig;

  @Column({ name: 'published_version_id', type: 'int', nullable: true, comment: '当前发布版本ID' })
  publishedVersionId: number | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true })
  creatorName: string | null;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updaterId: number | null;

  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

