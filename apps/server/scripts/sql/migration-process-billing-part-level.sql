-- 开单注明改部件级：billing_note（产品级）拆为 外/中/内轨 三列。
-- 存量产品级数据迁入外轨列（保守保留），随后删除旧列。幂等。

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'billing_note_outer');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN billing_note_outer VARCHAR(255) NULL COMMENT ''开单注明-外轨'' AFTER special_req_inner', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'billing_note_middle');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN billing_note_middle VARCHAR(255) NULL COMMENT ''开单注明-中轨'' AFTER billing_note_outer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'billing_note_inner');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN billing_note_inner VARCHAR(255) NULL COMMENT ''开单注明-内轨'' AFTER billing_note_middle', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 存量产品级开单注明迁入外轨列（仅当旧列还在且外轨列为空）
SET @has_old := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'billing_note');
SET @sql := IF(@has_old > 0,
  'UPDATE t_process_info SET billing_note_outer = billing_note WHERE billing_note IS NOT NULL AND billing_note <> '''' AND (billing_note_outer IS NULL OR billing_note_outer = '''')',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_old > 0, 'ALTER TABLE t_process_info DROP COLUMN billing_note', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
