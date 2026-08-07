import { EntityManager } from 'typeorm';
import { FINISHED_BIZ_TYPE, FINISHED_DOC_STATUS, ORDER_STATUS } from '@hb-oms/shared';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditOnUpdate } from '../../common/utils/audit.util';

/**
 * ===== 欠数口径的唯一事实源（设计文档 §5.1 / §3.1）=====
 *
 * 台账（order-ledger.service）与订单自动完结（本文件 syncOrderFinishState）都要算
 * 「完成数 / 出库数」，两处必须同一口径——各写一份 SQL 迟早分叉，届时台账显示
 * 已交清、订单却还挂在进行中，对账时根本查不出是谁错。故 SQL 片段与参数下沉此处。
 *
 * 单据族的判定：红字单看**被冲原单**的 biz_type，因此都要 LEFT JOIN 原单（别名 fo）。
 * 聚合时统一 `direction × quantity`：红字方向与原单相反，天然抵扣、无需特判。
 */

/** 入向单据族：生产入库 + 期初，以及冲销它们的红字单。需 `fd`（本单）与 `fo`（被冲原单）两个别名 */
export const INBOUND_FAMILY_SQL = `(
  fd.biz_type IN (?, ?)
  OR (fd.biz_type = ? AND fo.biz_type IN (?, ?))
)`;

/** 出向单据族：销售出库，以及冲销它的红字单 */
export const OUTBOUND_FAMILY_SQL = `(
  fd.biz_type = ?
  OR (fd.biz_type = ? AND fo.biz_type = ?)
)`;

export const INBOUND_FAMILY_PARAMS: string[] = [
  FINISHED_BIZ_TYPE.INBOUND,
  FINISHED_BIZ_TYPE.OPENING_BALANCE,
  FINISHED_BIZ_TYPE.REVERSAL,
  FINISHED_BIZ_TYPE.INBOUND,
  FINISHED_BIZ_TYPE.OPENING_BALANCE,
];

export const OUTBOUND_FAMILY_PARAMS: string[] = [
  FINISHED_BIZ_TYPE.SALE_OUTBOUND,
  FINISHED_BIZ_TYPE.REVERSAL,
  FINISHED_BIZ_TYPE.SALE_OUTBOUND,
];

/** 一张订单的交付情况 */
export interface OrderOwedSummary {
  orderId: number;
  orderNo: string;
  status: number;
  /** 该订单下的部件组数 */
  groupCount: number;
  /** 仍有发货欠数（订单数 − 出库数 > 0）的组数；0 = 全部交清 */
  owedGroupCount: number;
}

/** 自动状态同步的结果，供接口回传给界面提示 */
export interface FinishSyncResult {
  /** 本次被自动完结的订单号 */
  finished: string[];
  /** 本次被自动重开的订单号 */
  reopened: string[];
}

/**
 * 按订单汇总「还有几个部件组欠发货」。
 * 成品表未建时（M4 之前）返回的 out_qty 恒为 0，此处不再兜底——M4 已落地。
 */
export async function loadOrderOwedSummary(
  mgr: EntityManager,
  orderIds: number[],
): Promise<Map<number, OrderOwedSummary>> {
  const map = new Map<number, OrderOwedSummary>();
  const ids = [...new Set(orderIds.filter((v) => Number.isInteger(v) && v > 0))];
  if (!ids.length) return map;

  const rows: any[] = await mgr.query(
    `SELECT o.id        AS orderId,
            o.order_no  AS orderNo,
            o.status    AS status,
            COUNT(g.id) AS groupCount,
            SUM(CASE WHEN g.qty_pcs - IFNULL(fout.out_qty, 0) > 0 THEN 1 ELSE 0 END) AS owedGroupCount
       FROM t_order o
       JOIN t_order_part_group g ON g.order_id = o.id
       LEFT JOIN (
             SELECT fi.order_part_group_id AS gid,
                    SUM(CASE WHEN ${OUTBOUND_FAMILY_SQL} THEN -fd.direction * fi.quantity ELSE 0 END) AS out_qty
               FROM t_finished_item fi
               JOIN t_finished_doc  fd ON fd.id = fi.doc_id
               LEFT JOIN t_finished_doc fo ON fo.id = fd.origin_doc_id
              WHERE fd.status = ? AND fi.order_part_group_id > 0
              GROUP BY fi.order_part_group_id
            ) fout ON fout.gid = g.id
      WHERE o.id IN (${ids.map(() => '?').join(',')})
      GROUP BY o.id, o.order_no, o.status`,
    [...OUTBOUND_FAMILY_PARAMS, FINISHED_DOC_STATUS.CONFIRMED, ...ids],
  );

  rows.forEach((r) => {
    map.set(Number(r.orderId), {
      orderId: Number(r.orderId),
      orderNo: r.orderNo ?? '',
      status: Number(r.status),
      groupCount: Number(r.groupCount) || 0,
      owedGroupCount: Number(r.owedGroupCount) || 0,
    });
  });
  return map;
}

/**
 * 订单状态自动同步（设计文档 §3.1 状态机）：
 *   - 进行中 且**全部部件组**发货欠数 ≤ 0 → 自动完结；
 *   - 已完结 但**任一组**发货欠数回正（> 0）→ 自动重开。
 *
 * 触发时机：成品出入库单「确认」与「红字冲销」之后、**同一事务内**调用，
 * 保证库存与订单状态一起成立或一起回滚。
 *
 * 说明：
 * - 「完结」只是台账口径（不再跟踪），**不锁单据**——已完结订单仍可继续出入库
 *   （客户追加提货），所以才需要回正时自动重开，否则订单会被错误地挂在已完结上。
 * - 已作废订单（status=9）不参与，作废是终态。
 * - 无部件组的订单不会被判为"已交清"（groupCount>0 才判定），避免空单被自动完结。
 */
export async function syncOrderFinishState(
  mgr: EntityManager,
  orderIds: number[],
  user: CurrentUserPayload,
): Promise<FinishSyncResult> {
  const result: FinishSyncResult = { finished: [], reopened: [] };
  const summaries = await loadOrderOwedSummary(mgr, orderIds);
  if (!summaries.size) return result;

  const audit = auditOnUpdate(user);
  /** 带 status 前置条件更新：并发下状态已被别人改走则本次不生效，避免覆盖 */
  const move = (orderId: number, from: number, to: number) =>
    mgr.query(
      'UPDATE t_order SET status = ?, updated_by = ?, updater_name = ? WHERE id = ? AND status = ?',
      [to, audit.updaterId ?? null, audit.updaterName ?? null, orderId, from],
    );

  for (const s of summaries.values()) {
    const allDelivered = s.groupCount > 0 && s.owedGroupCount === 0;

    if (s.status === ORDER_STATUS.ACTIVE && allDelivered) {
      await move(s.orderId, ORDER_STATUS.ACTIVE, ORDER_STATUS.FINISHED);
      result.finished.push(s.orderNo);
    } else if (s.status === ORDER_STATUS.FINISHED && !allDelivered) {
      await move(s.orderId, ORDER_STATUS.FINISHED, ORDER_STATUS.ACTIVE);
      result.reopened.push(s.orderNo);
    }
  }
  return result;
}
