import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 外发（发坯）单头（设计文档 §4.3）。
 * 一张单 = 一次发给同一加工商、同一表面处理+颜色的一批半成品；
 * 明细行锚定订单部件组，回货登记挂在明细行下（支持分批回货）。
 * 状态由回货登记自动推进 2→3→4，也可从 3 手工关闭为 4（须填原因）。
 */
@Entity('t_outsource_doc')
export class OutsourceDoc {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'blank_no',
    type: 'varchar',
    length: 16,
    comment: '发坯单号：7位定长纯数字全局序号（generatePaddedSequence 采番），展示层拼 No. 前缀',
  })
  blankNo: string;

  @Index('idx_processor')
  @Column({ name: 'processor_name', type: 'varchar', length: 128, comment: '加工商（外协厂）' })
  processorName: string;

  @Column({
    name: 'surface_type',
    type: 'varchar',
    length: 32,
    comment: '表面处理（字典 surface_type）：seal_paint封漆 electrophoresis电泳 spray喷涂 smooth_paint平滑漆…；保留值 none 不可外发',
  })
  surfaceType: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '颜色' })
  color: string | null;

  @Index('idx_plan_send_date')
  @Column({ name: 'plan_send_date', type: 'date', nullable: true, comment: '计划发外日期' })
  planSendDate: string | null;

  @Index('idx_actual_send_date')
  @Column({
    name: 'actual_send_date',
    type: 'date',
    nullable: true,
    comment: '实际发外日期（登记后状态推进为 2已发出）',
  })
  actualSendDate: string | null;

  @Column({ name: 'require_back_date', type: 'date', nullable: true, comment: '要求回货日期' })
  requireBackDate: string | null;

  @Index('idx_status')
  @Column({
    type: 'tinyint',
    default: 1,
    comment: '状态：1待发出 2已发出 3部分回货 4已回齐 9已作废',
  })
  status: number;

  @Column({
    name: 'close_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '手工关闭原因（3部分回货 → 4已回齐 时必填，尾数不回/损耗核销场景）',
  })
  closeReason: string | null;

  @Column({ type: 'text', nullable: true, comment: '备注' })
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
