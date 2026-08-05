import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 订单产品行（四级结构第二级）。
 * 图号/版本/料厚不在本表——已下沉部件组（t_order_part_group，跟踪/台账锚点）。
 * 不落台账冗余列：完成数/出库数/库存数/双欠数一律实时聚合（设计文档 §5）。
 */
@Entity('t_order_product')
export class OrderProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_order')
  @Column({ name: 'order_id', type: 'int', comment: '所属订单' })
  orderId: number;

  @Column({ name: 'order_type', type: 'tinyint', default: 1, comment: '订单类型：1销售订单 2库存备货' })
  orderType: number;

  @Column({ name: 'is_new_order', type: 'tinyint', default: 0, comment: '是否新单：0否 1是' })
  isNewOrder: number;

  @Column({ name: 'is_export', type: 'tinyint', default: 0, comment: '是否出口：0否 1是' })
  isExport: number;

  @Column({ name: 'export_country', type: 'varchar', length: 64, nullable: true, comment: '出口国家' })
  exportCountry: string | null;

  @Column({ name: 'material_id', type: 'int', nullable: true, comment: '物料主数据ID（可空支持手工行）' })
  materialId: number | null;

  @Column({ name: 'material_code', type: 'varchar', length: 64, nullable: true, comment: '物料代码快照（产品编码）' })
  materialCode: string | null;

  @Column({ name: 'item_no', type: 'varchar', length: 64, nullable: true, comment: '货号快照（如 53#）' })
  itemNo: string | null;

  @Column({ name: 'product_name', type: 'varchar', length: 128, nullable: true, comment: '产品名称' })
  productName: string | null;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '产品类型多选组合（字典序逗号拼接，如 standard,self_lock；含 socket 触发卡口规则）',
  })
  productType: string | null;

  @Column({ name: 'rail_section', type: 'varchar', length: 32, nullable: true, comment: '轨道节数：two_section二节轨 three_section三节轨' })
  railSection: string | null;

  @Column({ name: 'dimension_mm', type: 'int', nullable: true, comment: '规格（mm 统一口径，1英寸=25mm）' })
  dimensionMm: number | null;

  @Column({ name: 'dimension_raw', type: 'varchar', length: 32, nullable: true, comment: '规格原始录入值' })
  dimensionRaw: string | null;

  @Column({ name: 'dimension_unit', type: 'varchar', length: 8, nullable: true, comment: '规格录入单位：mm / inch' })
  dimensionUnit: string | null;

  @Column({
    name: 'surface_type',
    type: 'varchar',
    length: 32,
    default: 'none',
    comment: '表面处理（字典 surface_type）：none无 seal_paint封漆 electrophoresis电泳 spray喷涂 smooth_paint平滑漆…；none=不外发',
  })
  surfaceType: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '颜色' })
  color: string | null;

  @Column({ name: 'sheet_material', type: 'varchar', length: 64, nullable: true, comment: '材质（如 Q235）' })
  sheetMaterial: string | null;

  @Column({ name: 'order_qty', type: 'int', comment: '订单数量（按 unit 计）' })
  orderQty: number;

  @Column({ type: 'varchar', length: 16, default: 'piece', comment: '单位：set套 piece支（仅此两种，1套=2支）' })
  unit: string;

  @Column({ name: 'qty_pcs', type: 'int', comment: '支数口径（服务端计算冗余）：套→×2，支→原值；台账「订单数」' })
  qtyPcs: number;

  @Column({
    name: 'production_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '生产单号（手工填写；对应手工台账「订单编号」如 GLI46212-A；台账默认展示此号）',
  })
  productionNo: string | null;

  @Column({
    name: 'assembly_workshop',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '装配车间（字典 assembly_workshop：assembly_1装一~assembly_8装八）；计划属性，装配批次默认继承可覆写',
  })
  assemblyWorkshop: string | null;

  @Column({ name: 'delivery_date', type: 'date', nullable: true, comment: '交货日期' })
  deliveryDate: string | null;

  @Column({ name: 'delivery_address', type: 'varchar', length: 255, nullable: true, comment: '交货地址' })
  deliveryAddress: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '行序' })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
