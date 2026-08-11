import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 呆滞品出入库流水（2026-08-11）。
 *
 * 一行 = 一笔出入库登记。`quantity` **恒为正**，出入方向由 `direction` 表达
 * （与成品出入库同口径，复用共享包 `STOCK_DIRECTION`），聚合时统一 `direction × quantity`。
 *
 * **录错可整条删除**（与部件台账 `t_part_adjust` 的「只能反向调整」不同）：
 * 呆滞品是可修正的管理账而非凭证账，删一笔比让账面多出一正一负两条更好读。
 * 删除时在同一事务里回滚该笔对档案累计数的影响，回滚后结存为负则拒绝。
 *
 * **刻意不存「变动后结存」快照**：流水可删，存了快照就会在删掉中间一笔后
 * 让后续所有行的快照集体失真，还得回填。改由 service 按 `id ASC`
 * 从档案期初数累计推导后返回，永远与档案的四个数自洽。
 *
 * 只增不改的流水行，按 §5.5 豁免更新侧审计，只带 creator_* + created_at。
 */
@Entity('t_dull_stock_flow')
export class DullStockFlow {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_dull')
  @Column({ name: 'dull_id', type: 'int', comment: '所属呆滞品档案行' })
  dullId: number;

  @Column({
    name: 'direction',
    type: 'tinyint',
    comment: '方向：1入库 -1出库（与成品出入库 STOCK_DIRECTION 同口径）',
  })
  direction: number;

  @Column({
    name: 'quantity',
    type: 'int',
    default: 0,
    comment: '本次数量，**恒为正**；方向由 direction 表达（单位同档案行 unit）',
  })
  quantity: number;

  @Column({ name: 'flow_date', type: 'date', comment: '出入库日期' })
  flowDate: string;

  @Column({
    name: 'reason',
    type: 'varchar',
    length: 255,
    comment: '原因/用途说明（必填，如退货入库/清库处理/盘盈盘亏）',
  })
  reason: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '操作人ID' })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true, comment: '操作人姓名快照' })
  creatorName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
