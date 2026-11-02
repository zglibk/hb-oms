-- 呆滞品月度台账：档案补料厚，流水细分为客退/领料/生产入库/出货，并增加送货单权限。

SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 't_dull_stock'
     AND column_name = 'material_thickness'
);
SET @s := IF(
  @c = 0,
  'ALTER TABLE t_dull_stock ADD COLUMN material_thickness VARCHAR(32) NOT NULL DEFAULT '''' COMMENT ''料厚（如 2.00、1.2×1.0×1.2）'' AFTER dimension_text',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 't_dull_stock_flow'
     AND column_name = 'flow_type'
);
SET @s := IF(
  @c = 0,
  'ALTER TABLE t_dull_stock_flow ADD COLUMN flow_type VARCHAR(32) NULL COMMENT ''流水类型：customer_return客退 production_issue生产领料 production_inbound生产入库 shipment出货'' AFTER direction',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 存量流水按方向与原原因尽量还原业务类型；无法精确判断时分别归生产入库/生产领料，账面方向不变。
UPDATE t_dull_stock_flow
   SET flow_type = CASE
     WHEN direction = 1 AND reason LIKE '%退货%' THEN 'customer_return'
     WHEN direction = 1 THEN 'production_inbound'
     WHEN direction = -1 AND (reason LIKE '%销售%' OR reason LIKE '%出货%' OR reason LIKE '%清库%' OR reason LIKE '%降价%') THEN 'shipment'
     ELSE 'production_issue'
   END
 WHERE flow_type IS NULL OR flow_type = '';

ALTER TABLE t_dull_stock_flow
  MODIFY COLUMN flow_type VARCHAR(32) NOT NULL COMMENT '流水类型：customer_return客退 production_issue生产领料 production_inbound生产入库 shipment出货';

SET @c := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 't_dull_stock_flow'
     AND index_name = 'idx_dull_flow_month'
);
SET @s := IF(
  @c = 0,
  'ALTER TABLE t_dull_stock_flow ADD INDEX idx_dull_flow_month (flow_date, flow_type)',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 权限点由清单自动同步；迁移内先建行，确保可立即给存量角色补授。
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('dull-stock:print', '打印呆滞品送货单', 2, 0, 7, 1, 0, '系统同步', '系统同步');

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'dull-stock'
SET c.parent_id = p.id
WHERE c.perm_code = 'dull-stock:print' AND c.parent_id <> p.id;

-- 打印是出货工作的后续动作：只补给已经能登记呆滞品出入库的角色。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'dull-stock:stock'
JOIN t_permission np ON np.perm_code = 'dull-stock:print';
