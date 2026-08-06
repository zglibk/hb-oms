import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 外发发出明细行（设计文档 §4.3）。
 * 锚点是**订单部件组**（order_part_group_id）——外发按组整体发外，不分左右边别；
 * 其余订单字段为展示快照，订单侧后续修改不回写本表（§5.5 业务流水快照原则）。
 * decimal 列经 TypeORM 返回字符串，服务层统一 Number() 折算。
 */
@Entity('t_outsource_item')
export class OutsourceItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_doc')
  @Column({ name: 'doc_id', type: 'int', comment: '所属发坯单' })
  docId: number;

  @Index('idx_order')
  @Column({ name: 'order_id', type: 'int', comment: '冗余订单ID（订单下游引用探测按此列）' })
  orderId: number;

  @Column({ name: 'order_product_id', type: 'int', comment: '冗余订单产品行ID' })
  orderProductId: number;

  @Index('idx_part_group')
  @Column({ name: 'order_part_group_id', type: 'int', comment: '锚点：订单部件组（跟踪/台账粒度）' })
  orderPartGroupId: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, nullable: true, comment: '订单号快照' })
  orderNo: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 128, nullable: true, comment: '客户名称快照' })
  customerName: string | null;

  @Column({ name: 'production_no', type: 'varchar', length: 64, nullable: true, comment: '生产单号快照（自产品行）' })
  productionNo: string | null;

  @Column({
    name: 'product_model',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '产品型号快照（自部件组 = 货号+产品类型组合+组后缀，如 45#缓冲外中轨）',
  })
  productModel: string | null;

  @Column({ name: 'dimension_text', type: 'varchar', length: 64, nullable: true, comment: '规格展示快照（如 350mm）' })
  dimensionText: string | null;

  @Column({ name: 'cycle_code', type: 'varchar', length: 64, nullable: true, comment: '周期码快照（自部件行追溯码）' })
  cycleCode: string | null;

  @Column({
    name: 'send_weight',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: '发出重量（kg）',
  })
  sendWeight: string;

  @Column({
    name: 'unit_weight',
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    comment: '单重（kg/支），默认自部件信息带出，可改',
  })
  unitWeight: string;

  @Column({
    name: 'send_qty',
    type: 'int',
    default: 0,
    comment: '发出数量（支）= 发出重量 ÷ 单重 四舍五入，允许人工微调',
  })
  sendQty: number;

  @Column({
    name: 'returned_qty',
    type: 'int',
    default: 0,
    comment: '累计回货数量（支）：由回货登记汇总维护，允许超过发出数（重量折算误差）',
  })
  returnedQty: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '行序' })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
