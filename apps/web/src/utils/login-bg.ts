import {
  DEFAULT_LOGIN_BG,
  LOGIN_BG_STORAGE_KEY,
  getLoginBgScheme,
} from '@/constants/login-bg';

/** 读取持久化的登录背景方案 id；非法或缺失时回退默认 */
export function readLoginBg(): string {
  try {
    const saved = localStorage.getItem(LOGIN_BG_STORAGE_KEY);
    if (!saved) return DEFAULT_LOGIN_BG;
    if (getLoginBgScheme(saved)) return saved;
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_LOGIN_BG;
}

/**
 * 应用登录背景方案：向 :root 写入或清除 CSS 变量。
 *
 * 约定（在 views/login/index.vue 中）：
 *   .login-page     { background-image: var(--login-bg-image, none); }
 *   .bg-decoration  { display: var(--login-bg-show-decoration, block); }
 *
 * 系统默认方案（'system-default'）从 :root 的 --system-default-login-bg CSS 变量
 * 读取 URL（由 stores/theme.ts 的 loadSystemConfig 写入）：
 *   - 变量有值（系统配置了图片） → 应用图片
 *   - 变量为空（系统未配置图片） → 移除 --login-bg-image，显示 CSS 默认装饰
 */
export function applyLoginBg(schemeId: string): void {
  const root = document.documentElement;

  // 系统默认方案：从 :root CSS 变量读取系统配置的背景 URL
  if (schemeId === 'system-default') {
    const url = root.style.getPropertyValue('--system-default-login-bg').trim();
    if (url) {
      root.style.setProperty('--login-bg-image', `url("${url}")`);
      root.style.setProperty('--login-bg-show-decoration', 'none');
    } else {
      // 系统未配置图片 → 回退 CSS 默认装饰
      root.style.removeProperty('--login-bg-image');
      root.style.removeProperty('--login-bg-show-decoration');
    }
    return;
  }

  const scheme = getLoginBgScheme(schemeId);
  if (!scheme || scheme.type === 'system') {
    // 兜底：未知方案 → 系统默认行为
    root.style.removeProperty('--login-bg-image');
    root.style.removeProperty('--login-bg-show-decoration');
    return;
  }

  if (scheme.type === 'image' && scheme.image) {
    root.style.setProperty('--login-bg-image', `url("${scheme.image}")`);
    root.style.setProperty('--login-bg-show-decoration', 'none');
  }
}

/** 默认 favicon（public/favicon.svg） */
const DEFAULT_FAVICON = '/favicon.svg';

/**
 * 动态应用网站图标（favicon）。
 * 接管所有 <link rel="icon"> 标签（包括 index.html 中的默认标签），统一管理 href。
 *   - 有 URL：设置 href 为上传的 favicon URL
 *   - 无 URL：回退到默认 /favicon.svg
 *
 * @param url 服务器返回的 favicon 绝对路径（如 '/uploads/2026/07/04/xxx.ico'），null 表示使用默认
 */
export function applyFavicon(url: string | null): void {
  const head = document.head;
  // 查找所有 <link rel="icon"> 标签（包括 index.html 中的默认标签和动态注入的）
  const links = head.querySelectorAll<HTMLLinkElement>("link[rel='icon']");
  let link: HTMLLinkElement;
  if (links.length > 0) {
    // 复用第一个 link 标签，移除多余的
    link = links[0];
    links.forEach((l, i) => {
      if (i > 0) head.removeChild(l);
    });
  } else {
    // 不存在则创建
    link = document.createElement('link');
    link.rel = 'icon';
    head.appendChild(link);
  }
  link.href = url || DEFAULT_FAVICON;
  link.setAttribute('data-system-favicon', 'true');
}
