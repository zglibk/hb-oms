-- 修正 t_material.part_type 的列注释 —— 2026-08-10
--
-- 原注释写的是「outer_rail外轨 middle_rail中轨 inner_rail内轨」，但该列的取值
-- 实际来自字典 part_type（种子值 outer / middle / inner，见 seed-data.ts），
-- 与 t_order_part.part_type、共享包 PART_TYPE_OPTIONS 一致。注释里的 *_rail
-- 三个值**从未在库中出现过**，是文档性错误。
--
-- 外发回厂登记改为「按部件组对应的部件匹配单重」后要读这一列做关联，
-- 错误注释会把下一个人引到错误的取值上，故按 §4.2（字段注释强制、枚举须列全）修正。
--
-- 只改 COMMENT，列类型与可空性保持原样（MySQL 对 VARCHAR 仅改注释是原地操作，不重建数据）。
-- 幂等：列存在才执行，重复执行结果一致。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_material' AND column_name = 'part_type');
SET @s := IF(@c = 1,
  'ALTER TABLE t_material MODIFY COLUMN part_type VARCHAR(32) NULL COMMENT ''部件（字典 part_type）：outer外轨 middle中轨 inner内轨''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
