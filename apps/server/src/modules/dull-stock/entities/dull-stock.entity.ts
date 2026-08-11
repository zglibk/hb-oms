import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 呆滞品档案（2026-08-11 由「成品期初（不挂订单）」拆分独立）。
 *
 * **独立台账**：与订单跟踪台账四数、成品库存 `t_finished_balance` 完全不联动——
 * 呆滞品是已完结订单剩下的成品，不再归属任何订单，出入库也不影响任何订单的欠数。
 *
 * **一行 = 一批呆滞货，刻意不设属性唯一键**：同货号同客户可能先后产生好几批呆滞，
 * 逐批建档才能分别追溯来源与处置进度（这正是原纯属性期初行做不到的——
 * 它靠属性指纹唯一，同属性只能有一行）。
 *
 * 四个数的口径：`结存数 = 期初数 + 入库数 − 出库数`。
 * 期初数建档时录入、可编辑；入库数/出库数是 `t_dull_stock_flow` 的**累计值**，
 * 只由「登记出入库」驱动，任何业务代码都不得直接改这两列（§4.6「不直接改数无痕」）。
 *
 * 轻量记账行，不采番、无单据号（§5.4，与装配批次、外发件回厂记录同列）。
 */
@Entity('t_dull_stock')
export class DullStock {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_item_no')
  @Column({ name: 'item_no', type: 'varchar', length: 64, default: '', comment: '货号（如 53#）' })
  itemNo: string;

  @Index('idx_customer')
  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 128,
    default: '',
    comment: '客户名称（纯文本快照，不关联 t_customer；主数据改名不回写，§5.5）',
  })
  customerName: string;

  @Index('idx_production_no')
  @Column({
    name: 'production_no',
    type: 'varchar',
    length: 64,
    default: '',
    comment: '生产单号（呆滞品来源，纯文本快照，不校验订单是否存在）',
  })
  productionNo: string;

  @Column({
    name: 'product_model',
    type: 'varchar',
    length: 128,
    default: '',
    comment: '产品型号（未填时按 货号+产品类型组合 自动拼，共享包 formatProductModel）',
  })
  productModel: string;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 128,
    default: '',
    comment: '产品类型多选组合串（字典序逗号拼接，如 standard,self_lock）',
  })
  productType: string;

  @Column({
    name: 'rail_section',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '轨道节数：two_section二节轨 three_section三节轨',
  })
  railSection: string;

  @Column({ name: 'dimension_mm', type: 'int', default: 0, comment: '规格（mm 统一口径，1英寸=25mm）' })
  dimensionMm: number;

  @Column({
    name: 'dimension_text',
    type: 'varchar',
    length: 64,
    default: '',
    comment: '规格展示文本（如 350mm）',
  })
  dimensionText: string;

  @Column({
    name: 'surface_type',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '表面处理（字典 surface_type）：none无 seal_paint封漆 electrophoresis电泳 spray喷涂 smooth_paint平滑漆…',
  })
  surfaceType: string;

  @Column({
    name: 'color',
    type: 'varchar',
    length: 64,
    default: '',
    comment: '颜色（字典 surface_color，允许手输新值）',
  })
  color: string;

  @Column({
    name: 'side',
    type: 'varchar',
    length: 16,
    default: '',
    comment: '边别：left左 right右，非卡口空串',
  })
  side: string;

  @Column({
    name: 'unit',
    type: 'varchar',
    length: 16,
    default: 'piece',
    comment: '数量单位：set套 piece支；本行四个数量列一律按本单位计，1套=2支；已有流水后不可改',
  })
  unit: string;

  @Column({
    name: 'opening_qty',
    type: 'int',
    default: 0,
    comment: '期初数：建档时的呆滞存量（单位见 unit）',
  })
  openingQty: number;

  @Column({
    name: 'inbound_qty',
    type: 'int',
    default: 0,
    comment: '入库数：累计入库量 = Σ t_dull_stock_flow 入向流水；只由登记出入库驱动，禁止直接改',
  })
  inboundQty: number;

  @Column({
    name: 'outbound_qty',
    type: 'int',
    default: 0,
    comment: '出库数：累计出库量 = Σ t_dull_stock_flow 出向流水；只由登记出入库驱动，禁止直接改',
  })
  outboundQty: number;

  @Column({
    name: 'balance_qty',
    type: 'int',
    default: 0,
    comment: '结存数 = 期初数 + 入库数 − 出库数，不得为负',
  })
  balanceQty: number;

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
