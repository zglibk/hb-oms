import { BadRequestException } from '@nestjs/common';

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
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
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
