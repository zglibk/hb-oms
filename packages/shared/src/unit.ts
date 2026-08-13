/**
 * 单位换算——前后端唯一事实源。
 *
 * 两条口径（设计文档 §2.1）：
 * 1. 数量：台账/库存/外发一律以「支」为准；订单单位为「套」时 1 套 = 2 支
 *    （滑轨两支一组；卡口产品左右各 1 支为 1 套）。
 * 2. 规格：英寸/mm 双单位录入，换算系数固定 1 英寸 = 25mm（我司统一口径，非国标 25.4）。
 */

/* ===================== 套 ↔ 支 ===================== */

/** 每「套」折合的支数（滑轨两支一组） */
export const PIECES_PER_SET = 2;

/** 单位取值（t_order_product.unit 直接存本枚举字符串） */
export const UNIT = {
  SET: 'set',
  PIECE: 'piece',
} as const;

export const UNIT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '套', value: UNIT.SET },
  { label: '支', value: UNIT.PIECE },
];

/** 单位换算系数：套 → 2，其余（支/未填写）→ 1 */
export function unitFactor(unit?: string | null): number {
  if (!unit) return 1;
  return String(unit).trim() === UNIT.SET ? PIECES_PER_SET : 1;
}

/** 订单数量 → 支数口径（t_order_product.qty_pcs 服务端据此计算） */
export function toPieces(qty: number | null | undefined, unit?: string | null): number {
  return (Number(qty) || 0) * unitFactor(unit);
}

/** 支数 → 订单单位数量（展示折算，保留 2 位小数；奇数支折算会出现 0.5 套） */
export function piecesToUnitQty(pieces: number | null | undefined, unit?: string | null): number {
  const v = (Number(pieces) || 0) / unitFactor(unit);
  return Math.round(v * 100) / 100;
}

/* ===================== 英寸 ↔ mm ===================== */

/** 规格换算系数：1 英寸 = 25mm（我司统一口径，非国标 25.4） */
export const INCH_TO_MM = 25;

/** 规格单位取值（t_order_product.dimension_unit） */
export const DIMENSION_UNIT = {
  MM: 'mm',
  INCH: 'inch',
} as const;

export const DIMENSION_UNIT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'mm', value: DIMENSION_UNIT.MM },
  { label: '英寸', value: DIMENSION_UNIT.INCH },
];

/** 原始录入值 → mm 统一口径（t_order_product.dimension_mm 服务端据此计算） */
export function toMm(value: number | null | undefined, unit?: string | null): number {
  const v = Number(value) || 0;
  return String(unit).trim() === DIMENSION_UNIT.INCH ? Math.round(v * INCH_TO_MM) : Math.round(v);
}

/**
 * 规格展示：mm 录入 → `350mm`；英寸录入 → `14"（350mm）`。
 * raw 为原始录入值（保留小数），mm 为统一口径值。
 */
/**
 * 规格文本归一化（开单信息「规格」字段，1寸=25mm 我司口径）：
 * - "10寸" / "10 寸" / "10\"" → "250mm"（数值×25）；
 * - 纯数字 "250" → "250mm"；
 * - 已带 mm 或其它写法原样保留（trim 后）。
 */
export function normalizeDimensionText(s?: string | null): string {
  if (s === undefined || s === null) return '';
  const t = String(s).trim();
  if (!t) return '';
  const cun = t.match(/^([\d.]+)\s*[寸"]$/);
  if (cun) {
    const n = Number(cun[1]);
    if (!Number.isNaN(n)) return `${Math.round(n * INCH_TO_MM * 100) / 100}mm`;
  }
  if (/^[\d.]+$/.test(t)) return `${t}mm`;
  return t;
}

export function formatDimension(
  raw: number | string | null | undefined,
  unit: string | null | undefined,
  mm: number | null | undefined,
): string {
  if (raw == null || raw === '') return mm ? `${mm}mm` : '';
  if (String(unit).trim() === DIMENSION_UNIT.INCH) return `${raw}"（${mm}mm）`;
  return `${mm}mm`;
}

/**
 * 按查看单位格式化规格（台账等界面临时切单位用，不改库）。
 * 英寸侧展示简称「寸」（1 寸 = 25mm，与录入口径一致）。
 */
export function formatDimensionView(
  mm: number | null | undefined,
  viewUnit: typeof DIMENSION_UNIT.MM | typeof DIMENSION_UNIT.INCH,
): string {
  if (mm == null || Number.isNaN(Number(mm))) return '';
  const n = Number(mm);
  if (viewUnit === DIMENSION_UNIT.INCH) {
    const cun = Math.round((n / INCH_TO_MM) * 100) / 100;
    return `${cun}寸`;
  }
  return `${n}mm`;
}
