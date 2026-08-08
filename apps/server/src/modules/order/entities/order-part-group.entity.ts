import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 订单部件组（四级结构第三级——**跟踪与台账的锚点粒度**，设计文档 §4.2）。
 * 多数产品一产品一组（whole 整品）；缓冲类可拆「外中轨」「内轨」等多组，
 * 各组独立图号/版本/料厚。组不拆数量：每组 qty_pcs 默认 = 产品支数
 * （组间是同一批产品的互补部件，非数量拆分）。
 * 外发明细/装配批次/成品出入库/台账行一律锚定本表 id（+side）。
 */
@Entity('t_order_part_group')
@Unique('uk_product_group', ['orderProductId', 'groupType'])
export class OrderPartGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'int', comment: '冗余订单ID（直查用）' })
  orderId: number;

  @Index('idx_product')
  @Column({ name: 'order_product_id', type: 'int', comment: '所属产品行' })
  orderProductId: number;

  @Column({
    name: 'group_type',
    type: 'varchar',
    length: 32,
    default: 'whole',
    comment: '部件组类型（字典 part_group_type）：whole整品 outer_middle外中轨 inner内轨 outer外轨 middle中轨；同产品行内唯一',
  })
  groupType: string;

  @Index('idx_drawing_no')
  @Column({ name: 'drawing_no', type: 'varchar', length: 128, nullable: true, comment: '生产图号（组级；按图号匹配工艺信息自动带入）' })
  drawingNo: string | null;

  @Column({ name: 'drawing_version', type: 'varchar', length: 32, nullable: true, comment: '版本号（组级，文本型小数如 1.1）' })
  drawingVersion: string | null;

  @Column({
    name: 'material_thickness',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '料厚（组级）：整品 外×中×内（2.0×2.0×2.0）、外中轨 外×中（1.2×1.2）、内轨单值（1.5）',
  })
  materialThickness: string | null;

  @Column({ name: 'qty_pcs', type: 'int', comment: '组支数口径，默认=产品行 qty_pcs' })
  qtyPcs: number;

  @Column({
    name: 'product_model',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '产品型号快照 = 货号+产品类型组合+组后缀（如 45#缓冲外中轨、53#普通滑轨；共享包函数拼接）',
  })
  productModel: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '组序' })
  sort: number;

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
