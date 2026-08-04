/**
 * 动态更新页面标题与社交分享 meta 标签
 *
 * 背景：系统名称、Logo 存于后端 t_system_config，可由管理员修改。
 * 静态 index.html 只能放默认值，运行时拉取配置后用本工具覆盖，
 * 使浏览器标签标题、分享卡片（Open Graph / Twitter Card）反映最新系统信息。
 *
 * 注意：Open Graph 主要供“服务端抓取”的爬虫（微信/QQ/微博/Facebook）读取。
 * 这类爬虫通常不执行 JS，只读初始 HTML，因此：
 *   - 静态 index.html 里的 og 标签是分享卡片的“兜底默认值”（保证有内容）
 *   - 本运行时更新主要让在浏览器内分享、或支持 JS 渲染的平台拿到最新值
 * 若需要爬虫也拿到动态值，需在 Nginx/SSR 层做服务端注入（见部署文档建议）。
 */

interface DocumentMetaOptions {
  systemName?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
}

/** 系统名称缓存键：用于下次启动时同步应用标题，消除标签名闪烁 */
const SYSTEM_NAME_CACHE_KEY = 'hb_mes_system_name';

/** 默认系统名称（无缓存、接口未返回时的兜底） */
const DEFAULT_SYSTEM_NAME = '海宝五金订单跟踪系统';

/**
 * 应用启动时同步设置标题（无需等接口）
 * 读取上次缓存的系统名称立即写入 document.title，
 * 使刷新/再次访问时首屏标题即为正确值，避免从硬编码值跳变。
 * 首次访问（无缓存）时回退到默认名称。
 */
export function applyCachedTitle() {
  try {
    const cached = localStorage.getItem(SYSTEM_NAME_CACHE_KEY);
    document.title = cached?.trim() || DEFAULT_SYSTEM_NAME;
  } catch {
    document.title = DEFAULT_SYSTEM_NAME;
  }
}

/** 确保存在指定的 meta 标签并设置其 content */
function upsertMeta(
  selector: string,
  attr: 'property' | 'name',
  key: string,
  content: string,
) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function applyDocumentMeta(opts: DocumentMetaOptions) {
  const system = opts.systemName?.trim() || '海宝五金订单跟踪系统';
  const company = opts.companyName?.trim() || '海宝五金';
  const description = `${company} PMC 生产计划管理平台 —— 以客户订单为驱动，贯通接单、排产、审核、外协全链路数字化管理。`;

  // 浏览器标签标题：仅使用管理员配置的「系统名称」
  document.title = system;
  // 缓存系统名称，下次启动同步应用，消除标签名闪烁
  try {
    localStorage.setItem(SYSTEM_NAME_CACHE_KEY, system);
  } catch {
    /* localStorage 不可用时忽略 */
  }

  // Open Graph（分享卡片标题同样用系统名称）
  upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', system);
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', system);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
  if (opts.logoUrl) {
    // 转为绝对 URL（分享平台要求 og:image 为可公网访问的完整地址）
    const absLogo = opts.logoUrl.startsWith('http')
      ? opts.logoUrl
      : `${window.location.origin}${opts.logoUrl.startsWith('/') ? '' : '/'}${opts.logoUrl}`;
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', absLogo);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', absLogo);
  }

  // 通用描述
  upsertMeta('meta[name="description"]', 'name', 'description', description);

  // Twitter Card
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', system);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
}
