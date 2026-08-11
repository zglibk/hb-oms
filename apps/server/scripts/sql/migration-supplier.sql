-- =============================================================
-- 供应商主数据（基础数据）
--
-- 背景：外发件回厂的「加工商」原本是纯手输文本，同一家厂常被写成多种写法
-- （简称/全称/错别字），既不好统计也不好核对。建一张主数据表供下拉选择。
--
-- ⚠️ 业务流水仍只快照**名称**（t_outsource_part.processor_name），不存 supplier_id：
-- 遵循 §5.5「基础数据变更不回写历史单据」，且下拉允许手输新值，
-- 主数据没来得及维护时不挡录入。故本次不改动 t_outsource_part。
-- =============================================================

CREATE TABLE IF NOT EXISTS t_supplier (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  supplier_code  VARCHAR(64)  NOT NULL COMMENT '供应商编码（唯一）',
  supplier_name  VARCHAR(128) NOT NULL COMMENT '供应商名称（可重复，编码才是唯一业务键）',
  contact_person VARCHAR(64)  NULL COMMENT '联系人',
  contact_phone  VARCHAR(64)  NULL COMMENT '联系电话',
  address        VARCHAR(255) NULL COMMENT '地址',
  sort           INT          NOT NULL DEFAULT 0 COMMENT '排序（越小越靠前，控制下拉顺序）',
  status         TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用（停用后不进下拉，历史记录不受影响）',
  remark         VARCHAR(255) NULL COMMENT '备注',
  creator_id     INT          NULL COMMENT '创建人ID',
  creator_name   VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by     INT          NULL COMMENT '最后更新人ID',
  updater_name   VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_supplier_code (supplier_code),
  KEY idx_supplier_name (supplier_name),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商主数据（基础数据；外发加工商等下拉来源）';

-- -------------------------------------------------------------
-- 权限点：清单（permission-manifest.ts）才是 SSOT，启动时会 upsert 并校正
-- parent_id / 名称 / 排序。这里先建行，是因为迁移**先于**服务启动执行，
-- 不预建的话下面按 perm_code 授权给角色时一条也匹配不到。
-- uk_perm_code 保证幂等重复执行不报错。
-- -------------------------------------------------------------
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, menu_path, component, icon, sort, status, access_type, creator_name, updater_name)
VALUES
  ('basic:supplier', '供应商', 1, 0, '/basic/supplier', 'basic/supplier/index', 'Van', 2, 1, 1, '系统同步', '系统同步');

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('supplier:create', '新增供应商', 2, 0, 1, 1, 0, '系统同步', '系统同步'),
  ('supplier:update', '编辑供应商', 2, 0, 2, 1, 0, '系统同步', '系统同步'),
  ('supplier:delete', '删除供应商', 2, 0, 3, 1, 0, '系统同步', '系统同步');

-- parent_id 回填（启动期同步服务也会做，此处先做以免迁移与重启之间树是断的）
UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic'
SET c.parent_id = p.id
WHERE c.perm_code = 'basic:supplier' AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'basic:supplier'
SET c.parent_id = p.id
WHERE c.perm_code IN ('supplier:create', 'supplier:update', 'supplier:delete') AND c.parent_id <> p.id;

-- -------------------------------------------------------------
-- 授权：凡是能管「客户资料」的角色，同样能管供应商——两者都是基础数据里的
-- 往来单位主数据，维护人是同一批。菜单与按钮逐项对应授予，admin 由
-- PermissionSyncService.grantAllToAdmin() 自动补，不在此处理。
-- -------------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id
JOIN t_permission np ON np.perm_code = CASE op.perm_code
    WHEN 'basic:customer'  THEN 'basic:supplier'
    WHEN 'customer:create' THEN 'supplier:create'
    WHEN 'customer:update' THEN 'supplier:update'
    WHEN 'customer:delete' THEN 'supplier:delete'
  END
WHERE op.perm_code IN ('basic:customer', 'customer:create', 'customer:update', 'customer:delete');
