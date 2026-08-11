-- =============================================================
-- 岗位管理：由字典 hr_position 升级为独立主数据（2026-08-11）
--
-- 背景：岗位原先只是一条字典项（标签/值/排序/启停），装不下岗位编码、所属部门、
-- 职级、编制人数；维护入口又挂在「系统管理 → 数据字典」下，HR 专员通常没有系统
-- 管理权限，进去还容易误改 surface_type 这类代码保留值。故升级为 t_position 主数据。
--
-- t_employee.position（存字典值）→ position_id（引用 t_position.id），
-- 与同表 dept_id 同款，岗位改名/改编码不影响已建档员工。
--
-- ⚠️ 第 3~5 步是**一次性动作**（改列 + 清字典），用「t_employee.position 列是否
-- 还存在」当守卫：列删掉后重跑一律跳过，永不重复执行（§三「只生效一次」）。
-- =============================================================

CREATE TABLE IF NOT EXISTS t_position (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  position_code  VARCHAR(64)  NOT NULL COMMENT '岗位编码（唯一业务键）',
  position_name  VARCHAR(64)  NOT NULL COMMENT '岗位名称（可重复，编码才是唯一业务键；不同部门可有同名岗位）',
  dept_id        INT          NULL COMMENT '所属部门（t_department.id）；空=通用岗位，不限部门',
  job_level      VARCHAR(32)  NULL COMMENT '职级（字典 job_level）',
  is_manager     TINYINT      NOT NULL DEFAULT 0 COMMENT '是否管理岗：1是 0否',
  headcount      INT          NULL COMMENT '编制人数；空=不限编（列表用它与在岗人数对照，超编标红）',
  sort           INT          NOT NULL DEFAULT 0 COMMENT '排序（越小越靠前，控制下拉顺序）',
  status         TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用（停用后不进下拉，已引用它的员工不受影响）',
  remark         VARCHAR(255) NULL COMMENT '备注',
  creator_id     INT          NULL COMMENT '创建人ID',
  creator_name   VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by     INT          NULL COMMENT '最后更新人ID',
  updater_name   VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_position_code (position_code),
  KEY idx_dept (dept_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='岗位主数据（基础数据；被员工引用后禁止删除，下线用停用）';

-- ---------- 1a. 把存量库里的 hr_position 字典项搬进 t_position ----------
-- 包括管理员自己加过的自定义岗位，一条都不能丢。
-- dept_id 留空 = 通用岗位（原字典没有部门概念，不臆造归属，由 HR 上线后自行指定）
INSERT INTO t_position (position_code, position_name, sort, status, creator_name, updater_name)
SELECT d.dict_value, d.dict_label, d.sort, 1, '系统同步', '系统同步'
FROM t_dict d
WHERE d.dict_type = 'hr_position'
  AND NOT EXISTS (SELECT 1 FROM t_position p WHERE p.position_code = d.dict_value);

-- ---------- 1b. 兜底种入四个基础岗位 ----------
-- 上面那段依赖「库里还有 hr_position 字典项」，而 migration-employee.sql 已不再种它们，
-- 所以一个从头跑全量迁移的新库走到这里会一条都搬不到 —— 必须再直种一次。
INSERT INTO t_position (position_code, position_name, sort, status, creator_name, updater_name)
SELECT d.position_code, d.position_name, d.sort, 1, '系统同步', '系统同步'
FROM (
            SELECT 'stamping' AS position_code, '冲压工' AS position_name, 1 AS sort
  UNION ALL SELECT 'assembly',    '装配工', 2
  UNION ALL SELECT 'qc',          '质检',   3
  UNION ALL SELECT 'maintenance', '机修',   4
) d
WHERE NOT EXISTS (SELECT 1 FROM t_position p WHERE p.position_code = d.position_code);

-- ---------- 2. t_employee 加 position_id ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'position_id');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN position_id INT NULL COMMENT ''岗位（t_position.id）'' AFTER team_group',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND index_name = 'idx_position');
SET @s := IF(@c = 0, 'ALTER TABLE t_employee ADD KEY idx_position (position_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3~5. 一次性：回填 → 删旧列 → 清字典 ----------
-- 守卫：旧列还在才执行；删掉后重跑全部退化为 SELECT 1。
-- 注意 IF(cond, 0, (SELECT … col …)) 挡不住——MySQL 预处理阶段就解析列名，
-- 条件为假照样报 Unknown column，故整条都得进 PREPARE（§三 已踩）。
SET @has_old := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'position');

-- 3. 按岗位编码回填（系统尚未上线，实际多为 0 行，留着以防开发库有数据）
SET @s := IF(@has_old = 1,
  'UPDATE t_employee e JOIN t_position p ON p.position_code = e.position SET e.position_id = p.id WHERE e.position IS NOT NULL AND e.position <> ''''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 删旧列
SET @s := IF(@has_old = 1, 'ALTER TABLE t_employee DROP COLUMN position', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. 清掉 hr_position 字典项（数据已进 t_position，留着两处会打架）。
-- 这条**刻意不加一次性守卫**：hr_position 是已作废的字典类型，
-- migration-employee.sql 也不再种它，删完就不会再有；重复执行删的是 0 行、无副作用。
-- 若哪天有人手工在字典里又建了 hr_position，下次迁移顺手清掉也正是我们想要的。
DELETE FROM t_dict WHERE dict_type = 'hr_position';

-- ---------- 6. 职级字典 ----------
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, status, creator_name, updater_name)
SELECT d.dict_type, d.dict_label, d.dict_value, d.sort, 1, '系统同步', '系统同步'
FROM (
            SELECT 'job_level' AS dict_type, '员级' AS dict_label, 'staff' AS dict_value, 1 AS sort
  UNION ALL SELECT 'job_level', '组长', 'group_leader', 2
  UNION ALL SELECT 'job_level', '班长', 'shift_leader', 3
  UNION ALL SELECT 'job_level', '主管', 'supervisor', 4
  UNION ALL SELECT 'job_level', '经理', 'manager', 5
) d
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict x WHERE x.dict_type = d.dict_type AND x.dict_value = d.dict_value
);

-- ---------- 7. 权限点 ----------
-- 清单（permission-manifest.ts）才是 SSOT，启动时会 upsert 并校正 parent_id/名称/排序。
-- 这里先建行，是因为迁移**先于**服务启动执行，不预建的话下面按 perm_code 授权时匹配不到。
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, menu_path, component, icon, sort, status, access_type, creator_name, updater_name)
VALUES
  ('basic:position', '岗位管理', 1, 0, '/basic/position', 'basic/position/index', 'Postcard', 4, 1, 1, '系统同步', '系统同步');

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('position:create', '新增岗位', 2, 0, 1, 1, 0, '系统同步', '系统同步'),
  ('position:update', '编辑岗位', 2, 0, 2, 1, 0, '系统同步', '系统同步'),
  ('position:delete', '删除岗位', 2, 0, 3, 1, 0, '系统同步', '系统同步');

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic'
SET c.parent_id = p.id
WHERE c.perm_code = 'basic:position' AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic:position'
SET c.parent_id = p.id
WHERE c.perm_code IN ('position:create', 'position:update', 'position:delete') AND c.parent_id <> p.id;

-- 授权：持有「部门信息」的角色同步获得岗位全套——部门与岗位是同一批人维护的组织主数据
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'basic:dept'
JOIN t_permission np ON np.perm_code IN
  ('basic:position', 'position:create', 'position:update', 'position:delete');
