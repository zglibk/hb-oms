import type { PrintDriverOrientation } from '@hb-oms/shared';

const PRINT_STATE_FALLBACK_MS = 10 * 60 * 1000;

/**
 * 以临时 @page 规则打开浏览器打印预览，并将打印态保留到预览真正结束。
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

/**
 * 交互打印：按纸型档案的驱动方向临时覆盖页面常驻的毫米 @page，纸张尺寸取打印对话框所选驱动纸型。
 *
 * Chromium 遇到宽 > 高的 CSS 页面尺寸会判定为横向并写入 Windows DEVMODE，还会隐藏「布局」选项。
 * 针式连续纸的自定义表单本身按 241.3×140 定义，须以纵向打印；被判成横向时驱动会把页面转 90°
 * 并缩小。CSS 的 `size: portrait` 也不能用——它要求页面长边竖直，会把宽纸页面框对调成竖长。
 * 所以纵向一律 `size: auto`（不声明尺寸，Chromium 直接用驱动纸型、布局默认纵向）；
 * 只有竖长定义的标准纸型打横版（如 A5 横向）才声明 `size: landscape`。
 * 服务端 PDF 不调用本函数，仍使用打印页常驻的精确毫米 @page。
 */
export function printWithDriverOrientation(orientation: PrintDriverOrientation, bodyClass?: string) {
  const size = orientation === 'landscape' ? 'landscape' : 'auto';
  printWithPageRule(`@page{size:${size};margin:0}`, bodyClass);
}
