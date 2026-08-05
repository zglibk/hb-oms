import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 订单主表（四级结构第一级：订单 → 产品行 → 部件组 → 部件行，设计文档 §4.2）。
 * 无审核流，创建即生效；「完结」是台账口径不锁单据（§3.1）。
 */
@Entity('t_order')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_no', type: 'varchar', length: 32, unique: true, comment: '系统单号，ORD 采番' })
  orderNo: string;

  @Column({ name: 'po_no', type: 'varchar', length: 64, nullable: true, comment: 'PO#（客户单号/合同号）' })
  poNo: string | null;

  @Column({ name: 'customer_id', type: 'int', nullable: true, comment: '客户ID（t_customer，可空支持手输客户）' })
  customerId: number | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 128, comment: '客户名称快照' })
  customerName: string;

  @Column({ name: 'order_date', type: 'date', comment: '订单日期' })
  orderDate: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '业务员' })
  salesman: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '跟单员' })
  merchandiser: string | null;

  @Column({
    name: 'order_source',
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '下单来源：official_doc官方订单文件 verbal口头 phone电话 social社交软件',
  })
  orderSource: string | null;

  @Column({ name: 'attachment_ids', type: 'varchar', length: 512, nullable: true, comment: '订单原始文件附件URL（JSON数组）' })
  attachmentIds: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '状态：1进行中 2已完结 9已作废' })
  status: number;

  @Column({ name: 'is_opening', type: 'tinyint', default: 0, comment: '期初补录标记：0正常 1期初补录（免非关键必填校验）' })
  isOpening: number;

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
