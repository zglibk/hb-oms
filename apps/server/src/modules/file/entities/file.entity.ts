import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('t_file')
export class FileEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'file_no' })
  fileNo: string;

  @Column({ name: 'biz_type', nullable: true })
  bizType: string;

  @Column({ name: 'biz_id', type: 'int', nullable: true })
  bizId: number | null;

  @Column({ name: 'file_path' })
  filePath: string;

  @Column({ name: 'original_name', nullable: true })
  originalName: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number;

  @Column({ name: 'mime_type', nullable: true })
  mimeType: string;

  @Column({ name: 'creator_id', type: 'int', nullable: true })
  creatorId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
