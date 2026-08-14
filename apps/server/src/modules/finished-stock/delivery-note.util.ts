import { DIMENSION_UNIT, UNIT_OPTIONS, piecesToUnitQty } from '@hb-oms/shared';

/**
 * 送货单取数的纯逻辑（CLAUDE.md §5.6「送货单打印」）。
 *
 * 送货单是**给客户的单据**，与系统内部台账口径有两处刻意的差异，都收在本文件：
 *   1. **左右合并**：含卡口产品的出库明细按 left/right 分两行（结存要按边别核算），
 *      但客户拿到的纸质单只有一行——这里按订单产品行合并再折算。
 *   2. **数量跟随订单单位**：内部一律记「支」，送货单按客户下单的口径（套/支）印，
 *      折算走共享包 `piecesToUnitQty`，**不在此另写除法**。
 *
 * 本文件不含任何版式知识：哪几列、列叫什么名、取哪个字段当「品名」，
 * 全由前端模板注册表（web/src/constants/delivery-note.ts）决定，
 * 服务端一律把候选字段都给出去。
 */

/** 明细行的原始形态（service 一条 SQL JOIN 出来的行，字段名与 SQL 别名一致） */
export interface DeliveryNoteSourceRow {
  id: number;
  sort: number;
  order_product_id: number;
  side: string | null;
  quantity: number;
  order_no: string | null;
  production_no: string | null;
  item_no: string | null;
  product_model: string | null;
  dimension_mm: number | null;
  dimension_text: string | null;
  color: string | null;
  remark: string | null;
  /** 以下来自 JOIN 的订单侧（产品行被删时为 null，各字段自行回落明细快照） */
  material_code: string | null;
  customer_drawing_no: string | null;
  product_name: string | null;
  product_requirement: string | null;
  unit: string | null;
  dimension_raw: string | number | null;
  dimension_unit: string | null;
  po_no: string | null;
}

/** 送货单一行（模板无关的全字段行） */
export interface DeliveryNoteRow {
  /** 序号（合并左右后重排，从 1 起） */
  seq: number;
  orderProductId: number;
  /** 采购单编号 / 合同编号（客户订单文件上的号） */
  poNo: string;
  /** 物料编码 / 产品编码（客户方编码）——两套模板叫法不同，取的是同一个字段 */
  materialCode: string;
  /**
   * 客户图号（客户来图上的图号，非部件组的生产图号）。
   * 送货单上没有独立的一列，只作**编码列的回退值**：客户方编码没录时，
   * 印客户图号总比留空强——客户拿这两个号都能对上货。
   * **刻意不受「客户图号」业务字段开关影响**：这里是取值兜底，与「要不要展示客户图号
   * 这个字段」是两回事；且该开关停用的厂本就不录这个号，回退自然取不到值。
   */
  customerDrawingNo: string;
  productName: string;
  /** 产品要求描述（耐斯克模板的「品名」栏取它，多行文本） */
  productRequirement: string;
  /** 产品型号（上面两个都空时的回落值，如 53#普通滑轨） */
  productModel: string;
  itemNo: string;
  /** 规格：英寸录入 → `17寸`；mm 录入 → `425mm`（纸质单口径，不带括号 mm） */
  specText: string;
  /**
   * 颜色（出库明细的快照值）。通用模板有独立的「颜色」列；
   * 该列受 §5.7 全局「颜色」开关控制——停用时整列不印（与其它页面口径一致）。
   */
  color: string;
  /** 数量（已按 unit 折算；奇数支折套会出现 0.5） */
  qty: number;
  /** 订单单位：set / piece */
  unit: string;
  /** 单位中文：套 / 支 */
  unitLabel: string;
  /** 支数原值（内部口径，供对账，不一定上纸面） */
  qtyPcs: number;
  /** 海宝内部单号 = 生产单号 */
  productionNo: string;
  orderNo: string;
  remark: string;
}

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/** 单位中文标签（走共享包的选项表，别在这里再写一份 set→套 的映射） */
export function unitLabelOf(unit: string | null | undefined): string {
  const hit = UNIT_OPTIONS.find((o) => o.value === s(unit));
  // 未填单位按「支」——内部口径本就是支，回落到它不会让数字与标签对不上
  return hit?.label ?? '支';
}

/**
 * 规格文本（送货单口径）：英寸录入印「17寸」、mm 录入印「425mm」。
 *
 * 刻意不用共享包的 `formatDimension`——那个产出 `17"（425mm）` 是内部界面口径，
 * 纸质送货单那一格只有几个字符宽，客户看的也只是下单时说的那个数。
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
 * 出库明细 → 送货单行：按订单产品行合并左右两行、数量折成订单单位、重排序号。
 *
 * 备注取各边别去重后并列（左右备注通常相同，不同则都留着——那多半是包装说明，丢了就少信息）。
 */
export function buildDeliveryRows(src: DeliveryNoteSourceRow[]): DeliveryNoteRow[] {
  const merged = new Map<string, DeliveryNoteSourceRow & { _pcs: number; _remarks: string[] }>();
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

  return [...merged.values()].map((r, i) => {
    const unit = s(r.unit);
    return {
      seq: i + 1,
      orderProductId: Number(r.order_product_id) || 0,
      poNo: s(r.po_no),
      materialCode: s(r.material_code),
      customerDrawingNo: s(r.customer_drawing_no),
      productName: s(r.product_name),
      productRequirement: s(r.product_requirement),
      productModel: s(r.product_model),
      itemNo: s(r.item_no),
      specText: specTextOf(r.dimension_raw, r.dimension_unit, r.dimension_mm, r.dimension_text),
      color: s(r.color),
      qty: piecesToUnitQty(r._pcs, unit),
      unit,
      unitLabel: unitLabelOf(unit),
      qtyPcs: r._pcs,
      productionNo: s(r.production_no),
      orderNo: s(r.order_no),
      remark: [...new Set(r._remarks)].join('；'),
    };
  });
}

/**
 * 分单位合计。
 *
 * 全单单位一致时只有一项（表头写「数量（套）」、单元格只写数字）；
 * 混着套与支时**分别合计、并列显示**——把两种单位加成一个数是错的，
 * 界面也据此把表头退化成「数量」、单元格带上单位后缀。
 */
export function sumByUnit(rows: DeliveryNoteRow[]): Array<{ unit: string; unitLabel: string; qty: number }> {
  const map = new Map<string, { unit: string; unitLabel: string; qty: number }>();
  rows.forEach((r) => {
    const hit = map.get(r.unit);
    if (hit) hit.qty += r.qty;
    else map.set(r.unit, { unit: r.unit, unitLabel: r.unitLabel, qty: r.qty });
  });
  // 浮点累加（0.5 套）会出 0.30000000000000004 这种尾巴，统一收两位
  return [...map.values()].map((t) => ({ ...t, qty: Math.round(t.qty * 100) / 100 }));
}

/**
 * 送货单编号：由出库单号派生，**不新增采番**。
 * `FGO260814-0001` → `20260814-0001`——保持纸质单的日期形态，天然唯一，
 * 客户报号时也能直接回查到系统单据。前缀不匹配（异常单号）时原样回退。
 */
export function deliveryNoOf(docNo: string | null | undefined): string {
  const v = s(docNo);
  return /^[A-Z]{2,4}\d{6}-\d+$/.test(v) ? `20${v.replace(/^[A-Z]+/, '')}` : v;
}
