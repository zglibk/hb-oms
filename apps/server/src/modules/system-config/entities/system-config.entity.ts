import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 系统配置实体（单行表，id 固定为 1）
 * 字段对应 t_system_config 表结构
 */
@Entity('t_system_config')
export class SystemConfig {
  @PrimaryGeneratedColumn()
  id: number;

  // ===== 公司信息 =====
  @Column({ name: 'logo_url', type: 'varchar', length: 512, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'favicon_url', type: 'varchar', length: 512, nullable: true })
  faviconUrl: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 128, nullable: true })
  companyName: string | null;

  @Column({ name: 'system_name', type: 'varchar', length: 64, nullable: true })
  systemName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 64, nullable: true })
  contactPhone: string | null;

  @Column({ name: 'company_address', type: 'varchar', length: 255, nullable: true })
  companyAddress: string | null;

  @Column({ name: 'bank_account', type: 'varchar', length: 64, nullable: true })
  bankAccount: string | null;

  @Column({ name: 'tax_no', type: 'varchar', length: 64, nullable: true })
  taxNo: string | null;

  @Column({ name: 'copyright_info', type: 'varchar', length: 255, nullable: true })
  copyrightInfo: string | null;

  // ===== 登录页背景 =====
  @Column({ name: 'login_bg_url', type: 'varchar', length: 512, nullable: true })
  loginBgUrl: string | null;

  @Column({ name: 'login_bg_set_as_default', type: 'tinyint', default: 0 })
  loginBgSetAsDefault: number;

  // ===== 元数据 =====
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
