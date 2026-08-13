-- 成品库存：新增「批量导入」「导出」权限点（2026-08-13）
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
  ('stock-balance:import', '批量导入成品库存', 2, 0, 1, 1, 0, '系统同步', '系统同步'),
  ('stock-balance:export', '导出成品库存',     2, 0, 2, 1, 0, '系统同步', '系统同步');

-- 回填 parent_id（清单同步同样会做，此处保证本文件内后续语句的父子关系已正确）
UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'stock-balance'
SET c.parent_id = p.id
WHERE c.perm_code IN ('stock-balance:import', 'stock-balance:export') AND c.parent_id <> p.id;

-- ---------- 2. 授权 ----------
-- 导出是只读动作：凡能看成品库存页的角色一并给导出，
-- 否则「看得见却导不出」会立刻变成一堆手工申请。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'stock-balance'
JOIN t_permission np ON np.perm_code = 'stock-balance:export';

-- 导入会写数据，且**实质就是批量录成品期初**（落地成一张 FGO 期初单，由单据驱动余额），
-- 故只给已经持有「成品期初录入」写权限的角色。只读角色不会因这次迁移凭空获得写入能力，
-- 更不会让「只能看库存」的人具备凭空加库存的本事。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'opening:finished'
JOIN t_permission np ON np.perm_code = 'stock-balance:import';
