-- =============================================================
-- 人事档案（HR 独立模块）
--
-- 一级菜单「HR人力资源管理 → 人事档案」。可读取部门等主数据；
-- V1 暂不向订单/账号等业务模块对外供数（不建 user_id、无 options 接口）。
-- =============================================================

CREATE TABLE IF NOT EXISTS t_employee (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  emp_no             VARCHAR(32)  NOT NULL COMMENT '员工编号（全库唯一，手工录入）',
  emp_name           VARCHAR(64)  NOT NULL COMMENT '姓名',
  gender             TINYINT      NOT NULL DEFAULT 0 COMMENT '性别：0未知 1男 2女',
  id_card            VARCHAR(18)  NULL COMMENT '身份证号',
  birth_date         DATE         NULL COMMENT '出生日期（可由身份证带出）',
  phone              VARCHAR(32)  NULL COMMENT '联系方式',
  address            VARCHAR(255) NULL COMMENT '住址',
  emergency_contact  VARCHAR(64)  NULL COMMENT '紧急联系人（如：张三 138xxxx）',
  native_place       VARCHAR(64)  NULL COMMENT '籍贯',
  ethnicity          VARCHAR(32)  NULL COMMENT '民族',
  marital_status     VARCHAR(32)  NULL COMMENT '婚姻状况（字典 marital_status）',
  political_status   VARCHAR(32)  NULL COMMENT '政治面貌（字典 political_status）',
  education          VARCHAR(32)  NULL COMMENT '学历（字典 education）',
  education_type     VARCHAR(16)  NULL COMMENT '学历类型：full_time全日制 part_time非全日制',
  major              VARCHAR(64)  NULL COMMENT '专业',
  graduate_school    VARCHAR(128) NULL COMMENT '最终毕业院校',
  graduate_date      DATE         NULL COMMENT '毕业时间（存当月首日，界面按月录入）',
  emp_type           VARCHAR(32)  NOT NULL COMMENT '用工属性：formal正式工 temp临时工 dispatch派遣工 apprentice学徒（字典 emp_type）',
  hire_date          DATE         NULL COMMENT '入职日期',
  probation_months   TINYINT      NULL COMMENT '试用期（月），空或0=无试用期',
  contract_end_date  DATE         NULL COMMENT '合同到期日',
  job_status         TINYINT      NOT NULL DEFAULT 1 COMMENT '在职状态：1在职 2离职',
  leave_date         DATE         NULL COMMENT '离职日期（离职时必填）',
  leave_reason       VARCHAR(255) NULL COMMENT '离职原因',
  dept_id            INT          NULL COMMENT '所属车间/组织（t_department.id，可读部门树）',
  team_group         VARCHAR(64)  NULL COMMENT '班组（自由文本）',
  position           VARCHAR(64)  NULL COMMENT '岗位（字典 hr_position）',
  supervisor_id      INT          NULL COMMENT '直属车间主管（本表 id）',
  status             TINYINT      NOT NULL DEFAULT 1 COMMENT '档案启停：1启用 0停用（离职时自动置0）',
  remark             VARCHAR(255) NULL COMMENT '备注',
  creator_id         INT          NULL COMMENT '创建人ID',
  creator_name       VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by         INT          NULL COMMENT '最后更新人ID',
  updater_name       VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_emp_no (emp_no),
  UNIQUE KEY uk_id_card (id_card),
  KEY idx_dept (dept_id),
  KEY idx_job_status (job_status),
  KEY idx_supervisor (supervisor_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人事档案（HR；暂不对外供数）';

-- 字典：用工属性 / 岗位（幂等）
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, status, creator_name, updater_name)
SELECT d.dict_type, d.dict_label, d.dict_value, d.sort, 1, '系统同步', '系统同步'
FROM (
  SELECT 'emp_type' AS dict_type, '正式工' AS dict_label, 'formal' AS dict_value, 1 AS sort
  UNION ALL SELECT 'emp_type', '临时工', 'temp', 2
  UNION ALL SELECT 'emp_type', '派遣工', 'dispatch', 3
  UNION ALL SELECT 'emp_type', '学徒', 'apprentice', 4
  UNION ALL SELECT 'hr_position', '冲压工', 'stamping', 1
  UNION ALL SELECT 'hr_position', '装配工', 'assembly', 2
  UNION ALL SELECT 'hr_position', '质检', 'qc', 3
  UNION ALL SELECT 'hr_position', '机修', 'maintenance', 4
) d
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict x WHERE x.dict_type = d.dict_type AND x.dict_value = d.dict_value
);

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, menu_path, component, icon, sort, status, access_type, creator_name, updater_name)
VALUES
  ('hr', 'HR人力资源管理', 1, 0, '/hr', NULL, 'Avatar', 15, 1, 1, '系统同步', '系统同步'),
  ('hr:employee', '人事档案', 1, 0, '/hr/employee', 'hr/employee/index', 'User', 1, 1, 1, '系统同步', '系统同步');

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('employee:create', '新增员工', 2, 0, 1, 1, 0, '系统同步', '系统同步'),
  ('employee:update', '编辑员工', 2, 0, 2, 1, 0, '系统同步', '系统同步'),
  ('employee:delete', '删除员工', 2, 0, 3, 1, 0, '系统同步', '系统同步');

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'hr'
SET c.parent_id = p.id
WHERE c.perm_code = 'hr:employee' AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'hr:employee'
SET c.parent_id = p.id
WHERE c.perm_code IN ('employee:create', 'employee:update', 'employee:delete') AND c.parent_id <> p.id;

-- 拥有「用户管理」菜单的角色同步获得人事档案全套（人事与账号常同一批人维护）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id AND op.perm_code = 'system:user'
JOIN t_permission np ON np.perm_code IN ('hr', 'hr:employee', 'employee:create', 'employee:update', 'employee:delete');
