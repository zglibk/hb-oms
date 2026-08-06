-- M3.5 装配批次建表（设计文档 §3.4 / §4.4）：按订单部件组 + 边别录多批装配
-- 「实际完成时间已填」即视为该批完成，其数量参与成品入库闸门（§4.5 / §7.13~7.15）
-- 轻量记账行，不采番、无单据号（§4.7）；幂等 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS t_assembly_batch (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  order_id            INT          NOT NULL COMMENT '冗余订单ID（订单下游引用探测按此列）',
  order_product_id    INT          NOT NULL COMMENT '冗余订单产品行ID',
  order_part_group_id INT          NOT NULL COMMENT '锚点：订单部件组（跟踪/台账粒度）',
  side                VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '边别：含卡口组合 left左 right右，其余空串；入库闸门按 side 分别核算，左右不串量',
  workshop            VARCHAR(32)  NULL COMMENT '装配车间（字典 assembly_workshop：装一~装八）；默认继承产品行 assembly_workshop，可覆写为实际装配车间',
  plan_date           DATE         NULL COMMENT '计划完成时间（计划员录入）',
  actual_date         DATE         NULL COMMENT '实际完成时间：NULL=计划中，非空=已完成（该批数量计入可入库量）',
  qty                 INT          NOT NULL DEFAULT 0 COMMENT '装配数量（支）',
  status              TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1计划中 2已完成；派生自 actual_date（共享包 deriveAssemblyStatus 唯一赋值），落库值须与 actual_date 保持一致',
  order_no            VARCHAR(32)  NULL COMMENT '订单号快照',
  customer_name       VARCHAR(128) NULL COMMENT '客户名称快照',
  production_no       VARCHAR(64)  NULL COMMENT '生产单号快照（自产品行；台账「订单编号」口径）',
  product_model       VARCHAR(128) NULL COMMENT '产品型号快照（自部件组 = 货号+产品类型组合+组后缀，如 45#缓冲外中轨）',
  dimension_text      VARCHAR(64)  NULL COMMENT '规格展示快照（如 350mm）',
  remark              VARCHAR(255) NULL COMMENT '备注',
  creator_id          INT          NULL COMMENT '创建人ID',
  creator_name        VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by          INT          NULL COMMENT '最后更新人ID',
  updater_name        VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_group_side (order_part_group_id, side),
  KEY idx_order (order_id),
  KEY idx_product (order_product_id),
  KEY idx_status (status),
  KEY idx_plan_date (plan_date),
  KEY idx_actual_date (actual_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='装配批次（锚定订单部件组+边别，一组可多批；已完成批次数量参与成品入库闸门）';
