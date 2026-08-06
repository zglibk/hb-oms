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

export default router;
