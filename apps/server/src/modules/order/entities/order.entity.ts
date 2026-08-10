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

  @Column({
    name: 'po_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'PO#（客户订单文件上的订单编号，手工填写；与 production_no 一对一）',
  })
  poNo: string | null;

  @Column({
    name: 'production_no',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment:
      '生产单号（订单级，手工填写；与 po_no 一对一；对应手工台账「订单编号」如 GLI46212-A，台账默认展示此号）',
  })
  productionNo: string | null;

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

  /**
   * 订单备注（图文混排）：wangEditor 输出的 HTML，图片已上传为真实 URL。
   * 与上面的纯文本 remark 并存——remark 是一句话摘要（列表列宽有限），
   * 本字段承载客户来函要求、包装示意图等需要图文说明的内容。
   */
  /**
   * `select: false`：列表页一次拉 20 张单，富文本正文（含多张图片的 <img> 标签）
   * 白白撑大响应体，而列表根本不展示它。详情接口用 addSelect('o.otherReq') 显式补选。
   */
  @Column({
    name: 'other_req',
    type: 'text',
    nullable: true,
    select: false,
    comment: '订单备注（图文混排HTML，wangEditor 输出）',
  })
  otherReq: string | null;

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
