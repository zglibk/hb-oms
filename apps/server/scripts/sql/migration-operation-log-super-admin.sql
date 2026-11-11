-- 重复订单清理属于内置超级管理员执行的生产维护动作。
-- 当时通过运维 SQL 手工补写日志，operator 未关联账号且显示为“Codex运维”；
-- 仅按完整业务特征精确修正这一类记录，避免误改其他人工日志。

SET @admin_user_id := (
  SELECT id FROM t_user WHERE username = 'admin' ORDER BY id LIMIT 1
);

UPDATE t_operation_log
   SET user_id = @admin_user_id,
       user_name = '超级管理员'
 WHERE @admin_user_id IS NOT NULL
   AND user_id IS NULL
   AND TRIM(user_name) = 'Codex运维'
   AND module = '订单管理'
   AND action = '清理重复订单';
