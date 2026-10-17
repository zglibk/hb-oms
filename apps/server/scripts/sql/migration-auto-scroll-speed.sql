-- 全站自动滚动速度：默认统一沿用数据可视化大屏原速度 22px/s，每张列表可独立调整。
-- 幂等迁移；兼容开发期间曾短暂出现的 home_scroll_speed / screen_scroll_speed 合并列。

-- 首页交期待办：若存在旧合并列则原地改名以保留值，否则新增。
SET @old := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'home_scroll_speed');
SET @new := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'home_owed_scroll_speed');
SET @s := IF(@new = 0,
  IF(@old > 0,
    'ALTER TABLE t_system_config CHANGE COLUMN home_scroll_speed home_owed_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''首页交期待办列表滚动速度（px/秒），允许 5~60，默认 22''',
    'ALTER TABLE t_system_config ADD COLUMN home_owed_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''首页交期待办列表滚动速度（px/秒），允许 5~60，默认 22'' AFTER delivery_template_default'),
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 首页近期外发回厂：首次添加时复制首页交期待办当前值，保持升级前观感一致。
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'home_outsource_scroll_speed');
SET @s := IF(@exists = 0,
  'ALTER TABLE t_system_config ADD COLUMN home_outsource_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''首页近期外发回厂列表滚动速度（px/秒），允许 5~60，默认 22'' AFTER home_owed_scroll_speed',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@exists = 0,
  'UPDATE t_system_config SET home_outsource_scroll_speed = home_owed_scroll_speed',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 大屏逾期未发货：兼容旧合并列原地改名。
SET @old := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'screen_scroll_speed');
SET @new := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'screen_overdue_scroll_speed');
SET @s := IF(@new = 0,
  IF(@old > 0,
    'ALTER TABLE t_system_config CHANGE COLUMN screen_scroll_speed screen_overdue_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''数据大屏逾期未发货列表滚动速度（px/秒），允许 5~60，默认 22''',
    'ALTER TABLE t_system_config ADD COLUMN screen_overdue_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''数据大屏逾期未发货列表滚动速度（px/秒），允许 5~60，默认 22'' AFTER home_outsource_scroll_speed'),
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 大屏近期外发回厂：首次添加时复制大屏逾期列表当前值。
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'screen_outsource_scroll_speed');
SET @s := IF(@exists = 0,
  'ALTER TABLE t_system_config ADD COLUMN screen_outsource_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''数据大屏近期外发回厂列表滚动速度（px/秒），允许 5~60，默认 22'' AFTER screen_overdue_scroll_speed',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@exists = 0,
  'UPDATE t_system_config SET screen_outsource_scroll_speed = screen_overdue_scroll_speed',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'changelog_scroll_speed');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN changelog_scroll_speed TINYINT UNSIGNED NOT NULL DEFAULT 22 COMMENT ''系统更新日志弹窗自动滚动速度（px/秒），允许 5~60，默认 22'' AFTER screen_outsource_scroll_speed',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 极端情况下新旧列同时存在：新列已是权威，清掉开发期旧列，避免实体口径分叉。
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'home_scroll_speed');
SET @s := IF(@c > 0, 'ALTER TABLE t_system_config DROP COLUMN home_scroll_speed', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'screen_scroll_speed');
SET @s := IF(@c > 0, 'ALTER TABLE t_system_config DROP COLUMN screen_scroll_speed', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
