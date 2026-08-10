import { EntityManager } from 'typeorm';
import { FINISHED_BIZ_TYPE, FINISHED_DOC_STATUS, calcInboundQuota } from '@hb-oms/shared';

/**
 * ===== 成品入库闸门：可入库量口径的**唯一实现** =====
 *
 * 设计文档 §4.4 / §4.5 / §7.13：
 *
 *   可入库量(产品行, side) = Σ已完成装配量 − Σ已入库量
 *
 * **锚点是订单产品行**（2026-08-10 由部件组升级）：装配的动作是把各部件组装成
 * 整套滑轨，本就是产品级活动；成品入库的对象也是这一整套。两侧必须同时按产品行
 * 聚合——若一侧产品级、一侧部件组级，维度对不上，闸门就形同虚设。
 *
 * - **已完成装配量** = `t_assembly_batch` 中 `actual_date` 非空的批次 qty 之和；
 * - **已入库量** = 已确认的**入库方向**成品单据数量，按 direction 求和：
 *     · `biz_type='inbound'`（生产入库，direction=1）→ +quantity
 *     · `biz_type='reversal'` 且**被冲原单是 inbound**（direction=-1）→ −quantity
 *   期初（`opening_balance`）与销售出库（`sale_outbound`）**均不参与**：
 *     · 期初是上线前存量补录、无装配过程，§4.5 明文豁免闸门；若把它算进已入库量，
 *       会让「装配 0 + 期初 100」的产品额度永久为 −100，之后正常入库全被挡死；
 *     · 出库是发货动作，不消耗装配额度；若参与（direction=-1）反而会凭空放大额度。
 *   冲销期初的红字单同理排除（按 origin_doc_id 回查原单 biz_type）。
 *
 * M3.5（装配）用它守「删除/下调/退回计划中不得使可入库量为负」（§7.14）；
 * M4（成品入库）确认时用**同一个函数**卡「本次入库量 ≤ 可入库量」。
 * 两处禁止各写一份 SQL —— 口径分叉会直接导致库存与台账对不上。
 *
 * 成品三表在 M4 才建；表不存在时已入库量按 0 计（M3.5 阶段等价于「只看装配量」），
 * 建表后自动生效，无需改本文件。
 */

/** 单个 (产品行, side) 的闸门明细 */
export interface InboundQuotaRow {
  orderProductId: number;
  /** 边别：含卡口 left/right，其余 '' */
  side: string;
  /** Σ已完成装配量（actual_date 非空）（支） */
  assembledQty: number;
  /** Σ已入库量（已确认 inbound + 其红字冲销，按 direction 抵扣）（支） */
  inboundQty: number;
  /** 可入库量 = assembledQty − inboundQty，**可为负**（数据异常时），由调用方判定 */
  quota: number;
}

export interface QuotaKey {
  orderProductId: number;
  side: string;
}

/** Map 键：产品行 + 边别。side 统一按空串兜底，避免 null/undefined 拆出两个键 */
export function quotaKey(orderProductId: number, side: string | null | undefined): string {
  return `${orderProductId}#${side ?? ''}`;
}

/**
 * 批量计算若干 (产品行, side) 的可入库量。
 *
 * @param mgr 事务 manager（闸门校验必须与业务写入同事务，§7.13）
 * @param keys 要计算的 (产品行, side) 组合；重复项自动去重
 * @param opts.lock 为 true 时先对相关装配批次行加行锁（`SELECT ... FOR UPDATE`），
 *        防并发下「两笔入库各自读到同一份额度」而双双通过校验。
 *        入库确认与批次删除/下调必须传 true；纯查询接口传 false。
 * @returns Map<quotaKey, InboundQuotaRow>；未命中任何数据的键也会返回全 0 行
 */
export async function loadInboundQuota(
  mgr: EntityManager,
  keys: QuotaKey[],
  opts: { lock?: boolean } = {},
): Promise<Map<string, InboundQuotaRow>> {
  const result = new Map<string, InboundQuotaRow>();
  const uniq = new Map<string, QuotaKey>();
  keys.forEach((k) => {
    if (!Number.isInteger(k.orderProductId) || k.orderProductId <= 0) return;
    uniq.set(quotaKey(k.orderProductId, k.side), {
      orderProductId: k.orderProductId,
      side: k.side ?? '',
    });
  });
  if (!uniq.size) return result;

  const productIds = [...new Set([...uniq.values()].map((k) => k.orderProductId))];
  const placeholders = productIds.map(() => '?').join(',');

  // 行锁：锁住这些产品行的全部装配批次行，后续聚合与业务写入在同一事务内串行化
  if (opts.lock) {
    await mgr.query(
      `SELECT id FROM t_assembly_batch WHERE order_product_id IN (${placeholders}) FOR UPDATE`,
      productIds,
    );
  }

  // 已完成装配量：按 actual_date 非空判定（与共享包 isAssemblyCompleted 同口径；
  // status 是派生列，聚合时不依赖它，避免历史脏数据让闸门失准）
  const asmRows: any[] = await mgr.query(
    `SELECT order_product_id AS pid, side AS side, SUM(qty) AS qty
       FROM t_assembly_batch
      WHERE order_product_id IN (${placeholders}) AND actual_date IS NOT NULL
      GROUP BY order_product_id, side`,
    productIds,
  );
  const assembled = new Map<string, number>();
  asmRows.forEach((r) => {
    assembled.set(quotaKey(Number(r.pid), r.side ?? ''), Number(r.qty) || 0);
  });

  const inbound = await loadConfirmedInboundQty(mgr, productIds);

  uniq.forEach((k, key) => {
    const assembledQty = assembled.get(key) ?? 0;
    const inboundQty = inbound.get(key) ?? 0;
    result.set(key, {
      orderProductId: k.orderProductId,
      side: k.side,
      assembledQty,
      inboundQty,
      quota: calcInboundQuota(assembledQty, inboundQty),
    });
  });
  return result;
}

/** 单个 (产品行, side) 的可入库量；供入库表单与装配页展示 */
export async function loadOneInboundQuota(
  mgr: EntityManager,
  orderProductId: number,
  side: string,
  opts: { lock?: boolean } = {},
): Promise<InboundQuotaRow> {
  const map = await loadInboundQuota(mgr, [{ orderProductId, side }], opts);
  return (
    map.get(quotaKey(orderProductId, side)) ?? {
      orderProductId,
      side: side ?? '',
      assembledQty: 0,
      inboundQty: 0,
      quota: 0,
    }
  );
}

/**
 * Σ已入库量（已确认 inbound 单 + 冲销 inbound 的红字单，按 direction 抵扣）。
 * 成品三表在 M4 建立；表未建时返回空 Map（等价于已入库量为 0）。
 */
async function loadConfirmedInboundQty(
  mgr: EntityManager,
  productIds: number[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!(await hasFinishedStockTables(mgr))) return map;

  const placeholders = productIds.map(() => '?').join(',');
  const rows: any[] = await mgr.query(
    `SELECT fi.order_product_id AS pid, fi.side AS side,
            SUM(fd.direction * fi.quantity) AS qty
       FROM t_finished_item fi
       JOIN t_finished_doc  fd ON fd.id = fi.doc_id
       LEFT JOIN t_finished_doc od ON od.id = fd.origin_doc_id
      WHERE fi.order_product_id IN (${placeholders})
        AND fd.status = ?
        AND (fd.biz_type = ? OR (fd.biz_type = ? AND od.biz_type = ?))
      GROUP BY fi.order_product_id, fi.side`,
    [
      ...productIds,
      FINISHED_DOC_STATUS.CONFIRMED,
      FINISHED_BIZ_TYPE.INBOUND,
      FINISHED_BIZ_TYPE.REVERSAL,
      FINISHED_BIZ_TYPE.INBOUND,
    ],
  );
  rows.forEach((r) => {
    map.set(quotaKey(Number(r.pid), r.side ?? ''), Number(r.qty) || 0);
  });
  return map;
}

/** 成品出入库表是否已建（M4 里程碑落地）。用 information_schema 探测，不靠捕获异常控流 */
async function hasFinishedStockTables(mgr: EntityManager): Promise<boolean> {
  const rows: Array<{ cnt: number | string }> = await mgr.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('t_finished_doc', 't_finished_item')`,
  );
  return Number(rows?.[0]?.cnt ?? 0) >= 2;
}
