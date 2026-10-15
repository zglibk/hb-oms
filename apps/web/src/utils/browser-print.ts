export interface BrowserPrintOptions {
  widthMm: number;
  heightMm: number;
  bodyClass: string;
}

export type BrowserPrintOrientation = 'portrait' | 'landscape';

const PRINT_STATE_FALLBACK_MS = 10 * 60 * 1000;

/**
 * 以指定毫米纸型打开浏览器打印预览，并将打印态保留到预览真正结束。
 *
 * Chromium 的 `window.print()` 在部分版本中会在打印预览完成取样前返回；若调用后
 * 立即移除 `@page` 或 body 状态类，预览会退回默认纸型，页面内容也可能被隐藏。
 */
function printWithPageRule(pageRule: string, bodyClass?: string) {
  const pageStyle = document.createElement('style');
  pageStyle.dataset.hbPrintPage = 'true';
  pageStyle.textContent = pageRule;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.clearTimeout(fallbackTimer);
    window.removeEventListener('afterprint', cleanup);
    if (bodyClass) document.body.classList.remove(bodyClass);
    pageStyle.remove();
  };

  document.head.appendChild(pageStyle);
  if (bodyClass) document.body.classList.add(bodyClass);
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

/** 设计器/校准页使用精确毫米尺寸，保证所见纸面与标尺一致。 */
export function printWithPageSize(options: BrowserPrintOptions) {
  printWithPageRule(
    `@page{size:${options.widthMm}mm ${options.heightMm}mm;margin:0}`,
    options.bodyClass,
  );
}

/**
 * 正式单据交互打印只向浏览器声明方向，纸张尺寸由 Windows 驱动中选定的纸型决定。
 *
 * Chromium 会把该方向写入 Windows DEVMODE；若同时用两个长度固定 @page，部分旧版
 * Chromium/厂商驱动只接收自定义宽高、仍沿用驱动默认纵向，最终把整页旋转 90°。
 * 服务端 PDF 不调用本函数，仍使用打印页常驻的精确毫米 @page，PDF 物理尺寸不受影响。
 */
export function printWithDriverOrientation(orientation: BrowserPrintOrientation) {
  printWithPageRule(`@page{size:${orientation};margin:0}`);
}
