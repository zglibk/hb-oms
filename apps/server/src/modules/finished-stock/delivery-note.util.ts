import { piecesToUnitQty } from '@hb-oms/shared';
import { mergeByProduct, specTextOf, sumByUnit, unitLabelOf } from './print-note.util';

/**
 * 送货单取数的纯逻辑（CLAUDE.md §5.6「送货单打印」）。
 *
 * 送货单是**给客户的单据**，与系统内部台账口径有两处刻意的差异：
 *   1. **左右合并**：含卡口产品的出库明细按 left/right 分两行（结存要按边别核算），
 *      但客户拿到的纸质单只有一行——按订单产品行合并再折算。
 *   2. **数量跟随订单单位**：内部一律记「支」，送货单按客户下单的口径（套/支）印，
 *      折算走共享包 `piecesToUnitQty`，**不在此另写除法**。
 *
 * 上面两条与「规格文本、单位中文、分单位合计」的实现都在
 * [print-note.util.ts](./print-note.util.ts)，与《入库单》共用（2026-08-14 按 §4.4 抽出）；
 * 本文件只剩送货单**专有**的部分：单号派生与字段映射。
 *
 * 本文件不含任何版式知识：哪几列、列叫什么名、取哪个字段当「品名」，
 * 全由前端模板注册表（web/src/constants/delivery-note.ts）决定，
 * 服务端一律把候选字段都给出去。
 */

// 共用件对外仍从本文件可见：service 与既有调用方无需改 import 路径
export { specTextOf, sumByUnit, unitLabelOf };

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

/**
 * 出库明细 → 送货单行：按订单产品行合并左右两行、数量折成订单单位、重排序号。
 * 合并与折算见 print-note.util.ts，这里只做送货单的字段映射。
 */
export function buildDeliveryRows(src: DeliveryNoteSourceRow[]): DeliveryNoteRow[] {
  return mergeByProduct(src).map((r, i) => {
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
      remark: r._remark,
    };
  });
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
