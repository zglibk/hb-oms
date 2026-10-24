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
  /** 不预留合计行时的明细可用高度，供仅末页显示合计的单据填满中间页。 */
  availableRowHeightWithoutFooter: number;
}

export interface PrintPaginationOptions {
  /** 合计行只在末页显示；中间页可使用合计行腾出的高度。 */
  footerOnLastPageOnly?: boolean;
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
  const availableRowHeightWithoutFooter = availableRowHeight + tableFootHeight;

  if (baseRowHeight <= 0 || availableRowHeight <= 0 || availableRowHeightWithoutFooter <= 0) return undefined;
  return {
    baseRowHeight,
    availableRowHeight,
    availableRowHeightWithoutFooter,
    rowHeights: measuredRows.map((row) => row.getBoundingClientRect().height),
  };
}

export function paginateRows<T extends Record<string, unknown>>(
  rows: T[],
  config: PrintProfileConfig,
  measurement?: PrintRowMeasurement,
  options: PrintPaginationOptions = {},
): T[][] {
  if (!rows.length) return [[]];
  const limit = Math.max(1, Math.min(50, config.pagination.rowsPerPage || 1));
  if (config.pagination.strategy === 'fixed' || config.mode === 'preprinted') {
    return chunk(rows, limit);
  }
  type MeasuredRow = { row: T; height: number };
  const pages: MeasuredRow[][] = [];
  let page: MeasuredRow[] = [];
  let used = 0;
  const measured = measurement
    && measurement.baseRowHeight > 0
    && measurement.availableRowHeight > 0
    && measurement.rowHeights.length === rows.length;
  const capacity = measured
    ? (options.footerOnLastPageOnly
      ? measurement.availableRowHeightWithoutFooter
      : measurement.availableRowHeight)
    : limit;
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
    page.push({ row, height });
    used += height;
  }
  if (page.length) pages.push(page);

  if (measured && options.footerOnLastPageOnly && pages.length) {
    const lastPage = pages[pages.length - 1];
    const lastPageHeight = lastPage.reduce((sum, item) => sum + item.height, 0);
    if (lastPage.length > 1 && lastPageHeight > measurement.availableRowHeight) {
      // 末行能与合计行同页时，只把这一行移到新末页；原页随即成为不带合计的中间页，
      // 可以继续使用全部容量。取最短后缀可保持前页尽量填满，避免出现「首屏 1 行、末页 9 行」。
      const splitAt = lastPage.length - 1;
      if (lastPage[splitAt].height <= measurement.availableRowHeight) {
        pages[pages.length - 1] = lastPage.slice(0, splitAt);
        pages.push(lastPage.slice(splitAt));
      }
    }
  }

  return pages.map((items) => items.map((item) => item.row));
}

function chunk<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages;
}
