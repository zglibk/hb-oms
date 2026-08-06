-- 装配批次补「计划开始时间」：计划员需要录入预计的装配开始~结束区间，
-- 原先只有 plan_date（计划完成）+ actual_date（实际完成），缺开始时点。
-- plan_start_date 为纯计划属性，不参与入库闸门（闸门仍只认 actual_date）。
-- 幂等：列不存在才添加

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND column_name = 'plan_start_date');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_assembly_batch ADD COLUMN plan_start_date DATE NULL COMMENT ''计划开始时间（计划员录入的预计开工日；纯计划属性，不参与入库闸门）'' AFTER workshop', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 原 plan_date 语义收敛为「计划完成时间」，同步刷新列注释（可重复执行）
ALTER TABLE t_assembly_batch MODIFY COLUMN plan_date DATE NULL COMMENT '计划完成时间（计划员录入的预计完工日；与 plan_start_date 组成预计装配区间）';

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND index_name = 'idx_plan_start_date');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE t_assembly_batch ADD INDEX idx_plan_start_date (plan_start_date)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
