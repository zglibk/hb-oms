/**
 * 日期格式化工具
 * ------------------------------------------------------------
 * 统一全站日期时间显示格式：
 *   - 日期：YYYY-MM-DD
 *   - 日期时间：YYYY-MM-DD HH:mm:ss
 * 避免直接使用 new Date().toLocaleString() ——
 * 其输出依赖浏览器 locale，中文 Chrome 默认为 "2024/1/15 14:30:00"，
 * 全站约定年月日分隔符 "-" 。
 */

/** 将日期补齐为两位数字符串 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** MES 业务统一使用中国标准时间，避免浏览器所在时区改变业务日期。 */
const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const businessDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 格式化日期。
 * @param value  任意可被 Date 构造的值（字符串、时间戳、Date 对象）；为空返回空串
 * @param withTime 是否包含时间部分，默认 false（仅日期）
 * @returns 形如 "2024-01-15" 或 "2024-01-15 14:30:00"
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  withTime = false,
): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  if (!withTime) return `${y}-${m}-${day}`;
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

/**
 * 格式化不包含时刻含义的 MES 业务日期。
 *
 * 数据库 DATE 正常应直接返回 YYYY-MM-DD；若旧接口把它序列化成 UTC ISO
 * （例如数据库 2026-07-18 返回 2026-07-17T16:00:00.000Z），则明确按
 * Asia/Shanghai 还原。不能直接 slice(0, 10)，否则会错误显示为前一天。
 */
export function formatBusinessDate(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'string') {
    const text = value.trim();
    if (DATE_ONLY_PATTERN.test(text)) return text;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = businessDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

/** 格式化为日期时间（YYYY-MM-DD HH:mm:ss）的便捷别名 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  return formatDate(value, true);
}
