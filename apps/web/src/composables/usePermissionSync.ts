import { onBeforeUnmount, onMounted } from 'vue';
import { ElNotification } from 'element-plus';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { registerDynamicRoutes } from '@/router/dynamic';

/**
 * 权限静默同步（管理员改了授权后，让在线用户的界面跟上）。
 *
 * **前提：服务端的权限校验本来就是实时的**（UserAuthCacheService 每请求查库、60s TTL、
 * 权限变更时主动失效）。所以这里**不强制用户下线、也不需要重新登录**——那只会打断
 * 正在录单的人，而且解决不了任何服务端问题。要解决的只是"按钮和菜单什么时候刷新"。
 *
 * 触发时机（都不打扰用户）：
 *   1. **窗口重新获得焦点**且距上次检查超过 `MIN_INTERVAL_MS`——切出去处理点别的事
 *      再回来，正好是刷新的自然时机；
 *   2. **撞到 403 时**（由 request.ts 调用 `syncOnForbidden`）——那多半就是权限刚被收回，
 *      此刻同步最精确。
 *
 * 提示强度按变化性质区分（用户选定的「静默自愈 + 异常时提醒」）：
 *   - 没变化 → **完全静默**，用户毫无感知；
 *   - 只多了菜单 → 菜单已自动出现，给一条几秒即散的轻提示；
 *   - 权限被收回 / 菜单减少 → 醒目通知且**不自动关闭**，带「立即刷新」按钮——
 *     这种情况用户屏幕上可能还留着不该有的按钮，点下去就是 403，不提醒更困惑。
 *
 * ⚠️ 按钮（`v-permission`）是指令，只在挂载/重渲染时判断，**必须刷新页面才生效**；
 * 菜单是响应式渲染的，赋值即刷新。所以提示语统一写「刷新后生效」，别承诺立即可见。
 */

/** 两次自动检查的最小间隔：授权不是高频操作，5 分钟足够及时又不会打扰 */
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastCheckAt = 0;
/** 同一时刻只跑一次，避免多标签页/多触发点并发拉 profile */
let inflight: Promise<void> | null = null;

async function runSync(router: ReturnType<typeof useRouter>, opts: { force?: boolean } = {}) {
  const store = useUserStore();
  if (!store.isLoggedIn) return;
  if (!opts.force && Date.now() - lastCheckAt < MIN_INTERVAL_MS) return;
  if (inflight) return inflight;

  inflight = (async () => {
    lastCheckAt = Date.now();
    let diff;
    try {
      diff = await store.syncPermissions();
    } catch {
      // 网络抖动不该打扰用户，下次触发再试
      return;
    }
    if (!diff.changed) return;

    // 菜单变了要重新注册动态路由，否则新菜单点进去是空白页
    if (diff.menuChanged) registerDynamicRoutes(router, store.menus);

    const lost = diff.removed.length > 0;
    ElNotification({
      title: lost ? '你的权限已被调整' : '你的权限已更新',
      dangerouslyUseHTMLString: true,
      message: lost
        ? '部分权限已被收回，当前页面上的一些按钮可能已经不能用了。<br/><b>请刷新页面</b>以避免操作失败。'
        : '管理员为你新增了权限。菜单已自动更新；<b>新增的按钮需刷新页面后可见</b>。',
      type: lost ? 'warning' : 'success',
      // 收回权限是"再不刷新就会点出 403"的情形，不能让它自己飘走
      duration: lost ? 0 : 6000,
      position: 'bottom-right',
    });
  })();

  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * 在布局层调用一次即可（打印页等顶层路由不需要——那是一次性页面）。
 */
export function usePermissionSync() {
  const router = useRouter();

  const onVisible = () => {
    if (document.visibilityState === 'visible') void runSync(router);
  };

  onMounted(() => {
    // 进入布局时先记一次时间，避免刚登录就立刻再拉一遍 profile
    lastCheckAt = Date.now();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  });

  return { syncNow: () => runSync(router, { force: true }) };
}

/**
 * 撞到 403 时由 request.ts 调用：绕过节流立即同步一次。
 *
 * 这里刻意**不接收 router**——拦截器里拿不到组件上下文。菜单若有变化会在下一次
 * 布局层触发时补注册路由；403 的当务之急是让用户知道"权限变了、该刷新了"。
 */
export async function syncOnForbidden(): Promise<void> {
  const store = useUserStore();
  if (!store.isLoggedIn) return;
  // 403 之后必然要给用户一个交代，故绕过节流；并发保护仍然生效
  lastCheckAt = 0;
  let diff;
  try {
    diff = await store.syncPermissions();
  } catch {
    return;
  }
  if (!diff.removed.length && !diff.menuChanged) return;
  ElNotification({
    title: '你的权限已被调整',
    dangerouslyUseHTMLString: true,
    message: '刚才的操作被拒绝是因为相关权限已被收回。<br/><b>请刷新页面</b>获取最新的菜单与按钮。',
    type: 'warning',
    duration: 0,
    position: 'bottom-right',
  });
}
