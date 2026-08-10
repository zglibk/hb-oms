import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ORDER_STATUS, formatDimension, formatProductModel } from '@hb-oms/shared';

/**
 * 订单**产品行**快照（设计文档 §4.2 锚点约定 + §5.5 业务流水快照原则）。
 *
 * 2026-08-10 起装配批次与成品出入库明细锚定订单产品行——装配的动作是把各部件
 * 组装成整套滑轨，成品入库的对象也是这一整套，都是产品级活动。这些下游建单时
 * 要把订单侧展示字段**快照落库**，且一律由服务端读取、不采信客户端传值（防伪造）。
 *
 * 与 `PartGroupSnapshotService` 并存、各管一层：
 *   - 本服务：装配 / 成品出入库 / 成品期初（产品级锚点）
 *   - 组级服务：外发件回厂（部件确实分开送去表面处理，仍锚部件组）
 * 两边都禁止各模块自写 SQL，避免口径漂移。
 */
export interface ProductSnapshot {
  orderProductId: number;
  orderId: number;
  /** 订单状态：1进行中 2已完结 9已作废 */
  orderStatus: number;
  orderNo: string | null;
  customerName: string | null;
  /** 生产单号（自订单，与 PO# 一对一；对应手工台账「订单编号」） */
  productionNo: string | null;
  /**
   * 产品型号 = 货号 + 产品类型中文组合 + 「滑轨」（如 `53#普通滑轨`）。
   * 共享包 `formatProductModel` 不传组类型即默认整品后缀「滑轨」——产品级要的正是
   * 「整套滑轨」这个语义，不该带「外轨/内轨」这类组后缀。
   */
  productModel: string | null;
  /** 规格展示文本（如 350mm），由共享包 formatDimension 统一拼装 */
  dimensionText: string | null;
  /** 表面处理（字典 surface_type，none = 不外发） */
  surfaceType: string | null;
  /** 产品类型多选组合串（判断是否含卡口用） */
  productType: string | null;
  /** 轨道节数：two_section / three_section */
  railSection: string | null;
  /** 规格（mm 统一口径，属性匹配用） */
  dimensionMm: number | null;
  color: string | null;
  /** 产品支数口径（支）——台账「订单数」与装配排产数量的默认值 */
  qtyPcs: number;
  itemNo: string | null;
  materialCode: string | null;
  deliveryDate: string | null;
  /** 订单数量与单位（原始录入口径：set 套 / piece 支） */
  orderQty: number;
  unit: string | null;
}

@Injectable()
export class ProductSnapshotService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 按产品行 ID 批量取快照。
   *
   * @param mgr 事务 manager；传 null 用默认连接
   * @param productIds 订单产品行 ID 列表
   * @param opts.includeCancelledOrder 是否包含已作废订单的产品行（默认 false = 不返回，
   *        下游建单时「查不到」即等价于「不可选」，调用方据此报错）
   */
  async load(
    mgr: EntityManager | null,
    productIds: number[],
    opts: { includeCancelledOrder?: boolean } = {},
  ): Promise<Map<number, ProductSnapshot>> {
    const map = new Map<number, ProductSnapshot>();
    const ids = [...new Set(productIds.filter((v) => Number.isInteger(v) && v > 0))];
    if (!ids.length) return map;

    const runner = mgr ?? this.dataSource;
    const params: Array<number | string> = [...ids];
    let orderFilter = '';
    if (!opts.includeCancelledOrder) {
      orderFilter = ' AND o.status <> ?';
      params.push(ORDER_STATUS.CANCELLED);
    }

    const rows: any[] = await runner.query(
      `SELECT p.id                AS product_id,
              p.order_id          AS order_id,
              p.qty_pcs           AS qty_pcs,
              p.order_qty         AS order_qty,
              p.unit              AS unit,
              p.item_no           AS item_no,
              p.material_code     AS material_code,
              p.product_type      AS product_type,
              p.rail_section      AS rail_section,
              p.color             AS color,
              p.surface_type      AS surface_type,
              p.delivery_date     AS delivery_date,
              p.dimension_raw     AS dimension_raw,
              p.dimension_unit    AS dimension_unit,
              p.dimension_mm      AS dimension_mm,
              o.status            AS order_status,
              o.order_no          AS order_no,
              o.customer_name     AS customer_name,
              o.production_no     AS production_no
         FROM t_order_product p
         JOIN t_order o ON o.id = p.order_id
        WHERE p.id IN (${ids.map(() => '?').join(',')})${orderFilter}`,
      params,
    );

    rows.forEach((r) => {
      map.set(Number(r.product_id), {
        orderProductId: Number(r.product_id),
        orderId: Number(r.order_id),
        orderStatus: Number(r.order_status),
        orderNo: r.order_no ?? null,
        customerName: r.customer_name ?? null,
        productionNo: r.production_no ?? null,
        // 不传组类型 = 默认整品后缀「滑轨」，产品级正是「整套滑轨」
        productModel: formatProductModel(r.item_no ?? '', r.product_type ?? ''),
        dimensionText: formatDimension(r.dimension_raw, r.dimension_unit, r.dimension_mm),
        surfaceType: r.surface_type ?? null,
        productType: r.product_type ?? null,
        railSection: r.rail_section ?? null,
        dimensionMm: r.dimension_mm == null ? null : Number(r.dimension_mm),
        color: r.color ?? null,
        qtyPcs: Number(r.qty_pcs) || 0,
        itemNo: r.item_no ?? null,
        materialCode: r.material_code ?? null,
        deliveryDate: r.delivery_date ?? null,
        orderQty: Number(r.order_qty) || 0,
        unit: r.unit ?? null,
      });
    });
    return map;
  }

  /** 单个产品行快照；查不到返回 null（订单已作废时同样返回 null） */
  async loadOne(
    mgr: EntityManager | null,
    productId: number,
    opts: { includeCancelledOrder?: boolean } = {},
  ): Promise<ProductSnapshot | null> {
    const map = await this.load(mgr, [productId], opts);
    return map.get(productId) ?? null;
  }
}
