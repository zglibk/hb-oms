-- 外发件回厂记录新增边别（2026-10-19）。
-- 卡口产品仅外轨、内轨按 left / right 分别登记；中轨及非卡口保持 side=''。
-- 历史回厂流水没有可追溯的边别来源，保留 side=''，由界面标记「历史未分边」，不擅自平均拆分。

SET @c := (
  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 't_outsource_part'
     AND column_name = 'side'
);
SET @s := IF(
  @c = 0,
  'ALTER TABLE t_outsource_part ADD COLUMN side VARCHAR(16) NOT NULL DEFAULT '''' COMMENT ''边别：卡口外轨/内轨为left左/right右；中轨及非卡口为空串；存量未分边记录也为空串'' AFTER order_part_group_id',
  'ALTER TABLE t_outsource_part MODIFY COLUMN side VARCHAR(16) NOT NULL DEFAULT '''' COMMENT ''边别：卡口外轨/内轨为left左/right右；中轨及非卡口为空串；存量未分边记录也为空串'''
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @i := (
  SELECT COUNT(*)
    FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 't_outsource_part'
     AND index_name = 'idx_part_group_side'
);
SET @s := IF(
  @i = 0,
  'ALTER TABLE t_outsource_part ADD KEY idx_part_group_side (order_part_group_id, side)',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
