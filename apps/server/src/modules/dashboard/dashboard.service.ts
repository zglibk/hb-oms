import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FINISHED_DOC_STATUS, ORDER_STATUS, OUTSOURCE_STATUS } from '@hb-oms/shared';
// 欠数口径的唯一事实源在 order-owed.util —— 台账、订单自动完结、本看板三处共用同一份
// 单据族 SQL，禁止在此另写一份 biz_type 判定（分叉后首页与台账数字对不上，最难查）
import {
  INBOUND_FAMILY_PARAMS,
  INBOUND_FAMILY_SQL,
  OUTBOUND_FAMILY_PARAMS,
  OUTBOUND_FAMILY_SQL,
} from '../order/order-owed.util';

/**
 * ===== 首页看板（销售视角，设计文档 §5.2）=====
 *
 * 汇总卡：进行中订单数 / 总生产欠数 / 总发货欠数 / 逾期订单数
 * 列表区：逾期未发货 TOP、临近交期 7 天内、外发超期未回齐
 *
 * 口径约定（与台账的差异是**刻意的**，勿"统一"）：
 *
 * 1. **范围**：看板只统计 `进行中` 订单（status=1）。已完结不再跟踪、已作废是终态，
 *    都不该出现在销售的待办视角里；台账则展示除作废外的全部订单（可回溯历史）。
 *
 * 2. **欠数取正**：看板对每个部件组取 `GREATEST(欠数, 0)` 再求和，台账汇总取净额
 *    （`Σ订单数 − Σ完成数`，含超产/超发的负值抵扣）。原因：A 组超发 100 支并不能
 *    抵消 B 组欠客户的 100 支——B 的客户照样没收到货。看板要回答"还欠多少"，
 *    净额会把这笔欠数抹平；台账要回答"账平不平"，净额才对。
 *
 * 全部实时聚合，不落冗余列（§4.2）。红字单方向与原单相反，按 `direction × quantity`
 * 求和自然抵扣。
 */

/** 列表区每块最多返回条数 */
const TOP_LIMIT = 10;
/** 「临近交期」窗口天数（设计文档 §5.2 定为 7 天） */
const UPCOMING_DAYS = 7;

/** 部件组粒度的待办行（逾期未发货 / 临近交期共用结构） */
export interface DashboardOwedRow {
  orderPartGroupId: number;
  orderId: number;
  orderNo: string | null;
  customerName: string | null;
  salesman: string | null;
  merchandiser: string | null;
  productionNo: string | null;
  productModel: string | null;
  deliveryDate: string | null;
  /** 逾期天数（逾期列表为正数）/ 距交期天数（临近列表为正数） */
  days: number;
  /** 订单数（支） */
  qtyPcs: number;
  /** 发货欠数（支） */
  deliveryOwed: number;
}

/** 外发超期未回齐行 */
export interface DashboardOutsourceRow {
  docId: number;
  blankNo: string | null;
  processorName: string | null;
  surfaceType: string | null;
  color: string | null;
  requireBackDate: string | null;
  /** 超期天数 */
  days: number;
  status: number;
  /** 应回数量（本单各明细行合计） */
  planReturnQty: number;
  returnedQty: number;
  /** 未回数量 = 应回 − 已回 */
  pendingQty: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 进行中订单的部件组 + 成品进出聚合，看板三处（汇总卡、逾期、临近）共用同一 FROM，
   * 保证四个卡片与两张列表算的是同一批行。
   */
  private readonly activeGroupsFrom = `
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
       WHERE o.status = ?`;

  /** 派生表 + WHERE 的参数序（顺序即 SQL 中占位符出现顺序） */
  private get activeGroupsParams(): Array<string | number> {
    return [
      ...INBOUND_FAMILY_PARAMS,
      ...OUTBOUND_FAMILY_PARAMS,
      FINISHED_DOC_STATUS.CONFIRMED,
      ORDER_STATUS.ACTIVE,
    ];
  }

  /** 待办行的公共查询列 */
  private readonly owedRowColumns = `
              g.id AS groupId, o.id AS orderId, o.order_no AS orderNo,
              o.customer_name AS customerName, o.salesman AS salesman,
              o.merchandiser AS merchandiser, o.production_no AS productionNo,
              g.product_model AS productModel, p.delivery_date AS deliveryDate,
              g.qty_pcs AS qtyPcs,
              g.qty_pcs - IFNULL(fin.out_qty, 0) AS deliveryOwed`;

  async summary() {
    const [cards, overdueOrders, upcomingOrders, overdueOutsource, counts] = await Promise.all([
      this.loadCards(),
      this.loadOverdueOrders(),
      this.loadUpcomingOrders(),
      this.loadOverdueOutsource(),
      this.loadListCounts(),
    ]);

    return {
      cards,
      /** 逾期未发货 TOP（逾期最久在前） */
      overdueOrders,
      /** 临近交期（含今天起 7 天内） */
      upcomingOrders,
      /** 外发超期未回齐 */
      overdueOutsource,
      /** 三张列表的**真实总条数**（列表被 TOP_LIMIT 截断，角标要显示总数） */
      counts,
      /** 列表区统一截断条数，供界面提示「仅显示前 N 条」 */
      topLimit: TOP_LIMIT,
      upcomingDays: UPCOMING_DAYS,
    };
  }

  /**
   * 三张待办列表的总条数。
   *
   * 单独查而不是用 `list.length`：列表被 TOP_LIMIT 截断，拿显示条数当总数会骗人
   * ——界面角标写的是「共 N 条」，25 条只显示 10 条却标 10，用户会以为只有 10 条。
   *
   * 前两个数与列表用同一 FROM/条件，保证角标与列表口径一致。
   */
  private async loadListCounts() {
    const [owedRows, osRows] = await Promise.all([
      this.dataSource.query(
        // ⚠️ 占位符顺序 = SQL 文本顺序：SELECT 里的 INTERVAL ? 在 FROM/WHERE 的占位符之前
        `SELECT
           COUNT(CASE WHEN p.delivery_date IS NOT NULL
                       AND p.delivery_date < CURDATE()
                       AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0 THEN 1 END) AS overdueCnt,
           COUNT(CASE WHEN p.delivery_date IS NOT NULL
                       AND p.delivery_date >= CURDATE()
                       AND p.delivery_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                       AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0 THEN 1 END) AS upcomingCnt
         ${this.activeGroupsFrom}`,
        [UPCOMING_DAYS, ...this.activeGroupsParams],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT d.id
             FROM t_outsource_doc d
             JOIN t_outsource_item i ON i.doc_id = d.id
            WHERE d.status IN (?, ?)
              AND d.require_back_date IS NOT NULL
              AND d.require_back_date < CURDATE()
            GROUP BY d.id
           HAVING SUM(i.returned_qty) < SUM(i.plan_return_qty)) x`,
        [OUTSOURCE_STATUS.PENDING, OUTSOURCE_STATUS.PARTIAL_RETURNED],
      ),
    ]);
    return {
      overdueOrders: Number(owedRows?.[0]?.overdueCnt) || 0,
      upcomingOrders: Number(owedRows?.[0]?.upcomingCnt) || 0,
      overdueOutsource: Number(osRows?.[0]?.cnt) || 0,
    };
  }

  /** 汇总卡：四个数字一次查完，避免四条 SQL 之间出现时间差 */
  private async loadCards() {
    const rows: any[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT o.id) AS activeOrders,
              SUM(GREATEST(g.qty_pcs - IFNULL(fin.in_qty, 0), 0))  AS productionOwed,
              SUM(GREATEST(g.qty_pcs - IFNULL(fin.out_qty, 0), 0)) AS deliveryOwed,
              COUNT(DISTINCT CASE WHEN p.delivery_date IS NOT NULL
                                   AND p.delivery_date < CURDATE()
                                   AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0
                                  THEN o.id END) AS overdueOrders
       ${this.activeGroupsFrom}`,
      this.activeGroupsParams,
    );
    const r = rows?.[0] ?? {};
    return {
      activeOrders: Number(r.activeOrders) || 0,
      productionOwed: Number(r.productionOwed) || 0,
      deliveryOwed: Number(r.deliveryOwed) || 0,
      overdueOrders: Number(r.overdueOrders) || 0,
    };
  }

  /** 逾期未发货：交期已过且仍欠发货，逾期最久排最前 */
  private async loadOverdueOrders(): Promise<DashboardOwedRow[]> {
    const rows: any[] = await this.dataSource.query(
      `SELECT ${this.owedRowColumns},
              DATEDIFF(CURDATE(), p.delivery_date) AS days
       ${this.activeGroupsFrom}
         AND p.delivery_date IS NOT NULL
         AND p.delivery_date < CURDATE()
         AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0
       ORDER BY p.delivery_date ASC, g.id ASC
       LIMIT ?`,
      [...this.activeGroupsParams, TOP_LIMIT],
    );
    return rows.map((r) => this.toOwedRow(r));
  }

  /** 临近交期：今天起 7 天内到期且仍欠发货（今天当天计入，days=0） */
  private async loadUpcomingOrders(): Promise<DashboardOwedRow[]> {
    const rows: any[] = await this.dataSource.query(
      `SELECT ${this.owedRowColumns},
              DATEDIFF(p.delivery_date, CURDATE()) AS days
       ${this.activeGroupsFrom}
         AND p.delivery_date IS NOT NULL
         AND p.delivery_date >= CURDATE()
         AND p.delivery_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND g.qty_pcs - IFNULL(fin.out_qty, 0) > 0
       ORDER BY p.delivery_date ASC, g.id ASC
       LIMIT ?`,
      [...this.activeGroupsParams, UPCOMING_DAYS, TOP_LIMIT],
    );
    return rows.map((r) => this.toOwedRow(r));
  }

  /**
   * 外发超期未回齐：**计划回货日期**已过、单头仍处于「待回货 / 部分回货」。
   * 已回齐（含手工关闭尾数）与已作废不算超期。
   * 2026-08-10 发出环节取消后，建单即待回货（1）——它现在就是"发出去还没回来"
   * 的正常态，必须纳入超期统计；原先排除 1、统计「已发出(2)」的口径同步作废。
   */
  private async loadOverdueOutsource(): Promise<DashboardOutsourceRow[]> {
    const rows: any[] = await this.dataSource.query(
      `SELECT d.id AS docId, d.blank_no AS blankNo, d.processor_name AS processorName,
              d.surface_type AS surfaceType, d.color AS color,
              d.require_back_date AS requireBackDate, d.status AS status,
              DATEDIFF(CURDATE(), d.require_back_date) AS days,
              IFNULL(SUM(i.plan_return_qty), 0) AS planReturnQty,
              IFNULL(SUM(i.returned_qty), 0)    AS returnedQty
         FROM t_outsource_doc d
         JOIN t_outsource_item i ON i.doc_id = d.id
        WHERE d.status IN (?, ?)
          AND d.require_back_date IS NOT NULL
          AND d.require_back_date < CURDATE()
        GROUP BY d.id, d.blank_no, d.processor_name, d.surface_type, d.color,
                 d.require_back_date, d.status
       HAVING SUM(i.returned_qty) < SUM(i.plan_return_qty)
        ORDER BY d.require_back_date ASC, d.id ASC
        LIMIT ?`,
      [OUTSOURCE_STATUS.PENDING, OUTSOURCE_STATUS.PARTIAL_RETURNED, TOP_LIMIT],
    );
    return rows.map((r) => {
      const planReturnQty = Number(r.planReturnQty) || 0;
      const returnedQty = Number(r.returnedQty) || 0;
      return {
        docId: Number(r.docId),
        blankNo: r.blankNo ?? null,
        processorName: r.processorName ?? null,
        surfaceType: r.surfaceType ?? null,
        color: r.color ?? null,
        requireBackDate: this.dateText(r.requireBackDate),
        days: Number(r.days) || 0,
        status: Number(r.status),
        planReturnQty,
        returnedQty,
        pendingQty: planReturnQty - returnedQty,
      };
    });
  }

  private toOwedRow(r: any): DashboardOwedRow {
    return {
      orderPartGroupId: Number(r.groupId),
      orderId: Number(r.orderId),
      orderNo: r.orderNo ?? null,
      customerName: r.customerName ?? null,
      salesman: r.salesman ?? null,
      merchandiser: r.merchandiser ?? null,
      productionNo: r.productionNo ?? null,
      productModel: r.productModel ?? null,
      deliveryDate: this.dateText(r.deliveryDate),
      days: Number(r.days) || 0,
      qtyPcs: Number(r.qtyPcs) || 0,
      deliveryOwed: Number(r.deliveryOwed) || 0,
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
