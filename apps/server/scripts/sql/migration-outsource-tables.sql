-- M3 外发（发坯单）建表（设计文档 §4.3）：单头 → 发出明细 → 回货登记
-- 明细锚定订单部件组（t_order_part_group）；幂等 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS t_outsource_doc (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  blank_no          VARCHAR(16)  NOT NULL COMMENT '发坯单号：7位定长纯数字全局序号（generatePaddedSequence 采番），展示层拼 No. 前缀',
  processor_name    VARCHAR(128) NOT NULL COMMENT '加工商（外协厂）',
  surface_type      VARCHAR(32)  NOT NULL COMMENT '表面处理（字典 surface_type）：seal_paint封漆 electrophoresis电泳 spray喷涂 smooth_paint平滑漆…；保留值 none 不可外发',
  color             VARCHAR(64)  NULL COMMENT '颜色',
  plan_send_date    DATE         NULL COMMENT '计划发外日期',
  actual_send_date  DATE         NULL COMMENT '实际发外日期（登记后状态推进为 2已发出）',
  require_back_date DATE         NULL COMMENT '要求回货日期',
  status            TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1待发出 2已发出 3部分回货 4已回齐 9已作废',
  close_reason      VARCHAR(255) NULL COMMENT '手工关闭原因（3部分回货 → 4已回齐 时必填，尾数不回/损耗核销场景）',
  remark            TEXT         NULL COMMENT '备注',
  creator_id        INT          NULL COMMENT '创建人ID',
  creator_name      VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by        INT          NULL COMMENT '最后更新人ID',
  updater_name      VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_blank_no (blank_no),
  KEY idx_status (status),
  KEY idx_processor (processor_name),
  KEY idx_plan_send_date (plan_send_date),
  KEY idx_actual_send_date (actual_send_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='外发（发坯）单头';

CREATE TABLE IF NOT EXISTS t_outsource_item (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  doc_id              INT           NOT NULL COMMENT '所属发坯单',
  order_id            INT           NOT NULL COMMENT '冗余订单ID（订单下游引用探测按此列）',
  order_product_id    INT           NOT NULL COMMENT '冗余订单产品行ID',
  order_part_group_id INT           NOT NULL COMMENT '锚点：订单部件组（跟踪/台账粒度）',
  order_no            VARCHAR(32)   NULL COMMENT '订单号快照',
  customer_name       VARCHAR(128)  NULL COMMENT '客户名称快照',
  production_no       VARCHAR(64)   NULL COMMENT '生产单号快照（自产品行）',
  product_model       VARCHAR(128)  NULL COMMENT '产品型号快照（自部件组 = 货号+产品类型组合+组后缀，如 45#缓冲外中轨）',
  dimension_text      VARCHAR(64)   NULL COMMENT '规格展示快照（如 350mm）',
  cycle_code          VARCHAR(64)   NULL COMMENT '周期码快照（自部件行追溯码）',
  send_weight         DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '发出重量（kg）',
  unit_weight         DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '单重（kg/支），默认自部件信息带出，可改',
  send_qty            INT           NOT NULL DEFAULT 0 COMMENT '发出数量（支）= 发出重量 ÷ 单重 四舍五入，允许人工微调',
  returned_qty        INT           NOT NULL DEFAULT 0 COMMENT '累计回货数量（支）：由回货登记汇总维护，允许超过发出数（重量折算误差）',
  remark              VARCHAR(255)  NULL COMMENT '备注',
  sort                INT           NOT NULL DEFAULT 0 COMMENT '行序',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_doc (doc_id),
  KEY idx_order (order_id),
  KEY idx_part_group (order_part_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='外发发出明细（锚定订单部件组）';

CREATE TABLE IF NOT EXISTS t_outsource_return (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  doc_id         INT           NOT NULL COMMENT '冗余发坯单ID',
  item_id        INT           NOT NULL COMMENT '所属发出明细行（一行可多条 = 分批回货）',
  back_date      DATE          NOT NULL COMMENT '回货日期',
  return_weight  DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '收回重量（kg）',
  unit_weight    DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '单重（kg/支），默认带出发出行单重，可改',
  return_qty     INT           NOT NULL DEFAULT 0 COMMENT '收回数量（支）= 收回重量 ÷ 单重 四舍五入，允许人工微调',
  remark         VARCHAR(255)  NULL COMMENT '备注',
  creator_id     INT           NULL COMMENT '创建人ID',
  creator_name   VARCHAR(64)   NULL COMMENT '创建人姓名快照',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doc (doc_id),
  KEY idx_item (item_id),
  KEY idx_back_date (back_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='外发回货登记（一发出明细行可多条，支持分批回货与撤销）';
