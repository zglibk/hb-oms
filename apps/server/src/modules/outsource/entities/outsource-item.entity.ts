import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 外发明细行（设计文档 §4.3）。
 * 锚点是**订单部件组**（order_part_group_id）——外发按组整体发外，不分左右边别；
 * 其余订单字段为展示快照，订单侧后续修改不回写本表（§5.5 业务流水快照原则）。
 *
 * 2026-08-10 发出环节取消：删发出重量/单重两列（过磅折算已下线），
 * 「发出数量」改名「应回数量」作为回齐判定基准。回货侧的重量/单重仍在
 * t_outsource_return 上，回货登记照旧折算。
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

  @Column({ name: 'production_no', type: 'varchar', length: 64, nullable: true, comment: '生产单号快照（自订单 t_order.production_no）' })
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

  /**
   * 应回数量（支）：本单该部件组预计要回多少，**回齐判定的基准**。
   * 建单时默认带出「组需求 − 他单已安排」，允许人工改（同一部件组可拆多张单外发）。
   * 2026-08-10 由原「发出数量」改名而来——发出环节取消后不再有过磅折算，
   * 这个数是计划值而非实测值。
   */
  @Column({
    name: 'plan_return_qty',
    type: 'int',
    default: 0,
    comment: '应回数量（支）：本单该部件组预计回多少，回货数≥此数即该行回齐',
  })
  planReturnQty: number;

  @Column({
    name: 'returned_qty',
    type: 'int',
    default: 0,
    comment: '累计回货数量（支）：由回货登记汇总维护，允许超过应回数（重量折算误差）',
  })
  returnedQty: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '行序' })
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
