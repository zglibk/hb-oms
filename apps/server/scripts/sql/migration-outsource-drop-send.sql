-- 外发取消「发出」环节 —— 2026-08-10
--
-- 使用部门反馈：发货不过磅、不留发出数量记录，维护这套数据没人填准也没人看。
-- 外发单改为只跟踪「哪些部件组发去做表面处理 → 计划何时回 → 实际何时回、回了多少」。
--
--   t_outsource_doc  删 plan_send_date（计划发外）、actual_send_date（实际发外）；
--                    require_back_date 列名不动，语义改为「计划回货日期」；
--                    status 语义改为 1待回货 3部分回货 4已回齐 9已作废（2已发出弃用）。
--   t_outsource_item 删 send_weight、unit_weight（过磅折算下线）；
--                    send_qty 改名 plan_return_qty（应回数量，回齐判定基准）。
--   t_outsource_return 完全不动——回货仍按明细行分批登记、仍按重量折算支数。
--   权限点 outsource:send 连同角色授权一并清理。
--
-- 幂等：列先判存在再改；权限行删除天然幂等。

-- ===================== 安全闸门 =====================
-- 已有回货登记 = 这套流程正在被真实使用，改结构前须人工确认（发出侧数据本身
-- 按业务决定丢弃，不为它设闸）。制造一个"表名即提示语"的报错来中止整条流程——
-- 普通脚本里不能用 SIGNAL（仅存储程序可用）。
SET @has_return := (SELECT COUNT(*) FROM t_outsource_return);
SET @s := IF(@has_return > 0,
  'SELECT * FROM `中止：已存在外发回货登记，请先人工确认再执行本迁移`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== t_outsource_item =====================
-- send_qty → plan_return_qty（改名保留数据；本列原是"发出数量"，现为"应回数量"）
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'send_qty');
SET @s := IF(@c = 1,
  'ALTER TABLE t_outsource_item CHANGE COLUMN send_qty plan_return_qty INT NOT NULL DEFAULT 0 COMMENT ''应回数量（支）：本单该部件组预计回多少，回货数≥此数即该行回齐''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 兜底：全新库由 01-schema 建表时已是 plan_return_qty，此处只刷注释保持一致
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'plan_return_qty');
SET @s := IF(@c = 1,
  'ALTER TABLE t_outsource_item MODIFY COLUMN plan_return_qty INT NOT NULL DEFAULT 0 COMMENT ''应回数量（支）：本单该部件组预计回多少，回货数≥此数即该行回齐''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'send_weight');
SET @s := IF(@c = 1, 'ALTER TABLE t_outsource_item DROP COLUMN send_weight', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 注意只删明细行的单重；t_outsource_return.unit_weight 是回货折算用的，必须保留
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_item' AND column_name = 'unit_weight');
SET @s := IF(@c = 1, 'ALTER TABLE t_outsource_item DROP COLUMN unit_weight', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 累计回货数的注释同步（原文写的是"允许超过发出数"）
ALTER TABLE t_outsource_item MODIFY COLUMN returned_qty INT NOT NULL DEFAULT 0
  COMMENT '累计回货数量（支）：由回货登记汇总维护，允许超过应回数（重量折算误差）';

-- ===================== t_outsource_doc =====================
-- 删两个发外日期（其上的 idx_plan_send_date / idx_actual_send_date 随列自动消失）
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_doc' AND column_name = 'plan_send_date');
SET @s := IF(@c = 1, 'ALTER TABLE t_outsource_doc DROP COLUMN plan_send_date', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_doc' AND column_name = 'actual_send_date');
SET @s := IF(@c = 1, 'ALTER TABLE t_outsource_doc DROP COLUMN actual_send_date', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 语义改名只体现在注释上（列名保持稳定，避免牵动索引/看板 SQL/前端字段名）
ALTER TABLE t_outsource_doc MODIFY COLUMN require_back_date DATE NULL COMMENT '计划回货日期';
ALTER TABLE t_outsource_doc MODIFY COLUMN status TINYINT NOT NULL DEFAULT 1
  COMMENT '状态：1待回货 3部分回货 4已回齐 9已作废（2已发出为弃用值，发出环节已取消）';

-- ===================== 权限点清理 =====================
-- outsource:send（登记发出）已从清单删除；清单同步只做新增/更新不删行，
-- 留着会在菜单/权限树里多出一条点了必 404 的条目。先解绑角色授权再删行。
DELETE rp FROM t_role_permission rp
JOIN t_permission p ON p.id = rp.permission_id
WHERE p.perm_code = 'outsource:send';
DELETE FROM t_permission WHERE perm_code = 'outsource:send';
