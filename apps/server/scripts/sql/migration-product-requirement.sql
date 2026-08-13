-- 订单产品级新增「产品要求描述」（2026-08-13）
--
-- 客户对该产品的特殊要求（如测试标准、包装要求等），录订单时随产品行登记，
-- 表单位置在「轨道节数」与「规格」之间。可由「系统配置 → 业务字段」全局停用
-- （开关列 product_requirement_enabled 在 migration-field-switches.sql 追加，§5.7）。
--
-- 幂等：列不存在才添加。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_order_product' AND column_name = 'product_requirement');
SET @s := IF(@c = 0,
  'ALTER TABLE t_order_product ADD COLUMN product_requirement VARCHAR(255) NULL COMMENT ''产品要求描述（客户对该产品的特殊要求，如测试标准/包装要求；可由业务字段开关全局停用录入与展示）'' AFTER rail_section',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
