import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 生产 BOM 表头；业务字段均保存快照，主数据后续变更不回写。 */
@Entity('t_production_bom')
export class ProductionBom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'process_info_id', type: 'int', nullable: true, comment: '关联开单信息ID（可空）' })
  processInfoId: number | null;

  @Column({ name: 'drawing_no', type: 'varchar', length: 128, comment: '生产图号' })
  drawingNo: string;

  @Column({ name: 'customer_id', type: 'int', nullable: true, comment: '关联客户ID（可空）' })
  customerId: number | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 128, nullable: true, comment: '客户名称快照' })
  customerName: string | null;

  @Column({ name: 'product_name', type: 'varchar', length: 128, comment: '产品/BOM名称' })
  productName: string;

  @Column({ type: 'varchar', length: 32, comment: 'BOM版本号（文本，如1.0）' })
  version: string;

  @Column({ name: 'prepared_by', type: 'varchar', length: 64, comment: '制表人' })
  preparedBy: string;

  @Column({ name: 'prepared_date', type: 'date', comment: '制表日期' })
  preparedDate: string;

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
