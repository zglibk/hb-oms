import { BadRequestException } from '@nestjs/common';

export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
export const BUSINESS_TIME_ZONE_OFFSET = '+08:00';
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

function dateOf(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && LOCAL_DATE_TIME_PATTERN.test(value.trim().replace(' ', 'T'))) {
    return parseBusinessDateTime(value);
  }
  return new Date(value);
}

/** 任意绝对时刻对应的中国标准时间业务日期。 */
export function businessDate(value: Date | string | number): string {
  const date = dateOf(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = businessParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 任意绝对时刻对应的中国标准时间，供导出与日志展示统一使用。 */
export function businessDateTime(value: Date | string | number): string {
  const date = dateOf(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = businessParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** 当前业务日期（中国标准时间），避免 UTC 日期在凌晨回退到前一天。 */
export function businessToday(now = new Date()): string {
  const value = businessDate(now);
  if (!value) {
    throw new Error('无法计算当前业务日期');
  }
  return value;
}

/** 将无时区业务墙上时间明确按东八区解析；已带时区的 ISO 值按其自身语义解析。 */
export function parseBusinessDateTime(value: string | Date): Date {
  if (value instanceof Date) return value;
  const text = value.trim().replace(' ', 'T');
  return new Date(LOCAL_DATE_TIME_PATTERN.test(text) ? `${text}${BUSINESS_TIME_ZONE_OFFSET}` : text);
}

/** 在无时区的业务日历上平移自然日，供等长日期窗口等场景使用。 */
export function shiftBusinessDate(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`无效业务日期：${value}`);
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`无效业务日期：${value}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** 两个业务日期之间包含首尾的自然日数；结束日早于开始日时返回非正数。 */
export function businessDateSpan(from: string, to: string): number {
  const shiftedFrom = shiftBusinessDate(from, 0);
  const shiftedTo = shiftBusinessDate(to, 0);
  return Math.round((Date.parse(shiftedTo) - Date.parse(shiftedFrom)) / 86_400_000) + 1;
}

/**
 * 业务日期先后关系校验。
 *
 * 【背景】排产的 planDate / plannedFinish / 外协发出 / 外协回货四个日期此前只有
 * `@IsDateString` 的格式校验，没有任何先后关系约束，前端 el-date-picker 也没设
 * disabledDate。于是可以存下「排产 8/1、计划完工 7/1」这类倒挂数据：
 * 甘特图会画出负长度的条，延期判定（plannedFinish < today 且未完工）会立刻
 * 把它标成延期，导出的《子计划》表也是错的。
 *
 * 统一在服务端兜底，前端的 disabledDate 只是体验优化，不能作为唯一防线。
 */

/** 归一为 YYYY-MM-DD；空值返回 null */
export function toDay(value?: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return businessDate(value);
  }
  const text = String(value).trim();
  return text ? text.slice(0, 10) : null;
}

/**
 * 断言 later >= earlier（同日视为合法）。任一为空则跳过。
 * @param message 违例时的中文提示，需自带两个日期的业务名称
 */
export function assertNotBefore(
  earlier: string | Date | null | undefined,
  later: string | Date | null | undefined,
  message: string,
): void {
  const a = toDay(earlier);
  const b = toDay(later);
  if (!a || !b) return;
  if (b < a) throw new BadRequestException(message);
}

/** 排产单内部四个日期的完整先后关系校验 */
export function assertPlanDateOrder(input: {
  planDate?: string | null;
  plannedFinish?: string | null;
  hasSubcontract?: number | null;
  subcontractSendDate?: string | null;
  subcontractBackDate?: string | null;
}): void {
  assertNotBefore(
    input.planDate,
    input.plannedFinish,
    '计划完工日期不能早于排产日期',
  );
  if (Number(input.hasSubcontract) !== 1) return;
  assertNotBefore(
    input.planDate,
    input.subcontractSendDate,
    '外协发出日期不能早于排产日期',
  );
  assertNotBefore(
    input.subcontractSendDate,
    input.subcontractBackDate,
    '外协预计回货日期不能早于外协发出日期',
  );
  assertNotBefore(
    input.subcontractBackDate,
    input.plannedFinish,
    '计划完工日期不能早于外协预计回货日期',
  );
}
