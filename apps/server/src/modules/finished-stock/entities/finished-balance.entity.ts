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
 * 唯一键 `(order_product_id, side, batch_no, attr_key)`：余额行一律挂订单产品行，
 * 由「产品行 + 边别 + 批次」唯一，`attr_key` **恒为空串**。
 * 该列原本用于区分「不挂订单的纯属性期初行」，该形态已于 2026-08-11 下线
 * （已完结订单剩下的成品改由呆滞品管理承载），列保留仅因它仍是 uk_balance 的组成部分。
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
  @Column({ name: 'order_id', type: 'int', default: 0, comment: '冗余订单ID' })
  orderId: number;

  @Column({
    name: 'order_product_id',
    type: 'int',
    default: 0,
    comment: '锚点：订单产品行（跟踪/台账粒度）',
  })
  orderProductId: number;

  @Index('idx_item_no')
  @Column({ name: 'item_no', type: 'varchar', length: 64, default: '', comment: '货号（属性快照）' })
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

  @Column({
    name: 'group_type',
    type: 'varchar',
    length: 32,
    default: '',
    comment: '部件组类型（弃用，恒为空串：原仅纯属性期初行使用，该形态已于 2026-08-11 下线）',
  })
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
      '预留：恒为空串（原用于「不挂订单的纯属性期初行」，该形态已于 2026-08-11 下线，改由呆滞品管理承载）；仍参与 uk_balance 唯一键',
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
