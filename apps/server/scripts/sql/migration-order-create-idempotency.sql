-- 新增订单幂等键：同一张新增表单的重复/并发 POST 只允许落一张订单。
-- 列保持可空以兼容历史数据与迁移期间尚未刷新的旧前端；MySQL 唯一索引允许多个 NULL。
SET @has_order_create_request_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_order'
    AND COLUMN_NAME = 'create_request_id'
);
SET @add_order_create_request_id := IF(
  @has_order_create_request_id = 0,
  'ALTER TABLE t_order ADD COLUMN create_request_id VARCHAR(64) NULL COMMENT ''创建订单请求幂等键；同一张新增表单重复提交只创建一次'' AFTER order_no',
  'SELECT 1'
);
PREPARE stmt FROM @add_order_create_request_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_order_create_request_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_order'
    AND INDEX_NAME = 'uk_order_create_request_id'
);
SET @add_order_create_request_index := IF(
  @has_order_create_request_index = 0,
  'ALTER TABLE t_order ADD UNIQUE KEY uk_order_create_request_id (create_request_id)',
  'SELECT 1'
);
PREPARE stmt FROM @add_order_create_request_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
