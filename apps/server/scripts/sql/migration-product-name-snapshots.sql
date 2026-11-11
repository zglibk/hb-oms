-- 产品身份字段拆分：所有产品级列表统一显示「产品代码 + 产品名称」，
-- 部件级业务继续单独保留组型号，不再拿组型号代替产品名称。
--
-- 下游流水必须保存订单侧展示快照，避免订单后来修改后历史单据悄悄变样；
-- 呆滞品是独立台账，没有订单锚点，产品名称作为可选的人工档案字段保存。

SET @has_outsource_item_no := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_outsource_part' AND COLUMN_NAME = 'item_no'
);
SET @add_outsource_item_no := IF(
  @has_outsource_item_no = 0,
  'ALTER TABLE t_outsource_part ADD COLUMN item_no VARCHAR(64) NULL COMMENT ''产品代码快照（自订单产品行）'' AFTER production_no',
  'SELECT 1'
);
PREPARE stmt FROM @add_outsource_item_no; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_outsource_product_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_outsource_part' AND COLUMN_NAME = 'product_name'
);
SET @add_outsource_product_name := IF(
  @has_outsource_product_name = 0,
  'ALTER TABLE t_outsource_part ADD COLUMN product_name VARCHAR(128) NULL COMMENT ''产品名称快照（自订单产品行）'' AFTER item_no',
  'SELECT 1'
);
PREPARE stmt FROM @add_outsource_product_name; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_finished_item_product_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_finished_item' AND COLUMN_NAME = 'product_name'
);
SET @add_finished_item_product_name := IF(
  @has_finished_item_product_name = 0,
  'ALTER TABLE t_finished_item ADD COLUMN product_name VARCHAR(128) NULL COMMENT ''产品名称快照（自订单产品行）'' AFTER item_no',
  'SELECT 1'
);
PREPARE stmt FROM @add_finished_item_product_name; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_finished_balance_product_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_finished_balance' AND COLUMN_NAME = 'product_name'
);
SET @add_finished_balance_product_name := IF(
  @has_finished_balance_product_name = 0,
  'ALTER TABLE t_finished_balance ADD COLUMN product_name VARCHAR(128) NOT NULL DEFAULT '''' COMMENT ''产品名称快照（自成品出入库明细）'' AFTER item_no',
  'SELECT 1'
);
PREPARE stmt FROM @add_finished_balance_product_name; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_dull_product_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_dull_stock' AND COLUMN_NAME = 'product_name'
);
SET @add_dull_product_name := IF(
  @has_dull_product_name = 0,
  'ALTER TABLE t_dull_stock ADD COLUMN product_name VARCHAR(128) NOT NULL DEFAULT '''' COMMENT ''产品名称（独立档案字段；不明确可为空）'' AFTER item_no',
  'SELECT 1'
);
PREPARE stmt FROM @add_dull_product_name; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 订单锚定流水按订单产品行回填存量快照。
UPDATE t_outsource_part r
JOIN t_order_product p ON p.id = r.order_product_id
   SET r.item_no = p.item_no,
       r.product_name = p.product_name
 WHERE r.item_no IS NULL OR r.item_no = '' OR r.product_name IS NULL OR r.product_name = '';

UPDATE t_finished_item i
JOIN t_order_product p ON p.id = i.order_product_id
   SET i.product_name = p.product_name
 WHERE i.product_name IS NULL OR i.product_name = '';

UPDATE t_finished_balance b
JOIN t_order_product p ON p.id = b.order_product_id
   SET b.product_name = COALESCE(p.product_name, '')
 WHERE b.product_name = '';

-- 呆滞品没有订单外键；仅当「生产单号 + 产品代码」能唯一对应一个非空名称时回填，
-- 其余保持空白，避免把技术型号误当成产品名称。
UPDATE t_dull_stock d
JOIN (
  SELECT o.production_no,
         p.item_no,
         MAX(TRIM(p.product_name)) AS product_name
    FROM t_order o
    JOIN t_order_product p ON p.order_id = o.id
   WHERE o.production_no IS NOT NULL AND o.production_no <> ''
     AND p.item_no IS NOT NULL AND p.item_no <> ''
     AND p.product_name IS NOT NULL AND TRIM(p.product_name) <> ''
   GROUP BY o.production_no, p.item_no
  HAVING COUNT(DISTINCT TRIM(p.product_name)) = 1
) matched ON matched.production_no = d.production_no AND matched.item_no = d.item_no
   SET d.product_name = matched.product_name
 WHERE d.product_name = '';
