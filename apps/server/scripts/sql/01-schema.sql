-- =============================================================
-- 海宝五金订单跟踪系统（hb-oms）数据库建表脚本
-- MySQL 8.0+ / InnoDB / utf8mb4
-- 字段与状态枚举严格对齐《订单跟踪系统(hb-oms)设计文档》第4章
-- =============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================
-- 一、系统管理 / RBAC 权限相关表
-- =============================================================

-- 部门表
CREATE TABLE IF NOT EXISTS t_department (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  dept_code   VARCHAR(64)  NOT NULL COMMENT '部门编码',
  dept_name   VARCHAR(64)  NOT NULL COMMENT '部门名称',
  parent_id   INT          NOT NULL DEFAULT 0 COMMENT '上级部门ID，0=顶级',
  sort        INT          NOT NULL DEFAULT 0 COMMENT '排序号',
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dept_code (dept_code),
  KEY idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

-- 账号表
CREATE TABLE IF NOT EXISTS t_user (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL COMMENT '登录账号',
  password        VARCHAR(128) NOT NULL COMMENT 'bcrypt 哈希(saltRounds=12)',
  real_name       VARCHAR(64)  NOT NULL COMMENT '真实姓名',
  gender          TINYINT      NOT NULL DEFAULT 0 COMMENT '性别：0未知 1男 2女',
  dept_id         INT          NULL COMMENT '所属部门ID',
  phone           VARCHAR(32)  NULL COMMENT '联系电话',
  status          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  login_fail_count TINYINT     NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
  locked_until    DATETIME     NULL COMMENT '锁定截止时间，超过该时间自动解锁',
  must_change_pwd TINYINT      NOT NULL DEFAULT 0 COMMENT '首次登录强制改密：1是 0否',
  last_login_at   DATETIME     NULL COMMENT '最后登录时间',
  token_invalid_before DATETIME(3) NULL COMMENT '会话撤销水位线：签发时间早于此刻的 token 一律失效',
  remark          VARCHAR(255) NULL,
  avatar          VARCHAR(255) NULL COMMENT '头像URL',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username),
  KEY idx_dept (dept_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号表';

-- 角色表（扩展 RBAC + data_scope）
CREATE TABLE IF NOT EXISTS t_role (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  role_code   VARCHAR(64)  NOT NULL COMMENT '角色编码，如 planner、dept_manager_plan',
  role_name   VARCHAR(64)  NOT NULL COMMENT '角色名称',
  data_scope  TINYINT      NOT NULL DEFAULT 4 COMMENT '数据范围：1全部 2本部门 3本部门及下级 4本人 5自定义',
  is_builtin  TINYINT      NOT NULL DEFAULT 0 COMMENT '是否内置：1内置(不可删除) 0自定义',
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  sort        INT          NOT NULL DEFAULT 0,
  remark      VARCHAR(255) NULL COMMENT '角色描述',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_code (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 权限表（菜单/按钮/接口三类，perm_type 区分）
CREATE TABLE IF NOT EXISTS t_permission (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  perm_code   VARCHAR(128) NOT NULL COMMENT '权限标识，如 order:create、plan:review:level1',
  perm_name   VARCHAR(64)  NOT NULL COMMENT '权限名称',
  perm_type   TINYINT      NOT NULL COMMENT '权限类型：1菜单 2按钮 3接口',
  parent_id   INT          NOT NULL DEFAULT 0 COMMENT '父权限ID，构建权限树',
  menu_path   VARCHAR(128) NULL COMMENT '菜单类型的前端路由路径',
  component   VARCHAR(128) NULL COMMENT '菜单类型的前端组件路径',
  api_pattern VARCHAR(128) NULL COMMENT '接口类型的请求路径模式，如 POST /api/order',
  icon        VARCHAR(64)  NULL COMMENT '菜单图标',
  sort        INT          NOT NULL DEFAULT 0,
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_perm_code (perm_code),
  KEY idx_parent (parent_id),
  KEY idx_type (perm_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表(菜单/按钮/接口)';

-- 用户-角色关联表（多对多）
CREATE TABLE IF NOT EXISTS t_user_role (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  user_id  INT NOT NULL,
  role_id  INT NOT NULL,
  UNIQUE KEY uk_user_role (user_id, role_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联表';

-- 角色-权限关联表（多对多）
CREATE TABLE IF NOT EXISTS t_role_permission (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  role_id       INT NOT NULL,
  permission_id INT NOT NULL,
  UNIQUE KEY uk_role_perm (role_id, permission_id),
  KEY idx_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限关联表';

-- 角色-部门关联表（data_scope=5 自定义时使用）
CREATE TABLE IF NOT EXISTS t_role_dept (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  role_id  INT NOT NULL,
  dept_id  INT NOT NULL,
  UNIQUE KEY uk_role_dept (role_id, dept_id),
  KEY idx_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-部门关联表';

-- 数据字典表
CREATE TABLE IF NOT EXISTS t_dict (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  dict_type   VARCHAR(64)  NOT NULL COMMENT '字典类型，如 surface_type、exception_type',
  dict_label  VARCHAR(64)  NOT NULL COMMENT '字典标签(显示值)',
  dict_value  VARCHAR(64)  NOT NULL COMMENT '字典键值',
  sort        INT          NOT NULL DEFAULT 0,
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  remark      VARCHAR(255) NULL,
  parent_value VARCHAR(64) NULL COMMENT '上级字典值（级联用，如产线归属车间的 dict_value）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_type (dict_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据字典表';

-- 操作日志表
CREATE TABLE IF NOT EXISTS t_operation_log (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT          NULL COMMENT '操作人ID',
  user_name    VARCHAR(64)  NULL COMMENT '操作人姓名(冗余)',
  module       VARCHAR(64)  NULL COMMENT '业务模块',
  action       VARCHAR(64)  NULL COMMENT '操作动作',
  description  VARCHAR(255) NULL COMMENT '操作描述',
  method       VARCHAR(16)  NULL COMMENT 'HTTP方法',
  url          VARCHAR(255) NULL COMMENT '请求URL',
  ip           VARCHAR(64)  NULL COMMENT '请求IP',
  params       TEXT         NULL COMMENT '请求参数(脱敏)',
  biz_type     VARCHAR(32)  NULL COMMENT '关联业务类型：order/plan/material/auth 等',
  biz_id       INT          NULL COMMENT '关联业务对象ID',
  result       TINYINT      NULL COMMENT '结果：1成功 0失败',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_created (created_at),
  KEY idx_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';

-- 系统更新日志表
CREATE TABLE IF NOT EXISTS t_file (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  file_no       VARCHAR(32)  NOT NULL COMMENT '文件编号 FILEyymmdd-XXXX',
  biz_type      VARCHAR(32)  NULL COMMENT '业务类型 order_front_mark/order_side_mark/order_attachment/editor_image',
  biz_id        INT          NULL COMMENT '关联业务记录ID',
  file_path     VARCHAR(512) NOT NULL COMMENT '相对路径 uploads/2026/06/30/uuid.jpg',
  original_name VARCHAR(255) NULL COMMENT '原始文件名',
  file_size     INT          NULL COMMENT '文件大小(字节)',
  mime_type     VARCHAR(64)  NULL COMMENT 'MIME类型',
  creator_id    INT          NULL COMMENT '上传人ID',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_file_no (file_no),
  KEY idx_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件附件表';

-- 物料档案表（首期基础，二期完善）
CREATE TABLE IF NOT EXISTS t_material (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  material_code VARCHAR(64)  NOT NULL COMMENT '物料编号',
  item_no       VARCHAR(64)  NULL COMMENT '货号',
  product_name  VARCHAR(128) NULL COMMENT '产品名称',
  material_name VARCHAR(128) NULL COMMENT '物料名称(遗留字段，二期将废弃)',
  spec          VARCHAR(128) NULL COMMENT '规格',
  product_type  VARCHAR(32)  NULL COMMENT '产品类型：standard普通款 buffer缓冲款 socket卡口等',
  rail_section  VARCHAR(32)  NULL COMMENT '默认产品类别：two_section二节轨 three_section三节轨',
  part_type     VARCHAR(32)  NULL COMMENT '部件：outer_rail外轨 middle_rail中轨 inner_rail内轨',
  drawing_no    VARCHAR(64)  NULL COMMENT '图号',
  unit          VARCHAR(16)  NULL COMMENT '单位',
  safety_stock  DECIMAL(14,2) NULL COMMENT '安全库存(预留)',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  remark        VARCHAR(255) NULL,
  creator_id    INT          NULL COMMENT '创建人ID',
  creator_name  VARCHAR(64)  NULL COMMENT '创建人姓名快照(审计)',
  updated_by    INT          NULL COMMENT '最后更新人ID(审计)',
  updater_name  VARCHAR(64)  NULL COMMENT '最后更新人姓名快照(审计)',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  UNIQUE KEY uk_material_code (material_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料档案表';

-- 系统配置表（单行表，id 固定为 1）
CREATE TABLE IF NOT EXISTS t_no_sequence (
  seq_key  VARCHAR(64) NOT NULL COMMENT '序列键，如 ORD:20260630',
  seq_val  INT         NOT NULL DEFAULT 0 COMMENT '当前序号',
  PRIMARY KEY (seq_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单号采番序列表';

-- =============================================================
-- 三、M2 订单四级结构（订单 → 产品行 → 部件组 → 部件行）
-- =============================================================

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

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================

-- =============================================================
-- 二、基础数据：客户资料 / 工艺信息
-- =============================================================

-- 客户资料（设计文档 §4.1.1）
CREATE TABLE IF NOT EXISTS t_customer (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  customer_code    VARCHAR(64)  NOT NULL COMMENT '客户代码（唯一）',
  customer_name    VARCHAR(128) NOT NULL COMMENT '客户名称（可重复，一名多码）',
  contact_person   VARCHAR(64)  NULL COMMENT '联系人',
  contact_phone    VARCHAR(64)  NULL COMMENT '联系电话',
  salesman         VARCHAR(64)  NULL COMMENT '默认业务员',
  merchandiser     VARCHAR(64)  NULL COMMENT '默认跟单员',
  delivery_address VARCHAR(255) NULL COMMENT '默认交货地址',
  status           TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  remark           VARCHAR(255) NULL COMMENT '备注',
  creator_id       INT          NULL COMMENT '创建人ID',
  creator_name     VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by       INT          NULL COMMENT '最后更新人ID',
  updater_name     VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_customer_code (customer_code),
  KEY idx_customer_name (customer_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户资料';

-- 工艺信息（设计文档 §4.1.3；订单按生产图号匹配自动带入，引用为快照不回写）
CREATE TABLE IF NOT EXISTS t_process_info (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  drawing_no            VARCHAR(128) NOT NULL COMMENT '生产图号（唯一，匹配键）',
  drawing_version       VARCHAR(32)  NULL COMMENT '版本号',
  customer_id           INT          NULL COMMENT '客户ID',
  customer_name         VARCHAR(128) NULL COMMENT '客户名称',
  product_name          VARCHAR(128) NULL COMMENT '产品名称',
  machines              VARCHAR(128) NULL COMMENT '生产机台-薄料/通用（多值逗号存储，如 362,363,364；无厚薄之分时填此列）',
  machines_thick        VARCHAR(128) NULL COMMENT '生产机台-厚料（多值逗号存储，如 82,80,81）',
  length_req_outer      VARCHAR(128) NULL COMMENT '长度要求-外轨',
  length_req_middle     VARCHAR(128) NULL COMMENT '长度要求-中轨',
  length_req_inner      VARCHAR(128) NULL COMMENT '长度要求-内轨',
  special_req_outer     VARCHAR(255) NULL COMMENT '特殊要求-外轨',
  special_req_middle    VARCHAR(255) NULL COMMENT '特殊要求-中轨',
  special_req_inner     VARCHAR(255) NULL COMMENT '特殊要求-内轨',
  billing_note_outer    VARCHAR(255) NULL COMMENT '开单注明-外轨',
  billing_note_middle   VARCHAR(255) NULL COMMENT '开单注明-中轨',
  billing_note_inner    VARCHAR(255) NULL COMMENT '开单注明-内轨',
  mold_no_outer         VARCHAR(64)  NULL COMMENT '模具编号-外轨',
  mold_no_middle        VARCHAR(64)  NULL COMMENT '模具编号-中轨',
  mold_no_inner         VARCHAR(64)  NULL COMMENT '模具编号-内轨',
  process_update_note   TEXT         NULL COMMENT '工艺更新说明',
  process_update_images VARCHAR(512) NULL COMMENT '工艺更新附图（多图URL JSON数组）',
  review_opinion        TEXT         NULL COMMENT '审核意见（产品级，文字）',
  review_images         VARCHAR(512) NULL COMMENT '审核意见截图（多图URL JSON数组，可传领导聊天记录截图）',
  reviewer              VARCHAR(64)  NULL COMMENT '审核人（产品级）',
  review_date           DATE         NULL COMMENT '审核日期（产品级）',
  remark                VARCHAR(255) NULL COMMENT '备注',
  creator_id            INT          NULL COMMENT '创建人ID',
  creator_name          VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by            INT          NULL COMMENT '最后更新人ID',
  updater_name          VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_drawing_no (drawing_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺信息';

-- 工艺信息修改履历（新增/修改，产品级+部件级粒度）
CREATE TABLE IF NOT EXISTS t_process_info_history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  process_info_id INT          NOT NULL COMMENT '工艺记录ID（记录删除时履历级联删除）',
  drawing_no      VARCHAR(128) NOT NULL COMMENT '生产图号快照',
  action          VARCHAR(16)  NOT NULL COMMENT '动作：create新增 update修改 import导入更新',
  changes         TEXT         NULL COMMENT '变更明细 JSON 数组：[{field,label,scope,old,new}]；scope：product产品级/outer外轨/middle中轨/inner内轨',
  operator_id     INT          NULL COMMENT '操作人ID',
  operator_name   VARCHAR(64)  NULL COMMENT '操作人姓名快照',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  KEY idx_process (process_info_id),
  KEY idx_drawing (drawing_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺信息修改履历（新增/修改，产品级+部件级粒度）';

-- =============================================================
-- 四、设备管理
-- =============================================================

-- 设备信息（设备适产记录——机台适合生产的产品/部件及用料）
CREATE TABLE IF NOT EXISTS t_equipment_info (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  machine_no       VARCHAR(32)  NOT NULL COMMENT '机台号（如 89、362）',
  product_model    VARCHAR(128) NULL COMMENT '产品型号（如 45#缓冲滑轨）',
  part_type        VARCHAR(32)  NULL COMMENT '部件（字典 part_type）：outer外轨 middle中轨 inner内轨',
  mechanic         VARCHAR(64)  NULL COMMENT '机修员',
  material_spec    VARCHAR(128) NULL COMMENT '用料规格（如 卷料 65×1.2）',
  drawing_no       VARCHAR(128) NULL COMMENT '图号',
  common_thickness VARCHAR(64)  NULL COMMENT '常用料厚（如 1.2 / 1.2×1.0×1.2）',
  remark           VARCHAR(255) NULL COMMENT '备注',
  creator_id       INT          NULL COMMENT '创建人ID',
  creator_name     VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by       INT          NULL COMMENT '最后更新人ID',
  updater_name     VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_machine_no (machine_no),
  KEY idx_drawing_no (drawing_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备信息（设备适产记录）';

SET FOREIGN_KEY_CHECKS = 1;
