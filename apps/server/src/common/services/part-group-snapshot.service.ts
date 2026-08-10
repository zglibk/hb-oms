import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ORDER_STATUS, formatDimension } from '@hb-oms/shared';

/**
 * 订单部件组快照（设计文档 §4.2 锚点约定 + §5.5 业务流水快照原则）。
 *
 * 部件组是一切下游单据的锚点，下游建单时必须把订单侧的展示字段**快照落库**，
 * 且这些值一律由服务端从上游表读取，不采信客户端传值（防伪造）。
 * 外发明细（M3）、装配批次（M3.5）、成品出入库明细（M4）读的是同一份字段，
 * 故下沉本服务统一提供，避免各模块各写一份 SQL 导致口径漂移。
 */
export interface PartGroupSnapshot {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  /** 订单状态：1进行中 2已完结 9已作废 */
  orderStatus: number;
  orderNo: string | null;
  customerName: string | null;
  /** 生产单号（自订单，与 PO# 一对一；对应手工台账「订单编号」） */
  productionNo: string | null;
  /** 产品型号（自部件组 = 货号+产品类型组合+组后缀） */
  productModel: string | null;
  /** 规格展示文本（如 350mm），由共享包 formatDimension 统一拼装 */
  dimensionText: string | null;
  /** 周期码：取该组下首个非空追溯码（外发单打印用） */
  cycleCode: string | null;
  /** 表面处理（字典 surface_type，none = 不外发） */
  surfaceType: string | null;
  /** 产品类型多选组合串（判断是否含卡口用） */
  productType: string | null;
  /** 轨道节数：two_section / three_section */
  railSection: string | null;
  /** 规格（mm 统一口径，属性匹配用） */
  dimensionMm: number | null;
  /** 颜色 */
  color: string | null;
  /** 部件组类型：whole/outer_middle/inner… */
  groupType: string | null;
  /** 组支数口径（支） */
  qtyPcs: number;
  itemNo: string | null;
  materialCode: string | null;
  deliveryDate: string | null;
  /** 订单数量与单位（产品行原始录入口径：set 套 / piece 支） */
  orderQty: number;
  unit: string | null;
  /** 生产图号（部件组级，内部技术图纸号；区别于产品行的客户图号） */
  drawingNo: string | null;
  /** 材料厚度（部件组级） */
  materialThickness: string | null;
}

@Injectable()
export class PartGroupSnapshotService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 按部件组 ID 批量取快照。
   *
   * @param mgr 事务 manager；传 null 用默认连接
   * @param groupIds 部件组 ID 列表
   * @param opts.includeCancelledOrder 是否包含已作废订单的组（默认 false = 不返回，
   *        下游建单时「查不到」即等价于「不可选」，调用方据此报错）
   */
  async load(
    mgr: EntityManager | null,
    groupIds: number[],
    opts: { includeCancelledOrder?: boolean } = {},
  ): Promise<Map<number, PartGroupSnapshot>> {
    const map = new Map<number, PartGroupSnapshot>();
    const ids = [...new Set(groupIds.filter((v) => Number.isInteger(v) && v > 0))];
    if (!ids.length) return map;

    const runner = mgr ?? this.dataSource;
    const params: Array<number | string> = [...ids];
    let orderFilter = '';
    if (!opts.includeCancelledOrder) {
      orderFilter = ' AND o.status <> ?';
      params.push(ORDER_STATUS.CANCELLED);
    }

    const rows: any[] = await runner.query(
      `SELECT g.id                AS group_id,
              g.order_id          AS order_id,
              g.order_product_id  AS order_product_id,
              g.group_type        AS group_type,
              g.product_model     AS product_model,
              g.qty_pcs           AS qty_pcs,
              g.drawing_no        AS drawing_no,
              g.material_thickness AS material_thickness,
              p.order_qty         AS order_qty,
              p.unit              AS unit,
              o.status            AS order_status,
              o.order_no          AS order_no,
              o.customer_name     AS customer_name,
              o.production_no     AS production_no,
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
              (SELECT MIN(pt.cycle_code) FROM t_order_part pt
                WHERE pt.part_group_id = g.id AND pt.cycle_code IS NOT NULL AND pt.cycle_code <> '')
                                  AS cycle_code
         FROM t_order_part_group g
         JOIN t_order_product p ON p.id = g.order_product_id
         JOIN t_order o         ON o.id = g.order_id
        WHERE g.id IN (${ids.map(() => '?').join(',')})${orderFilter}`,
      params,
    );

    rows.forEach((r) => {
      map.set(Number(r.group_id), {
        orderPartGroupId: Number(r.group_id),
        orderId: Number(r.order_id),
        orderProductId: Number(r.order_product_id),
        orderStatus: Number(r.order_status),
        orderNo: r.order_no ?? null,
        customerName: r.customer_name ?? null,
        productionNo: r.production_no ?? null,
        productModel: r.product_model ?? null,
        dimensionText: formatDimension(r.dimension_raw, r.dimension_unit, r.dimension_mm),
        cycleCode: r.cycle_code ?? null,
        surfaceType: r.surface_type ?? null,
        productType: r.product_type ?? null,
        railSection: r.rail_section ?? null,
        dimensionMm: r.dimension_mm == null ? null : Number(r.dimension_mm),
        color: r.color ?? null,
        groupType: r.group_type ?? null,
        qtyPcs: Number(r.qty_pcs) || 0,
        itemNo: r.item_no ?? null,
        materialCode: r.material_code ?? null,
        deliveryDate: r.delivery_date ?? null,
        orderQty: Number(r.order_qty) || 0,
        unit: r.unit ?? null,
        drawingNo: r.drawing_no ?? null,
        materialThickness: r.material_thickness ?? null,
      });
    });
    return map;
  }

  /** 单个部件组快照；查不到返回 null（订单已作废时同样返回 null） */
  async loadOne(
    mgr: EntityManager | null,
    groupId: number,
    opts: { includeCancelledOrder?: boolean } = {},
  ): Promise<PartGroupSnapshot | null> {
    const map = await this.load(mgr, [groupId], opts);
    return map.get(groupId) ?? null;
  }
}
