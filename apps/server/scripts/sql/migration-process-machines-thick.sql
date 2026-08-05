-- 工艺信息机台分厚/薄料：同一图号薄料与厚料生产使用不同机台组
-- （如薄料 362,363,364 / 厚料 82,80,81）。
-- 既有 machines 列语义收窄为「薄料/通用机台」，新增 machines_thick 厚料机台。
-- 幂等：列不存在才添加。

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_process_info'
    AND column_name = 'machines_thick'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE t_process_info ADD COLUMN machines_thick VARCHAR(128) NULL COMMENT ''生产机台-厚料（多值逗号存储，如 82,80,81）'' AFTER machines',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE t_process_info MODIFY COLUMN machines VARCHAR(128) NULL COMMENT '生产机台-薄料/通用（多值逗号存储，如 362,363,364；无厚薄之分时填此列）';
