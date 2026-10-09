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

  /**
   * 「呆滞品颜色」字段启用开关：1启用 0停用。
   *
   * **刻意独立于 `colorFieldEnabled`**（2026-08-11）：呆滞品建档时表面处理与颜色是
   * 配套联动带出的（电泳→黑色 / 喷涂→白色），颜色是这本账辨认货物的主要依据；
   * 而全局颜色开关是给「订单/外发口径用不到颜色」的厂关的。两者诉求不同，
   * 合用一个开关会出现「关了全局颜色，呆滞品就认不出货」的尴尬，故各管各的。
   */
  @Column({
    name: 'dull_stock_color_enabled',
    type: 'tinyint',
    default: 1,
    comment:
      '呆滞品颜色字段启用开关：1启用 0停用；**独立于 color_field_enabled**，只管呆滞品管理页的颜色列与建档弹窗',
  })
  dullStockColorEnabled: number;

  /** 「产品要求描述」启用开关（订单产品级的特殊要求文本，2026-08-13 加） */
  @Column({
    name: 'product_requirement_enabled',
    type: 'tinyint',
    default: 1,
    comment:
      '产品要求描述字段启用开关：1启用 0停用（停用后隐藏订单产品级「产品要求描述」的录入与展示，不删除既有数据）',
  })
  productRequirementEnabled: number;

  /**
   * 英寸换算系数（1 英寸 = N mm）。**非布尔配置**，与上面几个开关不是一类。
   *
   * 抽自共享包写死的 `INCH_TO_MM`（我司口径 25，非国标 25.4）。改动只影响
   * 「之后的录入折算」与「所有寸视图的显示」，**已落库的 dimension_mm 永不重算**——
   * 存储值始终是权威，否则历史订单的规格会随一次配置改动集体漂移。
   *
   * transformer 必需：MySQL 的 DECIMAL 经驱动回来是字符串，不转会让前端拿到 "25.000"。
   */
  @Column({
    name: 'inch_to_mm',
    type: 'decimal',
    precision: 6,
    scale: 3,
    default: 25,
    transformer: {
      to: (v: number) => v,
      from: (v: string | number | null) => (v == null ? 25 : Number(v)),
    },
    comment:
      '英寸换算系数：1 英寸 = N mm（我司口径 25，非国标 25.4）；仅影响之后的录入折算与寸视图显示，不重算已落库 mm',
  })
  inchToMm: number;

  /** 规格默认查看单位（mm / inch）：三张汇总页的初始视图与两个导出的规格列都看它 */
  @Column({
    name: 'dimension_view_unit',
    type: 'varchar',
    length: 8,
    default: 'mm',
    comment:
      '规格默认查看单位：mm毫米 inch寸；控制首页/订单跟踪台账/订单管理三页的初始视图与台账、总计划两个导出的规格列',
  })
  dimensionViewUnit: string;

  /**
   * 送货单默认模板编码：客户资料未单独配置模板时用它（送货单打印，§5.6）。
   * 版式定义在前端注册表 web/src/constants/delivery-note.ts；库里不做值域约束，
   * 打印页取到未知编码时回落通用模板。
   */
  @Column({
    name: 'delivery_template_default',
    type: 'varchar',
    length: 32,
    default: 'generic',
    comment:
      '送货单默认模板编码：nsk耐斯克 jinggong精工 generic通用；客户资料未单独配置模板时用它',
  })
  deliveryTemplateDefault: string;

  /*
   * 业务记录修改主管角色（角色编码逗号分隔，2026-09-26 使用方要求——防止自己建的数据被别人改掉）：
   * 订单 / 外发回厂记录 / 装配批次 / 成品出入库单只允许创建人与对应模块的主管角色修改、删除，
   * **管理员与超级管理员均不例外**；主管再受其角色「数据范围」约束。判定统一在 RecordOwnershipService。
   */
  @Column({
    name: 'order_edit_roles',
    type: 'varchar',
    length: 255,
    default: 'BUS_MGR',
    comment:
      '订单修改主管角色：角色编码逗号分隔；订单只允许创建人与这些角色的用户修改/删除（管理员与超级管理员均不例外，主管受数据范围约束），缺省 BUS_MGR 业务经理',
  })
  orderEditRoles: string;

  @Column({
    name: 'outsource_edit_roles',
    type: 'varchar',
    length: 255,
    default: 'PLN_MGR',
    comment:
      '外发回厂记录修改主管角色：角色编码逗号分隔；只允许创建人与这些角色的用户修改/删除（管理员与超级管理员均不例外，主管受数据范围约束），缺省 PLN_MGR 计划经理',
  })
  outsourceEditRoles: string;

  @Column({
    name: 'assembly_edit_roles',
    type: 'varchar',
    length: 255,
    default: 'PLN_MGR,PROD_MGR',
    comment:
      '装配批次修改主管角色：角色编码逗号分隔；只允许创建人与这些角色的用户修改/删除（管理员与超级管理员均不例外，主管受数据范围约束），缺省 PLN_MGR 计划经理、PROD_MGR 生产经理',
  })
  assemblyEditRoles: string;

  @Column({
    name: 'finished_edit_roles',
    type: 'varchar',
    length: 255,
    default: 'PLN_MGR',
    comment:
      '成品出入库单修改主管角色：角色编码逗号分隔；草稿的编辑/作废/确认只允许创建人与这些角色的用户（管理员与超级管理员均不例外，主管受数据范围约束），缺省 PLN_MGR 计划经理',
  })
  finishedEditRoles: string;

  /**
   * 数据大屏免登录访问码的 SHA-256 摘要；NULL = 免登录访问关闭。
   * `select: false`：完整配置接口会把整行回给前端，摘要也不外露。
   * 读写只走 SystemConfigService 的 screen-key 系列方法。
   */
  @Column({
    name: 'screen_key_hash',
    type: 'char',
    length: 64,
    nullable: true,
    select: false,
    comment: '数据大屏免登录访问码的 SHA-256 摘要（十六进制）；NULL=免登录访问关闭，明文不落库',
  })
  screenKeyHash: string | null;

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
