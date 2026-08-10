import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 外发件回厂记录（设计文档 §4.3）。
 *
 * **一行 = 一次回厂**。2026-08-10 外发模块经两轮简化到此形态：
 * 先取消「发出」环节，再取消发坯单本身——使用部门只需要记下
 * 「哪个部件组、发给谁做的表面处理、什么时候回厂、回了多少」。
 *
 * 由此本表**没有状态列**（记录存在即已回厂）、**没有单据号**
 * （与装配批次同属轻量记账行，§5.4 不采番）；同一部件组可有多行
 * （分批回厂），不做唯一约束。
 *
 * 锚点是订单部件组；其余订单侧字段为展示快照，订单后续修改不回写
 * （§5.5 业务流水快照原则）。decimal 列经 TypeORM 返回字符串，
 * 服务层统一 Number() 处理。
 */
@Entity('t_outsource_part')
export class OutsourcePart {
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({ name: 'order_qty', type: 'int', default: 0, comment: '订单数量快照（产品行原始录入口径，配合 unit 看）' })
  orderQty: number;

  @Column({ name: 'unit', type: 'varchar', length: 16, nullable: true, comment: '订单单位快照：set套 piece支（1套=2支）' })
  unit: string | null;

  @Column({ name: 'drawing_no', type: 'varchar', length: 128, nullable: true, comment: '生产图号快照（自部件组）' })
  drawingNo: string | null;

  @Column({ name: 'material_thickness', type: 'varchar', length: 32, nullable: true, comment: '材料厚度快照（自部件组）' })
  materialThickness: string | null;

  @Index('idx_processor')
  @Column({ name: 'processor_name', type: 'varchar', length: 128, comment: '加工商（外协厂）' })
  processorName: string;

  @Column({
    name: 'surface_type',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '表面处理（字典 surface_type）：自订单带出，可改；保留值 none 不外发',
  })
  surfaceType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '颜色：自订单带出，可改' })
  color: string | null;

  @Index('idx_back_date')
  @Column({ name: 'back_date', type: 'date', comment: '实际回厂日期（必填——记录存在即代表已回厂）' })
  backDate: string;

  @Column({
    name: 'return_weight',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: '回厂重量（kg）',
  })
  returnWeight: string;

  @Column({
    name: 'unit_weight',
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    comment: '单重（kg/支）：默认自部件信息 t_material.unit_weight 带出，可改',
  })
  unitWeight: string;

  @Column({
    name: 'return_qty',
    type: 'int',
    default: 0,
    comment: '回厂数量（支）= 回厂重量 ÷ 单重 四舍五入，允许人工微调',
  })
  returnQty: number;

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
