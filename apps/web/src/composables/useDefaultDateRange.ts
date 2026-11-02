import { useFeatureFlags } from '@/composables/useFeatureFlags';
import { ledgerDeliveryDateRange, recentSixNaturalMonthRange } from '@/utils/date';

/**
 * 系统级默认日期范围。
 *
 * 只在页面初始化或用户点击“重置”时读取开关，不监听后续变化，因此管理员修改配置
 * 不会突然改写用户当前正在使用的筛选条件；下一次进入页面或重置时才按新配置生效。
 */
export function useDefaultDateRange() {
  const { defaultDateFilterEnabled } = useFeatureFlags();

  /** 单据日期、下单日期等已发生业务：本月及前五个自然月，截至今天。 */
  function defaultRecentDateRange(): [string, string] | null {
    return defaultDateFilterEnabled.value ? recentSixNaturalMonthRange() : null;
  }

  /** 订单交期：从近六个月起点到今天往后六个月。 */
  function defaultDeliveryDateRange(): [string, string] | null {
    return defaultDateFilterEnabled.value ? ledgerDeliveryDateRange() : null;
  }

  return {
    defaultDateFilterEnabled,
    defaultRecentDateRange,
    defaultDeliveryDateRange,
  };
}
