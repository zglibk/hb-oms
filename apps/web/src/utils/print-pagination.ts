import type { PrintProfileConfig } from '@/api/print-config';

/**
 * 空白纸的自动分页会把长文本折行折算成多行高度；固定分页则严格按配置行数。
 * 每页仍由纸面组件独立渲染完整单头、表头和签名栏，因此不会跨连续纸撕纸线。
 */
export interface PrintRowMeasurement {
  rowHeights: number[];
  baseRowHeight: number;
  /** 扣除单头、表头、合计行、签名栏与纸面内边距后，明细行真正可用的像素高度。 */
  availableRowHeight: number;
}

/**
 * 从隐藏的完整纸面读取浏览器真实排版尺寸。
 * 纸型、边距、字体缩放和模板不同都会改变可用高度，因此不能再用
 * 「基础行高 × 配置行数」冒充纸面容量。
 */
export function measurePrintRows(host: HTMLElement, expectedRows: number): PrintRowMeasurement | undefined {
  const sheet = host.querySelector<HTMLElement>('[data-print-sheet]');
  const table = host.querySelector<HTMLElement>('[data-print-detail-table]');
  const tableHead = host.querySelector<HTMLElement>('[data-print-table-head]');
  const signatures = host.querySelector<HTMLElement>('[data-print-signatures]');
  const probe = host.querySelector<HTMLElement>('[data-print-row-probe]');
  const measuredRows = Array.from(host.querySelectorAll<HTMLElement>('[data-print-detail-row]'));
  if (!sheet || !table || !tableHead || !signatures || !probe || measuredRows.length !== expectedRows) {
    return undefined;
  }

  const sheetRect = sheet.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const tableHeadHeight = tableHead.getBoundingClientRect().height;
  const tableFootHeight = Array.from(host.querySelectorAll<HTMLElement>('[data-print-table-foot]'))
    .reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
  const signaturesHeight = signatures.getBoundingClientRect().height;
  const baseRowHeight = probe.getBoundingClientRect().height;
  // 减 1px 给折叠边框与浏览器毫米换算的舍入误差留余量，避免多出空白尾页。
  const availableRowHeight = sheetRect.bottom - paddingBottom - tableRect.top
    - tableHeadHeight - tableFootHeight - signaturesHeight - 1;

  if (baseRowHeight <= 0 || availableRowHeight <= 0) return undefined;
  return {
    baseRowHeight,
    availableRowHeight,
    rowHeights: measuredRows.map((row) => row.getBoundingClientRect().height),
  };
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
  const measured = measurement
    && measurement.baseRowHeight > 0
    && measurement.availableRowHeight > 0
    && measurement.rowHeights.length === rows.length;
  const capacity = measured ? measurement.availableRowHeight : limit;
  for (const [index, row] of rows.entries()) {
    const longest = Math.max(0, ...Object.values(row).map((v) => String(v ?? '').length));
    // 首屏渲染前暂以字符数兜底；隐藏测量纸面就绪后改用浏览器真实排版高度。
    const height = measured
      ? Math.max(measurement.rowHeights[index] || measurement.baseRowHeight, measurement.baseRowHeight)
      : Math.max(1, Math.ceil(longest / 18));
    if (page.length && (page.length >= limit || used + height > capacity)) {
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
