import { defineStore } from 'pinia';
import { getFeatureFlags, type FeatureFlags } from '@/api/system';

/**
 * 业务字段开关（系统配置 → 业务字段）。
 *
 * 管理员在系统配置里关掉某个字段后，全系统的录入框 / 表格列 / 导出列一并隐藏。
 * 页面统一经 `composables/useFeatureFlags` 取值，**禁止各页自行请求接口**。
 *
 * 口径：这是**录入与展示**开关，不删除库里已有的数据——停用期间表单仍原样回传
 * 既有值（见各页注释），重新启用后历史数据完好可见。
 *
 * 新增开关只需在 FeatureFlags 接口与下方 DEFAULTS 各加一项，本文件其余逻辑不用动。
 */

/** 本地缓存键：首屏先用上次的值渲染，避免"列闪一下再消失" */
const STORAGE_KEY = 'hb-oms-feature-flags';

/** 缺省一律**启用**——新库/首次访问/接口没答上来时，不该凭空少字段 */
const DEFAULTS: FeatureFlags = {
  colorFieldEnabled: true,
  customerDrawingNoEnabled: true,
  // 呆滞品颜色**独立开关**，与 colorFieldEnabled 互不影响
  dullStockColorEnabled: true,
  productRequirementEnabled: true,
};

type FeatureState = FeatureFlags & {
  /** 是否已从服务端拉到过真实值（缓存值不算） */
  loaded: boolean;
};

const FLAG_KEYS = Object.keys(DEFAULTS) as Array<keyof FeatureFlags>;

/** 读本地缓存；缺项/损坏的键各自回落到默认值 */
function readCache(): FeatureFlags {
  const out = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as Partial<FeatureFlags>;
      for (const k of FLAG_KEYS) {
        if (typeof cached?.[k] === 'boolean') out[k] = cached[k] as boolean;
      }
    }
  } catch {
    // localStorage 不可用或内容损坏时忽略，走默认值
  }
  return out;
}

export const useFeatureStore = defineStore('feature', {
  state: (): FeatureState => ({ ...readCache(), loaded: false }),

  actions: {
    /** 拉取开关（进入后台布局时调用一次；管理员保存配置后再调一次立即生效） */
    async load() {
      try {
        const flags = await getFeatureFlags();
        for (const k of FLAG_KEYS) {
          // 后端漏回某个键时保留当前值，不要静默变成 undefined
          if (typeof flags?.[k] === 'boolean') this[k] = flags[k];
        }
        this.loaded = true;
        try {
          const snapshot: Partial<FeatureFlags> = {};
          for (const k of FLAG_KEYS) snapshot[k] = this[k];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
          // 忽略写入失败（无痕模式等），下次进页面重新拉即可
        }
      } catch {
        // 接口失败保留上次缓存值：一次网络抖动不该把字段整片藏起来
      }
    },
  },
});
