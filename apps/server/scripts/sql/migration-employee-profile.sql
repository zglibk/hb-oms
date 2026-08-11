-- =============================================================
-- 人事档案扩展字段（籍贯 / 教育背景 / 政治面貌 / 婚姻状况等）
--
-- 存量库幂等加列；字典项 INSERT 幂等。
-- =============================================================

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'native_place');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN native_place VARCHAR(64) NULL COMMENT ''籍贯'' AFTER emergency_contact',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'ethnicity');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN ethnicity VARCHAR(32) NULL COMMENT ''民族'' AFTER native_place',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'marital_status');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN marital_status VARCHAR(32) NULL COMMENT ''婚姻状况（字典 marital_status）'' AFTER ethnicity',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'political_status');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN political_status VARCHAR(32) NULL COMMENT ''政治面貌（字典 political_status）'' AFTER marital_status',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'education');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN education VARCHAR(32) NULL COMMENT ''学历（字典 education）'' AFTER political_status',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'education_type');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN education_type VARCHAR(16) NULL COMMENT ''学历类型：full_time全日制 part_time非全日制'' AFTER education',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'major');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN major VARCHAR(64) NULL COMMENT ''专业'' AFTER education_type',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'graduate_school');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN graduate_school VARCHAR(128) NULL COMMENT ''最终毕业院校'' AFTER major',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'graduate_date');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN graduate_date DATE NULL COMMENT ''毕业时间（存当月首日，界面按月录入）'' AFTER graduate_school',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 字典：婚姻状况 / 政治面貌 / 学历（幂等）
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, status, creator_name, updater_name)
SELECT d.dict_type, d.dict_label, d.dict_value, d.sort, 1, '系统同步', '系统同步'
FROM (
  SELECT 'marital_status' AS dict_type, '未婚' AS dict_label, 'unmarried' AS dict_value, 1 AS sort
  UNION ALL SELECT 'marital_status', '已婚', 'married', 2
  UNION ALL SELECT 'marital_status', '离异', 'divorced', 3
  UNION ALL SELECT 'marital_status', '丧偶', 'widowed', 4
  UNION ALL SELECT 'political_status', '群众', 'masses', 1
  UNION ALL SELECT 'political_status', '共青团员', 'league', 2
  UNION ALL SELECT 'political_status', '中共党员', 'party', 3
  UNION ALL SELECT 'political_status', '民主党派', 'democratic', 4
  UNION ALL SELECT 'education', '小学', 'primary', 1
  UNION ALL SELECT 'education', '初中', 'junior', 2
  UNION ALL SELECT 'education', '高中/中专', 'senior', 3
  UNION ALL SELECT 'education', '大专', 'college', 4
  UNION ALL SELECT 'education', '本科', 'bachelor', 5
  UNION ALL SELECT 'education', '硕士', 'master', 6
  UNION ALL SELECT 'education', '博士', 'doctor', 7
) d
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict x WHERE x.dict_type = d.dict_type AND x.dict_value = d.dict_value
);
