/**
 * 外发口径——前后端唯一事实源（设计文档 §4.3）。
 *
 * 2026-08-10 外发模块经**两轮简化**收敛到最小形态：先取消「发出」环节，
 * 再取消发坯单本身。现在只有一种记录：**外发件回厂流水**——货回厂时录一条
 * （锚定部件组 + 加工商 + 回厂日期 + 重量/单重/数量）。
 *
 * 随之下线的：发坯单号（`BLANK_NO` 采番、`formatBlankNo`）、单头状态派生
 * （`deriveOutsourceStatus`）、行级回齐判定（`isItemFullyReturned`）——
 * 没有单据就没有单号，没有"应回"就没有回齐可判。
 *
 * 本文件因此只剩重量→数量的折算：回厂按重量结算、按支数跟踪，折算规则
 * 必须前后端一致（前端表单自动带出、后端落库兜底），故留在共享包。
 */

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
