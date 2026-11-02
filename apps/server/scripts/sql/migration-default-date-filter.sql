-- 列表默认日期范围改为系统配置开关；默认关闭，恢复首次进入与重置时的全量查询。
SET @has_default_date_filter := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_system_config'
    AND COLUMN_NAME = 'default_date_filter_enabled'
);
SET @add_default_date_filter := IF(
  @has_default_date_filter = 0,
  'ALTER TABLE t_system_config ADD COLUMN default_date_filter_enabled TINYINT NOT NULL DEFAULT 0 COMMENT ''默认日期范围开关：1启用 0停用；停用时列表首次进入与重置均不带日期条件，启用时按页面口径加载半年范围'' AFTER product_requirement_enabled',
  'SELECT 1'
);
PREPARE stmt FROM @add_default_date_filter;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
