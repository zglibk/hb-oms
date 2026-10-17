-- 独立通知公告：正文、按人接收/首次查看、不可变追加回复。
-- 三张表均以 IF NOT EXISTS 建立，可重复执行；权限点由 permission-manifest.ts 启动同步。

CREATE TABLE IF NOT EXISTS t_announcement (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(128) NOT NULL COMMENT '公告标题',
  summary         VARCHAR(255) NOT NULL COMMENT '公告摘要',
  content         TEXT         NOT NULL COMMENT '纯文本正文',
  level           VARCHAR(16)  NOT NULL DEFAULT 'normal' COMMENT '级别：normal普通 important重要 urgent紧急',
  requires_reply  TINYINT      NOT NULL DEFAULT 0 COMMENT '是否要求回复：1是 0否',
  status          VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT '状态：draft草稿 published已发布 withdrawn已撤回',
  publish_at      DATETIME     NOT NULL COMMENT '计划发布时间',
  expire_at       DATETIME     NULL COMMENT '失效时间；NULL为永久有效',
  activated_at    DATETIME     NULL COMMENT '实际激活并生成首批接收人的时间',
  creator_id      INT          NULL COMMENT '创建人ID',
  creator_name    VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by      INT          NULL COMMENT '最后更新人ID',
  updater_name    VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_announcement_status_publish (status, publish_at),
  KEY idx_announcement_activated (activated_at),
  KEY idx_announcement_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知公告正文';

CREATE TABLE IF NOT EXISTS t_announcement_recipient (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT          NOT NULL COMMENT '公告ID',
  user_id          INT          NOT NULL COMMENT '接收用户ID',
  viewed_at        DATETIME     NULL COMMENT '首次查看时间',
  completed_at     DATETIME     NULL COMMENT '完成时间：普通公告已读或要求回复公告首次回复',
  view_username    VARCHAR(64)  NULL COMMENT '首次查看时账号快照',
  view_real_name   VARCHAR(64)  NULL COMMENT '首次查看时人员姓名快照',
  view_dept_name   VARCHAR(128) NULL COMMENT '首次查看时部门名称快照',
  view_role_names  VARCHAR(512) NULL COMMENT '首次查看时角色名称快照（多角色用顿号连接）',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '接收时间',
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_announcement_recipient (announcement_id, user_id),
  KEY idx_announcement_recipient_user (user_id, completed_at),
  KEY idx_announcement_recipient_announcement (announcement_id, viewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知公告按人接收及首次查看簿记（系统生成，豁免人工审计六件套）';

CREATE TABLE IF NOT EXISTS t_announcement_reply (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT          NOT NULL COMMENT '公告ID',
  recipient_id    INT          NOT NULL COMMENT '接收记录ID',
  user_id          INT          NOT NULL COMMENT '回复用户ID',
  username         VARCHAR(64)  NOT NULL COMMENT '回复时账号快照',
  real_name        VARCHAR(64)  NOT NULL COMMENT '回复时人员姓名快照',
  dept_name        VARCHAR(128) NULL COMMENT '回复时部门名称快照',
  role_names       VARCHAR(512) NULL COMMENT '回复时角色名称快照（多角色用顿号连接）',
  scope            VARCHAR(16)  NOT NULL DEFAULT 'public' COMMENT '回复范围：public公开 private非公开',
  content          TEXT         NOT NULL COMMENT '回复内容（提交后不可修改或删除）',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '回复时间',
  KEY idx_announcement_reply_announcement (announcement_id, created_at),
  KEY idx_announcement_reply_user (user_id, created_at),
  KEY idx_announcement_reply_recipient (recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知公告不可变追加回复（流水表，豁免更新审计字段）';
