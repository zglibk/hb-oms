/**
 * DTO 入参通用 Transform 工具（配合全局 ValidationPipe transform:true）。
 *
 * 背景（2026-08-03 生产事故）：前端表单可选日期字段初始值为空串 ''，
 * 随 payload 原样提交；`@IsOptional()` 只放过 null/undefined，空串会进入
 * `@IsDateString()` 校验 → 400「must be a valid ISO 8601 date string」。
 * 可选字符串字段一律先经 emptyToUndefined 归一，再走类型校验。
 */
import { Transform } from 'class-transformer';

/** 空串/null 归一为 undefined，使 @IsOptional 正确跳过后续校验 */
export function EmptyToUndefined() {
  return Transform(({ value }) =>
    value === '' || value == null ? undefined : value,
  );
}
