-- M2 订单四级结构建表（设计文档 §4.2）：订单 → 产品行 → 部件组 → 部件行
-- 部件组是跟踪/台账锚点；幂等 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS t_order (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  order_no       VARCHAR(32)  NOT NULL COMMENT '系统单号，ORD 采番',
  po_no          VARCHAR(64)  NULL COMMENT 'PO#（客户单号/合同号）',
  customer_id    INT          NULL COMMENT '客户ID（t_customer，可空支持手输客户）',
  customer_name  VARCHAR(128) NOT NULL COMMENT '客户名称快照',
  order_date     DATE         NOT NULL COMMENT '订单日期',
  salesman       VARCHAR(64)  NULL COMMENT '业务员',
  merchandiser   VARCHAR(64)  NULL COMMENT '跟单员',
  order_source   VARCHAR(32)  NULL COMMENT '下单来源：official_doc官方订单文件 verbal口头 phone电话 social社交软件',
  attachment_ids VARCHAR(512) NULL COMMENT '订单原始文件附件URL（JSON数组）',
  status         TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1进行中 2已完结 9已作废',
  is_opening     TINYINT      NOT NULL DEFAULT 0 COMMENT '期初补录标记：0正常 1期初补录（免非关键必填校验）',
  remark         VARCHAR(255) NULL COMMENT '备注',
  creator_id     INT          NULL COMMENT '创建人ID',
  creator_name   VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by     INT          NULL COMMENT '最后更新人ID',
  updater_name   VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_customer (customer_id),
  KEY idx_status (status),
  KEY idx_order_date (order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表（四级结构第一级）';

CREATE TABLE IF NOT EXISTS t_order_product (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  order_id         INT          NOT NULL COMMENT '所属订单',
  order_type       TINYINT      NOT NULL DEFAULT 1 COMMENT '订单类型：1销售订单 2库存备货',
  is_new_order     TINYINT      NOT NULL DEFAULT 0 COMMENT '是否新单：0否 1是',
  is_export        TINYINT      NOT NULL DEFAULT 0 COMMENT '是否出口：0否 1是',
  export_country   VARCHAR(64)  NULL COMMENT '出口国家',
  material_id      INT          NULL COMMENT '物料主数据ID（可空支持手工行）',
  material_code    VARCHAR(64)  NULL COMMENT '物料代码快照（产品编码）',
  item_no          VARCHAR(64)  NULL COMMENT '货号快照（如 53#）',
  product_name     VARCHAR(128) NULL COMMENT '产品名称',
  product_type     VARCHAR(128) NULL COMMENT '产品类型多选组合（字典序逗号拼接，如 standard,self_lock；含 socket 触发卡口规则）',
  rail_section     VARCHAR(32)  NULL COMMENT '轨道节数：two_section二节轨 three_section三节轨',
  dimension_mm     INT          NULL COMMENT '规格（mm 统一口径，1英寸=25mm）',
  dimension_raw    VARCHAR(32)  NULL COMMENT '规格原始录入值',
  dimension_unit   VARCHAR(8)   NULL COMMENT '规格录入单位：mm / inch',
  surface_type     VARCHAR(32)  NOT NULL DEFAULT 'none' COMMENT '表面处理（字典 surface_type）：none无 seal_paint封漆 electrophoresis电泳 spray喷涂 smooth_paint平滑漆…；none=不外发',
  color            VARCHAR(64)  NULL COMMENT '颜色',
  sheet_material   VARCHAR(64)  NULL COMMENT '材质（如 Q235）',
  order_qty        INT          NOT NULL COMMENT '订单数量（按 unit 计）',
  unit             VARCHAR(16)  NOT NULL DEFAULT 'piece' COMMENT '单位：set套 piece支（仅此两种，1套=2支）',
  qty_pcs          INT          NOT NULL COMMENT '支数口径（服务端计算冗余）：套→×2，支→原值；台账「订单数」',
  production_no    VARCHAR(64)  NULL COMMENT '生产单号（手工填写；对应手工台账「订单编号」如 GLI46212-A；台账默认展示此号）',
  assembly_workshop VARCHAR(32) NULL COMMENT '装配车间（字典 assembly_workshop：assembly_1装一~assembly_8装八）；计划属性，装配批次默认继承可覆写',
  delivery_date    DATE         NULL COMMENT '交货日期',
  delivery_address VARCHAR(255) NULL COMMENT '交货地址',
  remark           VARCHAR(255) NULL COMMENT '备注',
  sort             INT          NOT NULL DEFAULT 0 COMMENT '行序',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_order (order_id),
  KEY idx_production_no (production_no),
  KEY idx_item_no (item_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单产品行（四级结构第二级；图号/版本/料厚下沉部件组）';

CREATE TABLE IF NOT EXISTS t_order_part_group (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  order_id           INT          NOT NULL COMMENT '冗余订单ID（直查用）',
  order_product_id   INT          NOT NULL COMMENT '所属产品行',
  group_type         VARCHAR(32)  NOT NULL DEFAULT 'whole' COMMENT '部件组类型（字典 part_group_type）：whole整品 outer_middle外中轨 inner内轨 outer外轨 middle中轨；同产品行内唯一',
  drawing_no         VARCHAR(128) NULL COMMENT '生产图号（组级；按图号匹配工艺信息自动带入）',
  drawing_version    VARCHAR(32)  NULL COMMENT '版本号（组级，文本型小数如 1.1）',
  material_thickness VARCHAR(32)  NULL COMMENT '料厚（组级）：整品 外×中×内、外中轨 外×中、内轨单值',
  qty_pcs            INT          NOT NULL COMMENT '组支数口径，默认=产品行 qty_pcs',
  product_model      VARCHAR(128) NULL COMMENT '产品型号快照 = 货号+产品类型组合+组后缀（如 45#缓冲外中轨）',
  remark             VARCHAR(255) NULL COMMENT '备注',
  sort               INT          NOT NULL DEFAULT 0 COMMENT '组序',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_product_group (order_product_id, group_type),
  KEY idx_product (order_product_id),
  KEY idx_drawing_no (drawing_no),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单部件组（四级结构第三级——跟踪/台账锚点：外发/装配/出入库/台账行锚定本表）';

CREATE TABLE IF NOT EXISTS t_order_part (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT          NOT NULL COMMENT '冗余订单ID',
  product_id    INT          NOT NULL COMMENT '冗余产品行ID',
  part_group_id INT          NOT NULL COMMENT '所属部件组',
  part_type     VARCHAR(32)  NOT NULL COMMENT '部件：outer外轨 middle中轨 inner内轨',
  side          VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '边别：left左 right右；仅含卡口组合使用，其余空串',
  cycle_code    VARCHAR(64)  NULL COMMENT '产品周期（追溯码）：客户要求压印的追溯日期码，非必填',
  qty           INT          NOT NULL COMMENT '需求数量（支）',
  remark        VARCHAR(255) NULL COMMENT '备注',
  sort          INT          NOT NULL DEFAULT 0 COMMENT '行序',
  KEY idx_group (part_group_id),
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单部件行（四级结构第四级；按组类型+节数+卡口自动展开）';

-- 单位默认值对齐共享包 UNIT 口径（仅 set套 / piece支 两种；幂等 MODIFY，重复执行同定义无害）
ALTER TABLE t_order_product MODIFY COLUMN unit VARCHAR(16) NOT NULL DEFAULT 'piece' COMMENT '单位：set套 piece支（仅此两种，1套=2支）';
