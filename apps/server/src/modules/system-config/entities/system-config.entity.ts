import {
  Column,
  CreateDateColumn,
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

  // ===== 业务字段开关 =====
  /**
   * 「颜色」字段全局启用开关：1启用 0停用。
   * **录入与展示**开关，不是数据清理开关——关掉只是全系统不再录入/展示颜色，
   * 库中既有 color 值原样保留，重新打开即恢复可见。
   */
  @Column({
    name: 'color_field_enabled',
    type: 'tinyint',
    default: 1,
    comment: '颜色字段启用开关：1启用 0停用（停用后全系统隐藏颜色的录入与展示，不删除既有数据）',
  })
  colorFieldEnabled: number;

  /**
   * 「客户图号」字段全局启用开关：1启用 0停用。
   * 语义同上（录入与展示开关，不删除既有数据）。
   * 注意是产品级的**客户来图图号**，不是部件组的生产图号 drawing_no。
   */
  @Column({
    name: 'customer_drawing_no_enabled',
    type: 'tinyint',
    default: 1,
    comment: '客户图号字段启用开关：1启用 0停用（停用后全系统隐藏客户图号的录入与展示，不删除既有数据）',
  })
  customerDrawingNoEnabled: number;

  // ===== 元数据 =====
  // 单例配置行（id 恒为 1，由 db:init 建好），语义上只有"被修改"没有"被创建"，
  // 故只带更新侧审计；created_at 仅用于记录该行何时落库。
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  /** 最后更新人姓名快照 */
  @Column({ name: 'updater_name', type: 'varchar', length: 64, nullable: true })
  updaterName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
