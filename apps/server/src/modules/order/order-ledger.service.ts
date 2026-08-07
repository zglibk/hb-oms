import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  FINISHED_DOC_STATUS,
  ORDER_STATUS,
  OUTSOURCE_STATUS,
  formatDimension,
  hasSocket,
} from '@hb-oms/shared';
import { QueryLedgerDto } from './dto/ledger.dto';
// 单据族 SQL 与参数是台账与订单自动完结共用的欠数口径，唯一事实源在 order-owed.util
import {
  INBOUND_FAMILY_PARAMS,
  INBOUND_FAMILY_SQL,
  OUTBOUND_FAMILY_PARAMS,
  OUTBOUND_FAMILY_SQL,
} from './order-owed.util';

/**
 * ===== 订单跟踪台账：本系统的核心产出（设计文档 §5.1）=====
 *
 * 按**部件组**一行（对齐车间手工《订单跟踪表台账》的行粒度），围绕订单逐行呈现四个数：
 *   订单数 / 完成数 / 库存数 / 双欠数（生产欠数、发货欠数）
 *
 * **全部实时聚合，不落任何冗余列**（§4.2）——冗余列一旦与单据不同步就是对账灾难，
 * 这里宁可每次算。红字单方向与原单相反，聚合时按 `direction × quantity` 求和即自然抵扣。
 *
 * ⚠️ 与入库闸门的口径差异（**故意不同，勿"统一"**）：
 *   - 台账「完成数」**包含期初**（opening_balance）——期初是上线前已完成的存量，
 *     业务上确实"已完成"，不计进去台账就对不上手工账；
 *   - 闸门「已入库量」**排除期初**（assembly-quota.util.ts）——期初没有装配过程，
 *     计进去会让该组额度永久为负、挡死后续正常入库。
 *   两者服务于不同问题，各自正确。
 */

export interface LedgerRow {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  /** 下单日期 */
  orderDate: string | null;
  salesman: string | null;
  merchandiser: string | null;
  customerName: string | null;
  /** 台账「订单编号」= 生产单号（ORD 系统号仅内部定位） */
  productionNo: string | null;
  orderNo: string | null;
  materialCode: string | null;
  itemNo: string | null;
  productModel: string | null;
  productType: string | null;
  groupType: string | null;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  /** 订单数量与单位（原始录入口径，展示用） */
  orderQty: number;
  unit: string | null;
  surfaceType: string | null;
  color: string | null;
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  assemblyWorkshop: string | null;
  deliveryDate: string | null;
  isExport: number;
  exportCountry: string | null;
  socket: boolean;
  /** ===== 四数 ===== */
  /** 订单数（支，组支数口径） */
  qtyPcs: number;
  /** 完成数：Σ已确认入库（含期初）− Σ对应红字 */
  inQty: number;
  /** 出库数：Σ已确认销售出库 − Σ对应红字 */
  outQty: number;
  /** 库存数：该组当前结存合计 */
  stockQty: number;
  /** 生产欠数 = 订单数 − 完成数，可为负（超产） */
  productionOwed: number;
  /** 发货欠数 = 订单数 − 出库数，可为负（超发）；手工表「成品结存」即此口径 */
  deliveryOwed: number;
  /** 外发已回货数量 */
  returnedQty: number;
  /** 装配完成量（actual_date 非空的批次合计） */
  assembledQty: number;
  /** 装配未完成量 = 订单数 − 装配完成量，可为负（超装配） */
  assemblyPendingQty: number;
  /** 最早未完成装配批次的计划完成日 */
  nextAssemblyPlanDate: string | null;
  /** 是否逾期：交期已过且仍欠发货 */
  overdue: boolean;
}

@Injectable()
export class OrderLedgerService {
  constructor(private readonly dataSource: DataSource) {}

  async findLedger(query: QueryLedgerDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: string[] = ['o.status <> ?'];
    const params: Array<string | number> = [ORDER_STATUS.CANCELLED];

    if (query.keyword) {
      where.push(`(o.order_no LIKE ? OR o.customer_name LIKE ? OR p.production_no LIKE ?
                   OR g.product_model LIKE ? OR p.item_no LIKE ? OR p.material_code LIKE ?)`);
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw, kw, kw, kw);
    }
    if (query.customerName) {
      where.push('o.customer_name = ?');
      params.push(query.customerName);
    }
    if (query.salesman) {
      where.push('o.salesman = ?');
      params.push(query.salesman);
    }
    if (query.merchandiser) {
      where.push('o.merchandiser = ?');
      params.push(query.merchandiser);
    }
    if (query.deliveryFrom) {
      where.push('p.delivery_date >= ?');
      params.push(query.deliveryFrom);
    }
    if (query.deliveryTo) {
      where.push('p.delivery_date <= ?');
      params.push(query.deliveryTo);
    }
    if (query.surfaceType) {
      where.push('p.surface_type = ?');
      params.push(query.surfaceType);
    }
    if (query.assemblyWorkshop) {
      where.push('p.assembly_workshop = ?');
      params.push(query.assemblyWorkshop);
    }
    if (query.isExport != null) {
      where.push('p.is_export = ?');
      params.push(query.isExport);
    }
    if (query.orderStatus != null) {
      where.push('o.status = ?');
      params.push(query.orderStatus);
    }
    // 产品类型多选组合按**包含匹配**：组合串是字典序逗号拼接，单值命中即入选
    if (query.productType) {
      where.push('FIND_IN_SET(?, p.product_type)');
      params.push(query.productType);
    }

    // 聚合派生表放在 JOIN 里，筛选条件才能引用其列
    const fromSql = `
        FROM t_order_part_group g
        JOIN t_order_product p ON p.id = g.order_product_id
        JOIN t_order o         ON o.id = g.order_id
        LEFT JOIN (
              SELECT fi.order_part_group_id AS gid,
                     SUM(CASE WHEN ${INBOUND_FAMILY_SQL}  THEN fd.direction * fi.quantity ELSE 0 END) AS in_qty,
                     SUM(CASE WHEN ${OUTBOUND_FAMILY_SQL} THEN -fd.direction * fi.quantity ELSE 0 END) AS out_qty
                FROM t_finished_item fi
                JOIN t_finished_doc  fd ON fd.id = fi.doc_id
                LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
               WHERE fd.status = ? AND fi.order_part_group_id > 0
               GROUP BY fi.order_part_group_id
             ) fin ON fin.gid = g.id
        LEFT JOIN (
              SELECT order_part_group_id AS gid, SUM(quantity) AS qty
                FROM t_finished_balance
               WHERE order_part_group_id > 0
               GROUP BY order_part_group_id
             ) bal ON bal.gid = g.id
        LEFT JOIN (
              SELECT oi.order_part_group_id AS gid, SUM(orr.return_qty) AS return_qty
                FROM t_outsource_return orr
                JOIN t_outsource_item oi ON oi.id = orr.item_id
                JOIN t_outsource_doc od ON od.id = oi.doc_id
               WHERE od.status <> ?
               GROUP BY oi.order_part_group_id
             ) ret ON ret.gid = g.id
        LEFT JOIN (
              SELECT order_part_group_id AS gid,
                     SUM(CASE WHEN actual_date IS NOT NULL THEN qty ELSE 0 END) AS done_qty,
                     MIN(CASE WHEN actual_date IS NULL THEN plan_date END)      AS next_plan_date
                FROM t_assembly_batch
               GROUP BY order_part_group_id
             ) asm ON asm.gid = g.id
       WHERE ${where.join(' AND ')}`;

    // 派生表参数在 WHERE 参数之前（SQL 里 JOIN 先于 WHERE 出现）
    const joinParams: Array<string | number> = [
      ...INBOUND_FAMILY_PARAMS,
      ...OUTBOUND_FAMILY_PARAMS,
      FINISHED_DOC_STATUS.CONFIRMED,
      // 外发：已作废单不计回货
      OUTSOURCE_STATUS.CANCELLED,
    ];

    // 只看有欠数 / 只看逾期：依赖聚合结果，放 HAVING 之后的外层条件里
    const having: string[] = [];
    if (query.onlyOwed) {
      having.push(
        '(g.qty_pcs - IFNULL(fin.in_qty, 0) > 0 OR g.qty_pcs - IFNULL(fin.out_qty, 0) > 0)',
      );
    }
    if (query.onlyOverdue) {
      having.push('(p.delivery_date IS NOT NULL AND p.delivery_date < CURDATE() AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0)');
    }
    const havingSql = having.length ? ` AND ${having.join(' AND ')}` : '';

    const allParams = [...joinParams, ...params];

    const countRows: Array<{ cnt: number | string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt ${fromSql}${havingSql}`,
      allParams,
    );
    const total = Number(countRows?.[0]?.cnt ?? 0);

    const rows: any[] = await this.dataSource.query(
      `SELECT g.id AS groupId, g.order_id AS orderId, g.order_product_id AS orderProductId,
              g.group_type AS groupType, g.product_model AS productModel, g.qty_pcs AS qtyPcs,
              g.drawing_no AS drawingNo, g.drawing_version AS drawingVersion,
              g.material_thickness AS materialThickness,
              o.order_no AS orderNo, o.order_date AS orderDate, o.customer_name AS customerName,
              o.salesman AS salesman, o.merchandiser AS merchandiser,
              p.production_no AS productionNo, p.material_code AS materialCode, p.item_no AS itemNo,
              p.product_type AS productType, p.rail_section AS railSection,
              p.dimension_raw AS dimensionRaw, p.dimension_unit AS dimensionUnit,
              p.dimension_mm AS dimensionMm, p.order_qty AS orderQty, p.unit AS unit,
              p.surface_type AS surfaceType, p.color AS color,
              p.assembly_workshop AS assemblyWorkshop, p.delivery_date AS deliveryDate,
              p.is_export AS isExport, p.export_country AS exportCountry,
              IFNULL(fin.in_qty, 0)     AS inQty,
              IFNULL(fin.out_qty, 0)    AS outQty,
              IFNULL(bal.qty, 0)        AS stockQty,
              IFNULL(ret.return_qty, 0) AS returnedQty,
              IFNULL(asm.done_qty, 0)   AS assembledQty,
              asm.next_plan_date        AS nextAssemblyPlanDate
       ${fromSql}${havingSql}
       ORDER BY (p.delivery_date IS NULL), p.delivery_date ASC, g.id DESC
       LIMIT ? OFFSET ?`,
      [...allParams, pageSize, (page - 1) * pageSize],
    );

    const today = new Date().toISOString().slice(0, 10);
    const list: LedgerRow[] = rows.map((r) => {
      const qtyPcs = Number(r.qtyPcs) || 0;
      const inQty = Number(r.inQty) || 0;
      const outQty = Number(r.outQty) || 0;
      const assembledQty = Number(r.assembledQty) || 0;
      const deliveryDate = this.dateText(r.deliveryDate);
      const deliveryOwed = qtyPcs - outQty;
      return {
        orderPartGroupId: Number(r.groupId),
        orderId: Number(r.orderId),
        orderProductId: Number(r.orderProductId),
        orderDate: this.dateText(r.orderDate),
        salesman: r.salesman ?? null,
        merchandiser: r.merchandiser ?? null,
        customerName: r.customerName ?? null,
        productionNo: r.productionNo ?? null,
        orderNo: r.orderNo ?? null,
        materialCode: r.materialCode ?? null,
        itemNo: r.itemNo ?? null,
        productModel: r.productModel ?? null,
        productType: r.productType ?? null,
        groupType: r.groupType ?? null,
        railSection: r.railSection ?? null,
        dimensionMm: r.dimensionMm == null ? null : Number(r.dimensionMm),
        dimensionText: formatDimension(r.dimensionRaw, r.dimensionUnit, r.dimensionMm) || null,
        orderQty: Number(r.orderQty) || 0,
        unit: r.unit ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        drawingNo: r.drawingNo ?? null,
        drawingVersion: r.drawingVersion ?? null,
        materialThickness: r.materialThickness ?? null,
        assemblyWorkshop: r.assemblyWorkshop ?? null,
        deliveryDate,
        isExport: Number(r.isExport) || 0,
        exportCountry: r.exportCountry ?? null,
        socket: hasSocket(r.productType),
        qtyPcs,
        inQty,
        outQty,
        stockQty: Number(r.stockQty) || 0,
        productionOwed: qtyPcs - inQty,
        deliveryOwed,
        returnedQty: Number(r.returnedQty) || 0,
        assembledQty,
        assemblyPendingQty: qtyPcs - assembledQty,
        nextAssemblyPlanDate: this.dateText(r.nextAssemblyPlanDate),
        overdue: !!deliveryDate && deliveryDate < today && deliveryOwed > 0,
      };
    });

    // 汇总卡：当前筛选结果的整体口径（不受分页影响，故单独聚合）
    const sumRows: any[] = await this.dataSource.query(
      // 注意：rows 是 MySQL 8 保留字（窗口函数），列别名必须避开
      `SELECT COUNT(*) AS rowCnt,
              SUM(g.qty_pcs) AS totalQty,
              SUM(IFNULL(fin.in_qty, 0)) AS totalIn,
              SUM(IFNULL(fin.out_qty, 0)) AS totalOut,
              SUM(IFNULL(bal.qty, 0)) AS totalStock
       ${fromSql}${havingSql}`,
      allParams,
    );
    const s = sumRows?.[0] ?? {};
    const totalQty = Number(s.totalQty) || 0;
    const totalIn = Number(s.totalIn) || 0;
    const totalOut = Number(s.totalOut) || 0;

    return {
      list,
      total,
      page,
      pageSize,
      summary: {
        rows: Number(s.rowCnt) || 0,
        totalQty,
        totalIn,
        totalOut,
        totalStock: Number(s.totalStock) || 0,
        totalProductionOwed: totalQty - totalIn,
        totalDeliveryOwed: totalQty - totalOut,
      },
    };
  }

  private dateText(v: any): string | null {
    if (!v) return null;
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(v).slice(0, 10);
  }
}
