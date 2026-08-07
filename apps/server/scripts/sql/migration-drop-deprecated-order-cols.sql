-- 清理迁移（2026-08-07）：DROP 两个已弃用的产品行列
--   t_order_product.production_no     —— 已上移订单级 t_order.production_no
--   t_order_product.assembly_workshop —— 装配车间已下沉批次级 t_assembly_batch.workshop
--
-- 前置迁移 migration-order-field-adjust.sql 已完成回填与代码切换，此处只做物理删除。
-- DROP 不可逆，故先设**安全闸门**：若还存在「产品行有生产单号、但订单级为空」的行，
-- 说明回填没覆盖到（例如中途有旧代码写入），此时**中止迁移**而不是把数据删掉。
-- MySQL 普通脚本里不能用 SIGNAL（只在存储程序中可用），故用「让预处理语句
-- 指向一个不存在的表」把中止原因写进报错信息里——报错文本即为提示语。
--
-- 幂等：列已删则跳过；闸门在列不存在时自然通过（无行可查）。

-- ===== 0. 兜底再回填一次（幂等；列已删则整段跳过）=====
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 't_order_product' AND COLUMN_NAME = 'production_no');
SET @sql := IF(@has_col = 1, '
  UPDATE t_order o
     SET o.production_no = (
       SELECT p.production_no FROM t_order_product p
        WHERE p.order_id = o.id AND p.production_no IS NOT NULL AND p.production_no <> ""
        ORDER BY p.sort ASC, p.id ASC LIMIT 1)
   WHERE (o.production_no IS NULL OR o.production_no = "")
     AND EXISTS (SELECT 1 FROM t_order_product p
                  WHERE p.order_id = o.id AND p.production_no IS NOT NULL AND p.production_no <> "")',
  'SELECT ''production_no 列已删除，跳过回填''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ===== 1. 安全闸门 =====
-- 盯的是**同一订单的多个产品行填了不同生产单号**：§0 回填只取行序最前的一个，
-- DROP 之后其余值永久消失。这是本次删列唯一真正会丢信息的情形，命中即中止，
-- 待人工确认哪个才是该订单的生产单号（或把订单拆开）后再放行。
-- 「有产品行值但订单级为空」不设闸门——§0 刚回填过，那种行必然已归零。
-- 注意：不能写成 IF(@has_col = 0, 0, (SELECT … p.production_no …))——MySQL 在**预处理阶段**
-- 就要解析子查询里的列名，条件为假也照样报 Unknown column。故整条查询也走 PREPARE。
SET @conflict := 0;
SET @sql := IF(@has_col = 1, '
  SELECT COUNT(*) INTO @conflict FROM (
    SELECT order_id FROM t_order_product
     WHERE production_no IS NOT NULL AND production_no <> ""
     GROUP BY order_id HAVING COUNT(DISTINCT production_no) > 1) x',
  'SELECT 0 INTO @conflict');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@conflict = 0,
  'SELECT ''闸门通过：无订单存在多个不同生产单号''',
  'SELECT * FROM `迁移中止_有订单的多个产品行填了不同生产单号_删列会丢失其余值_请人工核对`');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ===== 2. DROP t_order_product.production_no（连带 idx_production_no 自动消失）=====
SET @sql := IF(@has_col = 1,
  'ALTER TABLE t_order_product DROP COLUMN production_no',
  'SELECT ''t_order_product.production_no 已删除，跳过''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ===== 3. DROP t_order_product.assembly_workshop =====
-- 无需闸门：该列只是「新建装配批次时的默认车间」，历史批次早已把车间快照进
-- t_assembly_batch.workshop，删掉不丢任何已发生的业务事实。
SET @has_ws := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 't_order_product' AND COLUMN_NAME = 'assembly_workshop');
SET @sql := IF(@has_ws = 1,
  'ALTER TABLE t_order_product DROP COLUMN assembly_workshop',
  'SELECT ''t_order_product.assembly_workshop 已删除，跳过''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
