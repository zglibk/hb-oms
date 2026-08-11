import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 供应商主数据（基础数据）。
 *
 * 用途：给「登记外发件回厂」的加工商等处提供下拉来源，避免同一家厂被写成
 * 简称/全称/错别字多种写法。
 *
 * ⚠️ 业务流水只快照**名称**（`t_outsource_part.processor_name`），不存 supplier_id：
 * 遵循 §5.5「基础数据变更不回写历史单据」；且下拉允许手输新值，
 * 主数据没维护到时不挡录入。改供应商名称不会动历史回厂记录。
 */
@Entity('t_supplier')
export class Supplier {
  @PrimaryGeneratedColumn()
  id: number;

  /** 供应商编码（唯一业务键） */
  @Column({ name: 'supplier_code', type: 'varchar', length: 64, unique: true, comment: '供应商编码（唯一）' })
  supplierCode: string;

  /** 供应商名称；与客户同理**不设唯一**——同一家可能因结算主体不同而有多个编码 */
  @Column({ name: 'supplier_name', type: 'varchar', length: 128, comment: '供应商名称（可重复，编码才是唯一业务键）' })
  supplierName: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 64, nullable: true, comment: '联系人' })
  contactPerson: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 64, nullable: true, comment: '联系电话' })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '地址' })
  address: string | null;

  /** 排序：越小越靠前，控制下拉顺序（常用的厂排前面） */
  @Column({ type: 'int', default: 0, comment: '排序（越小越靠前，控制下拉顺序）' })
  sort: number;

  /** 状态：1启用 0停用。停用只是不再进下拉，历史记录照旧 */
  @Column({ type: 'tinyint', default: 1, comment: '状态：1启用 0停用（停用后不进下拉，历史记录不受影响）' })
  status: number;

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
