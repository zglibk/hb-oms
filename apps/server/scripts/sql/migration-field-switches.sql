-- 业务字段全局开关 —— 2026-08-10
--
-- t_system_config 加一组 TINYINT 开关列，控制厂里用不到的业务字段是否启用。
-- 关掉后该字段在全系统的录入框、表格列与 Excel 导出列一并隐藏。
--
--   color_field_enabled              「颜色」（与表面处理配套的业务字段，非主题色）
--   customer_drawing_no_enabled      「客户图号」（客户来图上的图号，区别于部件组的生产图号）
--   dull_stock_color_enabled         「呆滞品颜色」（2026-08-11 加）——呆滞品管理页**独立**的颜色开关
--   product_requirement_enabled      「产品要求描述」（2026-08-13 加）——订单产品级的特殊要求文本
--
-- ⚠️ 呆滞品的颜色**刻意不受 color_field_enabled 管**：呆滞品建档时表面处理与颜色是
-- 配套联动带出的（电泳→黑色 / 喷涂→白色），是这本账辨认货物的主要依据；
-- 而全局颜色开关是给"订单/外发口径用不到颜色"的厂关的。两者诉求不同，
-- 混在一个开关里会出现"关了全局颜色，呆滞品就认不出货"的尴尬，故各管各的。
--
-- 口径：这是**录入与展示**开关，不是数据清理开关——关掉不会删除库中既有值，
-- 重新打开即原样可见；前端也保留既有值随表单原样回传，避免"关着开关编辑一张
-- 老订单"把历史数据洗掉。
--
-- 默认 1（启用）：存量库行为不变，要停用由管理员在「系统配置 → 业务字段」里关。
--
-- 幂等：列不存在才添加。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'color_field_enabled');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN color_field_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''颜色字段启用开关：1启用 0停用（停用后全系统隐藏颜色的录入与展示，不删除既有数据）'' AFTER login_bg_set_as_default',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'customer_drawing_no_enabled');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN customer_drawing_no_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''客户图号字段启用开关：1启用 0停用（停用后全系统隐藏客户图号的录入与展示，不删除既有数据）'' AFTER color_field_enabled',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'dull_stock_color_enabled');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN dull_stock_color_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''呆滞品颜色字段启用开关：1启用 0停用；**独立于 color_field_enabled**，只管呆滞品管理页的颜色列与建档弹窗'' AFTER customer_drawing_no_enabled',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'product_requirement_enabled');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN product_requirement_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''产品要求描述字段启用开关：1启用 0停用（停用后隐藏订单产品级「产品要求描述」的录入与展示，不删除既有数据）'' AFTER dull_stock_color_enabled',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 单位换算（2026-08-14，非布尔配置） ----------
-- 把写死在共享包的换算约定抽到配置，并让三张汇总页与两个导出有个默认查看单位。
-- 口径：改系数**只影响之后的录入折算与寸视图显示，不重算已落库的 dimension_mm**。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'inch_to_mm');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN inch_to_mm DECIMAL(6,3) NOT NULL DEFAULT 25.000 COMMENT ''英寸换算系数：1 英寸 = N mm（我司口径 25，非国标 25.4）；仅影响之后的录入折算与寸视图显示，不重算已落库 mm'' AFTER product_requirement_enabled',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'dimension_view_unit');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN dimension_view_unit VARCHAR(8) NOT NULL DEFAULT ''mm'' COMMENT ''规格默认查看单位：mm毫米 inch寸；控制首页/订单跟踪台账/订单管理三页的初始视图与台账、总计划两个导出的规格列'' AFTER inch_to_mm',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
