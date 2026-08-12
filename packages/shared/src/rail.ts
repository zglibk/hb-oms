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

/**
 * 新建产品行时的**默认部件组序列**（2026-08-10 起按部件维度跟踪）：
 *   三节轨 → 外轨 / 中轨 / 内轨；二节轨 → 外轨 / 内轨（二节轨无中轨）
 *
 * 从前默认单个「整品」组，跟踪粒度到不了部件；改成按节数铺开部件组后，
 * 外发回厂、装配、出入库、台账都能逐部件核算。
 *
 * **必须按节数返回**：中轨组在二节轨下 expandPartRows 展开为空，
 * 服务端会直接拒绝保存（"当前节数下无可展开部件"），所以二节轨不能带中轨。
 * 前端表单默认值与服务端兜底共用此函数，避免两端分叉。
 */
export function defaultGroupTypes(railSection: string | null | undefined): string[] {
  return railSection === 'two_section'
    ? ['outer', 'inner']
    : ['outer', 'middle', 'inner'];
}

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

/**
 * 部件行展开蓝图（订单部件组保存时自动展开，设计文档 §4.2）：
 * - 二节轨（two_section）无中轨，组内 middle 部件自动剔除；
 * - 含卡口（socket）左右分列 ×2，每边数量 = 组支数一半（卡口左右各1支为1套）；
 * - 返回 [{ partType, side, qty }]；qty 由 groupQtyPcs 推导，非卡口整行全量。
 * 卡口奇数支数时左边多 1 支（Math.ceil / Math.floor），保证合计守恒。
 */
export function expandPartRows(
  groupType: string | null | undefined,
  railSection: string | null | undefined,
  socket: boolean,
  groupQtyPcs: number,
): Array<{ partType: string; side: string; qty: number }> {
  const base = partGroupParts(groupType).filter(
    (pt) => railSection !== 'two_section' || pt !== 'middle',
  );
  if (!socket) {
    return base.map((pt) => ({ partType: pt, side: '', qty: groupQtyPcs }));
  }
  const left = Math.ceil(groupQtyPcs / 2);
  const right = groupQtyPcs - left;
  return base.flatMap((pt) => [
    { partType: pt, side: 'left', qty: left },
    { partType: pt, side: 'right', qty: right },
  ]);
}

/* ===== 分体出货（t_order_product.is_split，2026-08-12）=====
 * 客户把一支滑轨拆成多行下单（如三节轨拆「外中轨」+「内轨」两行），各行分开
 * 包装出货、不组装成整品。分体行的**出货形态不落库**，由该行部件组构成即时
 * 推导（组列表就是事实源），避免出现第二个需要人工保持一致的字段。 */

/** 部件固定排序（外→中→内）与取字表，分体形态推导用 */
const PART_ORDER: string[] = PART_TYPE_OPTIONS.map((o) => o.value);
const PART_CHAR: Record<string, string> = { outer: '外', middle: '中', inner: '内' };

/**
 * 是否允许开启「分体出货」——**仅三节轨**（2026-08-12 业务口径）。
 *
 * 二节轨只有外/内两个部件，厂里不存在拆单下单的场景；技术上虽然推导得出形态，
 * 但放开只会多一条误开关的路径。前端据此禁用开关，服务端硬校验兜住 API 直调。
 */
export function canSplitShipping(railSection: string | null | undefined): boolean {
  return railSection === 'three_section';
}

/**
 * 该组类型在当前节数下是否可选。两类不可用：
 * - 展开为空（二节轨的中轨组）——服务端本就会拒绝保存；
 * - **组名点名了具体部件、却被节数剔除掉一部分**（二节轨的「外中轨」实际只剩外轨）：
 *   组类型写着外中轨、出货形态却推导成外轨，账面自相矛盾，故一并禁用。
 *   「整品」是相对语义（有几个部件就含几个），不受这条限制。
 */
export function isGroupTypeAvailable(
  groupType: string | null | undefined,
  railSection: string | null | undefined,
): boolean {
  const actual = expandPartRows(groupType, railSection, false, 1);
  if (!actual.length) return false;
  if (groupType === 'whole') return true;
  return actual.length === partGroupParts(groupType).length;
}

/**
 * 组合型组（含 ≥2 个部件，如 外中轨 / 整品）→ 应拆成的**单部件组**类型列表；
 * 单部件组返回空数组（无需拆）。部件类型值（outer/middle/inner）与单部件组类型
 * 一一对应，故可直接复用。
 *
 * 用途：**表面处理 ≠ 无（需外发）时不该挂组合型组**——外发锚定部件组，挂一个
 * 「外中轨」组会导致 ① 回厂只能按一条记账、分不出各部件回了多少；② 单重按部件
 * 建档，组合型组取不到准确单重，重量折算数量会系统性偏差。
 */
export function splitCombinedGroup(
  groupType: string | null | undefined,
  railSection: string | null | undefined,
): string[] {
  const parts = [...new Set(expandPartRows(groupType, railSection, false, 1).map((r) => r.partType))];
  return parts.length > 1 ? PART_ORDER.filter((p) => parts.includes(p)) : [];
}

/**
 * 分体行部件组构成 → 实际出货部件并集（外→中→内固定序去重）；
 * 二节轨剔除中轨，与 expandPartRows 蓝图同口径。
 */
export function splitParts(
  groupTypes: Array<string | null | undefined>,
  railSection: string | null | undefined,
): string[] {
  const set = new Set<string>();
  groupTypes.forEach((g) => partGroupParts(g).forEach((p) => set.add(p)));
  return PART_ORDER.filter(
    (p) => set.has(p) && (railSection !== 'two_section' || p !== 'middle'),
  );
}

/**
 * 分体形态后缀（产品型号拼接用）：按部件取字生成——{外,中}→外中轨、{内}→内轨、
 * {中,内}→中内轨……不枚举组合、天然全覆盖；空数组回退「滑轨」保证型号可拼。
 */
export function splitSuffix(parts: string[]): string {
  if (!parts.length) return '滑轨';
  return `${parts.map((p) => PART_CHAR[p] ?? '').join('')}轨`;
}

/**
 * 该产品行是否受装配入库闸门（Σ已完成装配 − Σ已入库）约束：
 * 分体且只含单一部件（如内轨）→ 没有装配环节，免闸门（否则永远入不了库）；
 * 整品、或分体但含 ≥2 部件（外中轨仍要把外轨+中轨组装）→ 照常受闸门约束。
 */
export function needsAssemblyGate(
  isSplit: boolean | number | null | undefined,
  parts: string[],
): boolean {
  return !(Boolean(isSplit) && parts.length === 1);
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
