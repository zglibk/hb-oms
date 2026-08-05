-- 客户名称去唯一约束：真实客户「一名多码」是常态（同一客户名下挂多个客户代码，
-- 如同名客户 40+ 个代码），客户代码 customer_code 才是唯一业务键。
-- 幂等：仅当唯一索引存在时删除；普通索引不存在时补建（保留名称查询性能）。

SET @has_uk := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_customer'
    AND index_name = 'uk_customer_name' AND non_unique = 0
);
SET @sql := IF(@has_uk > 0,
  'ALTER TABLE t_customer DROP INDEX uk_customer_name',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_customer'
    AND index_name = 'idx_customer_name'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE t_customer ADD INDEX idx_customer_name (customer_name)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE t_customer MODIFY COLUMN customer_name VARCHAR(128) NOT NULL COMMENT '客户名称（可重复，一名多码）';
