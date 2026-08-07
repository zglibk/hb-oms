-- M5 部件台账建表（设计文档 §4.6）：属性锚定的独立参考台账 + 变动流水
-- V1 定位：仅「期初 + 手工调整留痕」，**不与外发/成品单据联动**（§2.1，无报工则无采集点）
-- 幂等 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS t_part_balance (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  part_type          VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '部件：outer外轨 middle中轨 inner内轨',
  side               VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '边别：left左 right右，非卡口空串',
  item_no            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '货号（如 53#）。注意：与 hb-mes 用物料代码不同，本项目按业务习惯改用货号',
  rail_section       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '轨道节数：two_section二节轨 three_section三节轨',
  product_type       VARCHAR(128) NOT NULL DEFAULT '' COMMENT '产品类型多选组合串（字典序逗号拼接，与产品行同一规范化口径）',
  material_thickness VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '料厚（如 1.2×1.0×1.2 或单值 1.5）',
  dimension_mm       INT          NOT NULL DEFAULT 0 COMMENT '规格（mm 统一口径，1英寸=25mm）',
  quantity           INT          NOT NULL DEFAULT 0 COMMENT '台账余量（支）；只由期初录入与手工调整驱动，且每次变动必写 t_part_adjust 流水',
  remark             VARCHAR(255) NULL COMMENT '备注',
  creator_id         INT          NULL COMMENT '创建人ID',
  creator_name       VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by         INT          NULL COMMENT '最后更新人ID',
  updater_name       VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 7 维唯一键：全部 NOT NULL DEFAULT ''/0 兜底，规避 MySQL 唯一键多 NULL 不去重
  UNIQUE KEY uk_part_7dim (part_type, side, item_no, rail_section, product_type, material_thickness, dimension_mm),
  KEY idx_item_no (item_no),
  KEY idx_part_type (part_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部件台账余量（7 维属性锚定；V1 为独立参考台账，不与单据联动）';

CREATE TABLE IF NOT EXISTS t_part_adjust (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  balance_id         INT          NOT NULL DEFAULT 0 COMMENT '对应余量行ID（便于按行下钻流水）',
  part_type          VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '部件快照：outer外轨 middle中轨 inner内轨',
  side               VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '边别快照：left左 right右，非卡口空串',
  item_no            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '货号快照',
  rail_section       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '轨道节数快照',
  product_type       VARCHAR(128) NOT NULL DEFAULT '' COMMENT '产品类型组合串快照',
  material_thickness VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '料厚快照',
  dimension_mm       INT          NOT NULL DEFAULT 0 COMMENT '规格 mm 快照',
  source             VARCHAR(16)  NOT NULL DEFAULT 'manual' COMMENT '变动来源：opening期初录入 manual手工调整',
  delta              INT          NOT NULL DEFAULT 0 COMMENT '调整量（支）：正为增、负为减',
  quantity_after     INT          NOT NULL DEFAULT 0 COMMENT '本次调整后的余量（支），便于逐笔追溯不必重算',
  reason             VARCHAR(255) NOT NULL COMMENT '调整原因（必填，如盘盈盘亏/录错纠正/期初补录）',
  creator_id         INT          NULL COMMENT '操作人ID',
  creator_name       VARCHAR(64)  NULL COMMENT '操作人姓名快照',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_balance (balance_id),
  KEY idx_item_no (item_no),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部件台账变动流水（期初录入与手工调整共用；余量每次变动必留痕，禁止直接改数）';
