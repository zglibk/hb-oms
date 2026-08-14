import { defineStore } from 'pinia';
import {
  login as loginApi,
  logout as logoutApi,
  getProfile,
  updateProfile,
  type LoginParams,
  type MenuNode,
  type UserInfo,
  type UpdateProfileParams,
} from '@/api/auth';
import { tokenStore } from '@/utils/request';
import { clearDictCache } from '@/composables/useDict';

interface UserState {
  userInfo: UserInfo | null;
  roles: string[];
  roleNames: string[];
  permissions: string[];
  menus: MenuNode[];
  /** 动态路由是否已注册 */
  routesLoaded: boolean;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    userInfo: null,
    roles: [],
    roleNames: [],
    permissions: [],
    menus: [],
    routesLoaded: false,
  }),

  getters: {
    isLoggedIn: () => !!tokenStore.get(),
  },

  actions: {
    async login(params: LoginParams) {
      const res = await loginApi(params);
      tokenStore.set(res.accessToken, res.refreshToken);
      this.userInfo = res.userInfo;
      this.roles = res.roles;
      this.roleNames = res.roleNames;
      this.permissions = res.permissions;
      this.menus = res.menus;
      return res;
    },

    /** 刷新页面后从 profile 恢复用户信息与菜单 */
    async loadProfile() {
      const res = await getProfile();
      this.userInfo = res.userInfo;
      this.roles = res.roles;
      this.roleNames = res.roleNames;
      this.permissions = res.permissions;
      this.menus = res.menus;
      return res;
    },

    /**
     * 同步权限（管理员改了授权后让界面跟上）。
     *
     * **服务端的权限校验本来就是实时的**（UserAuthCacheService 每请求查库、60s TTL、
     * 变更时主动失效），所以这里要解决的只是"界面显不显示"，**不需要强制用户重新登录**。
     *
     * 三类东西的生效方式不同，返回值据此让调用方决定要不要提示：
     *   - **菜单**：`menus` 是响应式渲染的，赋值即刷新，**真静默生效**；
     *   - **动态路由**：新菜单要 addRoute 才点得进去（调用方负责，见 usePermissionSync）；
     *   - **按钮**：`v-permission` 是指令，只在挂载/重渲染时判断，**必须刷新页面**才变。
     *
     * @returns 与上次相比的差异；`changed` 为 false 时调用方应完全静默
     */
    async syncPermissions(): Promise<{
      changed: boolean;
      added: string[];
      removed: string[];
      menuChanged: boolean;
    }> {
      const beforePerms = [...this.permissions];
      const beforeMenu = JSON.stringify(this.menus.map((m) => m.path));
      await this.loadProfile();
      const added = this.permissions.filter((p) => !beforePerms.includes(p));
      const removed = beforePerms.filter((p) => !this.permissions.includes(p));
      const menuChanged = JSON.stringify(this.menus.map((m) => m.path)) !== beforeMenu;
      return { changed: !!added.length || !!removed.length || menuChanged, added, removed, menuChanged };
    },

    /** 个人中心自助更新（姓名/手机/备注/头像） */
    async updateMyProfile(params: UpdateProfileParams) {
      const res = await updateProfile(params);
      this.userInfo = res.userInfo;
      this.roles = res.roles;
      this.roleNames = res.roleNames;
      this.permissions = res.permissions;
      return res;
    },

    async logout() {
      try {
        await logoutApi();
      } catch {
        // 忽略登出接口错误，本地清理即可
      }
      this.reset();
    },

    reset() {
      tokenStore.clear();
      this.userInfo = null;
      this.roles = [];
      this.roleNames = [];
      this.permissions = [];
      this.menus = [];
      this.routesLoaded = false;
      clearDictCache();
    },

    hasPermission(code: string): boolean {
      return this.permissions.includes(code);
    },

    /** 拥有任一权限即通过（OR） */
    hasAnyPermission(codes: string[]): boolean {
      return codes.some((c) => this.permissions.includes(c));
    },
  },
});
