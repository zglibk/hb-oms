import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 成品出入库明细（设计文档 §4.5）。
 *
 * 锚点是**订单部件组 + 边别**；含卡口组合的产品按左右分行，闸门与结存按 side 分别核算。
 * `quantity` **恒为正**，出入方向由单头 direction 表达——聚合时统一 `direction × quantity`，
 * 红字单方向与原单相反，因此天然抵扣、无需特判。
 * 锚点三列为 0 表示「不挂订单的纯属性期初行」（只计库存数，不参与任何订单欠数，§7.9）。
 */
@Entity('t_finished_item')
export class FinishedItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_doc')
  @Column({ name: 'doc_id', type: 'int', comment: '所属单据' })
  docId: number;

  @Index('idx_order')
  @Column({
    name: 'order_id',
    type: 'int',
    default: 0,
    comment: '冗余订单ID（订单下游引用探测按此列）；0=不挂订单的纯属性期初行',
  })
  orderId: number;

  @Column({ name: 'order_product_id', type: 'int', default: 0, comment: '冗余订单产品行ID；0=纯属性期初行' })
  orderProductId: number;

  @Index('idx_part_group')
  @Column({
    name: 'order_part_group_id',
    type: 'int',
    default: 0,
    comment: '锚点：订单部件组（跟踪/台账粒度）；0=纯属性期初行，不参与任何订单欠数',
  })
  orderPartGroupId: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, nullable: true, comment: '订单号快照' })
  orderNo: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 128, nullable: true, comment: '客户名称快照' })
  customerName: string | null;

  @Column({
    name: 'production_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '生产单号快照（自订单 t_order.production_no；台账「订单编号」口径）',
  })
  productionNo: string | null;

  @Column({ name: 'item_no', type: 'varchar', length: 64, nullable: true, comment: '货号快照（如 53#）' })
  itemNo: string | null;

  @Column({
    name: 'product_model',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '产品型号快照（货号+产品类型组合+组后缀，如 45#缓冲外中轨）',
  })
  productModel: string | null;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '产品类型多选组合串快照（字典序逗号拼接，如 standard,self_lock）',
  })
  productType: string | null;

  @Column({
    name: 'group_type',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '部件组类型快照：whole整品 outer_middle外中轨 inner内轨…',
  })
  groupType: string | null;

  @Column({
    name: 'rail_section',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '轨道节数快照：two_section二节轨 three_section三节轨',
  })
  railSection: string | null;

  @Column({ name: 'dimension_text', type: 'varchar', length: 64, nullable: true, comment: '规格展示快照（如 350mm）' })
  dimensionText: string | null;

  @Column({
    name: 'dimension_mm',
    type: 'int',
    nullable: true,
    comment: '规格快照（mm 统一口径，匹配纯属性行用）',
  })
  dimensionMm: number | null;

  @Column({
    name: 'surface_type',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '表面处理快照（字典 surface_type）',
  })
  surfaceType: string | null;

  @Column({ name: 'color', type: 'varchar', length: 64, nullable: true, comment: '颜色快照' })
  color: string | null;

  @Column({
    name: 'side',
    type: 'varchar',
    length: 16,
    default: '',
    comment: '边别：含卡口组合 left左 right右，其余空串；卡口产品按左右分行，左右不串量',
  })
  side: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 64, default: '', comment: '批次号（预留，默认空串）' })
  batchNo: string;

  @Column({
    name: 'quantity',
    type: 'int',
    default: 0,
    comment: '数量（支），**恒为正**；出入方向由单头 direction 表达',
  })
  quantity: number;

  @Index('idx_origin_item')
  @Column({
    name: 'origin_item_id',
    type: 'int',
    nullable: true,
    comment: '红字明细指向被冲原明细行ID；非红字为 NULL',
  })
  originItemId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '行序' })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
