import { Transform, TransformFnParams } from 'class-transformer';

/**
 * DTO 入参通用 Transform 工具（配合全局 ValidationPipe transform:true）。
 */

/**
 * 空串/null 归一为 undefined，使 @IsOptional 正确跳过后续校验。
 *
 * 背景（2026-08-03 生产事故）：前端表单可选日期字段初始值为空串 ''，
 * 随 payload 原样提交；`@IsOptional()` 只放过 null/undefined，空串会进入
 * `@IsDateString()` 校验 → 400「must be a valid ISO 8601 date string」。
 * 可选字符串字段一律先经 emptyToUndefined 归一，再走类型校验。
 */
export function EmptyToUndefined() {
  return Transform(({ value }) =>
    value === '' || value == null ? undefined : value,
  );
}

/**
 * 查询串布尔归一（GET 入参专用）。
 *
 * **必须用它，不能用 `@Type(() => Boolean)`**：
 * 全局 ValidationPipe 开了 `transformOptions.enableImplicitConversion`（main.ts），
 * class-transformer 会先按 TS 反射类型把值隐式转换一遍——而 GET 查询串里的
 * `false` 是**非空字符串 `"false"`**，隐式转换后变成 `true`。
 * 更隐蔽的是：`@Transform` 拿到的 `value` 已经是隐式转换后的结果（`true`），
 * 光在 `@Transform` 里判断 `value` 同样救不回来，
 * 必须从**原始源对象** `obj[key]` 上取未转换的字符串。
 *
 * 踩坑实例（2026-08-06）：装配管理页「只看未装完 / 只看逾期」两个未勾选的复选框
 * 以 `?onlyUnfinished=false&onlyOverdue=false` 发出，被判成 true 后
 * 列表默认就带上了两个筛选，3 条数据只显示 1 条。
 *
 * 用法：`@IsOptional() @Transform(toBoolean) @IsBoolean() flag?: boolean;`
 */
export function toBoolean({ obj, key, value }: TransformFnParams): boolean | undefined {
  const raw = obj && key in obj ? obj[key] : value;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}
