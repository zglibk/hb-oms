import { ref } from 'vue';

/**
 * 新手引导（el-tour）状态管理。
 *
 * - 模块级单例 ref：布局（挂 el-tour）与任意入口（用户面板「新手引导」）共享同一开关；
 * - localStorage 记忆「已看过」，仅首次登录进入系统时自动弹出；
 * - 手动重看不受记忆限制（用户面板随时可点）。
 *
 * 版本号策略：引导内容大改时递增 KEY 后缀（v1 → v2），老用户会再看到一次新引导。
 */
// v2（2026-08-08）：引导由「首页/基础数据/系统管理」三步扩成完整业务主线十步，并补上操作手册入口。
// v3（2026-08-10）：外发收敛为「外发件回厂记录」，发坯单相关文案全部作废。
// v4（2026-08-10）：跟踪锚点分层——装配/出入库/台账由部件组升到订单产品行，
//                   老用户看过的是「按部件组跟踪」，口径变了必须让他们重看一遍。
// v5（2026-08-11）：物料管理下新增「呆滞品管理」，「成品期初（不挂订单）」同步下线——
//                   老用户还会去期初页找那个页签，得让他们知道换地方了。
const TOUR_DONE_KEY = 'hb_mes_tour_done_v5';

const tourOpen = ref(false);

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式等场景忽略：本会话内仍有效，下次会再弹一次 */
  }
}

export function useTour() {
  /** 打开引导（手动入口用，不看记忆标记） */
  function startTour() {
    tourOpen.value = true;
  }

  /** 结束引导（完成或中途关闭都算看过，写记忆标记） */
  function finishTour() {
    tourOpen.value = false;
    safeSet(TOUR_DONE_KEY, '1');
  }

  /** 是否应自动弹出：没看过 且 非小屏（小屏遮罩引导体验差，不打扰） */
  function shouldAutoStart(): boolean {
    return !safeGet(TOUR_DONE_KEY) && window.innerWidth > 768;
  }

  return { tourOpen, startTour, finishTour, shouldAutoStart };
}
