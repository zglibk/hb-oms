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
