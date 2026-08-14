import { computed, type ComputedRef } from 'vue';
import { useFeatureStore } from '@/stores/feature';

/**
 * 业务字段开关（系统配置 → 业务字段）的页面读取入口。
 *
 * 用法：
 *   const { colorEnabled } = useFeatureFlags();
 *   <el-table-column v-if="colorEnabled" label="颜色" />
 *
 * 开关值由布局层统一拉取（layout/index.vue 的 onMounted），页面**不要**自己请求接口。
 * 停用只影响录入与展示：表单仍原样回传已有值，不会把历史数据洗掉。
 */
export function useFeatureFlags(): {
  colorEnabled: ComputedRef<boolean>;
  customerDrawingNoEnabled: ComputedRef<boolean>;
  dullStockColorEnabled: ComputedRef<boolean>;
  productRequirementEnabled: ComputedRef<boolean>;
  inchToMm: ComputedRef<number>;
  dimensionViewUnit: ComputedRef<'mm' | 'inch'>;
} {
  const store = useFeatureStore();
  return {
    /** 「颜色」字段是否启用（与「表面处理」配套的业务字段，非主题色） */
    colorEnabled: computed(() => store.colorFieldEnabled),
    /** 「客户图号」字段是否启用（客户来图图号，非部件组的生产图号） */
    customerDrawingNoEnabled: computed(() => store.customerDrawingNoEnabled),
    /**
     * 呆滞品管理页的「颜色」是否启用。
     * **独立于 colorEnabled**，呆滞品页只认这一个，不要再与全局颜色开关相与。
     */
    dullStockColorEnabled: computed(() => store.dullStockColorEnabled),
    /** 「产品要求描述」是否启用（订单产品级的特殊要求文本） */
    productRequirementEnabled: computed(() => store.productRequirementEnabled),
    /**
     * 英寸换算系数（1 英寸 = N mm，缺省 25）。
     * 展示换算与录入折算都传它，**不要再直接用共享包的 INCH_TO_MM 常量**。
     */
    inchToMm: computed(() => store.inchToMm),
    /** 规格默认查看单位：页面上的 mm/寸 切换以它为初值，用户仍可临时切换 */
    dimensionViewUnit: computed(() => store.dimensionViewUnit),
  };
}
