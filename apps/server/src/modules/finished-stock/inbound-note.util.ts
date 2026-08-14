import { formatProductTypes, piecesToUnitQty } from '@hb-oms/shared';
import { mergeByProduct, specTextOf, unitLabelOf } from './print-note.util';

/**
 * 入库单取数的纯逻辑（CLAUDE.md §5.6「入库单打印」）。
 *
 * 入库单是**给仓库的内部凭证**（装配完工 → 仓库收货，主管/质检/制单三方签字），
 * 锚点是既有的生产入库单 `t_finished_doc(biz_type='inbound')`，不新建业务表。
 *
 * 与送货单共用的三件事（合并左右、规格文本、单位中文）都在
 * [print-note.util.ts](./print-note.util.ts)，这里只做入库单自己的字段映射。
 * 本文件同样**不含版式知识**——哪几列、列叫什么名由前端纸面组件决定。
 */

/** 明细行的原始形态（service 一条 SQL JOIN 出来的行，字段名与 SQL 别名一致） */
export interface InboundNoteSourceRow {
  id: number;
  sort: number;
  order_product_id: number;
  side: string | null;
  quantity: number;
  order_no: string | null;
  production_no: string | null;
  item_no: string | null;
  product_model: string | null;
  product_type: string | null;
  dimension_mm: number | null;
  dimension_text: string | null;
  color: string | null;
  remark: string | null;
  /** 以下来自 JOIN 的订单侧（产品行被删时为 null，各字段自行回落明细快照） */
  unit: string | null;
  dimension_raw: string | number | null;
  dimension_unit: string | null;
}

/** 入库单一行 */
export interface InboundNoteRow {
  /** 序号（合并左右后重排，从 1 起） */
  seq: number;
  orderProductId: number;
  /**
   * 纸面「产品名称」栏：产品型号快照（货号 + 产品类型中文 + 部件组后缀，
   * 如 `45#自锁外中轨`、`53#普通自锁滑轨`）。业务部门 2026-08-14 指定用它而不是
   * 订单里手填的产品名称——车间认的是货号那一套。
   */
  productModel: string;
  /**
   * 纸面「类别」栏：产品类型中文组合（如「普通自锁」）。
   *
   * ⚠️ 与 `productModel` 里的类型部分**重复是有意的**——使用方要一列单独的类别，
   * 便于清点时一眼归类。别为了"去重"把这列删掉或改成表面处理。
   */
  productTypeText: string;
  itemNo: string;
  /** 纸面「规格型号」栏：英寸录入 → `17寸`；mm 录入 → `425mm` */
  specText: string;
  /** 颜色（入库明细快照）；该列受 §5.7 全局「颜色」开关控制，停用时整列不印 */
  color: string;
  /** 数量（已按订单单位折算；奇数支折套会出现 0.5） */
  qty: number;
  /** 订单单位：set / piece */
  unit: string;
  /** 单位中文：套 / 支 */
  unitLabel: string;
  /** 支数原值（内部口径，供对账） */
  qtyPcs: number;
  productionNo: string;
  orderNo: string;
  remark: string;
}

const s = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * 入库明细 → 入库单行：按订单产品行合并左右两行、数量折成订单单位、重排序号。
 *
 * 含卡口产品的 left/right 在纸面上合并成一行：入库对象是装配产出的整套滑轨（§5.2），
 * 左右是内部核算维度（结存按边别隔离），仓库点的是「这个产品收了多少」。
 */
export function buildInboundRows(src: InboundNoteSourceRow[]): InboundNoteRow[] {
  return mergeByProduct(src).map((r, i) => {
    const unit = s(r.unit);
    return {
      seq: i + 1,
      orderProductId: Number(r.order_product_id) || 0,
      productModel: s(r.product_model),
      productTypeText: formatProductTypes(r.product_type),
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
