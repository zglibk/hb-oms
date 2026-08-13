-- 装配管理：新增「导出装配记录」权限点（2026-08-13）
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
  ('assembly:export', '导出装配记录', 2, 0, 4, 1, 0, '系统同步', '系统同步');

-- 回填 parent_id（清单同步同样会做，此处保证本文件内后续语句的父子关系已正确）
UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'assembly'
SET c.parent_id = p.id
WHERE c.perm_code = 'assembly:export' AND c.parent_id <> p.id;

-- ---------- 2. 授权 ----------
-- 导出是只读动作：凡能看装配管理页的角色（持有菜单权限点 assembly）一并给导出，
-- 否则「看得见却导不出」会立刻变成一堆手工申请（沿用呆滞品/部件台账导出的口径）。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'assembly'
JOIN t_permission np ON np.perm_code = 'assembly:export';
