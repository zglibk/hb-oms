import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { EXPORT_ROW_LIMIT, PRODUCT_TYPE_OPTIONS, normalizeProductTypes } from '@hb-oms/shared';

// 上限定义在共享包（前端导出前要拿它做预检，两端必须同一个数），此处转出方便本层引用
export { EXPORT_ROW_LIMIT };

/**
 * Excel 统一排版工具（导出表 / 导入模板共用）。
 *
 * 车间是把导出表打印出来贴在工位上看的，各模块各写一套样式会显得像不同系统导出的东西，
 * 故样式集中在此，**新增导出一律调 `styleSheet`，不要在各 service 里手写字体边框**。
 *
 * 统一口径：等线 10 号 / 自动列宽 / 隔行浅灰 / 有效内容区浅灰边框 / 关闭网格线。
 */

/** 等线是 Windows Office 的中文默认正文字体，车间机器都装了，不会回落成宋体 */
const FONT_NAME = '等线';
const FONT_SIZE = 10;

/** 浅灰三件套：边框比填充略深，隔行填充比表头浅，避免整张表发灰 */
const COLOR_BORDER = 'FFD9D9D9';
const COLOR_STRIPE = 'FFF7F7F7';
const COLOR_HEADER = 'FFEDEDED';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR_BORDER } },
  left: { style: 'thin', color: { argb: COLOR_BORDER } },
  bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
  right: { style: 'thin', color: { argb: COLOR_BORDER } },
};

/**
 * 估算显示宽度：中日韩字符与全角标点按 2 个字符宽算，其余按 1。
 * Excel 的列宽单位是「默认字体下的字符数」，中文不折算的话列宽会普遍偏窄一半。
 */
function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += /[⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch)
      ? 2
      : 1;
  }
  return width;
}

/** 取单元格的可见文本（公式/富文本/超链接单元格的 value 是对象，直接 String() 会得到 [object Object]） */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return '0000-00-00';
  if (typeof value === 'object') {
    const v = value as any;
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? '').join('');
    return String(v.text ?? v.result ?? v.hyperlink ?? '');
  }
  return String(value);
}

export interface StyleSheetOptions {
  /** 表头所在行号，默认 1；传 0 表示无表头（如「填写说明」页），此时不冻结、不隔行 */
  headerRow?: number;
  /** 隔行浅灰填充，默认 true */
  stripe?: boolean;
  /** 隔行填充色（ARGB），默认使用统一浅灰；需要更明显区分时可按导出表覆盖 */
  stripeColor?: string;
  /** 自动列宽，默认 true */
  autoWidth?: boolean;
  /** 自动列宽的下限 / 上限（字符数），默认 8 / 50 */
  minWidth?: number;
  maxWidth?: number;
  /** 需要居中的列号（1 基），一般给数量、状态这类短列 */
  centerColumns?: number[];
}

/**
 * 给工作表套上统一排版。**必须在所有数据行写完之后调用**——
 * 自动列宽要量所有单元格的内容，提前调只会量到表头。
 */
export function styleSheet(ws: ExcelJS.Worksheet, opts: StyleSheetOptions = {}): void {
  const headerRow = opts.headerRow ?? 1;
  const stripe = opts.stripe ?? true;
  const stripeColor = opts.stripeColor ?? COLOR_STRIPE;
  const autoWidth = opts.autoWidth ?? true;
  const minWidth = opts.minWidth ?? 8;
  const maxWidth = opts.maxWidth ?? 50;
  const center = new Set(opts.centerColumns ?? []);

  // 关闭网格线：内容区已有浅灰边框，再叠一层网格线会让空白区显脏；
  // 有表头时顺带冻结首行，长表滚动时表头不跑掉
  ws.views = headerRow > 0
    ? [{ state: 'frozen', ySplit: headerRow, showGridLines: false } as ExcelJS.WorksheetView]
    : [{ showGridLines: false } as ExcelJS.WorksheetView];

  const colCount = ws.columnCount;
  if (colCount < 1) return;

  const widest: number[] = new Array(colCount + 1).fill(0);

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const isHeader = headerRow > 0 && rowNumber === headerRow;
    // 数据行从 headerRow+1 起算，第 1、3、5… 条数据填灰（与表头之间留一条白，视觉上更分得开）
    const isStripe = stripe && headerRow > 0 && !isHeader && (rowNumber - headerRow) % 2 === 0;

    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: isHeader };
      // 边框只铺有效内容区（eachRow 跳过空行、循环上限是 columnCount），空白区保持干净
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: 'middle',
        horizontal: isHeader || center.has(c) ? 'center' : 'left',
        wrapText: false,
      };
      if (isHeader) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
      } else if (isStripe) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stripeColor } };
      }

      const w = displayWidth(cellText(cell.value));
      if (w > widest[c]) widest[c] = w;
    }
    row.height = 18;
  });

  if (autoWidth) {
    for (let c = 1; c <= colCount; c += 1) {
      // +2 给左右留白，否则内容会贴着边框
      ws.getColumn(c).width = Math.min(maxWidth, Math.max(minWidth, widest[c] + 2));
    }
  }
}

/** 新建工作簿并写上作者信息（各导出统一，便于日后追溯文件来源） */
export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = '海宝五金 OMS';
  wb.created = new Date();
  return wb;
}

/**
 * 追加一张「填写说明」页并套用统一排版。
 * 导入模板一律配一张，把必填项、取值范围、导入规则写清楚——
 * 车间照着模板填，说明写在文件里比写在页面上更容易被看到。
 */
export function addTipsSheet(
  wb: ExcelJS.Workbook,
  rows: Array<[string, string]>,
  sheetName = '填写说明',
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ header: '项目', width: 16 }, { header: '说明', width: 90 }];
  rows.forEach((r) => ws.addRow(r));
  // 说明页内容长短不一，自动列宽会把「说明」列拉到很宽，故固定列宽 + 自动换行
  styleSheet(ws, { autoWidth: false });
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 92;
  ws.getColumn(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  return ws;
}

/**
 * 时间列文本：`YYYY-MM-DD HH:mm`（导出表里到分钟就够，秒只会挤宽列）。
 *
 * **刻意不用 toISOString()**：那会按 UTC 输出，导出表里的时间会比车间实际时间早 8 小时。
 * 注：assembly.service 里还有一份同名的私有实现（早于本函数），下次动那边时一并收敛过来。
 */
export function dateTimeText(v: Date | string | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ==================== 导入侧公共件 ==================== */

/** 按 value 取中文 label；取不到就回原值（历史脏数据也要显示得出来，不能变空白） */
export function labelOf(
  options: Array<{ label: string; value: string }>,
  value: string | null | undefined,
): string {
  if (!value) return '';
  return options.find((o) => o.value === value)?.label ?? value;
}

/** 取单元格文本并去空白：公式单元格取 result、富文本取拼接后的纯文本 */
export function cellString(cell: ExcelJS.Cell): string {
  const v: any = cell?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? '').join('').trim();
    return String(v.text ?? v.result ?? '').trim();
  }
  return String(v).trim();
}

/** 读取上传文件的第一张工作表；解析失败给可操作的中文提示（而不是抛 zip 解析栈） */
export async function loadFirstSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    throw new BadRequestException('无法解析 Excel 文件，请使用下载的模板另存为 .xlsx 后再上传');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException('Excel 中没有工作表');
  return ws;
}

/**
 * 把用户填的中文产品类型拆成规范化组合串。
 * 分隔符宽容处理（中英文逗号、顿号、斜杠、空格都认），车间填表不会严格照模板来。
 */
export function parseTypeLabels(text: string): { value: string; invalid: string[] } {
  if (!text) return { value: '', invalid: [] };
  const labelToValue = new Map(PRODUCT_TYPE_OPTIONS.map((o) => [o.label, o.value]));
  const valueSet = new Set(PRODUCT_TYPE_OPTIONS.map((o) => o.value));
  const parts = text.split(/[,，、/\s]+/).map((s) => s.trim()).filter(Boolean);

  const values: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    // 中文标签优先；也允许直接填英文值（从本系统导出的原始数据再导回来）
    const hit = labelToValue.get(p) ?? (valueSet.has(p) ? p : undefined);
    if (hit) values.push(hit);
    else invalid.push(p);
  }
  // 必须经共享包规范化（排序+去重），否则「普通,自锁」与「自锁,普通」会分裂成两行台账
  return { value: normalizeProductTypes(values), invalid };
}

/**
 * 导入被拒的统一异常：`errors` 逐行明细由 AllExceptionsFilter 透传给前端，
 * `failedCount` / `totalCount` 供前端显示「N 条失败 / 共 M 条」。
 * 一律强调「未写入任何数据」——用户最关心的是要不要去数据库收拾残局。
 */
export function importRejected(errors: string[], totalCount: number): BadRequestException {
  return new BadRequestException({
    message: `导入未执行：${errors.length} 处问题，已整批回滚，未写入任何数据`,
    errors,
    failedCount: errors.length,
    totalCount,
  });
}
