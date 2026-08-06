import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 外发回货登记（设计文档 §4.3）。
 * 一条 = 一次分批回货；同一发出明细行可有多条。
 * 累计回货数回写 t_outsource_item.returned_qty，并据此推进单头状态；
 * 撤销登记后累计数与状态自动回退（§7.6）。
 */
@Entity('t_outsource_return')
export class OutsourceReturn {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_doc')
  @Column({ name: 'doc_id', type: 'int', comment: '冗余发坯单ID' })
  docId: number;

  @Index('idx_item')
  @Column({ name: 'item_id', type: 'int', comment: '所属发出明细行（一行可多条 = 分批回货）' })
  itemId: number;

  @Index('idx_back_date')
  @Column({ name: 'back_date', type: 'date', comment: '回货日期' })
  backDate: string;

  @Column({
    name: 'return_weight',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: '收回重量（kg）',
  })
  returnWeight: string;

  @Column({
    name: 'unit_weight',
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    comment: '单重（kg/支），默认带出发出行单重，可改',
  })
  unitWeight: string;

  @Column({
    name: 'return_qty',
    type: 'int',
    default: 0,
    comment: '收回数量（支）= 收回重量 ÷ 单重 四舍五入，允许人工微调',
  })
  returnQty: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '创建人ID' })
  creatorId: number | null;

  @Column({ name: 'creator_name', type: 'varchar', length: 64, nullable: true, comment: '创建人姓名快照' })
  creatorName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
