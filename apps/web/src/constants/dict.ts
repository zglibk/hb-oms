import i18nIsoCountries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';
import enLocale from 'i18n-iso-countries/langs/en.json';

/**
 * 前端枚举常量统一引用入口。
 *
 * 业务状态/单位换算/产品类型组合定义在共享包 `@hb-oms/shared`
 * （packages/shared/src/），前后端共用同一份数值与中文文案，不双套手工同步。
 *
 * 本文件命名约定：
 *   - `XXX_STATUS`（数组）：展示映射 { label, value, type }，配合 labelOf/tagTypeOf；
 *   - `XXX_STATUS_VALUE`（对象）：逻辑判断用数值常量。
 * 页面中禁止硬编码状态数字（如 row.status === 1），一律引用命名常量。
 */
export {
  // 订单
  ORDER_STATUS_OPTIONS as ORDER_STATUS,
  ORDER_STATUS as ORDER_STATUS_VALUE,
  ORDER_TYPE_OPTIONS as ORDER_TYPE,
  ORDER_TYPE as ORDER_TYPE_VALUE,
  ORDER_SOURCE_OPTIONS as ORDER_SOURCE,
  // 表面处理（字典驱动，页面经 useDict('surface_type') 取选项；此处仅哨兵与判断函数）
  SURFACE_NONE,
  needsOutsource,
  // 外发：2026-08-10 收敛为「回厂流水」后，只剩重量→数量折算
  // （状态枚举、发坯单号、回齐判定随发坯单一并下线）
  qtyFromWeight,
  // 装配
  ASSEMBLY_STATUS_OPTIONS as ASSEMBLY_STATUS,
  ASSEMBLY_STATUS as ASSEMBLY_STATUS_VALUE,
  isAssemblyCompleted,
  deriveAssemblyStatus,
  calcInboundQuota,
  isValidSide,
  assemblySides,
  // 部件台账
  PART_ADJUST_SOURCE_OPTIONS as PART_ADJUST_SOURCE,
  PART_ADJUST_SOURCE as PART_ADJUST_SOURCE_VALUE,
  // 成品出入库
  FINISHED_DOC_STATUS_OPTIONS as FINISHED_DOC_STATUS,
  FINISHED_DOC_STATUS as FINISHED_DOC_STATUS_VALUE,
  STOCK_DIRECTION as STOCK_DIRECTION_VALUE,
  FINISHED_BIZ_TYPE,
  FINISHED_BIZ_TYPE_OPTIONS,
  // 启停
  ENABLE_STATUS_OPTIONS as ENABLE_STATUS,
  ENABLE_STATUS as ENABLE_STATUS_VALUE,
  // 人事档案
  JOB_STATUS_OPTIONS as JOB_STATUS,
  JOB_STATUS as JOB_STATUS_VALUE,
  GENDER_OPTIONS as GENDER,
  GENDER as GENDER_VALUE,
  EDUCATION_TYPE_OPTIONS as EDUCATION_TYPE,
  EDUCATION_TYPE as EDUCATION_TYPE_VALUE,
  ageFromBirthDate,
  birthDateFromIdCard,
  // 员工编码规则（厂区/年份标识/前缀/拼装，部门编码在 t_department.hr_code）
  EMP_PLANT_OPTIONS,
  EMP_PLANT_CODES,
  empPlantLabel,
  empYearFlag,
  empCodePrefix,
  empCodePreview,
  isConvertToFormal,
  isValidEmpNo,
  // 单位换算（1套=2支、1英寸=25mm）
  PIECES_PER_SET,
  UNIT,
  UNIT_OPTIONS,
  unitFactor,
  toPieces,
  piecesToUnitQty,
  INCH_TO_MM,
  DIMENSION_UNIT,
  DIMENSION_UNIT_OPTIONS,
  toMm,
  normalizeDimensionText,
  formatDimension,
  // 产品类型多选组合
  PRODUCT_TYPE_OPTIONS,
  parseProductTypes,
  normalizeProductTypes,
  formatProductTypes,
  hasSocket,
  formatProductModel,
  // 部件/边别/节数/部件组
  PART_TYPE_OPTIONS,
  SIDE_OPTIONS,
  RAIL_SECTION_OPTIONS,
  PART_GROUP_OPTIONS,
  partTypeLabel,
  sideLabel,
  railSectionLabel,
  partGroupLabel,
  partGroupSuffix,
  partGroupParts,
  defaultGroupTypes,
  expandPartRows,
  // 版本号文本型小数
  normalizeVersion,
} from '@hb-oms/shared';

/**
 * 内置角色编码 → 中文名（与后端 seed-data.ts ROLES / migration-builtin-roles.sql 一致）。
 * 仅作**兜底展示**：角色列表与用户分配处一律取库中 role_name，
 * 这里只服务于拿不到角色对象、手里只有编码的场景。管理员自建角色不在此表，回退显示编码。
 */
export const ROLE_MAP: Record<string, string> = {
  GEN_MGR: '总经理',
  VICE_MGR: '副总经理',
  BUS_MGR: '业务经理',
  BUS_OPR: '业务员',
  DOC_OPR: '跟单员',
  PLN_MGR: '计划经理',
  PLN_OPR: '计划员',
  PROD_MGR: '生产经理',
  PROD_OPR: '生产文员',
  WH_OPR: '仓管员',
  TECH_MGR: '技术经理',
  TECH_ENG: '技术工程师',
  QA_MGR: '品质经理',
  PQE_ENG: 'PQE 工程师',
  FIN_MGR: '财务经理',
  PAY_OPR: '薪资核算员',
  admin: '系统管理员',
};

/**
 * 部件余量「调整原因」预设项（仅前端使用，故不进共享包）。
 *
 * 后端**不做枚举校验**、`reason` 仍是自由文本：选「其他」时用户填的就是任意内容，
 * 校验只能退化成「非空」，加了没有意义；期初模块也会自己传「期初录入」之类的文案。
 * 这里的下拉是**引导**——让手工调整的原因收敛到可统计的几类，而不是硬闸门。
 */
export const PART_ADJUST_REASON_OTHER = '其他';
export const PART_ADJUST_REASON_OPTIONS: string[] = [
  '期初补录',
  '盘盈盘亏',
  '录错纠正',
  PART_ADJUST_REASON_OTHER,
];

/**
 * 表面处理 → 默认颜色（呆滞品建档时**联动带出**，仅前端交互，不进共享包也不做服务端校验）。
 *
 * 厂里呆滞品绝大多数就这两种搭配，逐条手选颜色纯属重复劳动。
 * 联动只在颜色为空、或仍是上一个表面处理带出的默认色时才改写——
 * 用户手工改过的颜色不能被覆盖。
 */
export const SURFACE_DEFAULT_COLOR: Record<string, string> = {
  electrophoresis: '黑色',
  spray: '白色',
};

/** 取角色中文名，未知角色回退为原编码 */
export function roleLabel(code: string): string {
  return ROLE_MAP[code] || code;
}

/** 通用：按 value 取 label / tag 类型 */
export function labelOf(
  list: Array<{ label: string; value: any }>,
  value: any,
): string {
  return list.find((i) => i.value === value)?.label ?? String(value ?? '');
}
export function tagTypeOf(
  list: Array<{ value: any; type?: string }>,
  value: any,
): string {
  return list.find((i) => i.value === value)?.type ?? 'info';
}

/* ===== 出口国家（沿袭 hb-mes：i18n-iso-countries 全量列表 + flag-icons 国旗） ===== */
i18nIsoCountries.registerLocale(zhLocale as never);
i18nIsoCountries.registerLocale(enLocale as never);

export interface CountryOption {
  /** alpha-2 代码（如 CN/US），flag-icons 国旗类名用 */
  code: string;
  /** 中文国家名（落库值） */
  name: string;
  /** 英文全称 */
  englishName: string;
}
const COUNTRY_EN_NAMES = i18nIsoCountries.getNames('en');
export const COUNTRY_OPTIONS: CountryOption[] = Object.entries(
  i18nIsoCountries.getNames('zh'),
).map(([code, name]) => ({ code, name, englishName: COUNTRY_EN_NAMES[code] || code }));
