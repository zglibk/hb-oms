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
  mold_no_outer         VARCHAR(64)  NULL COMMENT '模具编号-外轨',
  mold_no_middle        VARCHAR(64)  NULL COMMENT '模具编号-中轨',
  mold_no_inner         VARCHAR(64)  NULL COMMENT '模具编号-内轨',
  process_update_note   TEXT         NULL COMMENT '工艺更新说明',
  process_update_images VARCHAR(512) NULL COMMENT '工艺更新附图（多图URL JSON数组）',
  billing_note          VARCHAR(255) NULL COMMENT '开单注明（产品级）',
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

SET FOREIGN_KEY_CHECKS = 1;
