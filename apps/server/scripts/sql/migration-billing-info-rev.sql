-- 「工艺信息」改版为「开单信息」（开工单基础信息）：
-- 1) 新增产品级「规格」dimension（文本，寸自动换算 mm 由应用层完成）
-- 2) 「版本」降为部件级：drawing_version 拆 外/中/内 三列，存量值复制到三列后删旧列
-- 3) 表注释改开单信息（表名/权限码保持 process_info 内部标识稳定）
-- 幂等

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'dimension');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN dimension VARCHAR(32) NULL COMMENT ''规格（产品级，统一 mm 文本，如 250mm；1寸=25mm）'' AFTER product_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'drawing_version_outer');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN drawing_version_outer VARCHAR(32) NULL COMMENT ''版本-外轨（文本型小数）'' AFTER drawing_no', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'drawing_version_middle');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN drawing_version_middle VARCHAR(32) NULL COMMENT ''版本-中轨（文本型小数）'' AFTER drawing_version_outer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'drawing_version_inner');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN drawing_version_inner VARCHAR(32) NULL COMMENT ''版本-内轨（文本型小数）'' AFTER drawing_version_middle', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 存量产品级版本复制到三个部件列（仅当旧列还在且新列为空）
SET @has_old := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'drawing_version');
SET @sql := IF(@has_old > 0,
  'UPDATE t_process_info SET drawing_version_outer = COALESCE(drawing_version_outer, drawing_version), drawing_version_middle = COALESCE(drawing_version_middle, drawing_version), drawing_version_inner = COALESCE(drawing_version_inner, drawing_version) WHERE drawing_version IS NOT NULL AND drawing_version <> ''''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_old > 0, 'ALTER TABLE t_process_info DROP COLUMN drawing_version', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE t_process_info COMMENT='开单信息表（原工艺信息，2026-08 改版；开工单基础信息，内部标识仍为 process_info）';
