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
  // 外发
  OUTSOURCE_STATUS_OPTIONS as OUTSOURCE_STATUS,
  OUTSOURCE_STATUS as OUTSOURCE_STATUS_VALUE,
  formatBlankNo,
  qtyFromWeight,
  isItemFullyReturned,
  deriveOutsourceStatus,
  // 装配
  ASSEMBLY_STATUS_OPTIONS as ASSEMBLY_STATUS,
  ASSEMBLY_STATUS as ASSEMBLY_STATUS_VALUE,
  isAssemblyCompleted,
  deriveAssemblyStatus,
  calcInboundQuota,
  isValidSide,
  assemblySides,
  // 成品出入库
  FINISHED_DOC_STATUS_OPTIONS as FINISHED_DOC_STATUS,
  FINISHED_DOC_STATUS as FINISHED_DOC_STATUS_VALUE,
  STOCK_DIRECTION as STOCK_DIRECTION_VALUE,
  FINISHED_BIZ_TYPE,
  FINISHED_BIZ_TYPE_OPTIONS,
  // 启停
  ENABLE_STATUS_OPTIONS as ENABLE_STATUS,
  ENABLE_STATUS as ENABLE_STATUS_VALUE,
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
  expandPartRows,
  // 版本号文本型小数
  normalizeVersion,
} from '@hb-oms/shared';

/** 角色编码 → 中文名映射（与后端种子角色一致） */
export const ROLE_MAP: Record<string, string> = {
  admin: '系统管理员',
  salesman: '业务员',
  merchandiser: '跟单员',
  warehouse: '仓管员',
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
