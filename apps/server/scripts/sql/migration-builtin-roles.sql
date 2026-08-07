-- 内置角色统一为公司实际岗位编制（17 个，数据范围一律「全部」、一律内置）
--
-- 两点必须注意：
-- 1. 三个旧编码（salesman/merchandiser/warehouse）**原地改编码**而不是删了重建——
--    它们已绑定用户与权限（t_user_role / t_role_permission 引用的是 role_id），
--    删除重建会同时断掉用户分配和权限授权。
-- 2. 生产库可能已有管理员在界面手工建的同名角色（实测已有 BUS_MGR），
--    故用 INSERT IGNORE + UPDATE 的 upsert 写法，命中即更新、不产生重复行。
--
-- status 不在 UPDATE 之列：保留库中取值，允许管理员临时停用某个内置角色。
-- 幂等：改名带存在性判断，upsert 可重复执行。

-- ---------- 1. 旧编码原地迁移（仅当旧编码还在、且新编码尚未占用时执行）----------
SET @old := (SELECT COUNT(*) FROM t_role WHERE role_code = 'salesman');
SET @new := (SELECT COUNT(*) FROM t_role WHERE role_code = 'BUS_OPR');
SET @sql := IF(@old = 1 AND @new = 0, "UPDATE t_role SET role_code = 'BUS_OPR' WHERE role_code = 'salesman'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old := (SELECT COUNT(*) FROM t_role WHERE role_code = 'merchandiser');
SET @new := (SELECT COUNT(*) FROM t_role WHERE role_code = 'DOC_OPR');
SET @sql := IF(@old = 1 AND @new = 0, "UPDATE t_role SET role_code = 'DOC_OPR' WHERE role_code = 'merchandiser'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old := (SELECT COUNT(*) FROM t_role WHERE role_code = 'warehouse');
SET @new := (SELECT COUNT(*) FROM t_role WHERE role_code = 'WH_OPR');
SET @sql := IF(@old = 1 AND @new = 0, "UPDATE t_role SET role_code = 'WH_OPR' WHERE role_code = 'warehouse'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 2. 补齐 17 个内置角色（已存在的编码被 IGNORE 跳过，保住其 id 与绑定）----------
INSERT IGNORE INTO t_role (role_code, role_name, data_scope, is_builtin, status, sort, remark) VALUES
  ('GEN_MGR',  '总经理',     1, 1, 1,  1, '公司经营决策'),
  ('VICE_MGR', '副总经理',   1, 1, 1,  2, '协助总经理分管业务'),
  ('BUS_MGR',  '业务经理',   1, 1, 1,  3, '业务团队管理与客户维护'),
  ('BUS_OPR',  '业务员',     1, 1, 1,  4, '录单/跟踪订单完成情况'),
  ('DOC_OPR',  '跟单员',     1, 1, 1,  5, '订单跟踪/外发跟进'),
  ('PLN_MGR',  '计划经理',   1, 1, 1,  6, '生产计划统筹'),
  ('PLN_OPR',  '计划员',     1, 1, 1,  7, '排程与交期跟进'),
  ('PROD_MGR', '生产经理',   1, 1, 1,  8, '生产现场管理'),
  ('PROD_OPR', '生产文员',   1, 1, 1,  9, '生产数据录入与统计'),
  ('WH_OPR',   '仓管员',     1, 1, 1, 10, '成品出入库操作'),
  ('TECH_MGR', '技术经理',   1, 1, 1, 11, '技术工艺管理'),
  ('TECH_ENG', '技术工程师', 1, 1, 1, 12, '工艺文件与图纸维护'),
  ('QA_MGR',   '品质经理',   1, 1, 1, 13, '品质体系管理'),
  ('PQE_ENG',  'PQE 工程师', 1, 1, 1, 14, '制程品质工程'),
  ('FIN_MGR',  '财务经理',   1, 1, 1, 15, '财务核算管理'),
  ('PAY_OPR',  '薪资核算员', 1, 1, 1, 16, '计件与薪资核算'),
  ('admin',    '系统管理员', 1, 1, 1, 17, '系统管理');

-- ---------- 3. 统一名称/数据范围/内置标记/排序（编码为键；status 保留库中取值）----------
UPDATE t_role SET role_name = '总经理',     data_scope = 1, is_builtin = 1, sort =  1 WHERE role_code = 'GEN_MGR';
UPDATE t_role SET role_name = '副总经理',   data_scope = 1, is_builtin = 1, sort =  2 WHERE role_code = 'VICE_MGR';
UPDATE t_role SET role_name = '业务经理',   data_scope = 1, is_builtin = 1, sort =  3 WHERE role_code = 'BUS_MGR';
UPDATE t_role SET role_name = '业务员',     data_scope = 1, is_builtin = 1, sort =  4 WHERE role_code = 'BUS_OPR';
UPDATE t_role SET role_name = '跟单员',     data_scope = 1, is_builtin = 1, sort =  5 WHERE role_code = 'DOC_OPR';
UPDATE t_role SET role_name = '计划经理',   data_scope = 1, is_builtin = 1, sort =  6 WHERE role_code = 'PLN_MGR';
UPDATE t_role SET role_name = '计划员',     data_scope = 1, is_builtin = 1, sort =  7 WHERE role_code = 'PLN_OPR';
UPDATE t_role SET role_name = '生产经理',   data_scope = 1, is_builtin = 1, sort =  8 WHERE role_code = 'PROD_MGR';
UPDATE t_role SET role_name = '生产文员',   data_scope = 1, is_builtin = 1, sort =  9 WHERE role_code = 'PROD_OPR';
UPDATE t_role SET role_name = '仓管员',     data_scope = 1, is_builtin = 1, sort = 10 WHERE role_code = 'WH_OPR';
UPDATE t_role SET role_name = '技术经理',   data_scope = 1, is_builtin = 1, sort = 11 WHERE role_code = 'TECH_MGR';
UPDATE t_role SET role_name = '技术工程师', data_scope = 1, is_builtin = 1, sort = 12 WHERE role_code = 'TECH_ENG';
UPDATE t_role SET role_name = '品质经理',   data_scope = 1, is_builtin = 1, sort = 13 WHERE role_code = 'QA_MGR';
UPDATE t_role SET role_name = 'PQE 工程师', data_scope = 1, is_builtin = 1, sort = 14 WHERE role_code = 'PQE_ENG';
UPDATE t_role SET role_name = '财务经理',   data_scope = 1, is_builtin = 1, sort = 15 WHERE role_code = 'FIN_MGR';
UPDATE t_role SET role_name = '薪资核算员', data_scope = 1, is_builtin = 1, sort = 16 WHERE role_code = 'PAY_OPR';
UPDATE t_role SET role_name = '系统管理员', data_scope = 1, is_builtin = 1, sort = 17 WHERE role_code = 'admin';
