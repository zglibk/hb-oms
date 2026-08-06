import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 装配批次（设计文档 §3.4 / §4.4）。
 *
 * 锚点是**订单部件组 + 边别**（order_part_group_id + side）——含卡口组合的产品
 * 左右各自独立卡量，闸门按 side 分别核算，左右不串量（§7.15）。
 * 一组可多批；`actual_date` 已填即视为该批完成，其 qty 计入成品入库可入库量。
 * status 为派生列，只能由共享包 `deriveAssemblyStatus(actualDate)` 赋值。
 * 其余订单字段为展示快照，订单侧后续修改不回写本表（§5.5 业务流水快照原则）。
 */
@Entity('t_assembly_batch')
@Index('idx_group_side', ['orderPartGroupId', 'side'])
export class AssemblyBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_order')
  @Column({ name: 'order_id', type: 'int', comment: '冗余订单ID（订单下游引用探测按此列）' })
  orderId: number;

  @Index('idx_product')
  @Column({ name: 'order_product_id', type: 'int', comment: '冗余订单产品行ID' })
  orderProductId: number;

  @Column({ name: 'order_part_group_id', type: 'int', comment: '锚点：订单部件组（跟踪/台账粒度）' })
  orderPartGroupId: number;

  @Column({
    name: 'side',
    type: 'varchar',
    length: 16,
    default: '',
    comment: '边别：含卡口组合 left左 right右，其余空串；入库闸门按 side 分别核算，左右不串量',
  })
  side: string;

  @Column({
    name: 'workshop',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment:
      '装配车间（字典 assembly_workshop：装一~装八）；默认继承产品行 assembly_workshop，可覆写为实际装配车间',
  })
  workshop: string | null;

  @Column({ name: 'plan_date', type: 'date', nullable: true, comment: '计划完成时间（计划员录入）' })
  planDate: string | null;

  @Column({
    name: 'actual_date',
    type: 'date',
    nullable: true,
    comment: '实际完成时间：NULL=计划中，非空=已完成（该批数量计入可入库量）',
  })
  actualDate: string | null;

  @Column({ name: 'qty', type: 'int', default: 0, comment: '装配数量（支）' })
  qty: number;

  @Index('idx_status')
  @Column({
    name: 'status',
    type: 'tinyint',
    default: 1,
    comment:
      '状态：1计划中 2已完成；派生自 actual_date（共享包 deriveAssemblyStatus 唯一赋值），落库值须与 actual_date 保持一致',
  })
  status: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, nullable: true, comment: '订单号快照' })
  orderNo: string | null;

  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '客户名称快照',
  })
  customerName: string | null;

  @Column({
    name: 'production_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '生产单号快照（自产品行；台账「订单编号」口径）',
  })
  productionNo: string | null;

  @Column({
    name: 'product_model',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '产品型号快照（自部件组 = 货号+产品类型组合+组后缀，如 45#缓冲外中轨）',
  })
  productModel: string | null;

  @Column({
    name: 'dimension_text',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '规格展示快照（如 350mm）',
  })
  dimensionText: string | null;

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
