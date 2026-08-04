import type { Router, RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '@/api/auth';

// 业务页面组件懒加载映射：component 字段 → 实际组件
// 后端 t_permission.component 存的是相对 views 的路径，如 'order/index'
const modules = import.meta.glob('@/views/**/*.vue');

function resolveComponent(component: string | null) {
  if (!component) return undefined;
  const key = `/src/views/${component}.vue`;
  const loader = modules[key];
  if (!loader) {
    // 找不到组件时回退到占位页，避免白屏
    return modules['/src/views/placeholder/index.vue'];
  }
  return loader;
}

/** 将后端菜单树扁平化为 layout 下的子路由 */
function menusToRoutes(menus: MenuNode[]): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = [];
  const walk = (nodes: MenuNode[]) => {
    for (const node of nodes) {
      // 叶子菜单（有 component）才注册为路由
      if (node.component && node.path) {
        routes.push({
          path: node.path.replace(/^\//, ''),
          name: `menu_${node.id}`,
          component: resolveComponent(node.component) as any,
          meta: { title: node.name, icon: node.icon ?? undefined },
        });
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(menus);
  return routes;
}

/** 动态注册菜单路由到 layout('/') 下 */
export function registerDynamicRoutes(router: Router, menus: MenuNode[]) {
  const routes = menusToRoutes(menus);
  routes.forEach((r) => {
    router.addRoute('Layout', { ...r } as RouteRecordRaw);
  });
}
