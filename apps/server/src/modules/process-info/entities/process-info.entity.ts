import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 工艺信息（基础数据，设计文档 §4.1.3）。
 * 创建订单时按生产图号匹配自动带入版本号/产品名称（快照可改）；
 * 机台/长度要求/特殊要求/模具编号在订单表单「查看工艺」抽屉参考展示，不落订单字段。
 * 工艺后续更新不回写历史订单。
 */
@Entity('t_process_info')
export class ProcessInfo {
  @PrimaryGeneratedColumn()
  id: number;

  /** 生产图号（唯一，订单带入匹配键） */
  @Column({ name: 'drawing_no', type: 'varchar', length: 128, unique: true, comment: '生产图号（唯一，匹配键）' })
  drawingNo: string;

  /** 版本号 */
  @Column({ name: 'drawing_version', type: 'varchar', length: 32, nullable: true, comment: '版本号' })
  drawingVersion: string | null;

  @Column({ name: 'customer_id', type: 'int', nullable: true, comment: '客户ID' })
  customerId: number | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 128, nullable: true, comment: '客户名称' })
  customerName: string | null;

  /** 产品名称 */
  @Column({ name: 'product_name', type: 'varchar', length: 128, nullable: true, comment: '产品名称' })
  productName: string | null;

  /** 生产机台（多值逗号存储，展示 89/90/91） */
  @Column({ type: 'varchar', length: 128, nullable: true, comment: '生产机台-薄料/通用（多值逗号存储，如 362,363,364；无厚薄之分时填此列）' })
  machines: string | null;

  @Column({ name: 'machines_thick', type: 'varchar', length: 128, nullable: true, comment: '生产机台-厚料（多值逗号存储，如 82,80,81）' })
  machinesThick: string | null;

  /** 长度要求：外轨 */
  @Column({ name: 'length_req_outer', type: 'varchar', length: 128, nullable: true, comment: '长度要求-外轨' })
  lengthReqOuter: string | null;

  /** 长度要求：中轨 */
  @Column({ name: 'length_req_middle', type: 'varchar', length: 128, nullable: true, comment: '长度要求-中轨' })
  lengthReqMiddle: string | null;

  /** 长度要求：内轨 */
  @Column({ name: 'length_req_inner', type: 'varchar', length: 128, nullable: true, comment: '长度要求-内轨' })
  lengthReqInner: string | null;

  /** 特殊要求：外轨 */
  @Column({ name: 'special_req_outer', type: 'varchar', length: 255, nullable: true, comment: '特殊要求-外轨' })
  specialReqOuter: string | null;

  /** 特殊要求：中轨 */
  @Column({ name: 'special_req_middle', type: 'varchar', length: 255, nullable: true, comment: '特殊要求-中轨' })
  specialReqMiddle: string | null;

  /** 特殊要求：内轨 */
  @Column({ name: 'special_req_inner', type: 'varchar', length: 255, nullable: true, comment: '特殊要求-内轨' })
  specialReqInner: string | null;

  /** 开单注明：外轨（部件级） */
  @Column({ name: 'billing_note_outer', type: 'varchar', length: 255, nullable: true, comment: '开单注明-外轨' })
  billingNoteOuter: string | null;

  /** 开单注明：中轨（部件级） */
  @Column({ name: 'billing_note_middle', type: 'varchar', length: 255, nullable: true, comment: '开单注明-中轨' })
  billingNoteMiddle: string | null;

  /** 开单注明：内轨（部件级） */
  @Column({ name: 'billing_note_inner', type: 'varchar', length: 255, nullable: true, comment: '开单注明-内轨' })
  billingNoteInner: string | null;

  /** 模具编号：外轨 */
  @Column({ name: 'mold_no_outer', type: 'varchar', length: 64, nullable: true, comment: '模具编号-外轨' })
  moldNoOuter: string | null;

  /** 模具编号：中轨 */
  @Column({ name: 'mold_no_middle', type: 'varchar', length: 64, nullable: true, comment: '模具编号-中轨' })
  moldNoMiddle: string | null;

  /** 模具编号：内轨 */
  @Column({ name: 'mold_no_inner', type: 'varchar', length: 64, nullable: true, comment: '模具编号-内轨' })
  moldNoInner: string | null;

  /** 工艺更新说明 */
  @Column({ name: 'process_update_note', type: 'text', nullable: true, comment: '工艺更新说明' })
  processUpdateNote: string | null;

  /** 工艺更新附图（FILE 上传多图，JSON 数组存 URL） */
  @Column({ name: 'review_opinion', type: 'text', nullable: true, comment: '审核意见（产品级，文字）' })
  reviewOpinion: string | null;

  @Column({ name: 'review_images', type: 'varchar', length: 512, nullable: true, comment: '审核意见截图（多图URL JSON数组，可传领导聊天记录截图）' })
  reviewImages: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '审核人（产品级）' })
  reviewer: string | null;

  @Column({ name: 'review_date', type: 'date', nullable: true, comment: '审核日期（产品级）' })
  reviewDate: string | null;

  @Column({ name: 'process_update_images', type: 'varchar', length: 512, nullable: true, comment: '工艺更新附图（多图URL JSON数组）' })
  processUpdateImages: string | null;

  /** 备注 */
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
