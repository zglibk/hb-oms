-- 「物料信息」改版为「部件信息」：
-- 1) t_material 补 材质/料厚/单重 三列（表单同时去掉「单位」录入，unit 列保留存量数据）
-- 2) 表注释同步改为部件信息（表名/字段名保持 material 不变——订单模块 material_code/material_id
--    引用与生产数据依赖内部标识稳定，仅展示层全面改为「部件」口径）
-- 幂等：列不存在才添加

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_material' AND column_name = 'sheet_material');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_material ADD COLUMN sheet_material VARCHAR(64) NULL COMMENT ''材质（如 Q235）'' AFTER unit', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_material' AND column_name = 'material_thickness');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_material ADD COLUMN material_thickness VARCHAR(32) NULL COMMENT ''料厚（如 1.2 / 1.2×1.0×1.2）'' AFTER sheet_material', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_material' AND column_name = 'unit_weight');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_material ADD COLUMN unit_weight DECIMAL(10,4) NULL COMMENT ''单重(kg/支)'' AFTER material_thickness', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE t_material COMMENT='部件信息表（原物料档案，2026-08 改版；内部标识仍为 material）';
