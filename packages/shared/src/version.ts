/**
 * 版本号文本型小数归一化——前后端唯一事实源。
 * 图纸版本号统一按**文本**存储：纯整数补一位小数（4 → "4.0"），
 * 数值型消除 Excel 浮点尾差（1.1000000000000001 → "1.1"）；
 * 非数值写法（A/1）原样保留。Excel 导出时版本列须强制文本格式（numFmt '@'）。
 */
export function normalizeVersion(s?: string | null): string | undefined {
  if (s === undefined || s === null) return undefined;
  const t = String(s).trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return `${t}.0`;
  if (/^\d+\.\d+$/.test(t)) {
    const n = Number(t);
    // 浮点尾差（超长小数位）用 Number 还原；正常写法（如 1.10）保留原文尾零
    return t.length > 8 ? String(n) : t;
  }
  return t;
}
