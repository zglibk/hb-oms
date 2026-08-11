import { computed, ref, watch } from 'vue';
import { qtyFromWeight } from '@/constants/dict';

/**
 * 外发回厂「录入方式」——登记页与列表编辑弹窗共用。
 *
 * 背景：加工商的送货单是印刷单据，多数只印**数量**，重量与单重要靠人手写补，常漏。
 * 原实现让「重量 ÷ 单重」始终驱动数量，结果是：录入员按送货单填了数量 100，
 * 之后顺手补一个重量，数量就被静默改写成 80——账做错了还没人知道。
 *
 * 现在把「谁驱动谁」交给用户显式选择：
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

const MODE_KEY = 'hb_oms_outsource_entry_mode';

function readMode(): OutsourceEntryMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'weight' ? 'weight' : 'qty';
  } catch {
    // 隐私模式/内嵌浏览器可能禁用 localStorage，退回默认值即可
    return 'qty';
  }
}

/**
 * 登记页的录入方式（记住上次选择，不用每次重选）。
 * 默认 `qty`——送货单只有数量是常态，把常态设为默认少一次点击。
 */
export function useOutsourceEntryMode() {
  const entryMode = ref<OutsourceEntryMode>(readMode());
  watch(entryMode, (v) => {
    try {
      localStorage.setItem(MODE_KEY, v);
    } catch {
      /* 同上，存不下不影响本次使用 */
    }
  });
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
