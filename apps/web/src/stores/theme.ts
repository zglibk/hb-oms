import { defineStore } from 'pinia';
import {
  applyThemeColor,
  isValidHexColor,
  DEFAULT_COLOR,
} from '@/utils/theme';
import { applyLoginBg, applyFavicon, readLoginBg } from '@/utils/login-bg';
import { applyDocumentMeta } from '@/utils/document-meta';
import { normalizeUploadUrl } from '@/utils/upload-url';
import { DEFAULT_LOGIN_BG, LOGIN_BG_STORAGE_KEY } from '@/constants/login-bg';
import { getPublicSystemConfig } from '@/api/system';

const STORAGE_KEY = 'hb-mes-theme-color';

function readStoredColor(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidHexColor(saved)) return saved.toUpperCase();
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_COLOR;
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    primaryColor: readStoredColor(),
    loginBgScheme: readLoginBg(),
    /** 系统配置的默认登录背景 URL（由 loadSystemConfig 拉取后填充） */
    systemDefaultLoginBgUrl: '',
    /** 系统配置的 Logo URL（侧边栏顶部展示用） */
    logoUrl: '' as string | null,
    /** 系统配置的公司名称 + 系统名称（侧边栏顶部展示用） */
    companyName: '' as string | null,
    systemName: '' as string | null,
    /** 系统配置的版权信息（登录页底部展示用） */
    copyrightInfo: '' as string | null,
  }),

  actions: {
    /** 设置主题色并持久化 */
    setPrimaryColor(color: string) {
      if (!isValidHexColor(color)) return;
      this.primaryColor = color.toUpperCase();
      applyThemeColor(this.primaryColor);
      try {
        localStorage.setItem(STORAGE_KEY, this.primaryColor);
      } catch {
        // 忽略写入失败
      }
    },

    /** 恢复默认主题色 */
    resetPrimaryColor() {
      this.setPrimaryColor(DEFAULT_COLOR);
    },

    /** 切换登录页背景方案并持久化 */
    setLoginBg(schemeId: string) {
      this.loginBgScheme = schemeId;
      applyLoginBg(schemeId);
      try {
        localStorage.setItem(LOGIN_BG_STORAGE_KEY, schemeId);
      } catch {
        // 忽略写入失败
      }
    },

    /** 恢复默认登录背景（系统默认方案） */
    resetLoginBg() {
      this.setLoginBg(DEFAULT_LOGIN_BG);
    },

    /** 应用启动时还原持久化的主题色与登录背景 */
    initTheme() {
      applyThemeColor(this.primaryColor);
      applyLoginBg(this.loginBgScheme);
    },

    /**
     * 拉取系统配置（公开接口），写入 :root CSS 变量供 applyLoginBg('system-default') 读取，
     * 并应用 favicon；若当前 scheme 为 system-default，则重新应用（可能从空 → 有 URL）。
     * 接口失败时静默忽略，使用 CSS 默认装饰。
     */
    async loadSystemConfig() {
      try {
        const cfg = await getPublicSystemConfig();
        const logoUrl = normalizeUploadUrl(cfg.logoUrl);
        const faviconUrl = normalizeUploadUrl(cfg.faviconUrl);
        const loginBgUrl = normalizeUploadUrl(cfg.loginBgUrl);
        this.systemDefaultLoginBgUrl = loginBgUrl ?? '';
        // 同步 logo / 公司名 / 系统名 / 版权信息（供侧边栏顶部与登录页底部展示）
        this.logoUrl = logoUrl;
        this.companyName = cfg.companyName;
        this.systemName = cfg.systemName;
        this.copyrightInfo = cfg.copyrightInfo;
        // 写入 :root CSS 变量供 applyLoginBg('system-default') 读取
        const root = document.documentElement;
        if (loginBgUrl) {
          root.style.setProperty('--system-default-login-bg', loginBgUrl);
        } else {
          root.style.removeProperty('--system-default-login-bg');
        }
        // 应用 favicon
        applyFavicon(faviconUrl);
        // 动态更新页面标题与社交分享 meta（Open Graph / Twitter Card）
        applyDocumentMeta({
          systemName: cfg.systemName,
          companyName: cfg.companyName,
          logoUrl: logoUrl ?? faviconUrl,
        });
        // 若当前 scheme 为 system-default，则重新应用（可能从空 → 有 URL）
        if (this.loginBgScheme === 'system-default') {
          applyLoginBg('system-default');
        }
      } catch {
        // 接口失败静默忽略，使用 CSS 默认装饰
      }
    },
  },
});
