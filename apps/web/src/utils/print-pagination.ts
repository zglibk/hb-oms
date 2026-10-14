import type { PrintProfileConfig } from '@/api/print-config';

/**
 * 空白纸的自动分页会把长文本折行折算成多行高度；固定分页则严格按配置行数。
 * 每页仍由纸面组件独立渲染完整单头、表头和签名栏，因此不会跨连续纸撕纸线。
 */
export interface PrintRowMeasurement {
  rowHeights: number[];
  baseRowHeight: number;
}

export function paginateRows<T extends Record<string, unknown>>(
  rows: T[],
  config: PrintProfileConfig,
  measurement?: PrintRowMeasurement,
): T[][] {
  if (!rows.length) return [[]];
  const limit = Math.max(1, Math.min(50, config.pagination.rowsPerPage || 1));
  if (config.pagination.strategy === 'fixed' || config.mode === 'preprinted') {
    return chunk(rows, limit);
  }
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  const measured = measurement && measurement.baseRowHeight > 0 && measurement.rowHeights.length === rows.length;
  const capacity = measured ? measurement.baseRowHeight * limit : limit;
  for (const [index, row] of rows.entries()) {
    const longest = Math.max(0, ...Object.values(row).map((v) => String(v ?? '').length));
    // 首屏渲染前暂以字符数兜底；隐藏测量纸面就绪后改用浏览器真实排版高度。
    const height = measured
      ? Math.max(measurement.rowHeights[index] || measurement.baseRowHeight, measurement.baseRowHeight)
      : Math.max(1, Math.ceil(longest / 18));
    if (page.length && used + height > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(row);
    used += height;
  }
  if (page.length) pages.push(page);
  return pages;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages;
}
