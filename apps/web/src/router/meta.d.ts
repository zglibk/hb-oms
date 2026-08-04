import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    icon?: string;
    /** 需全部满足的功能权限（AND） */
    permissions?: string[];
    /** 满足其一即可（OR） */
    anyPermissions?: string[];
  }
}
