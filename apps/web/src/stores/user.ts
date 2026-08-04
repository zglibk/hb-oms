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
