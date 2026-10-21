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

/** OMS 业务统一使用中国标准时间，避免浏览器所在时区改变业务日期。 */
export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
export const BUSINESS_TIME_ZONE_OFFSET = '+08:00';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
const businessDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function businessParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    businessDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

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
  if (!withTime && typeof value === 'string' && DATE_ONLY_PATTERN.test(value.trim())) {
    return value.trim();
  }
  const d = value instanceof Date
    ? value
    : typeof value === 'string' && LOCAL_DATE_TIME_PATTERN.test(value.trim().replace(' ', 'T'))
      ? parseBusinessDateTime(value)
      : new Date(value);
  if (isNaN(d.getTime())) return '';
  const parts = businessParts(d);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return withTime
    ? `${date} ${parts.hour}:${parts.minute}:${parts.second}`
    : date;
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

  return formatDate(value, false);
}

/** 当前中国标准时间对应的业务日期。 */
export function businessToday(now = new Date()): string {
  return formatBusinessDate(now);
}

/**
 * 默认业务查询区间：含当前月在内的最近六个自然月。
 *
 * 例如业务日期为 2026-10-21 时返回 2026-05-01 ～ 2026-10-21。
 * 这里用 UTC 只做无时区的日历月运算，最终仍手工拼接日期，避免 ISO/浏览器时区
 * 把查询边界偏移一天。调用方每次重置都应重新调用，不能长期复用模块加载时的旧值。
 */
export function recentSixNaturalMonthRange(today = businessToday()): [string, string] {
  const normalizedToday = DATE_ONLY_PATTERN.test(today) ? today : businessToday();
  const year = Number(normalizedToday.slice(0, 4));
  const month = Number(normalizedToday.slice(5, 7));
  const start = new Date(Date.UTC(year, month - 1, 1));
  start.setUTCMonth(start.getUTCMonth() - 5);
  const pad = (part: number) => String(part).padStart(2, '0');
  return [
    `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`,
    normalizedToday,
  ];
}

/**
 * Element Plus 日期面板传入的是“用户在面板上点到的本地日历格”，不是一个业务绝对时刻。
 * 这里刻意读取本地年月日，避免东京等 UTC+8 以东浏览器把 00:00 换算成上海前一天。
 */
export function datePickerDay(value: Date): string {
  if (Number.isNaN(value.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/**
 * 将公告表单使用的无时区墙上时间按中国标准时间解析为绝对时刻。
 * 已带 Z / ±HH:mm 的接口值保持其自身时区语义。
 */
export function parseBusinessDateTime(value: string | Date): Date {
  if (value instanceof Date) return value;
  const text = value.trim().replace(' ', 'T');
  return new Date(LOCAL_DATE_TIME_PATTERN.test(text) ? `${text}${BUSINESS_TIME_ZONE_OFFSET}` : text);
}

/** el-date-picker(type=datetime) 使用的中国标准时间墙上时间。 */
export function formatBusinessDateTimeInput(value: string | number | Date): string {
  const date = typeof value === 'string' ? parseBusinessDateTime(value) : value;
  return formatDate(date, true).replace(' ', 'T');
}

/** 格式化为日期时间（YYYY-MM-DD HH:mm:ss）的便捷别名 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  return formatDate(value, true);
}
