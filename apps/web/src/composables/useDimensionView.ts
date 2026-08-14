import { computed, ref, watch, type ComputedRef, type WritableComputedRef } from 'vue';
import { DIMENSION_UNIT, formatDimensionView } from '@/constants/dict';
import { useFeatureFlags } from './useFeatureFlags';

type ViewUnit = typeof DIMENSION_UNIT.MM | typeof DIMENSION_UNIT.INCH;

/**
 * 规格查看单位（mm / 寸）——首页、订单跟踪台账、订单管理三页共用。
 *
 * 三页原先各写一份「ref + 列标题 computed + 格式化函数」，2026-08-14 加「默认单位」
 * 配置时就成了第三处重复，按 §4.4 抽到这里。
 *
 * 两条口径：
 * - **初值取系统配置的「默认规格单位」**；配置是异步到的（布局层统一拉取），
 *   所以要 watch 一次，不能只在 setup 时读一遍。
 * - **用户本次会话手动切过之后，配置的后续变化不再顶掉他的选择**（`touched`）。
 *   否则管理员在另一头保存配置、正在看表的人手里的单位会被悄悄换掉。
 *
 * 换算系数同样来自配置，**页面不要再直接引 INCH_TO_MM 常量**。
 */
export function useDimensionView(): {
  /** 绑给 el-radio-group 的 v-model；写入即视为用户手动切换 */
  viewUnit: WritableComputedRef<ViewUnit>;
  /** 列标题：规格(mm) / 规格(寸) */
  colLabel: ComputedRef<string>;
  /** mm 数值 → 当前单位的展示文本；空值给「—」 */
  text: (mm: number | null | undefined) => string;
} {
  const { inchToMm, dimensionViewUnit } = useFeatureFlags();

  const touched = ref(false);
  const current = ref<ViewUnit>(dimensionViewUnit.value as ViewUnit);

  watch(dimensionViewUnit, (v) => {
    if (!touched.value) current.value = v as ViewUnit;
  });

  const viewUnit = computed<ViewUnit>({
    get: () => current.value,
    set: (v) => {
      touched.value = true;
      current.value = v;
    },
  });

  return {
    viewUnit,
    colLabel: computed(() =>
      current.value === DIMENSION_UNIT.INCH ? '规格(寸)' : '规格(mm)',
    ),
    text: (mm) => formatDimensionView(mm, current.value, inchToMm.value) || '—',
  };
}
