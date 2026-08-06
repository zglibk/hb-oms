/**
 * 装配批次口径——前后端**唯一事实源**（设计文档 §3.4 / §4.4 / §7.13~7.15）。
 *
 * 装配是 OMS 唯一纳入系统的工序环节，且仅作**轻量跟踪**：计划员按部件组录批次
 * （计划完成时间 / 实际完成时间 / 装配数量），「实际完成时间已填」即视为该批完成，
 * 其数量计入成品入库闸门。不做工序报工、机台工时、产线调度。
 *
 * 状态枚举本身在 business-status.ts（ASSEMBLY_STATUS），本文件只放派生规则与闸门算式。
 */

import { ASSEMBLY_STATUS } from './business-status';

/**
 * 批次是否已完成：实际完成时间已填 = 已完成（设计文档 §3.4）。
 * 空串与全空白同样视为未填——前端日期选择器清空后常回传 ''，不能当成已完成。
 */
export function isAssemblyCompleted(actualDate: string | Date | null | undefined): boolean {
  if (actualDate == null) return false;
  if (actualDate instanceof Date) return !Number.isNaN(actualDate.getTime());
  return String(actualDate).trim() !== '';
}

/**
 * 批次状态派生：actual_date 为空 → 1 计划中，非空 → 2 已完成。
 * status 列虽然落库（便于按状态筛选走索引），但**只能由本函数赋值**，
 * 禁止业务代码直接写 status——与外发单 deriveOutsourceStatus 同一范式。
 */
export function deriveAssemblyStatus(actualDate: string | Date | null | undefined): number {
  return isAssemblyCompleted(actualDate) ? ASSEMBLY_STATUS.COMPLETED : ASSEMBLY_STATUS.PLANNING;
}

/**
 * 成品入库闸门算式（设计文档 §4.4，M4 入库确认复用同一函数）：
 *
 *   可入库量(部件组, side) = Σ已完成装配量 − Σ已入库量
 *
 * 结果**可为负**，代表已入库量超过了已完成装配量（例如批次被误删/误下调），
 * 由调用方判定并拒绝，本函数不 clamp 到 0——clamp 会把数据异常掩盖成「额度为 0」。
 */
export function calcInboundQuota(
  assembledQty: number | string | null | undefined,
  inboundQty: number | string | null | undefined,
): number {
  return (Number(assembledQty) || 0) - (Number(inboundQty) || 0);
}

/**
 * 边别合法性（设计文档 §7.15 装配卡口分边）：
 * 含卡口组合的产品必须落 left/right，非卡口一律空串 ''。
 * 闸门按 (部件组, side) 分别核算，左右不串量，故边别不允许留空或乱填。
 */
export function isValidSide(side: string | null | undefined, socket: boolean): boolean {
  const v = String(side ?? '').trim();
  return socket ? v === 'left' || v === 'right' : v === '';
}

/**
 * 一个部件组在装配维度上要跟踪的 side 列表：
 * 含卡口 → ['left','right']（左右各自独立卡量），其余 → ['']。
 */
export function assemblySides(socket: boolean): string[] {
  return socket ? ['left', 'right'] : [''];
}
