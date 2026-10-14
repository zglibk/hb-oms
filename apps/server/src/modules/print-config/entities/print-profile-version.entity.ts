import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { PrintProfileConfig } from '../print-config.types';

@Entity('t_print_profile_version')
@Unique('uk_print_profile_version', ['profileId', 'versionNo'])
export class PrintProfileVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'profile_id', type: 'int' })
  profileId: number;

  @Column({ name: 'version_no', type: 'int' })
  versionNo: number;

  @Column({ name: 'config_json', type: 'json' })
  configJson: PrintProfileConfig;

  @Column({ name: 'publisher_id', type: 'int', nullable: true })
  publisherId: number | null;

  @Column({ name: 'publisher_name', type: 'varchar', length: 64, nullable: true })
  publisherName: string | null;

  @CreateDateColumn({ name: 'published_at' })
  publishedAt: Date;
}

