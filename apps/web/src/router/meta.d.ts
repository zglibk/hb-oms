import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    icon?: string;
    /** 需全部满足的功能权限（AND） */
    permissions?: string[];
    /** 满足其一即可（OR） */
    anyPermissions?: string[];
    /**
     * 非菜单子页应高亮的侧栏菜单路径（精确匹配 el-menu-item 的 index）。
     * 如订单新增/编辑页 /order/form 不在侧栏，应高亮 /order；
     * 工艺录入/履历页应高亮 /basic/process-info。
     */
    activeMenu?: string;
    /**
     * 免登录可访问（现役只有数据大屏 /screen：车间电视凭访问码看，页面自行判断走哪个入口）。
     * 带 token 时照常加载用户信息与动态路由。
     */
    public?: boolean;
  }
}
