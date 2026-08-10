-- 跟踪锚点分层：装配与成品从「部件组」升到「产品行」 —— 2026-08-10
--
-- 背景：2026-08-10 订单部件组默认改为「按节数逐部件铺开」（三节轨 外/中/内三组）后
-- 暴露出粒度错配——装配的实际动作是**把各部件组装成整套滑轨**，本就是产品级活动；
-- 成品入库的对象也是装配产出的整套滑轨，不该再拆回外轨/内轨分别入库。
--
-- 分层结果（改后）：
--   外发件回厂 t_outsource_part  → 仍锚**部件组**（部件确实分开送去表面处理，不改）
--   装配       t_assembly_batch  → 改锚**产品行 + 边别**
--   成品明细   t_finished_item   → 改锚**产品行 + 边别**
--   成品余额   t_finished_balance→ 唯一键改 (order_product_id, side, batch_no, attr_key)
-- 入库闸门两侧同时升级，维度保持对齐：可入库量(产品行,side) = Σ装配量 − Σ已入库量。
--
-- 三张表都已有 order_product_id 冗余列，故只需删旧锚点列 + 改索引/唯一键。
--
-- ⚠️ 数据处理：旧数据锚的是部件组 id，换锚点后语义全错（比如三个组各 20 支会被
-- 合计成产品级 60 支，远超订单数），且业务方已确认开发库与生产库的装配/成品数据
-- **全部是测试数据**，故一次性清空而不做迁移换算。
--
-- ⚠️⚠️ 清空必须「只生效一次」：db:migrate 每次跑**全量清单**，直接写 DELETE 会导致
-- 上线后任何一次重跑都清掉生产数据。故用「旧列是否还存在」当守卫——列删掉之后
-- 第二次跑就是 SELECT 1，永不再清。这也让整个迁移保持幂等。
--
-- 注：外发表 t_outsource_part 的 order_part_group_id 保持不变，不在本迁移范围内。

-- ========== 1. 一次性清空（仅在尚未迁移时执行；按依赖反向顺序）==========

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_balance' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'DELETE FROM t_finished_balance', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_item' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'DELETE FROM t_finished_item', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 单头随明细一起清：只清明细会留下一堆没有行的孤儿单据
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_item' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'DELETE FROM t_finished_doc', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'DELETE FROM t_assembly_batch', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 2. t_assembly_batch：锚点改产品行 ==========

-- 索引 idx_group_side(order_part_group_id, side) → idx_product_side(order_product_id, side)
SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND index_name = 'idx_group_side');
SET @s := IF(@c > 0, 'ALTER TABLE t_assembly_batch DROP INDEX idx_group_side', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND index_name = 'idx_product_side');
SET @s := IF(@c = 0, 'ALTER TABLE t_assembly_batch ADD KEY idx_product_side (order_product_id, side)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'ALTER TABLE t_assembly_batch DROP COLUMN order_part_group_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 产品型号快照的口径由「部件组型号」改为「产品型号」，注释同步
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_assembly_batch' AND column_name = 'product_model');
SET @s := IF(@c = 1,
  'ALTER TABLE t_assembly_batch MODIFY COLUMN product_model VARCHAR(128) NULL COMMENT ''产品型号快照（自订单产品行 = 货号+产品类型组合，如 53#普通）''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 3. t_finished_item：锚点改产品行 ==========

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_finished_item' AND index_name = 'idx_part_group');
SET @s := IF(@c > 0, 'ALTER TABLE t_finished_item DROP INDEX idx_part_group', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_finished_item' AND index_name = 'idx_product');
SET @s := IF(@c = 0, 'ALTER TABLE t_finished_item ADD KEY idx_product (order_product_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_item' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'ALTER TABLE t_finished_item DROP COLUMN order_part_group_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_item' AND column_name = 'order_product_id');
SET @s := IF(@c = 1,
  'ALTER TABLE t_finished_item MODIFY COLUMN order_product_id INT NOT NULL DEFAULT 0 COMMENT ''锚点：订单产品行（跟踪/台账粒度）；0=纯属性期初行，不参与任何订单欠数''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 4. t_finished_balance：唯一键改产品行 ==========

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_finished_balance' AND index_name = 'uk_balance');
SET @s := IF(@c > 0, 'ALTER TABLE t_finished_balance DROP INDEX uk_balance', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_balance' AND column_name = 'order_part_group_id');
SET @s := IF(@c = 1, 'ALTER TABLE t_finished_balance DROP COLUMN order_part_group_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_finished_balance' AND column_name = 'order_product_id');
SET @s := IF(@c = 1,
  'ALTER TABLE t_finished_balance MODIFY COLUMN order_product_id INT NOT NULL DEFAULT 0 COMMENT ''锚点：订单产品行；0=纯属性期初行（只计库存数，不参与任何订单欠数）''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_finished_balance' AND index_name = 'uk_balance');
SET @s := IF(@c = 0,
  'ALTER TABLE t_finished_balance ADD UNIQUE KEY uk_balance (order_product_id, side, batch_no, attr_key)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
