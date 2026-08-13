-- 装配口径与入库单车间字段调整（2026-08-13，使用部门反馈）
--
-- ① 「免装配」口径整体下线：内轨等分体单部件行同样要装配自身小零件，
--    所有产品行一律走装配环节、受入库闸门约束（判定函数 needsAssemblyGate 已删）。
--    行为改动全在代码层，这里只订正 is_split 的列注释，别让注释继续描述已下线的口径。
-- ② 成品入库单「班组」字段改为「车间」下拉（存字典 assembly_workshop 值）：
--    按命名稳定性约定（§二）列名 work_team 不动，只订正注释说明取值口径已变；
--    「机台号」停用录入，列保留供历史单据追溯。
-- ③ assembly_workshop 字典补「装九」（原只有装一~装八）。
--
-- 无表结构变更（仅注释与字典行）。幂等：MODIFY 注释可重复执行，字典行按不存在才插入。

-- ---------- 1. is_split 列注释订正（免装配口径下线） ----------
ALTER TABLE t_order_product MODIFY COLUMN is_split TINYINT NOT NULL DEFAULT 0
  COMMENT '分体出货：0整品 1分体（该行按部件组构成分体包装出货，不组装成整品；出货形态由组构成推导；分体行同样走装配环节与入库闸门）';

-- ---------- 2. 入库单 work_team / machine_no 注释订正 ----------
ALTER TABLE t_finished_doc MODIFY COLUMN work_team VARCHAR(64) NULL
  COMMENT '车间（字典 assembly_workshop 值；入库单可选，供追溯。2026-08-13 前为自由文本班组名，历史值原样保留）';
ALTER TABLE t_finished_doc MODIFY COLUMN machine_no VARCHAR(64) NULL
  COMMENT '机台号（已于 2026-08-13 停用录入，列保留供历史单据追溯）';

-- ---------- 3. 装配批次 workshop 注释（装一~装九） ----------
ALTER TABLE t_assembly_batch MODIFY COLUMN workshop VARCHAR(32) NULL
  COMMENT '装配车间（字典 assembly_workshop：装一~装九）；批次录入时指定，订单环节不再预设计划车间';

-- ---------- 4. assembly_workshop 字典补「装九」 ----------
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort, status, creator_name, updater_name)
SELECT 'assembly_workshop', '装九', 'assembly_9', 9, 1, '系统同步', '系统同步'
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict x WHERE x.dict_type = 'assembly_workshop' AND x.dict_value = 'assembly_9'
);
