/**
 * 产品类型多选组合——前后端唯一事实源（设计文档决策 #8、§2.1）。
 *
 * 存储规则：字典值按 PRODUCT_TYPE_ORDER 固定顺序排序后逗号拼接
 * （如 `standard,self_lock`），保证同一组合唯一表达；
 * 展示为中文顺序拼接（如「普通自锁」）。
 * 两端一律经本文件函数处理，禁止各自手工拆串。
 */
import { partGroupSuffix, splitParts, splitSuffix } from './rail';

/** 产品类型候选值（顺序即组合串的规范排序；扩展新类型追加到末尾并同步字典） */
export const PRODUCT_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '普通', value: 'standard' },
  { label: '缓冲', value: 'buffer' },
  { label: '卡口', value: 'socket' },
  { label: '反弹', value: 'rebound' },
  { label: '自锁', value: 'self_lock' },
  { label: '防倾倒', value: 'anti_tilt' },
];

const PRODUCT_TYPE_ORDER: string[] = PRODUCT_TYPE_OPTIONS.map((o) => o.value);
const PRODUCT_TYPE_LABEL = new Map(PRODUCT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

/** 组合串 → 值数组（容忍空串/未知值原样保留，便于展示排查） */
export function parseProductTypes(combined: string | null | undefined): string[] {
  if (!combined) return [];
  return String(combined)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 值数组 → 规范化组合串（按固定顺序排序 + 去重后逗号拼接）。
 * 入库前必须经本函数，保证「普通+自锁」与「自锁+普通」存储一致。
 */
export function normalizeProductTypes(values: string[] | string | null | undefined): string {
  const arr = Array.isArray(values) ? values : parseProductTypes(values);
  const uniq = [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
  uniq.sort((a, b) => {
    const ia = PRODUCT_TYPE_ORDER.indexOf(a);
    const ib = PRODUCT_TYPE_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return uniq.join(',');
}

/** 组合串/值数组 → 中文展示（如「普通自锁」；未知值原样输出） */
export function formatProductTypes(values: string[] | string | null | undefined): string {
  const arr = Array.isArray(values) ? values : parseProductTypes(values);
  return parseProductTypes(normalizeProductTypes(arr))
    .map((v) => PRODUCT_TYPE_LABEL.get(v) ?? v)
    .join('');
}

/** 组合中是否含「卡口」——含卡口即触发全部卡口规则（左右分列、2支=1套、库存分边别） */
export function hasSocket(values: string[] | string | null | undefined): boolean {
  const arr = Array.isArray(values) ? values : parseProductTypes(values);
  return arr.includes('socket');
}

/**
 * 产品型号拼接：`货号 + 产品类型中文组合 + 部件组后缀`（设计文档 §2.1、决策 #11）。
 * 整品组后缀「滑轨」：(53#, standard) → 53#普通滑轨；
 * 拆组后缀为组名：(45#, buffer, 'outer_middle') → 45#缓冲外中轨。
 * 不传 groupType 时默认整品（兼容不拆组场景）。
 */
export function formatProductModel(
  itemNo: string | null | undefined,
  productTypes: string[] | string | null | undefined,
  groupType?: string | null,
): string {
  return `${itemNo ?? ''}${formatProductTypes(productTypes)}${partGroupSuffix(groupType)}`;
}

/**
 * **产品级**型号（装配/成品出入库/台账等产品级快照的唯一拼法，2026-08-12）：
 * 整品行后缀「滑轨」（如 53#普通滑轨）；分体行（isSplit）后缀由部件组构成推导
 * （如 45#缓冲外中轨 / 45#缓冲内轨）——同订单同货号拆成多行时，下游各处靠它区分。
 * groupTypes / railSection 仅分体行参与推导，整品行忽略。
 */
export function productLevelModel(
  itemNo: string | null | undefined,
  productTypes: string[] | string | null | undefined,
  isSplit: boolean | number | null | undefined,
  groupTypes: Array<string | null | undefined>,
  railSection: string | null | undefined,
): string {
  if (!isSplit) return formatProductModel(itemNo, productTypes);
  return `${itemNo ?? ''}${formatProductTypes(productTypes)}${splitSuffix(splitParts(groupTypes, railSection))}`;
}
