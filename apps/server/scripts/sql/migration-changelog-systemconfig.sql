-- 移植 hb-mes：系统更新日志 + 系统配置（单行表）；不含审批管理表（OMS 无审核流）
-- 幂等 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS t_changelog (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version     VARCHAR(32)  NOT NULL COMMENT '版本号，如 v1.0.0',
  title       VARCHAR(128) NULL COMMENT '版本标题（可选）',
  content     JSON         NOT NULL COMMENT '更新条目数组，每项为字符串',
  released_at DATE         NOT NULL COMMENT '发布日期',
  category    VARCHAR(32)  NULL COMMENT '分类标签文案，如 新功能/问题修复',
  sort        INT          NOT NULL DEFAULT 0 COMMENT '同日版本排序（DESC）',
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_released (released_at, sort),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统更新日志';

CREATE TABLE IF NOT EXISTS t_system_config (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  -- 公司信息
  logo_url                VARCHAR(512) NULL COMMENT 'Logo 相对路径 uploads/...',
  favicon_url             VARCHAR(512) NULL COMMENT '网站图标相对路径（支持 ico/png 等格式）',
  company_name            VARCHAR(128) NULL COMMENT '公司名称',
  system_name             VARCHAR(64)  NULL COMMENT '系统名称',
  contact_phone           VARCHAR(64)  NULL COMMENT '联系电话',
  company_address         VARCHAR(255) NULL COMMENT '公司地址',
  bank_account            VARCHAR(64)  NULL COMMENT '银行账号',
  tax_no                  VARCHAR(64)  NULL COMMENT '税号',
  copyright_info          VARCHAR(255) NULL COMMENT '版权信息',
  -- 登录页背景
  login_bg_url            VARCHAR(512) NULL COMMENT '登录页背景图相对路径',
  login_bg_set_as_default TINYINT      NOT NULL DEFAULT 0 COMMENT '是否设为默认背景：1是 0否',
  -- 元数据
  updated_by              INT          NULL COMMENT '最后更新人ID',
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_singleton (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置表(单行)';
