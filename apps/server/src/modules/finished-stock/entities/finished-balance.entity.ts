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
 * 成品库存余额（设计文档 §4.5）。
 *
 * 唯一键 `(order_product_id, side, batch_no, attr_key)`：
 * - 挂订单的行由「产品行 + 边别 + 批次」唯一，`attr_key` 恒为空串；
 * - 不挂订单的纯属性期初行锚点列为 0，改由 `attr_key`（属性指纹）兜底唯一。
 *   设计文档原写「应用层保证」，但并发下应用层判重挡不住重复行，故下沉到数据库唯一键。
 *
 * **余额只由单据确认与红字冲销驱动**（同事务内 `SELECT ... FOR UPDATE` 行锁后增减），
 * 任何业务代码都不得直接改 quantity（§4.5 / §7.8）。
 */
@Entity('t_finished_balance')
@Unique('uk_balance', ['orderProductId', 'side', 'batchNo', 'attrKey'])
export class FinishedBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_order')
  @Column({ name: 'order_id', type: 'int', default: 0, comment: '冗余订单ID；0=不挂订单的纯属性期初行' })
  orderId: number;

  @Column({
    name: 'order_product_id',
    type: 'int',
    default: 0,
    comment: '锚点：订单产品行；0=纯属性期初行（只计库存数，不参与任何订单欠数）',
  })
  orderProductId: number;

  @Index('idx_item_no')
  @Column({ name: 'item_no', type: 'varchar', length: 64, default: '', comment: '货号（属性快照，纯属性行的匹配依据）' })
  itemNo: string;

  @Column({ name: 'product_model', type: 'varchar', length: 128, default: '', comment: '产品型号（展示快照）' })
  productModel: string;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 128,
    default: '',
    comment: '产品类型多选组合串（属性快照）',
  })
  productType: string;

  @Column({ name: 'group_type', type: 'varchar', length: 32, default: '', comment: '部件组类型（属性快照）' })
  groupType: string;

  @Column({ name: 'rail_section', type: 'varchar', length: 32, default: '', comment: '轨道节数（属性快照）' })
  railSection: string;

  @Column({ name: 'dimension_mm', type: 'int', default: 0, comment: '规格 mm（属性快照）' })
  dimensionMm: number;

  @Column({ name: 'dimension_text', type: 'varchar', length: 64, default: '', comment: '规格展示文本（展示快照）' })
  dimensionText: string;

  @Column({
    name: 'surface_type',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '表面处理（属性快照，字典 surface_type）',
  })
  surfaceType: string;

  @Column({ name: 'color', type: 'varchar', length: 64, default: '', comment: '颜色（属性快照）' })
  color: string;

  @Column({ name: 'side', type: 'varchar', length: 16, default: '', comment: '边别：含卡口 left/right，其余空串' })
  side: string;

  @Column({ name: 'batch_no', type: 'varchar', length: 64, default: '', comment: '批次号（预留，默认空串）' })
  batchNo: string;

  @Column({
    name: 'attr_key',
    type: 'varchar',
    length: 255,
    default: '',
    comment:
      '纯属性行的属性指纹（货号|类型|组类型|节数|规格|表面处理|颜色），挂订单的行恒为空串；与锚点列一起参与唯一键，把「纯属性行逻辑唯一」下沉到数据库而非依赖应用层自觉',
  })
  attrKey: string;

  @Column({
    name: 'quantity',
    type: 'int',
    default: 0,
    comment: '当前结存（支）；只由单据确认与红字冲销驱动，禁止直接改数',
  })
  quantity: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
