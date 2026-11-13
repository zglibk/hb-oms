-- 订单产品自身边别：解决产品名称已经明确「左边 / 右边」，系统仍再次展开左右两行的问题。
--
-- product_side 是唯一事实源：left=左边单边 SKU，right=右边单边 SKU，空串=左右成对/未指定。
-- 存量仅按产品名称末尾的独立标记「-左边 / -右边 / （左） / （右）」回填；
-- 不解析产品代码 D/I，也不匹配名称正文里的自然“左右”字样，避免猜错。

SET @has_product_side := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_order_product'
     AND COLUMN_NAME = 'product_side'
);
SET @add_product_side := IF(
  @has_product_side = 0,
  'ALTER TABLE t_order_product ADD COLUMN product_side VARCHAR(16) NOT NULL DEFAULT '''' COMMENT ''产品自身边别：left左 right右 空串=左右成对/不指定；决定卡口产品允许展开的边'' AFTER product_name',
  'SELECT 1'
);
PREPARE stmt FROM @add_product_side; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 只给含卡口且尚未指定的产品回填；已由用户明确维护的值不得被名称覆盖。
UPDATE t_order_product
   SET product_side = CASE
     WHEN TRIM(product_name) REGEXP '(^|[-（(][[:space:]]*)左(边)?[[:space:]]*[）)]?$' THEN 'left'
     WHEN TRIM(product_name) REGEXP '(^|[-（(][[:space:]]*)右(边)?[[:space:]]*[）)]?$' THEN 'right'
     ELSE ''
   END
 WHERE product_side = ''
   AND FIND_IN_SET('socket', COALESCE(product_type, '')) > 0;

-- 产品边别明确后，订单部件蓝图只保留对应边；中轨仍是通用空边别。
DELETE pt
  FROM t_order_part pt
  JOIN t_order_product p ON p.id = pt.product_id
 WHERE p.product_side IN ('left', 'right')
   AND pt.side IN ('left', 'right')
   AND pt.side <> p.product_side;

-- 历史装配与成品流水统一归到产品自身边别。只改边别、不删记录、不改数量，
-- 因而历史单据总量、红字关联与审计记录全部保留。
UPDATE t_assembly_batch a
JOIN t_order_product p ON p.id = a.order_product_id
   SET a.side = p.product_side
 WHERE p.product_side IN ('left', 'right')
   AND a.side <> p.product_side;

UPDATE t_finished_item i
JOIN t_order_product p ON p.id = i.order_product_id
   SET i.side = p.product_side
 WHERE p.product_side IN ('left', 'right')
   AND i.side <> p.product_side;

-- 外发只有单独的卡口外轨/内轨分边；中轨与组合组继续保持通用空边别。
UPDATE t_outsource_part op
JOIN t_order_part_group g ON g.id = op.order_part_group_id
JOIN t_order_product p ON p.id = op.order_product_id
   SET op.side = CASE
     WHEN g.group_type IN ('outer', 'inner') THEN p.product_side
     ELSE ''
   END
 WHERE p.product_side IN ('left', 'right')
   AND op.side <> CASE
     WHEN g.group_type IN ('outer', 'inner') THEN p.product_side
     ELSE ''
   END;

-- 余额唯一键包含 side；左右历史行归到同一边前先按「产品 + 批次 + 属性」合并，
-- 选已有目标边行（若没有则选最早一行）承接合计，避免撞 uk_balance。
DROP TEMPORARY TABLE IF EXISTS tmp_product_side_balance;
CREATE TEMPORARY TABLE tmp_product_side_balance AS
SELECT b.order_product_id,
       p.product_side AS target_side,
       b.batch_no,
       b.attr_key,
       COALESCE(
         MIN(CASE WHEN b.side = p.product_side THEN b.id END),
         MIN(b.id)
       ) AS keep_id,
       SUM(b.quantity) AS quantity
  FROM t_finished_balance b
  JOIN t_order_product p ON p.id = b.order_product_id
 WHERE p.product_side IN ('left', 'right')
 GROUP BY b.order_product_id, p.product_side, b.batch_no, b.attr_key;

DELETE b
  FROM t_finished_balance b
  JOIN tmp_product_side_balance t
    ON t.order_product_id = b.order_product_id
   AND t.batch_no = b.batch_no
   AND t.attr_key = b.attr_key
 WHERE b.id <> t.keep_id;

UPDATE t_finished_balance b
JOIN tmp_product_side_balance t ON t.keep_id = b.id
   SET b.side = t.target_side,
       b.quantity = t.quantity;

DROP TEMPORARY TABLE IF EXISTS tmp_product_side_balance;
