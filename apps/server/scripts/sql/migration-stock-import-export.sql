-- 呆滞品管理 / 部件台账：新增「批量导入」「导出」权限点（2026-08-12）
--
-- 权限点本身由 PermissionSyncService 按 permission-manifest.ts 自动 upsert，本迁移
-- 不是为了建行，而是为了**授权**——同步服务只管 t_permission，不动 t_role_permission，
-- 存量角色的授予必须写迁移（§二）。
--
-- 无表结构变更。幂等：INSERT IGNORE + 只在缺失时补授。

-- ---------- 1. 预建权限点（清单同步也会建，这里先建是为了本文件后面能直接授权） ----------
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('dull-stock:import', '批量导入呆滞品', 2, 0, 5, 1, 0, '系统同步', '系统同步'),
  ('dull-stock:export', '导出呆滞品',     2, 0, 6, 1, 0, '系统同步', '系统同步'),
  ('part-stock:import', '批量导入调整',   2, 0, 2, 1, 0, '系统同步', '系统同步'),
  ('part-stock:export', '导出部件台账',   2, 0, 3, 1, 0, '系统同步', '系统同步');

-- 回填 parent_id（清单同步同样会做，此处保证本文件内后续语句的父子关系已正确）
UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'dull-stock'
SET c.parent_id = p.id
WHERE c.perm_code IN ('dull-stock:import', 'dull-stock:export') AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'part-stock'
SET c.parent_id = p.id
WHERE c.perm_code IN ('part-stock:import', 'part-stock:export') AND c.parent_id <> p.id;

-- ---------- 2. 授权 ----------
-- 导出是只读动作：凡能看该页的角色（持有菜单权限点）一并给导出，
-- 否则「看得见却导不出」会立刻变成一堆手工申请。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'dull-stock'
JOIN t_permission np ON np.perm_code = 'dull-stock:export';

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'part-stock'
JOIN t_permission np ON np.perm_code = 'part-stock:export';

-- 导入会写数据，**只给已经有对应写权限的角色**：
--   呆滞品导入 ← 已能新增呆滞品（dull-stock:create）
--   部件台账导入 ← 已能调整余量（part-stock:adjust）——导入本就是调整的批量形式
-- 只读角色不会因为这次迁移凭空获得写入能力。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'dull-stock:create'
JOIN t_permission np ON np.perm_code = 'dull-stock:import';

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'part-stock:adjust'
JOIN t_permission np ON np.perm_code = 'part-stock:import';
