-- 超管角色隔离：role_code='admin' 只允许绑定唯一内置 username='admin' 账号。
-- 新增可分配的普通管理员 SYS_OPR，并清理历史越权关系；全段幂等。

INSERT INTO t_role (role_code, role_name, data_scope, is_builtin, status, sort, remark)
VALUES ('SYS_OPR', '管理员', 1, 1, 1, 17, '日常系统管理（无超管旁路与危险操作）')
ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), data_scope = 1,
  is_builtin = 1, sort = 17, remark = VALUES(remark);

UPDATE t_role SET role_name = '超级管理员', data_scope = 1, is_builtin = 1,
  sort = 18, remark = '系统最高权限，仅限内置 admin 账号'
WHERE role_code = 'admin';

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM t_role r JOIN t_permission p
  ON p.perm_code NOT IN ('log:delete', 'system:danger')
WHERE r.role_code = 'SYS_OPR';

DELETE rp FROM t_role_permission rp
JOIN t_role r ON r.id = rp.role_id
JOIN t_permission p ON p.id = rp.permission_id
WHERE r.role_code <> 'admin' AND p.perm_code IN ('log:delete', 'system:danger');

-- 清理普通账号历史误绑的超级管理员角色。
DELETE ur
  FROM t_user_role ur
  JOIN t_user u ON u.id = ur.user_id
  JOIN t_role r ON r.id = ur.role_id
 WHERE r.role_code = 'admin'
   AND u.username <> 'admin';
