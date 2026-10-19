-- 卡口滑轨中轨改为不分左右的单行结构（2026-10-19）
--
-- 业务口径：卡口成品仍按左/右两支组成一套；部件层只有外轨、内轨区分左/右，
-- 中轨结构左右通用，订单部件行应为 side=''、qty=部件组总支数的一行。
--
-- 旧版 expandPartRows 把卡口组内所有部件统一拆成 left/right，导致中轨也落成两行。
-- 本迁移按部件组合并存量中轨行：保留最小 ID，数量回到组支数，边别清空；周期码和
-- 备注若左右填写不同则去重后用「 / 」并列，避免静默丢失人工追溯信息。
--
-- 幂等：首次执行后每组只剩一条 side='' 中轨；重复执行只会原值更新，不再删行。

DROP TEMPORARY TABLE IF EXISTS tmp_socket_middle_common;
CREATE TEMPORARY TABLE tmp_socket_middle_common AS
SELECT MIN(pt.id) AS keep_id,
       pt.part_group_id,
       g.qty_pcs AS target_qty,
       GROUP_CONCAT(
         DISTINCT NULLIF(TRIM(pt.cycle_code), '')
         ORDER BY NULLIF(TRIM(pt.cycle_code), '') SEPARATOR ' / '
       ) AS cycle_code,
       GROUP_CONCAT(
         DISTINCT NULLIF(TRIM(pt.remark), '')
         ORDER BY NULLIF(TRIM(pt.remark), '') SEPARATOR ' / '
       ) AS remark
  FROM t_order_part pt
  JOIN t_order_product p ON p.id = pt.product_id
  JOIN t_order_part_group g ON g.id = pt.part_group_id
 WHERE pt.part_type = 'middle'
   AND FIND_IN_SET('socket', COALESCE(p.product_type, '')) > 0
 GROUP BY pt.part_group_id, g.qty_pcs;

-- 合并文本超出字段长度时先中止，不能靠 MySQL 截断追溯信息后继续删行。
SET @too_long := (
  SELECT COUNT(*)
    FROM tmp_socket_middle_common
   WHERE CHAR_LENGTH(cycle_code) > 64 OR CHAR_LENGTH(remark) > 255
);
SET @s := IF(
  @too_long = 0,
  'SELECT 1',
  'SELECT * FROM `中止迁移_卡口中轨周期码或备注合并后超长_请先人工处理`'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_order_part pt
JOIN tmp_socket_middle_common x ON x.keep_id = pt.id
   SET pt.side = '',
       pt.qty = x.target_qty,
       pt.cycle_code = x.cycle_code,
       pt.remark = x.remark;

DELETE pt
  FROM t_order_part pt
  JOIN tmp_socket_middle_common x ON x.part_group_id = pt.part_group_id
 WHERE pt.part_type = 'middle'
   AND pt.id <> x.keep_id;

DROP TEMPORARY TABLE tmp_socket_middle_common;

-- 同步字段注释；列类型与默认值不变。
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_order_part' AND column_name = 'side');
SET @s := IF(@c = 1,
  'ALTER TABLE t_order_part MODIFY COLUMN side VARCHAR(16) NOT NULL DEFAULT '''' COMMENT ''边别：卡口外轨/内轨为left左/right右；中轨及非卡口为空串''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
