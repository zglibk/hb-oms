import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 订单部件行（四级结构第四级）。
 * 部件组保存时按组类型+节数+卡口自动展开（共享包 expandPartRows）：
 * whole 三节轨 3 行 / 二节轨 2 行（无中轨）；outer_middle 2 行；inner 1 行；
 * 含卡口组合再按左右分列 ×2（每边数量各半）。
 */
@Entity('t_order_part')
export class OrderPart {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'int', comment: '冗余订单ID' })
  orderId: number;

  @Column({ name: 'product_id', type: 'int', comment: '冗余产品行ID' })
  productId: number;

  @Index('idx_group')
  @Column({ name: 'part_group_id', type: 'int', comment: '所属部件组' })
  partGroupId: number;

  @Column({ name: 'part_type', type: 'varchar', length: 32, comment: '部件：outer外轨 middle中轨 inner内轨' })
  partType: string;

  @Column({ type: 'varchar', length: 16, default: '', comment: '边别：left左 right右；仅含卡口组合使用，其余空串' })
  side: string;

  @Column({ name: 'cycle_code', type: 'varchar', length: 64, nullable: true, comment: '产品周期（追溯码）：客户要求压印的追溯日期码，非必填' })
  cycleCode: string | null;

  @Column({ type: 'int', comment: '需求数量（支）' })
  qty: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'int', default: 0, comment: '行序' })
  sort: number;
}
