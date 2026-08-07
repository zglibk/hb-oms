-- 订单字段口径调整（2026-08-07）
--   1. 生产单号 产品级 → 订单级：生产单号与 PO#（客户订单文件的订单编号）是一对一关系，
--      同一张订单不会有两个生产单号，放在产品行是建模错位；
--   2. 产品级新增 客户图号：客户来图的图号，与部件组的 drawing_no（内部转化的生产图号）是两回事；
--   3. 产品级 装配车间 弃用：订单环节不安排装配车间，车间是装配批次录入时才定的（t_assembly_batch.workshop）。
--
-- 两个被弃用的列**保留不删**：production_no 若某订单历史上存在多个不同值，回填只取其一，
-- 直接 DROP 会不可逆地丢掉另一个；assembly_workshop 同理。待生产数据核对无误后另开清理迁移。
-- 幂等：列存在性判断走 information_schema，可重复执行。

-- ===== 1. t_order.production_no =====
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order' AND COLUMN_NAME = 'production_no');
SET @sql := IF(@exist = 0,
  'ALTER TABLE t_order ADD COLUMN production_no VARCHAR(64) NULL COMMENT ''生产单号（订单级，手工填写；与 po_no 一对一；对应手工台账「订单编号」如 GLI46212-A，台账默认展示此号）'' AFTER po_no',
  'SELECT ''t_order.production_no 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order' AND INDEX_NAME = 'idx_production_no');
SET @sql := IF(@exist = 0,
  'ALTER TABLE t_order ADD KEY idx_production_no (production_no)',
  'SELECT ''t_order.idx_production_no 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 回填：取该订单下**行序最靠前的非空**生产单号（同单多值时以第一行为准，其余保留在产品行不删）。
-- 用相关子查询而非 GROUP_CONCAT+SUBSTRING_INDEX——后者遇到单号自身含逗号会截错值。
-- ⚠️ 必须包在列存在性判断里：后续的 migration-drop-deprecated-order-cols.sql 会把
-- t_order_product.production_no 删掉，而 db:migrate 每次跑**全量清单**，裸写这条
-- UPDATE 会在删列后报 Unknown column 而让整个迁移流程失败。
SET @src_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 't_order_product' AND COLUMN_NAME = 'production_no');
SET @sql := IF(@src_col = 1, '
  UPDATE t_order o
     SET o.production_no = (
       SELECT p.production_no FROM t_order_product p
        WHERE p.order_id = o.id AND p.production_no IS NOT NULL AND p.production_no <> ""
        ORDER BY p.sort ASC, p.id ASC LIMIT 1)
   WHERE (o.production_no IS NULL OR o.production_no = "")
     AND EXISTS (SELECT 1 FROM t_order_product p
                  WHERE p.order_id = o.id AND p.production_no IS NOT NULL AND p.production_no <> "")',
  'SELECT ''产品行 production_no 已删除，无需回填''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ===== 2. t_order_product.customer_drawing_no =====
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_product' AND COLUMN_NAME = 'customer_drawing_no');
SET @sql := IF(@exist = 0,
  'ALTER TABLE t_order_product ADD COLUMN customer_drawing_no VARCHAR(128) NULL COMMENT ''客户图号（产品级）：客户来图上的图号；区别于部件组的 drawing_no 生产图号（内部转化的技术图纸）'' AFTER item_no',
  'SELECT ''t_order_product.customer_drawing_no 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_product' AND INDEX_NAME = 'idx_customer_drawing_no');
SET @sql := IF(@exist = 0,
  'ALTER TABLE t_order_product ADD KEY idx_customer_drawing_no (customer_drawing_no)',
  'SELECT ''t_order_product.idx_customer_drawing_no 已存在''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ===== 3. 权限点 order:cancel → order:delete =====
-- PermissionSyncService 只做 upsert 不删除，新权限点由它自动落库并补授 admin；
-- 旧的 order:cancel 需在此显式清掉，否则会以孤儿权限的形式留在角色授权界面上。
DELETE rp FROM t_role_permission rp
  JOIN t_permission p ON p.id = rp.permission_id
 WHERE p.perm_code = 'order:cancel';
DELETE FROM t_permission WHERE perm_code = 'order:cancel';

-- ===== 4. 弃用标记（只改 COMMENT，不删列、不改类型，重复执行同定义无害）=====
-- 同样要判存在：这两列稍后会被清理迁移删除，删后再 MODIFY 会报 Unknown column。
SET @sql := IF(@src_col = 1,
  'ALTER TABLE t_order_product MODIFY COLUMN production_no VARCHAR(64) NULL COMMENT ''【已弃用 2026-08-07】生产单号已上移订单级 t_order.production_no；本列仅保留历史数据，程序不再读写''',
  'SELECT ''产品行 production_no 已删除，跳过注释订正''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @ws_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 't_order_product' AND COLUMN_NAME = 'assembly_workshop');
SET @sql := IF(@ws_col = 1,
  'ALTER TABLE t_order_product MODIFY COLUMN assembly_workshop VARCHAR(32) NULL COMMENT ''【已弃用 2026-08-07】订单环节不安排装配车间；车间改由装配批次 t_assembly_batch.workshop 录入，本列仅保留历史数据，程序不再读写''',
  'SELECT ''产品行 assembly_workshop 已删除，跳过注释订正''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ===== 5. 下游快照列的来源注释订正（生产单号快照现自订单取，非产品行）=====
ALTER TABLE t_outsource_item
  MODIFY COLUMN production_no VARCHAR(64) NULL COMMENT '生产单号快照（自订单 t_order.production_no）';
ALTER TABLE t_assembly_batch
  MODIFY COLUMN production_no VARCHAR(64) NULL COMMENT '生产单号快照（自订单 t_order.production_no；台账「订单编号」口径）';
ALTER TABLE t_finished_item
  MODIFY COLUMN production_no VARCHAR(64) NULL COMMENT '生产单号快照（自订单 t_order.production_no；台账「订单编号」口径）';

-- 装配批次车间：不再继承产品行计划车间，改为录入时指定
ALTER TABLE t_assembly_batch
  MODIFY COLUMN workshop VARCHAR(32) NULL COMMENT '装配车间（字典 assembly_workshop：装一~装八）；批次录入时指定，订单环节不再预设计划车间';
