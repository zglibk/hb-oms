/**
 * 滑轨部件与边别口径——前后端唯一事实源。
 */

/** 部件类型（t_order_part.part_type / t_part_balance.part_type） */
export const PART_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '外轨', value: 'outer' },
  { label: '中轨', value: 'middle' },
  { label: '内轨', value: 'inner' },
];

/** 边别：仅产品类型组合含「卡口」时使用；非卡口一律空串 ''（台账唯一键兜底） */
export const SIDE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '左', value: 'left' },
  { label: '右', value: 'right' },
];

/** 轨道节数（t_order_product.rail_section） */
export const RAIL_SECTION_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '二节轨', value: 'two_section' },
  { label: '三节轨', value: 'three_section' },
];

/**
 * 部件组类型（t_order_part_group.group_type，设计文档决策 #11）：
 * 跟踪/台账的锚点粒度。label 供录入选择展示；suffix 供产品型号拼接
 * （如 45#缓冲外中轨）；parts 为该组展开的部件行类型。
 * 同产品行内 group_type 唯一；扩展新组类型追加到末尾并同步字典。
 */
export const PART_GROUP_OPTIONS: Array<{
  label: string;
  value: string;
  suffix: string;
  parts: string[];
}> = [
  { label: '整品', value: 'whole', suffix: '滑轨', parts: ['outer', 'middle', 'inner'] },
  { label: '外中轨', value: 'outer_middle', suffix: '外中轨', parts: ['outer', 'middle'] },
  { label: '内轨', value: 'inner', suffix: '内轨', parts: ['inner'] },
  { label: '外轨', value: 'outer', suffix: '外轨', parts: ['outer'] },
  { label: '中轨', value: 'middle', suffix: '中轨', parts: ['middle'] },
];

const PART_GROUP_MAP = new Map(PART_GROUP_OPTIONS.map((o) => [o.value, o]));

/** 部件组类型 → 选择展示名（未知值原样输出） */
export function partGroupLabel(v: string | null | undefined): string {
  return (v && PART_GROUP_MAP.get(v)?.label) || v || '';
}

/** 部件组类型 → 型号后缀（未知值回退「滑轨」，保证型号可拼） */
export function partGroupSuffix(v: string | null | undefined): string {
  return (v && PART_GROUP_MAP.get(v)?.suffix) || '滑轨';
}

/** 部件组类型 → 应展开的部件行类型列表（未知值回退整品三件） */
export function partGroupParts(v: string | null | undefined): string[] {
  return (v && PART_GROUP_MAP.get(v)?.parts) || ['outer', 'middle', 'inner'];
}

const label = (opts: Array<{ label: string; value: string }>) =>
  new Map(opts.map((o) => [o.value, o.label]));

const PART_LABEL = label(PART_TYPE_OPTIONS);
const SIDE_LABEL = label(SIDE_OPTIONS);
const SECTION_LABEL = label(RAIL_SECTION_OPTIONS);

export function partTypeLabel(v: string | null | undefined): string {
  return (v && PART_LABEL.get(v)) || v || '';
}
export function sideLabel(v: string | null | undefined): string {
  return (v && SIDE_LABEL.get(v)) || '';
}
export function railSectionLabel(v: string | null | undefined): string {
  return (v && SECTION_LABEL.get(v)) || v || '';
}
