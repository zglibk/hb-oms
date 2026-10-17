/**
 * 大候选集选择器的本地过滤公共件。
 *
 * 两个选择器都在打开时一次取全量快照，之后只在内存中做精确/模糊匹配。
 * 统一在这里处理 trim、大小写和去重排序，避免两处口径逐渐漂移。
 */
function normalized(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('zh-CN');
}

/** MySQL 默认文本比较不区分大小写，本地精确匹配保持同一体验。 */
export function pickerTextEquals(value: unknown, expected: unknown): boolean {
  const query = normalized(expected);
  return !query || normalized(value) === query;
}

/** 订单号、生产单号与全局关键词使用包含匹配。 */
export function pickerTextIncludes(value: unknown, expected: unknown): boolean {
  const query = normalized(expected);
  return !query || normalized(value).includes(query);
}

/** 从当前候选范围提取非空去重值，排序口径与原服务端下拉一致。 */
export function distinctPickerValues<T>(rows: T[], getter: (row: T) => unknown): string[] {
  return [...new Set(rows.map((row) => String(getter(row) ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
