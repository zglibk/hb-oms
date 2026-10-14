export interface BrowserPrintOptions {
  widthMm: number;
  heightMm: number;
  bodyClass: string;
}

const PRINT_STATE_FALLBACK_MS = 10 * 60 * 1000;

/**
 * 以指定毫米纸型打开浏览器打印预览，并将打印态保留到预览真正结束。
 *
 * Chromium 的 `window.print()` 在部分版本中会在打印预览完成取样前返回；若调用后
 * 立即移除 `@page` 或 body 状态类，预览会退回默认纸型，页面内容也可能被隐藏。
 */
export function printWithPageSize(options: BrowserPrintOptions) {
  const pageStyle = document.createElement('style');
  pageStyle.dataset.hbPrintPage = 'true';
  pageStyle.textContent = `@page{size:${options.widthMm}mm ${options.heightMm}mm;margin:0}`;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.clearTimeout(fallbackTimer);
    window.removeEventListener('afterprint', cleanup);
    document.body.classList.remove(options.bodyClass);
    pageStyle.remove();
  };

  document.head.appendChild(pageStyle);
  document.body.classList.add(options.bodyClass);
  window.addEventListener('afterprint', cleanup, { once: true });
  const fallbackTimer = window.setTimeout(cleanup, PRINT_STATE_FALLBACK_MS);

  // 等待两帧，确保动态 @page 与打印态样式均已完成布局后再交给浏览器取样。
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        window.print();
      } catch (error) {
        cleanup();
        throw error;
      }
    });
  });
}
