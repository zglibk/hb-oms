/**
 * 岗位主数据相关常量（基础数据 → 岗位管理）。
 */

/**
 * 岗位性质（`t_position.position_nature`）。
 *
 * 2026-08-12 由布尔的 `is_manager` 升级为三值——加了「技术岗」之后，
 * 「是不是管理岗」这个是非题已经表达不了了。
 */
export const POSITION_NATURE = {
  /** 普通岗：操作与职员类（普工/操作工/质检员/文员…） */
  NORMAL: 'normal',
  /** 管理岗：带团队、负管理职责 */
  MANAGER: 'manager',
  /** 技术岗：技术序列骨干，不带团队也能有对应等级 */
  TECH: 'tech',
} as const;

export const POSITION_NATURE_OPTIONS: Array<{ label: string; value: string; type: string }> = [
  { label: '普通岗', value: POSITION_NATURE.NORMAL, type: 'info' },
  { label: '管理岗', value: POSITION_NATURE.MANAGER, type: 'warning' },
  { label: '技术岗', value: POSITION_NATURE.TECH, type: 'success' },
];

export const POSITION_NATURE_VALUES: string[] = POSITION_NATURE_OPTIONS.map((o) => o.value);

export function positionNatureLabel(value: string | null | undefined): string {
  return POSITION_NATURE_OPTIONS.find((o) => o.value === value)?.label ?? '';
}

/**
 * 职级与岗位性质的关系（职级是独立主数据 `t_job_level`，不是字典）。
 *
 * 职级表达的是「**在本序列内的等级**」而非岗位名称——质检员分初/中/高级，
 * 工程师分助理/工程师/高级/资深，管理分班组长/主管/经理/高管。
 * 每条职级归属一个序列（`position_nature`，与岗位性质同一套值），
 * 岗位表单选定性质后，职级下拉只列该序列的等级。
 *
 * 之所以不用数据字典：序列归属得靠 `t_dict.parent_value` 手填「上级键值」，
 * 在通用字典页面维护极易填错，故给它一张自己的表和自己的维护页。
 */
export function filterJobLevels<T extends { positionNature?: string | null }>(
  levels: T[],
  positionNature: string | null | undefined,
): T[] {
  const nature = (positionNature ?? '').trim();
  if (!nature) return levels;
  return levels.filter((l) => l.positionNature === nature);
}
