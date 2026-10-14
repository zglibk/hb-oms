import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { PrintDocumentType } from '../print-config.types';

@Entity('t_print_document_setting')
export class PrintDocumentSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'document_type', type: 'varchar', length: 32, unique: true })
  documentType: PrintDocumentType;

  @Column({ name: 'default_profile_id', type: 'int' })
  defaultProfileId: number;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updaterId: number | null;

  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true })
  updaterName: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

