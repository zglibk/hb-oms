-- 外发收敛为「外发件回厂记录」—— 2026-08-10
--
-- 使用部门第二轮反馈：连发坯单都不需要建，只要能记下「外发件回厂了什么、回了多少」。
-- 于是「单头 + 明细 + 回货流水」三层结构塌缩为**一张流水表**：
--
--   t_outsource_doc / t_outsource_item / t_outsource_return  →  t_outsource_part
--
-- 一行 = 一次回厂。没有单据号（不采番，同装配批次属轻量记账行）、没有状态列
-- （记录存在即已回厂）、不登记计划回厂时间（业务不跟踪在外面的货）。
--
-- 幂等：删表用 IF EXISTS、建表用 IF NOT EXISTS、删权限行天然幂等。

-- ===================== 安全闸门 =====================
-- 三张旧表任一有数据 = 这套流程正在被真实使用，改结构前须人工确认。
-- 制造一个"表名即提示语"的报错来中止整条流程（普通脚本里不能用 SIGNAL）。
-- 表可能已被上一次执行删掉（幂等重跑），故先判表存在再数行数。
SET @cnt_doc := IFNULL((SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_doc'), 0);
SET @s := IF(@cnt_doc = 1,
  'SELECT COUNT(*) INTO @n_doc FROM t_outsource_doc', 'SELECT 0 INTO @n_doc');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cnt_ret := IFNULL((SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 't_outsource_return'), 0);
SET @s := IF(@cnt_ret = 1,
  'SELECT COUNT(*) INTO @n_ret FROM t_outsource_return', 'SELECT 0 INTO @n_ret');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF(@n_doc + @n_ret > 0,
  'SELECT * FROM `中止：旧外发表仍有数据，请先人工确认再执行本迁移`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== 删旧表 =====================
-- 顺序：先删挂在明细上的回货流水，再删明细，最后删单头（无外键，顺序仅为可读性）
DROP TABLE IF EXISTS t_outsource_return;
DROP TABLE IF EXISTS t_outsource_item;
DROP TABLE IF EXISTS t_outsource_doc;

-- ===================== 建新表 =====================
-- 列定义与 01-schema.sql 逐字一致（全新安装走 db:init，存量库走本迁移，两条路必须同构）
CREATE TABLE IF NOT EXISTS t_outsource_part (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  order_id            INT           NOT NULL COMMENT '冗余订单ID（订单下游引用探测按此列）',
  order_product_id    INT           NOT NULL COMMENT '冗余订单产品行ID',
  order_part_group_id INT           NOT NULL COMMENT '锚点：订单部件组（跟踪/台账粒度）',
  order_no            VARCHAR(32)   NULL COMMENT '订单号快照',
  customer_name       VARCHAR(128)  NULL COMMENT '客户名称快照',
  production_no       VARCHAR(64)   NULL COMMENT '生产单号快照（自订单 t_order.production_no）',
  product_model       VARCHAR(128)  NULL COMMENT '产品型号快照（自部件组 = 货号+产品类型组合+组后缀，如 45#缓冲外中轨）',
  dimension_text      VARCHAR(64)   NULL COMMENT '规格展示快照（如 350mm）',
  cycle_code          VARCHAR(64)   NULL COMMENT '周期码快照（自部件行追溯码）',
  order_qty           INT           NOT NULL DEFAULT 0 COMMENT '订单数量快照（产品行原始录入口径，配合 unit 看）',
  unit                VARCHAR(16)   NULL COMMENT '订单单位快照：set套 piece支（1套=2支）',
  drawing_no          VARCHAR(128)  NULL COMMENT '生产图号快照（自部件组）',
  material_thickness  VARCHAR(32)   NULL COMMENT '材料厚度快照（自部件组）',
  processor_name      VARCHAR(128)  NOT NULL COMMENT '加工商（外协厂）',
  surface_type        VARCHAR(32)   NULL COMMENT '表面处理（字典 surface_type）：自订单带出，可改；保留值 none 不外发',
  color               VARCHAR(64)   NULL COMMENT '颜色：自订单带出，可改',
  back_date           DATE          NOT NULL COMMENT '实际回厂日期（必填——记录存在即代表已回厂）',
  return_weight       DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '回厂重量（kg）',
  unit_weight         DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '单重（kg/支）：默认自部件信息 t_material.unit_weight 带出，可改',
  return_qty          INT           NOT NULL DEFAULT 0 COMMENT '回厂数量（支）= 回厂重量 ÷ 单重 四舍五入，允许人工微调',
  remark              VARCHAR(255)  NULL COMMENT '备注',
  creator_id          INT           NULL COMMENT '创建人ID',
  creator_name        VARCHAR(64)   NULL COMMENT '创建人姓名快照',
  updated_by          INT           NULL COMMENT '最后更新人ID',
  updater_name        VARCHAR(64)   NULL COMMENT '最后更新人姓名快照',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_order (order_id),
  KEY idx_part_group (order_part_group_id),
  KEY idx_processor (processor_name),
  KEY idx_back_date (back_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='外发件回厂记录（一行=一次回厂；无单据号、无状态）';

-- ===================== 清理已下线的权限点 =====================
-- 发坯单没了，登记发出/回货登记/撤销回货/关闭/作废/打印一并下线；
-- 清单同步只增不删，残留行会在菜单与权限树里多出点了必 404 的条目。
DELETE rp FROM t_role_permission rp
JOIN t_permission p ON p.id = rp.permission_id
WHERE p.perm_code IN (
  'outsource:send', 'outsource:return', 'outsource:return-cancel',
  'outsource:close', 'outsource:cancel', 'outsource:print'
);
DELETE FROM t_permission WHERE perm_code IN (
  'outsource:send', 'outsource:return', 'outsource:return-cancel',
  'outsource:close', 'outsource:cancel', 'outsource:print'
);

-- ===================== 清理发坯单号序列 =====================
-- BLANK_NO 是发坯单号的采番键；单号随发坯单一并取消，留着这行会让人以为还在用。
DELETE FROM t_no_sequence WHERE seq_key = 'BLANK_NO';
