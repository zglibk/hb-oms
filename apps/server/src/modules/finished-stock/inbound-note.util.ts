import { formatProductTypes, piecesToUnitQty, railNameSuffixOf, withRailSuffix, sanitizeItemCode } from '@hb-oms/shared';
import { colorTextOf, mergeByProduct, specTextOf, unitLabelOf } from './print-note.util';

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
  /** 表面处理字典值：纸面「颜色」格印它的中文名（见 colorTextOf） */
  surface_type: string | null;
  remark: string | null;
  /** 以下来自 JOIN 的订单侧（产品行被删时为 null，各字段自行回落明细快照） */
  product_name: string | null;
  /** 分体出货（2026-09-25 起用于产品名称带出货形态）：是否分体 / 节数 / 该行部件组（逗号拼接、按组序） */
  is_split: number | null;
  rail_section: string | null;
  group_types: string | null;
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
  /** 产品类型中文组合（如「普通自锁」），不带宽度；纸面「类别」栏用的是 categoryText（宽度 + 类型） */
  productTypeText: string;
  /** 纸面「产品代码」栏（2026-09-25 起）：货号 */
  itemNo: string;
  /**
   * 纸面「产品名称」栏（2026-09-25 新增，产品代码与规格之间）：订单产品名称，末尾不是「…轨」时补「滑轨」
   * （共享包 withRailSuffix，已含「轨」字不补），如「45#普通」→「45#普通滑轨」。
   */
  productName: string;
  /**
   * 纸面「类别」栏：**滑轨宽度 + 产品类型中文**（如「45#普通」「45#自锁」「35#缓冲卡口」），
   * 见 categoryTextOf。不直接印订单产品名称——那是手填的自由文本（如「45#普通1.0料」
   * 「小三节滑轨」），口径不一（2026-09-25 使用方实测纠正）。
   */
  categoryText: string;
  /**
   * 纸面「料厚」栏（2026-09-25 新增）：该产品各部件组料厚**按组序去重后用「/」并列**
   * （外/中/内轨料厚常不同，如「1.2/1.0」），与台账 joinGroupField 同一写法。
   */
  materialThickness: string;
  /** 纸面「规格」栏：英寸录入 → `17寸`；mm 录入 → `425mm` */
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
 * 入库单「类别」栏：**滑轨宽度 + 产品类型中文**，如「45#普通」「45#普通自锁」「35#缓冲卡口」。
 *
 * 「35#」「45#」里的数字是**滑轨宽度**（「规格」列才是长度）。订单产品行**没有单独的宽度字段**，
 * 只能从录入值里提取，而各订单录法不一（2026-09-25 按真实数据梳理）：
 *   - 多数货号直接就是宽度：「45#」、「45#无锁力」；
 *   - 客户料号当货号的：「D94214E-ZP-W」「DS3832A-22Z-CM」「785140753」，宽度只出现在
 *     产品名称开头（「45#普通」「45#缓冲」）；
 *   - 货号不带 #：「35」。
 * 故按顺序取第一个命中：① 货号以「2~3 位数字 + #」开头；② 产品名称以「2~3 位数字 + #」开头；
 * ③ 货号恰为 2~3 位纯数字（补 #）；都取不到就只印产品类型。
 * 限定 2~3 位数字：避免把「785140753」这类纯数字客户料号误当成宽度。
 * 井号全角半角都认（真实数据里有「45＃缓冲」），输出统一为半角「#」。
 *
 * 产品类型走共享包 formatProductTypes（字典顺序、中文拼接），与全系统型号口径一致。
 */
export function categoryTextOf(
  itemNo: string | null | undefined,
  productName: string | null | undefined,
  productType: string | null | undefined,
): string {
  const item = s(itemNo);
  const name = s(productName);
  const width =
    item.match(/^(\d{2,3})[#＃]/)?.[1] ??
    name.match(/^(\d{2,3})[#＃]/)?.[1] ??
    item.match(/^(\d{2,3})$/)?.[1] ??
    '';
  return `${width ? `${width}#` : ''}${formatProductTypes(productType)}`;
}

/**
 * 入库明细 → 入库单行：按订单产品行合并左右两行、数量折成订单单位、重排序号。
 *
 * 含卡口产品的 left/right 在纸面上合并成一行：入库对象是装配产出的整套滑轨（§5.2），
 * 左右是内部核算维度（结存按边别隔离），仓库点的是「这个产品收了多少」。
 */
export function buildInboundRows(
  src: InboundNoteSourceRow[],
  surfaceLabel: (value: string) => string,
  /** 订单产品行 → 料厚文本（按组序去重、「/」并列；见 loadThicknessByProduct） */
  thicknessOf: (orderProductId: number) => string,
): InboundNoteRow[] {
  return mergeByProduct(src).map((r, i) => {
    const unit = s(r.unit);
    return {
      seq: i + 1,
      orderProductId: Number(r.order_product_id) || 0,
      productModel: s(r.product_model),
      productTypeText: formatProductTypes(r.product_type),
      // 存量值可能夹着中文说明（「45#无锁力」），纸面只印代码部分（sanitizeItemCode，库里不回写）
      itemNo: sanitizeItemCode(r.item_no),
      // 分体行补它的出货形态（外中轨/内轨），整品补「滑轨」——否则分体两行印成同一个名字
      productName: withRailSuffix(
        s(r.product_name),
        railNameSuffixOf(r.is_split, s(r.group_types).split(','), r.rail_section),
      ),
      categoryText: categoryTextOf(r.item_no, r.product_name, r.product_type),
      materialThickness: thicknessOf(Number(r.order_product_id) || 0),
      specText: specTextOf(r.dimension_raw, r.dimension_unit, r.dimension_mm, r.dimension_text),
      color: colorTextOf(r.surface_type, r.color, surfaceLabel),
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
