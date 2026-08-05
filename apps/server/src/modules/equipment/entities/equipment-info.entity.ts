import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 设备信息（设备适产记录）：记录机台适合生产哪些产品/部件及对应用料。
 * 一台机可多行（不同产品型号/部件各一行），属基础数据（可编辑、无单据流转）。
 */
@Entity('t_equipment_info')
export class EquipmentInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_machine_no')
  @Column({ name: 'machine_no', type: 'varchar', length: 32, comment: '机台号（如 89、362）' })
  machineNo: string;

  @Column({ name: 'product_model', type: 'varchar', length: 128, nullable: true, comment: '产品型号（如 45#缓冲滑轨）' })
  productModel: string | null;

  @Column({ name: 'part_type', type: 'varchar', length: 32, nullable: true, comment: '部件（字典 part_type）：outer外轨 middle中轨 inner内轨' })
  partType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '机修员' })
  mechanic: string | null;

  @Column({ name: 'material_spec', type: 'varchar', length: 128, nullable: true, comment: '用料规格（如 卷料 65×1.2）' })
  materialSpec: string | null;

  @Column({ name: 'drawing_no', type: 'varchar', length: 128, nullable: true, comment: '图号' })
  drawingNo: string | null;

  @Column({ name: 'common_thickness', type: 'varchar', length: 64, nullable: true, comment: '常用料厚（如 1.2 / 1.2×1.0×1.2）' })
  commonThickness: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '创建人ID' })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true, comment: '创建人姓名快照' })
  creatorName: string | null;

  @Column({ name: 'updated_by', type: 'int', nullable: true, comment: '最后更新人ID' })
  updaterId: number | null;

  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true, comment: '最后更新人姓名快照' })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
