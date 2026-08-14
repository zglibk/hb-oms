-- 送货单打印 —— 2026-08-14
--
-- 车间现行送货单是手工 Excel，且**不同客户版式不同**（列集合、联系电话、签名项都不一样）。
-- 本次把打印搬进系统：从成品出库单（biz_type='sale_outbound'）一键出送货单，
-- 版式由「模板编码」决定，模板的版式定义在前端注册表（web/src/constants/delivery-note.ts）。
--
-- 两列：
--   t_customer.delivery_template            客户绑定的模板（空 = 取下面的全局默认）
--   t_system_config.delivery_template_default 全局默认模板（客户未单独配置时兜底）
--
-- 为什么模板编码在库里不做值域约束（无 ENUM、无 CHECK）：版式是代码（前端注册表），
-- 加一套新客户模板本就要写版式，值域再写死一份等于同一件事改两处、必然漂移。
-- 前端下拉只给注册表里有的选项；打印页取到未知编码时回落通用模板，不报错。
--
-- 幂等：列不存在才添加。

-- ---------- 客户绑定的送货单模板 ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_customer' AND column_name = 'delivery_template');
SET @s := IF(@c = 0,
  'ALTER TABLE t_customer ADD COLUMN delivery_template VARCHAR(32) NULL COMMENT ''送货单模板编码：nsk耐斯克 jinggong精工 generic通用；空=取系统配置的全局默认模板'' AFTER delivery_address',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 全局默认送货单模板 ----------
-- 放本文件而不是 migration-field-switches.sql：那个文件是「业务字段开关」专属，
-- 本配置与上面的客户列是同一件事，一个功能一个迁移文件更好回溯。
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'delivery_template_default');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN delivery_template_default VARCHAR(32) NOT NULL DEFAULT ''generic'' COMMENT ''送货单默认模板编码：nsk耐斯克 jinggong精工 generic通用；客户资料未单独配置模板时用它'' AFTER dimension_view_unit',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 「打印送货单」权限点的授权 ----------
-- 权限点本身由 PermissionSyncService 按 permission-manifest.ts 自动 upsert；
-- 同步服务只管 t_permission、不动 t_role_permission，**存量角色的授予必须写迁移**（§二）。
-- 这里先建行是为了后面的授权语句能直接引用到它。
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('finished-stock:print', '打印送货单', 2, 0, 6, 1, 0, '系统同步', '系统同步');

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'finished-stock'
SET c.parent_id = p.id
WHERE c.perm_code = 'finished-stock:print' AND c.parent_id <> p.id;

-- 授权口径：凡能开出入库单的角色（持有 finished-stock:create）一并给打印。
-- 不按「持有菜单 finished-stock」授——那会把只读角色也一并授权，而出 PDF 会真的
-- 拉起无头浏览器渲染（生产内存紧张，见 PdfService 注释），只读角色不该有这个开关。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'finished-stock:create'
JOIN t_permission np ON np.perm_code = 'finished-stock:print';
