-- =============================================================
-- 岗位性质三值化 + 职级升级为独立主数据（2026-08-12）
--
-- 1) is_manager（0否/1是）→ position_nature（normal/manager/tech）
--    加了「技术岗」之后，「是不是管理岗」这个是非题已经表达不了了。
--
-- 2) 职级由字典 job_level 升级为独立主数据 t_job_level：
--    - 原先那套（普工/操作工/机长/工程师…）实际是**岗位名称**，与岗位列表的
--      「岗位名称」列几乎一模一样，起不到职级的作用；
--    - 改为**按序列分等级**——职级表达「在本序列内的等级」：质检员分初/中/高级，
--      工程师分助理/工程师/高级/资深，管理分班组长/主管/经理/高管；
--    - 之所以不继续用字典：序列归属得靠 t_dict.parent_value 手填「上级键值」，
--      在通用字典页面维护极易填错，故给它一张自己的表和自己的维护页。
--
-- t_position.job_level（字典值）→ job_level_id（引用 t_job_level.id）。
-- =============================================================

-- ---------- 1. t_position.position_nature ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_position' AND column_name = 'position_nature');
SET @s := IF(@c = 0,
  'ALTER TABLE t_position ADD COLUMN position_nature VARCHAR(16) NOT NULL DEFAULT ''normal'' COMMENT ''岗位性质：normal普通岗 manager管理岗 tech技术岗'' AFTER dept_id',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 从旧的 is_manager 回填（只在旧列还在时执行，天然只生效一次）
SET @has_mgr := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_position' AND column_name = 'is_manager');
SET @s := IF(@has_mgr = 1,
  'UPDATE t_position SET position_nature = IF(is_manager = 1, ''manager'', ''normal'')', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@has_mgr = 1, 'ALTER TABLE t_position DROP COLUMN is_manager', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 2. 职级主数据表 ----------
CREATE TABLE IF NOT EXISTS t_job_level (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  level_name      VARCHAR(64)  NOT NULL COMMENT '职级名称（如 主管级 / 工程师 / 初级）',
  position_nature VARCHAR(16)  NOT NULL DEFAULT 'normal' COMMENT '所属序列 = 岗位性质：normal普通岗 manager管理岗 tech技术岗',
  level_rank      INT          NOT NULL DEFAULT 0 COMMENT '序列内等级高低（越大越高，供排序与日后挂薪资带宽）',
  sort            INT          NOT NULL DEFAULT 0 COMMENT '排序（越小越靠前，控制下拉顺序）',
  status          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用（停用后不进下拉，已引用它的岗位不受影响）',
  remark          VARCHAR(255) NULL COMMENT '备注',
  creator_id      INT          NULL COMMENT '创建人ID',
  creator_name    VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by      INT          NULL COMMENT '最后更新人ID',
  updater_name    VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_level_name_nature (position_nature, level_name),
  KEY idx_nature (position_nature),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='职级主数据（按岗位性质分序列，序列内分等级；被岗位引用后禁止删除）';

-- 种入三条序列的等级（幂等）
INSERT INTO t_job_level (level_name, position_nature, level_rank, sort, status, creator_name, updater_name)
SELECT d.level_name, d.position_nature, d.level_rank, d.sort, 1, '系统同步', '系统同步'
FROM (
  -- 管理序列
            SELECT '班组长级' AS level_name, 'manager' AS position_nature, 1 AS level_rank, 11 AS sort
  UNION ALL SELECT '主管级',      'manager', 2, 12
  UNION ALL SELECT '经理级',      'manager', 3, 13
  UNION ALL SELECT '高管级',      'manager', 4, 14
  -- 技术序列
  UNION ALL SELECT '助理工程师',  'tech',    1, 21
  UNION ALL SELECT '工程师',      'tech',    2, 22
  UNION ALL SELECT '高级工程师',  'tech',    3, 23
  UNION ALL SELECT '资深工程师',  'tech',    4, 24
  -- 普通序列（操作与职员：质检员、操作工、文员等按此分级）
  UNION ALL SELECT '初级',        'normal',  1, 31
  UNION ALL SELECT '中级',        'normal',  2, 32
  UNION ALL SELECT '高级',        'normal',  3, 33
  UNION ALL SELECT '技师',        'normal',  4, 34
) d
WHERE NOT EXISTS (
  SELECT 1 FROM t_job_level x
   WHERE x.position_nature = d.position_nature AND x.level_name = d.level_name
);

-- ---------- 3. t_position.job_level（字典值）→ job_level_id ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_position' AND column_name = 'job_level_id');
SET @s := IF(@c = 0,
  'ALTER TABLE t_position ADD COLUMN job_level_id INT NULL COMMENT ''职级（t_job_level.id）'' AFTER position_nature',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_position' AND index_name = 'idx_job_level');
SET @s := IF(@c = 0, 'ALTER TABLE t_position ADD KEY idx_job_level (job_level_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 旧字典值 → 新职级行的映射回填（只在旧列还在时执行，天然只生效一次）
SET @has_old := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_position' AND column_name = 'job_level');

SET @s := IF(@has_old = 1, "
  UPDATE t_position p JOIN t_job_level j
     ON j.level_name = CASE p.job_level
          WHEN 'general_manager'     THEN '高管级'
          WHEN 'deputy_gm'           THEN '高管级'
          WHEN 'manager'             THEN '经理级'
          WHEN 'deputy_manager'      THEN '经理级'
          WHEN 'supervisor'          THEN '主管级'
          WHEN 'director'            THEN '主管级'
          WHEN 'team_leader'         THEN '班组长级'
          WHEN 'group_leader'        THEN '班组长级'
          WHEN 'shift_leader'        THEN '班组长级'
          WHEN 'machine_leader'      THEN '班组长级'
          WHEN 'engineer'            THEN '工程师'
          WHEN 'technician'          THEN '助理工程师'
          WHEN 'general_worker'      THEN '初级'
          WHEN 'staff'               THEN '初级'
          WHEN 'operator'            THEN '中级'
          WHEN 'maintenance_worker'  THEN '中级'
          WHEN 'assistant'           THEN '中级'
          WHEN 'specialist'          THEN '中级'
          ELSE NULL END
    AND j.position_nature = CASE
          WHEN p.job_level IN ('general_manager','deputy_gm','manager','deputy_manager',
                               'supervisor','director','team_leader','group_leader',
                               'shift_leader','machine_leader') THEN 'manager'
          WHEN p.job_level IN ('engineer','technician') THEN 'tech'
          ELSE 'normal' END
   SET p.job_level_id = j.id
 WHERE p.job_level IS NOT NULL AND p.job_level <> ''", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填后把岗位性质补齐：管理/技术序列的职级反推性质（原先只有 manager/normal 两种）
SET @s := IF(@has_old = 1, "
  UPDATE t_position p JOIN t_job_level j ON j.id = p.job_level_id
     SET p.position_nature = j.position_nature", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(@has_old = 1, 'ALTER TABLE t_position DROP COLUMN job_level', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 4. 清掉已作废的 job_level 字典 ----------
-- 职级已改由 t_job_level 承载，字典类型整体作废。
-- 不加一次性守卫：种子已全部摘除（migration-job-level.sql 与 seed-data 均已改），
-- 删完不会再有，重复执行删 0 行、无副作用。
DELETE FROM t_dict WHERE dict_type = 'job_level';

-- ---------- 5. 权限点：职级管理 + 岗位导入导出 ----------
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, menu_path, component, icon, sort, status, access_type, creator_name, updater_name)
VALUES
  ('basic:job-level', '职级管理', 1, 0, '/basic/job-level', 'basic/job-level/index', 'Rank', 5, 1, 1, '系统同步', '系统同步');

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('job-level:create', '新增职级', 2, 0, 1, 1, 0, '系统同步', '系统同步'),
  ('job-level:update', '编辑职级', 2, 0, 2, 1, 0, '系统同步', '系统同步'),
  ('job-level:delete', '删除职级', 2, 0, 3, 1, 0, '系统同步', '系统同步'),
  ('position:import', '批量导入岗位', 2, 0, 4, 1, 0, '系统同步', '系统同步'),
  ('position:export', '导出岗位', 2, 0, 5, 1, 0, '系统同步', '系统同步');

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic'
SET c.parent_id = p.id
WHERE c.perm_code = 'basic:job-level' AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic:job-level'
SET c.parent_id = p.id
WHERE c.perm_code IN ('job-level:create', 'job-level:update', 'job-level:delete') AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic:position'
SET c.parent_id = p.id
WHERE c.perm_code IN ('position:import', 'position:export') AND c.parent_id <> p.id;

-- 授权：能管岗位的角色同样能管职级、能导入导出（同一批维护人）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'basic:position'
JOIN t_permission np ON np.perm_code = 'basic:job-level';

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'position:create'
JOIN t_permission np ON np.perm_code IN
  ('job-level:create', 'job-level:update', 'job-level:delete', 'position:import', 'position:export');
