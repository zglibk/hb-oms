import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FINISHED_DOC_STATUS, ORDER_STATUS, productLevelModel } from '@hb-oms/shared';
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
 * 汇总卡：进行中订单数 / 总成品欠数 / 总发货欠数 / 逾期订单数
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

/** 产品行粒度的待办行（逾期未发货 / 临近交期共用结构） */
export interface DashboardOwedRow {
  orderProductId: number;
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

/**
 * 近期外发回厂行。
 *
 * 2026-08-10 外发取消发坯单、不再登记计划回厂时间后，「超期未回齐」失去判定
 * 基准（没有计划日、也没有"在外面没回"的记录），本卡改为展示**最近几条回厂流水**。
 */
export interface DashboardOutsourceRow {
  id: number;
  backDate: string | null;
  processorName: string | null;
  surfaceType: string | null;
  color: string | null;
  productModel: string | null;
  productionNo: string | null;
  returnQty: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 进行中订单的**产品行** + 成品进出聚合，看板三处（汇总卡、逾期、临近）共用同一 FROM，
   * 保证四个卡片与两张列表算的是同一批行。
   *
   * 2026-08-10 由部件组升级到产品行——与成品出入库明细同维度，欠数口径才对得上。
   */
  private readonly activeGroupsFrom = `
        FROM t_order_product p
        JOIN t_order o ON o.id = p.order_id
        LEFT JOIN (
              SELECT fi.order_product_id AS pid,
                     SUM(CASE WHEN ${INBOUND_FAMILY_SQL}  THEN fd.direction * fi.quantity ELSE 0 END) AS in_qty,
                     SUM(CASE WHEN ${OUTBOUND_FAMILY_SQL} THEN -fd.direction * fi.quantity ELSE 0 END) AS out_qty
                FROM t_finished_item fi
                JOIN t_finished_doc  fd ON fd.id = fi.doc_id
                LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
               WHERE fd.status = ? AND fi.order_product_id > 0
               GROUP BY fi.order_product_id
             ) fin ON fin.pid = p.id
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

  /** 待办行的公共查询列（产品级；型号由 item_no + product_type 在 JS 侧拼） */
  private readonly owedRowColumns = `
              p.id AS productId, o.id AS orderId, o.order_no AS orderNo,
              o.customer_name AS customerName, o.salesman AS salesman,
              o.merchandiser AS merchandiser, o.production_no AS productionNo,
              p.item_no AS itemNo, p.product_type AS productType,
              p.rail_section AS railSection, p.is_split AS isSplit,
              (SELECT GROUP_CONCAT(g.group_type ORDER BY g.sort, g.id)
                 FROM t_order_part_group g
                WHERE g.order_product_id = p.id) AS groupTypes,
              p.delivery_date AS deliveryDate,
              p.qty_pcs AS qtyPcs,
              p.qty_pcs - IFNULL(fin.out_qty, 0) AS deliveryOwed`;

  async summary() {
    const [cards, overdueOrders, upcomingOrders, recentOutsource, counts] = await Promise.all([
      this.loadCards(),
      this.loadOverdueOrders(),
      this.loadUpcomingOrders(),
      this.loadRecentOutsource(),
      this.loadListCounts(),
    ]);

    return {
      cards,
      /** 逾期未发货 TOP（逾期最久在前） */
      overdueOrders,
      /** 临近交期（含今天起 7 天内） */
      upcomingOrders,
      /** 近期外发回厂（最近几条回厂流水） */
      recentOutsource,
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
                       AND p.qty_pcs - IFNULL(fin.out_qty, 0) > 0 THEN 1 END) AS overdueCnt,
           COUNT(CASE WHEN p.delivery_date IS NOT NULL
                       AND p.delivery_date >= CURDATE()
                       AND p.delivery_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                       AND p.qty_pcs - IFNULL(fin.out_qty, 0) > 0 THEN 1 END) AS upcomingCnt
         ${this.activeGroupsFrom}`,
        [UPCOMING_DAYS, ...this.activeGroupsParams],
      ),
      // 外发回厂流水总条数（列表被 TOP_LIMIT 截断，角标要显示总数）
      this.dataSource.query('SELECT COUNT(*) AS cnt FROM t_outsource_part'),
    ]);
    return {
      overdueOrders: Number(owedRows?.[0]?.overdueCnt) || 0,
      upcomingOrders: Number(owedRows?.[0]?.upcomingCnt) || 0,
      recentOutsource: Number(osRows?.[0]?.cnt) || 0,
    };
  }

  /** 汇总卡：四个数字一次查完，避免四条 SQL 之间出现时间差 */
  private async loadCards() {
    const rows: any[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT o.id) AS activeOrders,
              SUM(GREATEST(p.qty_pcs - IFNULL(fin.in_qty, 0), 0))  AS productionOwed,
              SUM(GREATEST(p.qty_pcs - IFNULL(fin.out_qty, 0), 0)) AS deliveryOwed,
              COUNT(DISTINCT CASE WHEN p.delivery_date IS NOT NULL
                                   AND p.delivery_date < CURDATE()
                                   AND p.qty_pcs - IFNULL(fin.out_qty, 0) > 0
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
         AND p.qty_pcs - IFNULL(fin.out_qty, 0) > 0
       ORDER BY p.delivery_date ASC, p.id ASC
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
         AND p.qty_pcs - IFNULL(fin.out_qty, 0) > 0
       ORDER BY p.delivery_date ASC, p.id ASC
       LIMIT ?`,
      [...this.activeGroupsParams, UPCOMING_DAYS, TOP_LIMIT],
    );
    return rows.map((r) => this.toOwedRow(r));
  }

  /**
   * 近期外发回厂：最近 TOP_LIMIT 条回厂流水（回厂日期倒序）。
   *
   * 取代原「外发超期未回齐」——不再登记计划回厂时间后，系统里既没有超期基准、
   * 也没有"还在外面没回"的记录，那张卡已无法计算（见 DashboardOutsourceRow 注释）。
   */
  private async loadRecentOutsource(): Promise<DashboardOutsourceRow[]> {
    const rows: any[] = await this.dataSource.query(
      `SELECT id, back_date AS backDate, processor_name AS processorName,
              surface_type AS surfaceType, color AS color,
              product_model AS productModel, production_no AS productionNo,
              return_qty AS returnQty
         FROM t_outsource_part
        ORDER BY back_date DESC, id DESC
        LIMIT ?`,
      [TOP_LIMIT],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      backDate: this.dateText(r.backDate),
      processorName: r.processorName ?? null,
      surfaceType: r.surfaceType ?? null,
      color: r.color ?? null,
      productModel: r.productModel ?? null,
      productionNo: r.productionNo ?? null,
      returnQty: Number(r.returnQty) || 0,
    }));
  }

  private toOwedRow(r: any): DashboardOwedRow {
    return {
      orderProductId: Number(r.productId),
      orderId: Number(r.orderId),
      orderNo: r.orderNo ?? null,
      customerName: r.customerName ?? null,
      salesman: r.salesman ?? null,
      merchandiser: r.merchandiser ?? null,
      productionNo: r.productionNo ?? null,
      // 产品级型号：整品行带「滑轨」后缀；分体行后缀由组构成推导（外中轨/内轨…）
      productModel: productLevelModel(
        r.itemNo ?? '',
        r.productType ?? '',
        Number(r.isSplit) || 0,
        String(r.groupTypes ?? '').split(',').filter(Boolean),
        r.railSection ?? null,
      ),
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
