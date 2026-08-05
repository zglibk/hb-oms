-- 部门信息页（基础数据）：t_department 补 负责人/联系电话 两列
-- 幂等：列不存在才添加

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'leader');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_department ADD COLUMN leader VARCHAR(64) NULL COMMENT ''负责人'' AFTER sort', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'phone');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_department ADD COLUMN phone VARCHAR(32) NULL COMMENT ''联系电话'' AFTER leader', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
