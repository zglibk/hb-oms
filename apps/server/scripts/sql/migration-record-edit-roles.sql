-- 业务记录修改权收紧（2026-09-26，使用方反馈「自己建的数据被别人改了」）：
-- 订单 / 外发回厂记录 / 装配批次 / 成品出入库单，只允许【创建人】与该模块的【主管角色】修改、删除
-- （成品出入库单含编辑、作废、确认），管理员与超级管理员均不例外；主管角色再受其角色「数据范围」约束
-- （只能改创建人部门落在自己数据范围内的记录）。主管角色在「系统配置 → 数据权限」调整。

-- 1) 四个模块的主管角色配置列（角色编码逗号分隔）
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'order_edit_roles');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN order_edit_roles VARCHAR(255) NOT NULL DEFAULT ''BUS_MGR'' COMMENT ''订单修改主管角色：角色编码逗号分隔；订单只允许创建人与这些角色的用户修改/删除（管理员与超级管理员均不例外，主管受数据范围约束），缺省 BUS_MGR 业务经理'' AFTER delivery_template_default',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'outsource_edit_roles');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN outsource_edit_roles VARCHAR(255) NOT NULL DEFAULT ''PLN_MGR'' COMMENT ''外发回厂记录修改主管角色：角色编码逗号分隔；只允许创建人与这些角色的用户修改/删除（管理员与超级管理员均不例外，主管受数据范围约束），缺省 PLN_MGR 计划经理'' AFTER order_edit_roles',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'assembly_edit_roles');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN assembly_edit_roles VARCHAR(255) NOT NULL DEFAULT ''PLN_MGR,PROD_MGR'' COMMENT ''装配批次修改主管角色：角色编码逗号分隔；只允许创建人与这些角色的用户修改/删除（管理员与超级管理员均不例外，主管受数据范围约束），缺省 PLN_MGR 计划经理、PROD_MGR 生产经理'' AFTER outsource_edit_roles',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'finished_edit_roles');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN finished_edit_roles VARCHAR(255) NOT NULL DEFAULT ''PLN_MGR'' COMMENT ''成品出入库单修改主管角色：角色编码逗号分隔；草稿的编辑/作废/确认只允许创建人与这些角色的用户（管理员与超级管理员均不例外，主管受数据范围约束），缺省 PLN_MGR 计划经理'' AFTER assembly_edit_roles',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) 主管角色补授对应按钮权限（连同父级菜单）：没有按钮权限，接口守卫就先挡住了。
--    INSERT IGNORE 靠 uk_role_perm 去重，可重复执行；角色或权限点不存在时不插入任何行。
--    业务经理：修改订单
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM t_role r
  JOIN t_permission p ON p.perm_code IN ('production', 'order', 'order:update')
 WHERE r.role_code = 'BUS_MGR';
--    计划经理：成品出入库草稿的修改 / 确认 / 作废（外发、装配的修改删除权计划经理原本就有）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM t_role r
  JOIN t_permission p ON p.perm_code IN ('material-mgmt', 'finished-stock', 'finished-stock:update', 'finished-stock:confirm', 'finished-stock:cancel')
 WHERE r.role_code = 'PLN_MGR';
