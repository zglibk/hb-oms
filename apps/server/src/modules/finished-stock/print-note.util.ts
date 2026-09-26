import { DIMENSION_UNIT, SURFACE_NONE, UNIT_OPTIONS } from '@hb-oms/shared';

/**
 * 纸质单据取数的**共用纯逻辑**（送货单 / 入库单，CLAUDE.md §5.6）。
 *
 * 两张单印给不同的人——送货单给客户、入库单给仓库——版式与列集合完全不同，
 * 但「怎么把出入库明细变成纸面上的一行」这件事是同一套：
 *   1. 含卡口产品按 left/right 分两行落库（结存要按边别核算），纸面只有一行；
 *   2. 内部一律记「支」，纸面按订单单位（套/支）印；
 *   3. 规格、单位中文、分单位合计的口径必须一致。
 *
 * 2026-08-14 入库单落地时按 §4.4「发现第二处相似实现时，先抽公共封装再继续」
 * 从 delivery-note.util.ts 搬出来，两边共用。**本文件不含任何版式知识**
 * （哪几列、列叫什么名由各自的纸面组件决定）。
 */

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/** 单位中文标签（走共享包的选项表，别在这里再写一份 set→套 的映射） */
export function unitLabelOf(unit: string | null | undefined): string {
  const hit = UNIT_OPTIONS.find((o) => o.value === s(unit));
  // 未填单位按「支」——内部口径本就是支，回落到它不会让数字与标签对不上
  return hit?.label ?? '支';
}

/**
 * 规格文本（纸质单口径）：英寸录入印「17寸」、mm 录入印「425mm」。
 *
 * 刻意不用共享包的 `formatDimension`——那个产出 `17"（425mm）` 是内部界面口径，
 * 纸质单那一格只有几个字符宽，看的也只是下单时说的那个数。
 */
export function specTextOf(
  raw: string | number | null | undefined,
  unit: string | null | undefined,
  mm: number | null | undefined,
  fallback: string | null | undefined,
): string {
  if (s(unit) === DIMENSION_UNIT.INCH && s(raw)) return `${s(raw)}寸`;
  if (mm != null && Number(mm) > 0) return `${Number(mm)}mm`;
  return s(fallback);
}

/**
 * 纸面「颜色」格的取值（2026-09-25 使用方要求）：**印表面处理的中文名**（封漆 / 电泳 / 光漆…）。
 *
 * 车间认货看的是表面处理；明细里的「颜色」字段绝大多数没填（本地数据约 3/4 为空），
 * 填了的也常常就是「封漆」这类表面处理——照印颜色字段，纸面这一格基本是空白。
 * 列标题仍叫「颜色」：那是客户 / 仓库纸质单上既有的格子名，不改。
 *
 * 表面处理为空或为「无」（SURFACE_NONE）时印「无」没有意义，回落到颜色字段原值。
 * surfaceLabel 由调用方传入（服务端 dictLabeler 转中文，页面与 PDF 拿到同一个值）。
 */
export function colorTextOf(
  surfaceType: string | null | undefined,
  color: string | null | undefined,
  surfaceLabel: (value: string) => string,
): string {
  const st = s(surfaceType);
  if (st && st !== SURFACE_NONE) return s(surfaceLabel(st)) || st;
  return s(color);
}

/** `mergeByProduct` 需要的最小字段集（各单据的源行都是它的超集） */
export interface MergeableItemRow {
  id: number;
  order_product_id: number;
  quantity: number;
  remark: string | null;
}

/**
 * 按订单产品行合并明细：含卡口产品的 left/right 两行并成一行，支数累加、备注去重后并列。
 *
 * 纸面一行一个产品——左右是内部核算维度（结存按边别隔离），拿给客户或仓库的纸质单上
 * 从来只有一行。备注取各边别去重后并列（左右通常相同，不同则都留着——那多半是
 * 包装说明，丢了就少信息）。
 *
 * 返回的行保留源行的全部字段（取首个出现的边别的快照值），另附：
 * - `_pcs`    合并后的总支数
 * - `_remark` 合并后的备注
 */
export function mergeByProduct<T extends MergeableItemRow>(
  src: T[],
): Array<T & { _pcs: number; _remark: string }> {
  const merged = new Map<string, T & { _pcs: number; _remarks: string[] }>();
  src.forEach((r) => {
    // 锚点恒为订单产品行（纯属性行形态已于 2026-08-11 下线）；真为 0 时退回按明细行分组，
    // 至少不会把两条互不相干的明细并成一行
    const key = Number(r.order_product_id) > 0 ? `p${r.order_product_id}` : `i${r.id}`;
    const hit = merged.get(key);
    if (hit) {
      hit._pcs += Number(r.quantity) || 0;
      if (s(r.remark)) hit._remarks.push(s(r.remark));
      return;
    }
    merged.set(key, {
      ...r,
      _pcs: Number(r.quantity) || 0,
      _remarks: s(r.remark) ? [s(r.remark)] : [],
    });
  });

  return [...merged.values()].map(({ _remarks, ...rest }) => ({
    ...(rest as T & { _pcs: number }),
    _remark: [...new Set(_remarks)].join('；'),
  }));
}

/** `sumByUnit` 需要的最小字段集 */
export interface UnitQtyRow {
  unit: string;
  unitLabel: string;
  qty: number;
}

/**
 * 分单位合计。
 *
 * 全单单位一致时只有一项（表头写「数量（套）」、单元格只写数字）；
 * 混着套与支时**分别合计、并列显示**——把两种单位加成一个数是错的，
 * 界面也据此把表头退化成「数量」、单元格带上单位后缀。
 */
export function sumByUnit(rows: UnitQtyRow[]): UnitQtyRow[] {
  const map = new Map<string, UnitQtyRow>();
  rows.forEach((r) => {
    const hit = map.get(r.unit);
    if (hit) hit.qty += r.qty;
    else map.set(r.unit, { unit: r.unit, unitLabel: r.unitLabel, qty: r.qty });
  });
  // 浮点累加（0.5 套）会出 0.30000000000000004 这种尾巴，统一收两位
  return [...map.values()].map((t) => ({ ...t, qty: Math.round(t.qty * 100) / 100 }));
}
