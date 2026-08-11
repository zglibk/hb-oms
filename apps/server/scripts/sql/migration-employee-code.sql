-- =============================================================
-- 员工编码规则落地（《海宝五金员工编码管理规则》，行政人事部）
--
-- 新增员工时由系统自动生成 10 位编码：
--   2位厂区 + 2位年份标识 + 3位部门编码 + 3位部门流水号
-- 非正式人员加字母前缀（实习生 S / 临时工 L），试用转正后换发标准 10 位码。
--
-- 本迁移做四件事：
--   1. t_employee 加 plant_code（厂区，编码第 1-2 位的来源）；
--   2. t_department 加 hr_code（部门人事编码，编码第 5-7 位的来源）——
--      **刻意放在部门主数据里而不是写死在代码**：部门会增减，硬编码迟早和库里对不上；
--   3. 补齐规则里的 9 个部门并回填 hr_code（按名称匹配存量部门，缺的新建）；
--   4. emp_type 字典补「实习生 intern」——规则点名了实习生要用 S 前缀，
--      而原字典只有 正式工/临时工/派遣工/学徒，没有实习生这一档。
--
-- 幂等：列/行不存在才添加。
-- =============================================================

-- ---------- 1. t_employee.plant_code ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_employee' AND column_name = 'plant_code');
SET @s := IF(@c = 0,
  'ALTER TABLE t_employee ADD COLUMN plant_code VARCHAR(2) NULL COMMENT ''厂区编码（员工编号第1-2位）：01总厂 02一号分厂 03二号分厂'' AFTER emp_no',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 2. t_department.hr_code ----------
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_department' AND column_name = 'hr_code');
SET @s := IF(@c = 0,
  'ALTER TABLE t_department ADD COLUMN hr_code VARCHAR(3) NULL COMMENT ''部门人事编码（员工编号第5-7位，如 005）；空=该部门不参与员工编码，建档时会被拒绝'' AFTER dept_name',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 't_department' AND index_name = 'uk_dept_hr_code');
SET @s := IF(@c = 0,
  'ALTER TABLE t_department ADD UNIQUE KEY uk_dept_hr_code (hr_code)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3. 回填 9 个部门的 hr_code ----------
-- 先按名称匹配存量部门回填（「仓库部」即规则里的「仓储部」，按 §二 命名稳定性约定
-- 只认不改名）；hr_code 为空才写，避免覆盖管理员手工调整过的映射。
UPDATE t_department SET hr_code = '001' WHERE dept_name = '生产部'     AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '002' WHERE dept_name IN ('仓储部', '仓库部') AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '003' WHERE dept_name = '行政人事部' AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '004' WHERE dept_name = '业务部'     AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '005' WHERE dept_name = '品检部'     AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '006' WHERE dept_name = '技术研发部' AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '007' WHERE dept_name = '财务部'     AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '008' WHERE dept_name = '采购部'     AND (hr_code IS NULL OR hr_code = '');
UPDATE t_department SET hr_code = '009' WHERE dept_name = '模具部'     AND (hr_code IS NULL OR hr_code = '');

-- 规则里有、库里还没有的部门补建（挂在顶级公司节点下，取现有最小的根部门为父）。
-- 用 hr_code 判存，重复执行不会建第二份。
SET @root := (SELECT id FROM t_department WHERE parent_id = 0 ORDER BY id LIMIT 1);
SET @root := IFNULL(@root, 0);

INSERT INTO t_department (dept_code, dept_name, hr_code, parent_id, sort, status, creator_name, updater_name)
SELECT d.dept_code, d.dept_name, d.hr_code, @root, d.sort, 1, '系统同步', '系统同步'
FROM (
            SELECT 'HR_PROD'  AS dept_code, '生产部'     AS dept_name, '001' AS hr_code, 11 AS sort
  UNION ALL SELECT 'HR_WH',    '仓储部',     '002', 12
  UNION ALL SELECT 'HR_ADMIN', '行政人事部', '003', 13
  UNION ALL SELECT 'HR_SALE',  '业务部',     '004', 14
  UNION ALL SELECT 'HR_QC',    '品检部',     '005', 15
  UNION ALL SELECT 'HR_RD',    '技术研发部', '006', 16
  UNION ALL SELECT 'HR_FIN',   '财务部',     '007', 17
  UNION ALL SELECT 'HR_PUR',   '采购部',     '008', 18
  UNION ALL SELECT 'HR_MOULD', '模具部',     '009', 19
) d
WHERE NOT EXISTS (SELECT 1 FROM t_department x WHERE x.hr_code = d.hr_code)
  AND NOT EXISTS (SELECT 1 FROM t_department y WHERE y.dept_code = d.dept_code);

-- ---------- 4. emp_type 字典补「实习生」 ----------
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, status, creator_name, updater_name)
SELECT 'emp_type', '实习生', 'intern', 5, 1, '系统同步', '系统同步'
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict x WHERE x.dict_type = 'emp_type' AND x.dict_value = 'intern'
);
