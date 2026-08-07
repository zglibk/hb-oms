import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 部件台账变动流水（设计文档 §4.6）。
 *
 * 期初录入与手工调整**共用本表**，靠 `source` 区分——设计文档要求「不直接改数无痕」，
 * 若只给手工调整留痕、期初靠 ON DUPLICATE KEY UPDATE 悄悄累加，期初那部分余量
 * 就永远查不出是谁在什么时候录的，与「无痕」要求相悖。
 *
 * 7 维属性为**快照**：余量行日后若被合并/清理，流水仍能独立还原当时调的是哪一档部件。
 * 轻量记账行，不采番、无单据号（§4.7）。
 */
@Entity('t_part_adjust')
export class PartAdjust {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_balance')
  @Column({
    name: 'balance_id',
    type: 'int',
    default: 0,
    comment: '对应余量行ID（便于按行下钻流水）',
  })
  balanceId: number;

  @Column({ name: 'part_type', type: 'varchar', length: 32, default: '', comment: '部件快照：outer外轨 middle中轨 inner内轨' })
  partType: string;

  @Column({ name: 'side', type: 'varchar', length: 16, default: '', comment: '边别快照：left左 right右，非卡口空串' })
  side: string;

  @Index('idx_item_no')
  @Column({ name: 'item_no', type: 'varchar', length: 64, default: '', comment: '货号快照' })
  itemNo: string;

  @Column({ name: 'rail_section', type: 'varchar', length: 32, default: '', comment: '轨道节数快照' })
  railSection: string;

  @Column({ name: 'product_type', type: 'varchar', length: 128, default: '', comment: '产品类型组合串快照' })
  productType: string;

  @Column({ name: 'material_thickness', type: 'varchar', length: 32, default: '', comment: '料厚快照' })
  materialThickness: string;

  @Column({ name: 'dimension_mm', type: 'int', default: 0, comment: '规格 mm 快照' })
  dimensionMm: number;

  @Column({
    name: 'source',
    type: 'varchar',
    length: 16,
    default: 'manual',
    comment: '变动来源：opening期初录入 manual手工调整',
  })
  source: string;

  @Column({ name: 'delta', type: 'int', default: 0, comment: '调整量（支）：正为增、负为减' })
  delta: number;

  @Column({
    name: 'quantity_after',
    type: 'int',
    default: 0,
    comment: '本次调整后的余量（支），便于逐笔追溯不必重算',
  })
  quantityAfter: number;

  @Column({
    name: 'reason',
    type: 'varchar',
    length: 255,
    comment: '调整原因（必填，如盘盈盘亏/录错纠正/期初补录）',
  })
  reason: string;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '操作人ID' })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true, comment: '操作人姓名快照' })
  creatorName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
