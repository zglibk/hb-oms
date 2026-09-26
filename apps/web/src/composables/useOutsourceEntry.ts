import { computed, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { qtyFromWeight } from '@/constants/dict';
import { getReturnProgress } from '@/api/outsource';

/**
 * 外发回厂「录入方式」——登记页与列表编辑弹窗共用。
 *
 * 背景：加工商的送货单是印刷单据，多数只印**数量**，重量与单重要靠人手写补，常漏。
 * 原实现让「重量 ÷ 单重」始终驱动数量，结果是：录入员按送货单填了数量 100，
 * 之后顺手补一个重量，数量就被静默改写成 80——账做错了还没人知道。
 *
 * 现在把「谁驱动谁」交给用户显式选择（默认 qty，见 useOutsourceEntryMode）：
 *   - qty    按数量：以送货单数量为准，重量/单重仅作记录与对账，**不回算数量**；
 *   - weight 按重量折算：重量与单重驱动数量，算完仍可微调。
 *
 * 一次登记 = 同一加工商 + 同一回厂日期 = 同一张送货单，故「一次录入一种模式」成立，
 * 不需要做到逐行可选。
 */
export type OutsourceEntryMode = 'qty' | 'weight';

export const ENTRY_MODE_OPTIONS: Array<{ label: string; value: OutsourceEntryMode }> = [
  { label: '按数量', value: 'qty' },
  { label: '按重量折算', value: 'weight' },
];

/**
 * 登记页的录入方式，**每次进入都重置为「按数量」**。
 *
 * 刻意不记忆上次选择：送货单只有数量是常态；而"记住上次"恰恰会制造隐患——
 * 某次用过折算模式后，下次进来仍停在折算，录入员按送货单填了数量、再补个重量，
 * 数量就被改掉了。默认回到最安全的那一档，要折算再手动切。
 */
export function useOutsourceEntryMode() {
  const entryMode = ref<OutsourceEntryMode>('qty');
  return { entryMode, isQtyMode: computed(() => entryMode.value === 'qty') };
}

/** 数量与「重量÷单重」的允许偏差，超过即提醒复核（不硬拦——过磅本就有误差） */
const QTY_TOLERANCE = 0.1;

/**
 * 三个数都填了、且登记数量与按重量折算的结果相差超过 10% 时，返回折算值；
 * 否则返回 null（一致或信息不全，无需打扰）。
 *
 * 只提示不清零：送货单同时印了重量和数量是常有的事（表面处理常按重量计价），
 * 抹掉重量会让加工费对账失去依据。
 */
export function mismatchedQty(row: {
  returnQty: number;
  returnWeight: number;
  unitWeight: number;
}): number | null {
  if (!(row.returnQty > 0 && row.returnWeight > 0 && row.unitWeight > 0)) return null;
  const calc = qtyFromWeight(row.returnWeight, row.unitWeight);
  if (calc <= 0) return null;
  return Math.abs(row.returnQty - calc) / row.returnQty > QTY_TOLERANCE ? calc : null;
}

/**
 * 保存前的**超量提醒**（2026-09-26，使用方反馈「回完了的外轨还能再登记一次」）：
 * 同一部件组「已回厂 + 本次登记」超过组支数时弹框列出，确认后才继续。
 *
 * - 已回厂数**保存时现查**（getReturnProgress），不用选择器打开时带回的数——两人同时登记同一批货时那份已过期；
 * - 同一次登记里同一组出现多行时先合并再比；
 * - **只提醒不拦截**：返工回厂、客户加量先做后补单都会合理超出；拦「重复登记 / 多打一个 0」靠当场确认就够（服务端也不硬拦）。
 *
 * @param rows   本次要保存的行（label 用于提示里指认是哪一行，如「第 2 行 GLI46273-A 外轨」）
 * @param excludeId 编辑弹窗传正在改的记录 id：它的旧数量不该算进「已回厂」
 * @returns 可以继续保存返回 true
 */
export async function confirmOverReturn(
  rows: Array<{ orderPartGroupId: number; returnQty: number; label: string }>,
  excludeId?: number,
): Promise<boolean> {
  const ids = [...new Set(rows.map((r) => r.orderPartGroupId))];
  if (!ids.length) return true;
  const progress = new Map((await getReturnProgress(ids, excludeId)).map((p) => [p.orderPartGroupId, p]));
  const lines: string[] = [];
  ids.forEach((gid) => {
    const p = progress.get(gid);
    if (!p || p.qtyPcs <= 0) return;
    const mine = rows.filter((r) => r.orderPartGroupId === gid);
    const thisQty = mine.reduce((s, r) => s + (Number(r.returnQty) || 0), 0);
    const total = p.returnedQty + thisQty;
    if (total <= p.qtyPcs) return;
    lines.push(
      `${mine.map((r) => r.label).join('、')}：组需求 ${p.qtyPcs} 支，已回厂 ${p.returnedQty} 支，` +
        `本次 ${thisQty} 支，累计 ${total} 支（超出 ${total - p.qtyPcs} 支）`,
    );
  });
  if (!lines.length) return true;
  try {
    await ElMessageBox.confirm(
      `<div>以下部件组登记后累计回厂将超过订单需求，请核对是否<b>重复登记</b>或<b>数量多打了位数</b>：</div>` +
        `<ul style="margin:6px 0 0;padding-left:18px">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
      '累计回厂超出订单需求',
      {
        type: 'warning',
        dangerouslyUseHTMLString: true,
        confirmButtonText: '确认无误，继续登记',
        cancelButtonText: '返回修改',
      },
    );
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
