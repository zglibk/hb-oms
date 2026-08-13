import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import { useUserStore } from '@/stores/user';
import { tokenStore } from '@/utils/request';
import { registerDynamicRoutes } from './dynamic';
import { ElMessage } from 'element-plus';

/** 静态路由（无需权限） */
const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录' },
  },
  /*
   * 打印页**刻意不挂在 Layout 下**：Layout 的 el-main 自带 16px 内边距、
   * 侧栏顶栏在打印媒体下仍占布局高度，会把 A4 纸面整体顶下十几毫米，
   * 导致每张单据都多出一页空白（已实测）。顶层路由 = 纯净页面，
   * 打印与服务端 PDF 渲染都不必再去 hack Layout 的内部结构。
   * 登录校验不受影响：router.beforeEach 对所有非 /login 路由一律检查 token。
   */
  {
    path: '/order/print',
    name: 'OrderPrint',
    component: () => import('@/views/order/print.vue'),
    meta: { title: '生产任务单' },
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/layout/index.vue'),
    redirect: '/home',
    children: [
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/views/home/index.vue'),
        meta: { title: '首页', icon: 'HomeFilled' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: { title: '个人中心' },
      },
      {
        path: 'redirect/:path(.*)',
        name: 'Redirect',
        component: () => import('@/views/redirect/index.vue'),
        meta: { title: '重定向' },
      },
      /* 非菜单子页面（菜单页内跳转进入，不出现在侧栏；权限由入口按钮控制）。
         meta.activeMenu 指定该子页面应高亮的侧栏菜单项（精确匹配 el-menu-item index）。 */
      {
        path: 'basic/process-info/form',
        name: 'ProcessInfoForm',
        component: () => import('@/views/basic/process-info/form.vue'),
        meta: { title: '工艺录入', activeMenu: '/basic/process-info' },
      },
      {
        path: 'basic/process-info/history',
        name: 'ProcessInfoHistory',
        component: () => import('@/views/basic/process-info/history.vue'),
        meta: { title: '工艺修改履历', activeMenu: '/basic/process-info' },
      },
      {
        path: 'order/form',
        name: 'OrderForm',
        component: () => import('@/views/order/form.vue'),
        meta: { title: '订单录入', activeMenu: '/order' },
      },
      {
        path: 'outsource/form',
        name: 'OutsourceForm',
        component: () => import('@/views/outsource/form.vue'),
        meta: { title: '登记外发件回厂', activeMenu: '/outsource' },
      },
      // 2026-08-10：发坯单打印页随发坯单一并下线（加工单改回纯手工）
      {
        path: 'finished-stock/form',
        name: 'FinishedStockForm',
        component: () => import('@/views/finished-stock/form.vue'),
        meta: { title: '出入库单录入', activeMenu: '/finished-stock' },
      },
      {
        // 人事档案字段多（基本信息/教育背景/用工属性/车间属性四段），弹窗塞不下，改子页面
        path: 'hr/employee/form',
        name: 'EmployeeForm',
        component: () => import('@/views/hr/employee/form.vue'),
        meta: { title: '员工档案录入', activeMenu: '/hr/employee' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: constantRoutes,
});

router.beforeEach(async (to, _from, next) => {
  const hasToken = !!tokenStore.get();

  if (to.path === '/login') {
    if (hasToken) next({ path: '/' });
    else next();
    return;
  }

  if (!hasToken) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  const userStore = useUserStore();
  if (!userStore.routesLoaded) {
    try {
      // 刷新页面后恢复用户信息 + 动态注册菜单路由
      if (!userStore.userInfo) {
        await userStore.loadProfile();
      }
      registerDynamicRoutes(router, userStore.menus);
      userStore.routesLoaded = true;
      next({ ...to, replace: true });
    } catch {
      userStore.reset();
      next({ path: '/login' });
    }
    return;
  }

  const needAll = to.meta.permissions;
  const needAny = to.meta.anyPermissions;
  if (needAll?.length || needAny?.length) {
    const okAll = !needAll?.length || needAll.every((p) => userStore.hasPermission(p));
    const okAny = !needAny?.length || userStore.hasAnyPermission(needAny);
    if (!okAll || !okAny) {
      ElMessage.warning('无访问权限');
      next({ path: '/home', replace: true });
      return;
    }
  }

  next();
});

/**
 * 懒加载 chunk 失效兜底（发版后必现的老页面卡死）。
 *
 * 现象：页面在发版前打开，路由组件是内容哈希命名的懒加载 chunk；部署脚本会
 * `rm -rf web-dist/assets` 再解包新产物，老哈希文件名全部消失。此时点任何
 * 尚未加载过的页面（退出→登录页、订单表单、打印页…），浏览器请求老 chunk
 * 被 Nginx 的 SPA 规则**回吐 index.html（Content-Type: text/html）**，
 * 动态 import 因 MIME 不符而 reject → vue-router 中止导航 → 页面原地不动，
 * 用户只能手动刷新。（2026-08-06 M3.5 发版后实测复现）
 *
 * 处理：识别到 chunk 加载失败就带着目标路径**硬跳转**一次，让浏览器重新拉
 * 新的 index.html 与新 chunk；用 sessionStorage 打标，同一目标只跳一次，
 * 避免新版本本身有问题时陷入刷新死循环。
 */
const CHUNK_RELOAD_PREFIX = 'hb_oms_chunk_reload:';
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|Unable to preload CSS/i;

function markedReloaded(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, '1');
    return false;
  } catch {
    // 隐私模式禁用 sessionStorage：放弃防重入，至少保证能跳一次
    return false;
  }
}

router.onError((error, to) => {
  if (!CHUNK_ERROR_RE.test(String((error as Error)?.message ?? error))) return;
  const key = `${CHUNK_RELOAD_PREFIX}${to.fullPath}`;
  if (markedReloaded(key)) return;
  // BASE_URL 生产为 '/oms/admin/'，去掉尾斜杠再拼 fullPath，避免出现双斜杠
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.location.assign(`${base}${to.fullPath}`);
});

// 导航成功即说明当前版本的 chunk 可用，清掉标记，
// 使下一次真正的发版失效仍能触发硬跳转（否则同一目标一辈子只救一次）。
router.afterEach((to) => {
  try {
    sessionStorage.removeItem(`${CHUNK_RELOAD_PREFIX}${to.fullPath}`);
  } catch {
    /* ignore */
  }
});

export default router;
