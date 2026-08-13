/**
 * 国旗图预热（出口国家下拉用）。
 *
 * 背景：flag-icons 的旗子是 CSS `background-image`，271 面 4x3 共约 1.9MB。
 * 其中中位数不到 1KB 的那批被 Vite 内联成 data URI 打进 CSS，随 CSS 一到位就显示；
 * 但 142 面带复杂纹章的（塞尔维亚 177KB、圣赫勒拿 140KB、玻利维亚、墨西哥、西班牙…）
 * 超过内联阈值，输出成独立文件，要真的发请求才有图。
 *
 * 实测 8 并发拉完 271 个本地要 1.2 秒，走生产远程更久。**所以「等下拉打开再下载」
 * 无论如何都来不及**——这也是为什么改回全量渲染并不能解决：全量渲染只是把「滚到
 * 哪行请求哪行」换成「打开面板一次全发」，第一次打开照样有一片空白格，还额外背上
 * 250 个 DOM 节点的渲染卡顿。图在不在取决于请求何时发出，与渲染多少行无关。
 *
 * 因此把下载提前到进入订单表单时（空闲时段起步，不与首屏关键资源抢带宽），
 * 用户填到「出口国家」时图早已在缓存里；下拉继续用虚拟滚动。
 *
 * 两个要点：
 * - URL 从**已生效的 CSS 规则**里现取，不写死路径也不用 import.meta.glob：产物名带
 *   hash、开发期又是 node_modules 下的原始路径，写死会在另一端失效；而 glob 会另外
 *   emit 一份副本，预热的 URL 与 CSS 实际引用的不是同一个，缓存根本命中不了。
 * - **只取 4x3**：flag-icons 同时提供 1x1 方形变体（`.fi-xx.fis`），项目没用到，
 *   全取会让下载量凭空翻倍到近 4MB。
 */
const CONCURRENCY = 8;

let started = false;

function collectFlagUrls(): string[] {
  const urls = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // 跨域样式表读不到 cssRules
    }
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule;
      if (!styleRule.selectorText?.includes('.fi-')) continue;
      const bg = styleRule.style?.backgroundImage || '';
      const matched = /url\(\s*["']?(?!data:)([^"')]+)/.exec(bg);
      if (matched && matched[1].includes('/4x3/')) urls.add(matched[1]);
    }
  }
  return [...urls];
}

/** 幂等：重复调用只有第一次真正下载 */
export function preloadCountryFlags(): void {
  if (started || typeof document === 'undefined') return;
  started = true;

  const urls = collectFlagUrls();
  let cursor = 0;
  // 限并发而不是一把甩出 271 个请求：别把浏览器的请求队列占满、拖慢同页的接口调用
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = url;
      });
    }
  };
  for (let i = 0; i < CONCURRENCY; i++) void worker();
}

/** 进入页面即排队预热，让给首屏关键资源先跑 */
export function preloadCountryFlagsWhenIdle(): void {
  if (started || typeof window === 'undefined') return;
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (idle) idle(() => preloadCountryFlags());
  else setTimeout(preloadCountryFlags, 1000);
}
