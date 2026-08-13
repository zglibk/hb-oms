import { DataSource, EntityManager } from 'typeorm';

/**
 * 字典值 → 中文标签（导出侧公共件）。
 *
 * 导出文件里必须落中文：字典的 `dict_value` 是 `electrophoresis` 这类英文码，
 * 车间拿导出表贴工位、对手工账，看到英文等于没导。
 * 台账导出与成品库存导出共用此处，避免两边各写一份 SQL 后取值口径漂移（§4.4）。
 */

/** 批量取字典标签，键为 `${dictType}:${dictValue}`（只取启用项） */
export async function loadDictLabels(
  runner: DataSource | EntityManager,
  types: string[],
): Promise<Map<string, string>> {
  if (!types.length) return new Map();
  const rows: any[] = await runner.query(
    `SELECT dict_type, dict_value, dict_label FROM t_dict
      WHERE dict_type IN (${types.map(() => '?').join(',')}) AND status = 1`,
    types,
  );
  return new Map(rows.map((r) => [`${r.dict_type}:${r.dict_value}`, r.dict_label]));
}

/**
 * 配套取值器：`label('surface_type', 'electrophoresis')` → `电泳`。
 * 查不到**回原值**而不是空串——字典项被停用/删除后，历史数据的原始码
 * 至少还认得出是什么，变成空白就彻底断了线索。
 */
export function dictLabeler(
  dict: Map<string, string>,
): (type: string, value: string | null | undefined) => string {
  return (type, value) => (value ? (dict.get(`${type}:${value}`) ?? value) : '');
}
