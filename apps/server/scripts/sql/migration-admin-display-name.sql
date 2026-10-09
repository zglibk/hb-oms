-- 管理员 / 超级管理员展示名补正（幂等，仅修复内置 admin 的旧占位名）。
--
-- 历史版本的 admin 账号 real_name 为「管理员」或「系统管理员」，导致操作日志、
-- 创建人和更新人快照无法与 SYS_OPR「管理员」区分。按操作人 ID 精确修复，绝不按
-- 姓名全表替换；这样同名普通员工不会被误改，用户填写的真实姓名也会保留。

SET @admin_user_id := (
  SELECT id FROM t_user WHERE username = 'admin' ORDER BY id LIMIT 1
);

UPDATE t_user
   SET real_name = '超级管理员'
 WHERE id = @admin_user_id
   AND (real_name IS NULL OR TRIM(real_name) IN ('', '管理员', '系统管理员'));

UPDATE t_operation_log SET user_name = '超级管理员'
 WHERE user_id = @admin_user_id AND (user_name IS NULL OR TRIM(user_name) IN ('', '管理员', '系统管理员'));
UPDATE t_process_info_history SET operator_name = '超级管理员'
 WHERE operator_id = @admin_user_id AND (operator_name IS NULL OR TRIM(operator_name) IN ('', '管理员', '系统管理员'));

UPDATE t_department SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_department SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_user SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_user SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_role SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_role SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_permission SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_permission SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_dict SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_dict SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_file SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_material SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_material SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_order SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_order SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_order_product SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_order_product SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_order_part_group SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_order_part_group SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_changelog SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_changelog SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_system_config SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_outsource_part SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_outsource_part SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_assembly_batch SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_assembly_batch SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_finished_doc SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_finished_doc SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_part_balance SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_part_balance SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_part_adjust SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_dull_stock SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_dull_stock SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_dull_stock_flow SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_customer SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_customer SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_supplier SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_supplier SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_employee SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_employee SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_position SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_position SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_job_level SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_job_level SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_process_info SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_process_info SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_production_bom SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_production_bom SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
UPDATE t_equipment_info SET creator_name = '超级管理员'
 WHERE creator_id = @admin_user_id AND (creator_name IS NULL OR TRIM(creator_name) IN ('', '管理员', '系统管理员'));
UPDATE t_equipment_info SET updater_name = '超级管理员'
 WHERE updated_by = @admin_user_id AND (updater_name IS NULL OR TRIM(updater_name) IN ('', '管理员', '系统管理员'));
