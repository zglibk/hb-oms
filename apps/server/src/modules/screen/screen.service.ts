import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FINISHED_DOC_STATUS, ORDER_STATUS, ORDER_STATUS_OPTIONS, toPieces } from '@hb-oms/shared';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  INBOUND_FAMILY_PARAMS,
  INBOUND_FAMILY_SQL,
  OUTBOUND_FAMILY_PARAMS,
  OUTBOUND_FAMILY_SQL,
} from '../order/order-owed.util';
import { dictLabeler, loadDictLabels } from '../../common/utils/dict-label.util';

/** 区间跨度上限（天）：再长趋势图就挤成一团，且按月分桶已足够看全年 */
const MAX_RANGE_DAYS = 366;
/** 跨度不超过它按日分桶，否则按月 */
const DAILY_BUCKET_MAX_DAYS = 62;
/** 大屏滚动列表条数：电视上滚一轮看得完即可，完整清单去台账 */
const SCREEN_LIST_LIMIT = 30;
const CUSTOMER_TOP = 5;

const DAY_MS = 86_400_000;

/**
 * 数据可视化大屏（只读）。
 *
 * 面板分两类，界面上各自标注，别混着读：
 * - **实时**：进行中订单、双欠数、逾期、成品库存、客户欠数 TOP、两张滚动列表、呆滞品/部件台账——
 *   与首页看板同一口径（直接调 DashboardService，不另写 SQL）；
 * - **区间**：订单状态分布、外发回厂/入库/出库趋势、业务主线流转、装配车间产出、区间新订单——
 *   按业务日期（下单日 / 回厂日 / 实际完成日 / 单据日期）落在 [from, to] 统计。
 *
 * 成品进出一律按 order-owed.util 的单据族 + `direction × quantity`（红字天然抵扣），
 * 只取已确认单——与台账、看板、产品汇总同一事实源。
 */
@Injectable()
export class ScreenService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly dashboard: DashboardService,
  ) {}

  async load(fromArg?: string, toArg?: string) {
    const { from, to, days } = this.resolveRange(fromArg, toArg);
    const monthly = days > DAILY_BUCKET_MAX_DAYS;
    const fmt = monthly ? '%Y-%m' : '%Y-%m-%d';
    const buckets = this.bucketKeys(from, to, monthly);

    const [cards, customerTop, overdue, recentOutsource, stock, finished, orders, outsource, assembly, extra] =
      await Promise.all([
        this.dashboard.loadCards(),
        this.dashboard.loadCustomerOwedTop(CUSTOMER_TOP),
        this.dashboard.loadOverdueOrders(),
        this.dashboard.loadRecentOutsource(),
        this.loadStockQty(),
        this.loadFinishedTrend(from, to, fmt),
        this.loadOrderStats(from, to),
        this.loadOutsourceTrend(from, to, fmt),
        this.loadAssemblyByWorkshop(from, to),
        this.loadExtras(),
      ]);

    const fill = (m: Map<string, number>) => buckets.map((k) => m.get(k) ?? 0);
    const inSeries = fill(finished.inMap);
    const outSeries = fill(finished.outMap);
    const outsourceSeries = fill(outsource);
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    const ratio = (owed: number) => (cards.totalQty > 0 ? Math.round(((cards.totalQty - owed) / cards.totalQty) * 1000) / 10 : 0);

    return {
      range: { from, to, bucket: monthly ? 'month' : 'day' },
      generatedAt: new Date().toISOString(),
      /** 实时指标卡 */
      cards: {
        activeOrders: cards.activeOrders,
        productionOwed: cards.productionOwed,
        deliveryOwed: cards.deliveryOwed,
        overdueOrders: cards.overdueOrders,
        stockQty: stock,
        /** 区间出库（支） */
        rangeOutbound: sum(outSeries),
      },
      /** 区间：下单日落在区间内的订单按状态计数（不含已作废） */
      orderStatus: orders.byStatus,
      /** 实时：客户发货欠数 TOP5 */
      customerOwedTop: customerTop,
      /** 区间：业务主线流转（支） */
      flow: {
        orderQty: orders.qty,
        outsourceReturned: sum(outsourceSeries),
        assembled: assembly.reduce((s, r) => s + r.qty, 0),
        inbound: sum(inSeries),
        outbound: sum(outSeries),
        /** 实时：进行中订单的完成率 / 发货率（%） */
        completionRate: ratio(cards.productionOwed),
        deliveryRate: ratio(cards.deliveryOwed),
      },
      trend: { labels: buckets, inbound: inSeries, outbound: outSeries, outsource: outsourceSeries },
      /** 区间：装配车间产出（支，按实际完成日） */
      workshopOutput: assembly,
      /** 实时滚动列表 */
      overdueOrders: overdue.slice(0, SCREEN_LIST_LIMIT),
      recentOutsource: recentOutsource.slice(0, SCREEN_LIST_LIMIT),
      summary: { ...extra, newOrders: orders.count },
    };
  }

  /** 解析并校验区间；缺省为本月 1 日 ~ 今天（服务器本地日期） */
  private resolveRange(fromArg?: string, toArg?: string) {
    const today = this.ymd(new Date());
    const to = toArg ? toArg.slice(0, 10) : today;
    const from = fromArg ? fromArg.slice(0, 10) : `${to.slice(0, 7)}-01`;
    const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
    if (!(days >= 1)) throw new BadRequestException('开始日期不能晚于结束日期');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`时间范围最长 ${MAX_RANGE_DAYS} 天，请缩小范围`);
    return { from, to, days };
  }

  /** 连续的分桶键（日：YYYY-MM-DD / 月：YYYY-MM），没数据的桶补 0，横轴才不断档 */
  private bucketKeys(from: string, to: string, monthly: boolean): string[] {
    const keys: string[] = [];
    if (monthly) {
      let [y, m] = from.split('-').map(Number);
      const [ty, tm] = to.split('-').map(Number);
      while (y < ty || (y === ty && m <= tm)) {
        keys.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      return keys;
    }
    for (let t = Date.parse(from); t <= Date.parse(to); t += DAY_MS) {
      keys.push(new Date(t).toISOString().slice(0, 10));
    }
    return keys;
  }

  /** 实时成品库存（支）：余额表合计，与成品库存页同源 */
  private async loadStockQty(): Promise<number> {
    const rows: any[] = await this.dataSource.query('SELECT IFNULL(SUM(quantity), 0) AS qty FROM t_finished_balance');
    return Number(rows?.[0]?.qty) || 0;
  }

  /** 区间成品入库 / 出库，按单据日期分桶（入向含期初，口径同台账完成数） */
  private async loadFinishedTrend(from: string, to: string, fmt: string) {
    const rows: any[] = await this.dataSource.query(
      `SELECT DATE_FORMAT(fd.doc_date, ?) AS k,
              SUM(CASE WHEN ${INBOUND_FAMILY_SQL}  THEN fd.direction * fi.quantity ELSE 0 END) AS inQty,
              SUM(CASE WHEN ${OUTBOUND_FAMILY_SQL} THEN -fd.direction * fi.quantity ELSE 0 END) AS outQty
         FROM t_finished_item fi
         JOIN t_finished_doc  fd ON fd.id = fi.doc_id
         LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
        WHERE fd.status = ? AND fd.doc_date BETWEEN ? AND ?
        GROUP BY k`,
      [fmt, ...INBOUND_FAMILY_PARAMS, ...OUTBOUND_FAMILY_PARAMS, FINISHED_DOC_STATUS.CONFIRMED, from, to],
    );
    const inMap = new Map<string, number>();
    const outMap = new Map<string, number>();
    rows.forEach((r) => {
      inMap.set(r.k, Number(r.inQty) || 0);
      outMap.set(r.k, Number(r.outQty) || 0);
    });
    return { inMap, outMap };
  }

  /** 区间订单：按状态计数 + 产品总支数（下单日落在区间，不含已作废） */
  private async loadOrderStats(from: string, to: string) {
    const [statusRows, qtyRows]: any[][] = await Promise.all([
      this.dataSource.query(
        `SELECT status, COUNT(*) AS cnt FROM t_order
          WHERE order_date BETWEEN ? AND ? AND status <> ?
          GROUP BY status`,
        [from, to, ORDER_STATUS.CANCELLED],
      ),
      this.dataSource.query(
        `SELECT IFNULL(SUM(p.qty_pcs), 0) AS qty FROM t_order_product p
           JOIN t_order o ON o.id = p.order_id
          WHERE o.order_date BETWEEN ? AND ? AND o.status <> ?`,
        [from, to, ORDER_STATUS.CANCELLED],
      ),
    ]);
    const cntOf = new Map(statusRows.map((r) => [Number(r.status), Number(r.cnt) || 0]));
    const byStatus = ORDER_STATUS_OPTIONS.filter((o) => o.value !== ORDER_STATUS.CANCELLED).map((o) => ({
      status: o.value,
      label: o.label,
      count: cntOf.get(o.value) ?? 0,
    }));
    return {
      byStatus,
      count: byStatus.reduce((s, r) => s + r.count, 0),
      qty: Number(qtyRows?.[0]?.qty) || 0,
    };
  }

  /** 区间外发回厂（部件支数），按回厂日期分桶 */
  private async loadOutsourceTrend(from: string, to: string, fmt: string) {
    const rows: any[] = await this.dataSource.query(
      `SELECT DATE_FORMAT(back_date, ?) AS k, SUM(return_qty) AS qty
         FROM t_outsource_part
        WHERE back_date BETWEEN ? AND ?
        GROUP BY k`,
      [fmt, from, to],
    );
    return new Map<string, number>(rows.map((r) => [r.k, Number(r.qty) || 0]));
  }

  /** 区间装配车间产出：已完成批次（actual_date 非空即完成，不依赖 status 列，§5.6） */
  private async loadAssemblyByWorkshop(from: string, to: string) {
    const [rows, dict] = await Promise.all([
      this.dataSource.query(
        `SELECT IFNULL(workshop, '') AS workshop, SUM(qty) AS qty
           FROM t_assembly_batch
          WHERE actual_date IS NOT NULL AND actual_date BETWEEN ? AND ?
          GROUP BY workshop
          ORDER BY qty DESC`,
        [from, to],
      ) as Promise<any[]>,
      loadDictLabels(this.dataSource, ['assembly_workshop']),
    ]);
    const label = dictLabeler(dict);
    return rows.map((r) => ({
      workshop: label('assembly_workshop', r.workshop) || '未填车间',
      qty: Number(r.qty) || 0,
    }));
  }

  /** 底部摘要（实时）：呆滞品结存（折支）、部件台账在库档数 */
  private async loadExtras() {
    const [dullRows, partRows]: any[][] = await Promise.all([
      this.dataSource.query('SELECT unit, SUM(balance_qty) AS qty FROM t_dull_stock GROUP BY unit'),
      this.dataSource.query('SELECT COUNT(*) AS cnt FROM t_part_balance WHERE quantity <> 0'),
    ]);
    return {
      dullStockPcs: dullRows.reduce((s, r) => s + toPieces(Number(r.qty) || 0, r.unit), 0),
      partBalanceItems: Number(partRows?.[0]?.cnt) || 0,
    };
  }

  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
