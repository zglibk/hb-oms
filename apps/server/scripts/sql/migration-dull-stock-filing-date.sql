-- 呆滞品档案新增建档日期（2026-10-20）。
-- 建档日期只表示档案建立 / 纳入呆滞品台账的日期，不参与出入库期间数量统计；
-- 期间入库、出库仍只按 t_dull_stock_flow.flow_date 汇总。
-- 存量档案以原 created_at 的日期回填，避免伪造其历史出入库业务日期。

SET @c := (
  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 't_dull_stock'
     AND column_name = 'filing_date'
);
SET @s := IF(
  @c = 0,
  'ALTER TABLE t_dull_stock ADD COLUMN filing_date DATE NULL COMMENT ''呆滞品建档日期（档案建立或纳入呆滞品台账的业务日期）'' AFTER unit',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_dull_stock
   SET filing_date = DATE(created_at)
 WHERE filing_date IS NULL;

ALTER TABLE t_dull_stock
  MODIFY COLUMN filing_date DATE NOT NULL COMMENT '呆滞品建档日期（档案建立或纳入呆滞品台账的业务日期）';
