import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('t_material')
export class Material {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'material_code', type: 'varchar', unique: true })
  materialCode: string;

  @Column({ name: 'item_no', type: 'varchar', length: 64, nullable: true, comment: '货号' })
  itemNo: string | null;

  @Column({ name: 'product_name', type: 'varchar', nullable: true })
  productName: string | null;

  @Column({ type: 'varchar', nullable: true })
  spec: string | null;

  @Column({ name: 'product_type', type: 'varchar', nullable: true })
  productType: string | null;

  /** 默认产品类别（二节轨/三节轨）：two_section / three_section，订单带出用 */
  @Column({ name: 'rail_section', type: 'varchar', length: 32, nullable: true })
  railSection: string | null;

  @Column({ name: 'part_type', type: 'varchar', nullable: true })
  partType: string | null;

  @Column({ name: 'drawing_no', type: 'varchar', nullable: true })
  drawingNo: string | null;

  /** 单位列保留存量数据；表单已不再录入（2026-08 部件信息改版） */
  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ name: 'sheet_material', type: 'varchar', length: 64, nullable: true, comment: '材质（如 Q235）' })
  sheetMaterial: string | null;

  @Column({ name: 'material_thickness', type: 'varchar', length: 32, nullable: true, comment: '料厚（如 1.2 / 1.2×1.0×1.2）' })
  materialThickness: string | null;

  @Column({ name: 'unit_weight', type: 'decimal', precision: 10, scale: 4, nullable: true, comment: '单重(kg/支)' })
  unitWeight: string | null;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'creator_id', type: 'int', nullable: true })
  creatorId: number | null;

  /** 创建人姓名快照（审计用） */
  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true })
  creatorName: string | null;

  /** 最后更新人 ID（审计用） */
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updaterId: number | null;

  /** 最后更新人姓名快照 */
  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
