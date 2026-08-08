-- 审计追溯补齐 + 查看权限（只读角色）—— 2026-08-08
--
-- 一、审计追溯（CLAUDE.md §5.5 审计六件套）
--   t_dict / t_department / t_role / t_permission / t_user / t_changelog /
--   t_order_product / t_order_part_group / t_outsource_item 补齐
--   creator_id + creator_name + updated_by + updater_name（+ 缺 updated_at 的补上）；
--   t_system_config 按单向语义补 updater_name + created_at；t_file 补 creator_name。
--
-- 二、查看权限
--   t_permission.access_type（0操作 1查看）+ 按「菜单=查看、按钮=操作」回填；
--   新建 stat / stat:dashboard 并补授全部存量角色（上线行为不变，可按角色收回）；
--   清理 2026-08-07 部件信息改名遗留的孤儿权限行 system:material；
--   修复存量授权的断链父级与「有按钮无菜单」的半残授权。
--
-- 幂等：列先判存在再加，权限/授权行靠唯一键 INSERT IGNORE，可重复执行。
-- ⚠️ 迁移涉及权限变更，执行后所有用户需重新登录刷新 JWT。
-- 注：本文件由 db-migrate.ts 用 mysql2 整文件 query 执行，**不能使用 DELIMITER
--     与存储过程**（那是 mysql 客户端指令，服务端不认），故加列一律用
--     information_schema 判存在 + PREPARE 的展开写法，与既有迁移风格一致。

-- ===================== 一、审计列 =====================

-- ---------- t_dict ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_dict' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_dict ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_dict' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_dict ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_dict' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_dict ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_dict' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_dict ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_dict' AND column_name = 'updated_at');
SET @s := IF(@c = 0, 'ALTER TABLE t_dict ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_department ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_department ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_department ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_department ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_department ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'updated_at');
SET @s := IF(@c = 0, 'ALTER TABLE t_department ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_role ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_role' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_role ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_role' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_role ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_role' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_role ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID（含分配权限操作）''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_role' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_role ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_role' AND column_name = 'updated_at');
SET @s := IF(@c = 0, 'ALTER TABLE t_role ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_permission ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_permission' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_permission ADD COLUMN creator_id INT NULL COMMENT ''创建人ID（清单同步的行为空）''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_permission' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_permission ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照；清单同步写入记「系统同步」''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_permission' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_permission ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_permission' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_permission ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_permission' AND column_name = 'updated_at');
SET @s := IF(@c = 0, 'ALTER TABLE t_permission ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_user（已有 created_at / updated_at） ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_user' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_user ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_user' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_user ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_user' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_user ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID；登录计数等系统簿记不写此列''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_user' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_user ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_changelog（已有 created_at / updated_at） ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_changelog' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_changelog ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_changelog' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_changelog ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_changelog' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_changelog ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_changelog' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_changelog ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_order_product（人工录入内容；编辑=整体重建，创建人沿用订单头） ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_product' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_product ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_product' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_product ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_product' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_product ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_product' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_product ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_order_part_group ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_part_group' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_part_group ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_part_group' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_part_group ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_part_group' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_part_group ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_part_group' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_order_part_group ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- t_outsource_item（有独立的「发出数量修正」接口按行改数） ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'creator_id');
SET @s := IF(@c = 0, 'ALTER TABLE t_outsource_item ADD COLUMN creator_id INT NULL COMMENT ''创建人ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_outsource_item ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''创建人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'updated_by');
SET @s := IF(@c = 0, 'ALTER TABLE t_outsource_item ADD COLUMN updated_by INT NULL COMMENT ''最后更新人ID（数量修正记于此）''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_outsource_item ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 单向语义表 ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'updater_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_system_config ADD COLUMN updater_name VARCHAR(64) NULL COMMENT ''最后更新人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'created_at');
SET @s := IF(@c = 0, 'ALTER TABLE t_system_config ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_file' AND column_name = 'creator_name');
SET @s := IF(@c = 0, 'ALTER TABLE t_file ADD COLUMN creator_name VARCHAR(64) NULL COMMENT ''上传人姓名快照''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 存量回填 ----------
-- 订单产品行/部件组：创建人取所属订单头（历史行本就由该订单录入人产生）
UPDATE t_order_product p
JOIN t_order o ON o.id = p.order_id
SET p.creator_id = o.creator_id, p.creator_name = o.creator_name,
    p.updated_by = o.updated_by, p.updater_name = o.updater_name
WHERE p.creator_id IS NULL AND p.creator_name IS NULL;

UPDATE t_order_part_group g
JOIN t_order o ON o.id = g.order_id
SET g.creator_id = o.creator_id, g.creator_name = o.creator_name,
    g.updated_by = o.updated_by, g.updater_name = o.updater_name
WHERE g.creator_id IS NULL AND g.creator_name IS NULL;

-- 外发明细行：创建人取所属发坯单头
UPDATE t_outsource_item i
JOIN t_outsource_doc d ON d.id = i.doc_id
SET i.creator_id = d.creator_id, i.creator_name = d.creator_name,
    i.updated_by = d.updated_by, i.updater_name = d.updater_name
WHERE i.creator_id IS NULL AND i.creator_name IS NULL;

-- 系统配置/文件：按已有的 id 列反查一次姓名，此后由业务代码写快照
UPDATE t_system_config c
JOIN t_user u ON u.id = c.updated_by
SET c.updater_name = COALESCE(NULLIF(TRIM(u.real_name), ''), u.username)
WHERE c.updater_name IS NULL;

UPDATE t_file f
JOIN t_user u ON u.id = f.creator_id
SET f.creator_name = COALESCE(NULLIF(TRIM(u.real_name), ''), u.username)
WHERE f.creator_name IS NULL;

-- ===================== 二、access_type 与查看权限 =====================

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_permission' AND column_name = 'access_type');
SET @s := IF(@c = 0, 'ALTER TABLE t_permission ADD COLUMN access_type TINYINT NOT NULL DEFAULT 0 COMMENT ''权限性质：0操作 1查看(只读)'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填：菜单=查看、按钮=操作（与清单 accessTypeOf 的缺省推导同口径）
UPDATE t_permission SET access_type = 1 WHERE perm_type = 1 AND access_type <> 1;
UPDATE t_permission SET access_type = 0 WHERE perm_type <> 1 AND access_type <> 0;

-- 首页看板权限点。容器 stat 用 perm_type=2：建成菜单会在侧栏多出一条点不开的条目
-- （buildMenuTree 只取 perm_type=1，故侧栏不受影响）。uk_perm_code 保证幂等。
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES ('stat', '统计查看', 2, 0, 1, 1, 0, '系统同步', '系统同步');

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES ('stat:dashboard', '查看首页看板', 2, 0, 1, 1, 1, '系统同步', '系统同步');

-- parent_id 回填（启动期 PermissionSyncService 也会做，此处先做以免迁移与重启之间树是断的）
UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'stat'
SET c.parent_id = p.id
WHERE c.perm_code = 'stat:dashboard' AND c.parent_id <> p.id;

-- 按钮型的**查看**权限点必须放在上面那两条 blanket 回填之后显式置 1，
-- 否则重复执行本迁移时会被「按钮=操作」那条刷回 0（首次执行看不出来，
-- 第二次跑就错了，且要等应用重启才被清单同步纠正）。
-- 清单里凡带 access_type: 1 的按钮型权限点，都要在此登记一行。
UPDATE t_permission SET access_type = 1
WHERE perm_code IN ('stat:dashboard') AND access_type <> 1;

-- 补授全部存量角色：首页看板此前登录即可见，上线后行为不变；需要收回时在角色权限树取消勾选
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
JOIN t_permission p ON p.perm_code IN ('stat', 'stat:dashboard');

-- 清理孤儿权限行 system:material：2026-08-07 部件信息由「物料管理」移入「基础数据」
-- 并改码为 basic:material，清单里已不存在该码，本次守卫也已改用新码，
-- 留着只会在菜单/权限树里多出一条谁也用不上的条目。先解绑授权再删行。
DELETE rp FROM t_role_permission rp
JOIN t_permission p ON p.id = rp.permission_id
WHERE p.perm_code = 'system:material';
DELETE FROM t_permission WHERE perm_code = 'system:material';

-- 修复「页面能打开、列表接口 403」：授了某菜单下的操作按钮却没授该菜单本身。
-- 本次把各模块 GET 接口挂上了菜单权限点，不补的话这类角色点进去就是空白 + 403。
-- 只补**直接父菜单**（perm_type=1），不碰兄弟菜单——那会造成静默越权。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, parent.id
FROM t_role_permission rp
JOIN t_permission child ON child.id = rp.permission_id
JOIN t_permission parent ON parent.id = child.parent_id AND parent.perm_type = 1
WHERE child.perm_type = 2;

-- 修复存量授权的断链父级：授了子权限却没授父级时 buildMenuTree 建不出菜单
-- （权限在、菜单不显示）。执行三遍覆盖现有菜单深度（按钮→二级菜单→一级菜单）。
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.parent_id
FROM t_role_permission rp
JOIN t_permission p ON p.id = rp.permission_id
WHERE p.parent_id <> 0;

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.parent_id
FROM t_role_permission rp
JOIN t_permission p ON p.id = rp.permission_id
WHERE p.parent_id <> 0;

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p.parent_id
FROM t_role_permission rp
JOIN t_permission p ON p.id = rp.permission_id
WHERE p.parent_id <> 0;
