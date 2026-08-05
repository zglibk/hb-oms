import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 客户资料（基础数据，设计文档 §4.1.1）。
 * 被订单引用后禁止删除（可停用）；订单创建时快照 customer_name，主数据变更不回写历史单据。
 */
@Entity('t_customer')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  /** 客户代码（唯一，必填；批量导入判重键） */
  @Column({ name: 'customer_code', type: 'varchar', length: 64, unique: true, comment: '客户代码（唯一）' })
  customerCode: string;

  /** 客户名称（唯一，必填） */
  /** 名称不唯一：真实客户存在「一名多码」（同一客户名下多个客户代码，如汉斯达 40+ 码），客户代码才是唯一业务键 */
  @Column({ name: 'customer_name', type: 'varchar', length: 128, comment: '客户名称（可重复，一名多码）' })
  customerName: string;

  /** 联系人 */
  @Column({ name: 'contact_person', type: 'varchar', length: 64, nullable: true, comment: '联系人' })
  contactPerson: string | null;

  /** 联系电话 */
  @Column({ name: 'contact_phone', type: 'varchar', length: 64, nullable: true, comment: '联系电话' })
  contactPhone: string | null;

  /** 默认业务员（订单创建选客户后带出，可改） */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '默认业务员' })
  salesman: string | null;

  /** 默认跟单员（同上） */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '默认跟单员' })
  merchandiser: string | null;

  /** 默认交货地址（同上） */
  @Column({ name: 'delivery_address', type: 'varchar', length: 255, nullable: true, comment: '默认交货地址' })
  deliveryAddress: string | null;

  /** 状态：1启用 0停用 */
  @Column({ type: 'tinyint', default: 1, comment: '状态：1启用 0停用' })
  status: number;

  /** 备注 */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ name: 'creator_id', type: 'int', nullable: true, comment: '创建人ID' })
  creatorId: number | null;

  /** 创建人姓名快照（审计用） */
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
