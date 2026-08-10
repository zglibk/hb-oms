/**
 * 外发（发坯单）口径——前后端唯一事实源（设计文档 §3.2 / §4.3）。
 *
 * **回货**按重量结算、按支数跟踪：收回重量 ÷ 单重折算出支数，折算规则必须两端
 * 一致（前端弹窗自动带出、后端落库兜底），故下沉本包。
 * 发出侧的过磅折算已随「取消发出环节」下线（2026-08-10），`qtyFromWeight`
 * 现在只服务于回货登记。
 * 状态枚举本身在 business-status.ts（OUTSOURCE_STATUS），本文件只放派生规则。
 */

import { OUTSOURCE_STATUS } from './business-status';

/** 发坯单号定长位数：7 位纯数字全局序号，展示层拼 `No.` 前缀（设计文档 §4.7） */
export const BLANK_NO_WIDTH = 7;

/** 发坯单号展示：库存 '0000123' → 展示 'No.0000123' */
export function formatBlankNo(blankNo: string | null | undefined): string {
  const v = String(blankNo ?? '').trim();
  return v ? `No.${v}` : '';
}

/**
 * 重量 → 数量（支）：`数量 = 重量 ÷ 单重`，四舍五入取整。
 *
 * 取整而非向下取整的原因：重量为磅秤实测值、单重为理论值，二者必有折算误差，
 * 就近取整比截断更接近真实支数；结果仅作**默认值**，允许人工微调（§4.3）。
 * 单重缺失或非正数时返回 0（界面据此提示先填单重）。
 */
export function qtyFromWeight(
  weight: number | string | null | undefined,
  unitWeight: number | string | null | undefined,
): number {
  const w = Number(weight);
  const u = Number(unitWeight);
  if (!Number.isFinite(w) || !Number.isFinite(u) || u <= 0 || w <= 0) return 0;
  return Math.round(w / u);
}

/** 行级回齐判定：累计回货数 ≥ 应回数（允许超回，见 §7.6） */
export function isItemFullyReturned(
  planReturnQty: number | null | undefined,
  returnedQty: number | null | undefined,
): boolean {
  return (Number(returnedQty) || 0) >= (Number(planReturnQty) || 0);
}

/**
 * 单头状态派生（设计文档 §3.2 状态机）：
 * - 无明细行、或尚无任何回货 → 1 待回货；
 * - 全部明细行回齐（累计回货 ≥ 应回数）→ 4 已回齐；
 * - 其余（部分行回齐 / 行内部分回货）→ 3 部分回货。
 *
 * 作废（9）与手工关闭（3→4，尾数不回场景）不由本函数派生，属显式操作。
 *
 * 2026-08-10：**发出环节取消**后本函数不再需要 `hasActualSendDate` 入参——
 * 建单即待回货，状态只由回货登记推进。空单保持待回货而非回齐，避免
 * 「一条明细都没有的单被判成已回齐」。
 */
export function deriveOutsourceStatus(
  items: Array<{
    planReturnQty: number | null | undefined;
    returnedQty: number | null | undefined;
  }>,
): number {
  if (!items.length) return OUTSOURCE_STATUS.PENDING;
  const totalReturned = items.reduce((sum, it) => sum + (Number(it.returnedQty) || 0), 0);
  if (totalReturned <= 0) return OUTSOURCE_STATUS.PENDING;
  return items.every((it) => isItemFullyReturned(it.planReturnQty, it.returnedQty))
    ? OUTSOURCE_STATUS.RETURNED_ALL
    : OUTSOURCE_STATUS.PARTIAL_RETURNED;
}
