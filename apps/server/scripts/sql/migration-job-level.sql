-- =============================================================
-- 职级字典按公司实际职级序列重定（2026-08-11）
--
-- 岗位主数据上线时先给了一组占位职级（员级/组长/班长/主管/经理），现按公司实际
-- 职级序列替换为 15 档：普工 → 总经理。
--
-- 「主管 supervisor」「经理 manager」两档新旧同名同值，原样保留不动；
-- 只删掉不在新序列里的 员级 / 组长 / 班长 三条。
--
-- ⚠️ 前序的 migration-position.sql 已把 job_level 种子段摘除，否则这里删掉的旧值
-- 会在下次全量迁移时被它重新种回来（本会话在 hr_position 上踩过同款坑）。
--
-- 职级是**可维护字典**：厂里要增减档位，直接去「系统管理 → 数据字典」改 job_level 即可。
-- =============================================================

-- 1. 清掉不在新序列里的旧职级。
-- 不加一次性守卫：这三个值已从所有种子里摘除，删完不会再有，重复执行删 0 行、无副作用。
DELETE FROM t_dict
WHERE dict_type = 'job_level' AND dict_value IN ('staff', 'group_leader', 'shift_leader');

-- 2. 种入新职级序列（幂等；supervisor / manager 已存在则跳过，只补 sort 之外的新档）
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, status, creator_name, updater_name)
SELECT d.dict_type, d.dict_label, d.dict_value, d.sort, 1, '系统同步', '系统同步'
FROM (
            SELECT 'job_level' AS dict_type, '普工' AS dict_label, 'general_worker' AS dict_value, 1 AS sort
  UNION ALL SELECT 'job_level', '操作工',                  'operator',           2
  UNION ALL SELECT 'job_level', '维修工',                  'maintenance_worker', 3
  UNION ALL SELECT 'job_level', '机长',                    'machine_leader',     4
  UNION ALL SELECT 'job_level', '助理',                    'assistant',          5
  UNION ALL SELECT 'job_level', '专员（计划 / 跟单 / 财务）', 'specialist',       6
  UNION ALL SELECT 'job_level', '班组长',                  'team_leader',        7
  UNION ALL SELECT 'job_level', '技术员',                  'technician',         8
  UNION ALL SELECT 'job_level', '主管',                    'supervisor',         9
  UNION ALL SELECT 'job_level', '工程师',                  'engineer',          10
  UNION ALL SELECT 'job_level', '主任',                    'director',          11
  UNION ALL SELECT 'job_level', '副经理',                  'deputy_manager',    12
  UNION ALL SELECT 'job_level', '经理',                    'manager',           13
  UNION ALL SELECT 'job_level', '副总经理',                'deputy_gm',         14
  UNION ALL SELECT 'job_level', '总经理',                  'general_manager',   15
) d
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict x WHERE x.dict_type = d.dict_type AND x.dict_value = d.dict_value
);

-- 3. 校正保留下来的两档排序（supervisor / manager 建于旧序列，sort 还是 4 / 5）
UPDATE t_dict SET sort = 9  WHERE dict_type = 'job_level' AND dict_value = 'supervisor' AND sort <> 9;
UPDATE t_dict SET sort = 13 WHERE dict_type = 'job_level' AND dict_value = 'manager'    AND sort <> 13;
