/** 自动滚动速度统一默认值（px/秒）：沿用数据可视化大屏原有速度。 */
export const AUTO_SCROLL_SPEED_DEFAULT = 22;

/** 系统配置允许的速度范围：保留足够的慢速阅读与大屏快速轮播空间。 */
export const AUTO_SCROLL_SPEED_MIN = 5;
export const AUTO_SCROLL_SPEED_MAX = 60;

/** 脏数据或旧接口缺字段时统一回落，避免某个页面静止或异常飞滚。 */
export function normalizeAutoScrollSpeed(value: unknown): number {
  const speed = Number(value);
  return Number.isInteger(speed) && speed >= AUTO_SCROLL_SPEED_MIN && speed <= AUTO_SCROLL_SPEED_MAX
    ? speed
    : AUTO_SCROLL_SPEED_DEFAULT;
}
