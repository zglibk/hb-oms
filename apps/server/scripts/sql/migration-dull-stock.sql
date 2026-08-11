-- =============================================================
-- 呆滞品管理（2026-08-11 由「成品期初（不挂订单）」拆分独立）
--
-- 背景：原「成品期初（不挂订单）」录的是**已完结订单剩下的成品**，落在
-- t_finished_balance 的纯属性行（order_product_id=0，靠 attr_key 属性指纹唯一）。
-- 但它被塞在「上线期初」这个一次性场景里，业务上其实是一本要长期维护的呆滞品账：
--   1. 只有期初一个写入口——成品出入库单必须挂订单产品行，录进去之后再也动不了；
--   2. 没有客户、生产单号，看不出这批货是谁的、哪张生产单留下来的；
--   3. 属性指纹唯一 ⇒ 同属性只能有一行，而呆滞品是逐批产生的；
--   4. 数量恒为「支」，而车间盘点习惯按「套」报数。
-- 故拆成独立的两张表，原纯属性期初形态前后端一并下线（系统尚未上线，无历史数据需迁移）。
--
-- ⚠️ 本模块是**独立台账**：与订单跟踪台账四数、成品库存完全不联动。
-- =============================================================

CREATE TABLE IF NOT EXISTS t_dull_stock (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  item_no        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '货号（如 53#）',
  customer_name  VARCHAR(128) NOT NULL DEFAULT '' COMMENT '客户名称（纯文本快照，不关联 t_customer；主数据改名不回写，§5.5）',
  production_no  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '生产单号（呆滞品来源，纯文本快照，不校验订单是否存在）',
  product_model  VARCHAR(128) NOT NULL DEFAULT '' COMMENT '产品型号（未填时按 货号+产品类型组合 自动拼，共享包 formatProductModel）',
  product_type   VARCHAR(128) NOT NULL DEFAULT '' COMMENT '产品类型多选组合串（字典序逗号拼接，如 standard,self_lock）',
  rail_section   VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '轨道节数：two_section二节轨 three_section三节轨',
  dimension_mm   INT          NOT NULL DEFAULT 0 COMMENT '规格（mm 统一口径，1英寸=25mm）',
  dimension_text VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '规格展示文本（如 350mm）',
  surface_type   VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '表面处理（字典 surface_type）：none无 seal_paint封漆 electrophoresis电泳 spray喷涂 smooth_paint平滑漆…',
  color          VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '颜色（字典 surface_color，允许手输新值）',
  side           VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '边别：left左 right右，非卡口空串',
  unit           VARCHAR(16)  NOT NULL DEFAULT 'piece' COMMENT '数量单位：set套 piece支；本行四个数量列一律按本单位计，1套=2支；已有流水后不可改',
  opening_qty    INT          NOT NULL DEFAULT 0 COMMENT '期初数：建档时的呆滞存量（单位见 unit）',
  inbound_qty    INT          NOT NULL DEFAULT 0 COMMENT '入库数：累计入库量 = Σ t_dull_stock_flow 入向流水；只由登记出入库驱动，禁止直接改',
  outbound_qty   INT          NOT NULL DEFAULT 0 COMMENT '出库数：累计出库量 = Σ t_dull_stock_flow 出向流水；只由登记出入库驱动，禁止直接改',
  balance_qty    INT          NOT NULL DEFAULT 0 COMMENT '结存数 = 期初数 + 入库数 − 出库数，不得为负',
  remark         VARCHAR(255) NULL COMMENT '备注',
  creator_id     INT          NULL COMMENT '创建人ID',
  creator_name   VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by     INT          NULL COMMENT '最后更新人ID',
  updater_name   VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_item_no (item_no),
  KEY idx_customer (customer_name),
  KEY idx_production_no (production_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='呆滞品档案（独立台账，与订单跟踪台账/成品库存不联动；一行=一批呆滞货，刻意不设属性唯一键）';

CREATE TABLE IF NOT EXISTS t_dull_stock_flow (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  dull_id       INT          NOT NULL COMMENT '所属呆滞品档案行',
  direction     TINYINT      NOT NULL COMMENT '方向：1入库 -1出库（与成品出入库 STOCK_DIRECTION 同口径）',
  quantity      INT          NOT NULL DEFAULT 0 COMMENT '本次数量，恒为正；方向由 direction 表达（单位同档案行 unit）',
  flow_date     DATE         NOT NULL COMMENT '出入库日期',
  reason        VARCHAR(255) NOT NULL COMMENT '原因/用途说明（必填，如退货入库/清库处理/盘盈盘亏）',
  remark        VARCHAR(255) NULL COMMENT '备注',
  creator_id    INT          NULL COMMENT '操作人ID',
  creator_name  VARCHAR(64)  NULL COMMENT '操作人姓名快照',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dull (dull_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='呆滞品出入库流水（只增不改，录错可整条删除并同事务回滚累计数；变动后结存不落库，查询时按 id 正序累计推导）';

-- -------------------------------------------------------------
-- 列注释订正：成品出入库的「不挂订单纯属性行」形态已下线，
-- 相关列注释若不改，下一个人会照旧以为锚点列可以是 0。
-- 只改 COMMENT，列类型与默认值原样保留（MySQL 8.0 为 INSTANT 算法，不重建表）。
-- -------------------------------------------------------------
ALTER TABLE t_finished_item
  MODIFY COLUMN order_id INT NOT NULL DEFAULT 0 COMMENT '冗余订单ID（订单下游引用探测按此列）',
  MODIFY COLUMN order_product_id INT NOT NULL DEFAULT 0 COMMENT '锚点：订单产品行（跟踪/台账粒度）',
  MODIFY COLUMN group_type VARCHAR(32) NULL COMMENT '部件组类型（弃用，恒为 NULL：成品是整套滑轨、无组的概念；原仅「不挂订单的纯属性期初行」使用，该形态已于 2026-08-11 下线）',
  MODIFY COLUMN dimension_mm INT NULL COMMENT '规格快照（mm 统一口径）';

ALTER TABLE t_finished_balance
  MODIFY COLUMN order_id INT NOT NULL DEFAULT 0 COMMENT '冗余订单ID',
  MODIFY COLUMN order_product_id INT NOT NULL DEFAULT 0 COMMENT '锚点：订单产品行（跟踪/台账粒度）',
  MODIFY COLUMN item_no VARCHAR(64) NOT NULL DEFAULT '' COMMENT '货号（属性快照）',
  MODIFY COLUMN group_type VARCHAR(32) NOT NULL DEFAULT '' COMMENT '部件组类型（弃用，恒为空串：原仅纯属性期初行使用，该形态已于 2026-08-11 下线）',
  MODIFY COLUMN attr_key VARCHAR(255) NOT NULL DEFAULT '' COMMENT '预留：恒为空串（原用于「不挂订单的纯属性期初行」，该形态已于 2026-08-11 下线，改由呆滞品管理承载）；仍参与 uk_balance 唯一键';

-- -------------------------------------------------------------
-- 权限点：清单（permission-manifest.ts）才是 SSOT，启动时会 upsert 并校正
-- parent_id / 名称 / 排序。这里先建行，是因为迁移**先于**服务启动执行，
-- 不预建的话下面按 perm_code 授权给角色时一条也匹配不到。
-- uk_perm_code 保证幂等重复执行不报错。
-- -------------------------------------------------------------
INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, menu_path, component, icon, sort, status, access_type, creator_name, updater_name)
VALUES
  ('dull-stock', '呆滞品管理', 1, 0, '/dull-stock', 'dull-stock/index', 'Warning', 3, 1, 1, '系统同步', '系统同步');

INSERT IGNORE INTO t_permission
  (perm_code, perm_name, perm_type, parent_id, sort, status, access_type, creator_name, updater_name)
VALUES
  ('dull-stock:create', '新增呆滞品', 2, 0, 1, 1, 0, '系统同步', '系统同步'),
  ('dull-stock:update', '编辑呆滞品', 2, 0, 2, 1, 0, '系统同步', '系统同步'),
  ('dull-stock:delete', '删除呆滞品', 2, 0, 3, 1, 0, '系统同步', '系统同步'),
  ('dull-stock:stock',  '登记出入库', 2, 0, 4, 1, 0, '系统同步', '系统同步');

-- parent_id 回填（启动期同步服务也会做，此处先做以免迁移与重启之间树是断的）
UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'material-mgmt'
SET c.parent_id = p.id
WHERE c.perm_code = 'dull-stock' AND c.parent_id <> p.id;

UPDATE t_permission c
JOIN t_permission p ON p.perm_code = 'dull-stock'
SET c.parent_id = p.id
WHERE c.perm_code IN ('dull-stock:create', 'dull-stock:update', 'dull-stock:delete', 'dull-stock:stock')
  AND c.parent_id <> p.id;

-- -------------------------------------------------------------
-- 授权：
--   1. 能看「成品库存」的角色 → 能看呆滞品菜单（同为成品口径的查询页）；
--   2. 能录「成品期初」的角色 → 能建档/编辑/删除/登记出入库（原本录不挂订单期初的就是这批人）。
-- admin 由 PermissionSyncService.grantAllToAdmin() 自动补，不在此处理。
-- -------------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id
JOIN t_permission np ON np.perm_code = 'dull-stock'
WHERE op.perm_code = 'stock-balance';

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT rp.role_id, np.id
FROM t_role_permission rp
JOIN t_permission op ON op.id = rp.permission_id
JOIN t_permission np ON np.perm_code IN
  ('dull-stock', 'dull-stock:create', 'dull-stock:update', 'dull-stock:delete', 'dull-stock:stock')
WHERE op.perm_code = 'opening:finished';
