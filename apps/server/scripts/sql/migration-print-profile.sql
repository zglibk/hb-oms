-- 出入库单针式连续纸与可视化套打配置 —— 2026-10-13
-- 幂等：表使用 IF NOT EXISTS，五个内置纸型按「单据类型+名称」唯一键补齐；
-- A4 入库纸只在首次补入时接替旧默认，后续迁移不会覆盖管理员手工调整的默认纸型。
-- 发布版本是不可变快照：规格修正必须生成新版本，严禁 UPDATE 历史 config_json。

CREATE TABLE IF NOT EXISTS t_print_profile (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL COMMENT '纸型名称',
  document_type        VARCHAR(32)  NOT NULL COMMENT '单据类型：delivery_note/inbound_note',
  status               TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1启用 0停用',
  is_builtin           TINYINT      NOT NULL DEFAULT 0 COMMENT '是否内置回退纸型',
  draft_config         JSON         NOT NULL COMMENT '未发布草稿配置',
  published_version_id INT          NULL COMMENT '当前发布版本ID',
  creator_id           INT          NULL,
  creator_name         VARCHAR(64)  NULL,
  updated_by           INT          NULL,
  updater_name         VARCHAR(64)  NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_print_profile_type_name (document_type, name),
  KEY idx_print_profile_type_status (document_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='针式打印纸型档案';

CREATE TABLE IF NOT EXISTS t_print_profile_version (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  profile_id     INT          NOT NULL,
  version_no     INT          NOT NULL,
  config_json    JSON         NOT NULL,
  publisher_id   INT          NULL,
  publisher_name VARCHAR(64)  NULL,
  published_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_print_profile_version (profile_id, version_no),
  KEY idx_print_profile_version_profile (profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='针式打印纸型发布版本';

CREATE TABLE IF NOT EXISTS t_print_document_setting (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  document_type      VARCHAR(32) NOT NULL,
  default_profile_id INT         NOT NULL,
  updated_by         INT         NULL,
  updater_name       VARCHAR(64) NULL,
  updated_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_print_document_setting_type (document_type),
  KEY idx_print_document_setting_profile (default_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单据全局默认纸型';

SET @continuous_delivery := JSON_OBJECT(
  'schemaVersion',1,'mode','blank',
  'paper',JSON_OBJECT('widthMm',241.3,'heightMm',140,'bodyWidthMm',218,'bodyHeightMm',140,'driverFormName','OMS 9.5x5.5'),
  'margins',JSON_OBJECT('top',5,'right',5,'bottom',5,'left',5),
  'offset',JSON_OBJECT('x',0,'y',0),
  'style',JSON_OBJECT('fontScale',100,'borderWidthPt',0.75),
  'pagination',JSON_OBJECT('strategy','auto','rowsPerPage',6),
  'layout',JSON_OBJECT('snapMm',0.5,'elements',JSON_ARRAY())
);
SET @a5_delivery := JSON_SET(@continuous_delivery, '$.paper.widthMm', 210, '$.paper.heightMm', 148, '$.paper.bodyWidthMm', 210, '$.paper.bodyHeightMm', 148, '$.paper.driverFormName', 'A5', '$.pagination.rowsPerPage', 7);
SET @continuous_inbound := JSON_SET(@continuous_delivery, '$.pagination.rowsPerPage', 7);
SET @a5_inbound := JSON_SET(@continuous_inbound, '$.paper.widthMm', 210, '$.paper.heightMm', 148, '$.paper.bodyWidthMm', 210, '$.paper.bodyHeightMm', 148, '$.paper.driverFormName', 'A5', '$.pagination.rowsPerPage', 8);
SET @a4_inbound := JSON_SET(@continuous_inbound, '$.paper.widthMm', 210, '$.paper.heightMm', 297, '$.paper.bodyWidthMm', 210, '$.paper.bodyHeightMm', 297, '$.paper.driverFormName', 'A4', '$.pagination.rowsPerPage', 24);
SET @a4_inbound_existed := (
  SELECT COUNT(*) FROM t_print_profile
  WHERE document_type = 'inbound_note' AND name = 'A4 打字纸（纵向）'
);

-- 送货单纸型在功能开发期间曾先由界面建立、后又以旧名称写入迁移，导致同一物理纸型出现两份。
-- 若规范名称尚不存在，先把一条旧内置档案原地归一，保留其 ID、默认引用与完整版本历史。
UPDATE t_print_profile p
SET p.name = '21.8×14cm 针式打印纸'
WHERE p.id = (
  SELECT legacy.id FROM (
    SELECT id
    FROM t_print_profile
    WHERE document_type = 'delivery_note' AND is_builtin = 1
      AND name IN ('9.5×5.5 连续纸', '21.8×14cm 连续纸', '21.8×14cm 针式连续纸')
    ORDER BY id
    LIMIT 1
  ) legacy
)
AND NOT EXISTS (
  SELECT 1 FROM (
    SELECT id FROM t_print_profile
    WHERE document_type = 'delivery_note' AND name = '21.8×14cm 针式打印纸'
  ) canonical
);

UPDATE t_print_profile p
SET p.name = 'A5 打字纸（横向）'
WHERE p.id = (
  SELECT legacy.id FROM (
    SELECT id
    FROM t_print_profile
    WHERE document_type = 'delivery_note' AND is_builtin = 1
      AND name IN ('A5 横向', 'A5 打字纸')
    ORDER BY id
    LIMIT 1
  ) legacy
)
AND NOT EXISTS (
  SELECT 1 FROM (
    SELECT id FROM t_print_profile
    WHERE document_type = 'delivery_note' AND name = 'A5 打字纸（横向）'
  ) canonical
);

INSERT IGNORE INTO t_print_profile (name, document_type, status, is_builtin, draft_config, creator_name, updater_name)
VALUES
  ('21.8×14cm 针式打印纸', 'delivery_note', 1, 1, @continuous_delivery, '系统内置', '系统内置'),
  ('A5 打字纸（横向）',    'delivery_note', 1, 1, @a5_delivery,       '系统内置', '系统内置'),
  ('21.8×14cm 连续纸', 'inbound_note',  1, 1, @continuous_inbound, '系统内置', '系统内置'),
  ('A5 横向',       'inbound_note',  1, 1, @a5_inbound,        '系统内置', '系统内置'),
  ('A4 打字纸（纵向）', 'inbound_note', 1, 1, @a4_inbound,        '系统内置', '系统内置');

INSERT IGNORE INTO t_print_profile_version (profile_id, version_no, config_json, publisher_name)
SELECT id, 1, draft_config, '系统内置' FROM t_print_profile WHERE is_builtin = 1;

UPDATE t_print_profile p
JOIN t_print_profile_version v ON v.profile_id = p.id AND v.version_no = 1
SET p.published_version_id = v.id
WHERE p.published_version_id IS NULL AND p.is_builtin = 1;

-- 只清理由旧迁移重复补入、且草稿与当前发布配置均和规范档案完全一致的送货单档案。
-- 有任何人工差异就保留，避免把管理员尚未发布的校准草稿当成重复数据误删。
DROP TEMPORARY TABLE IF EXISTS tmp_duplicate_delivery_profiles;
CREATE TEMPORARY TABLE tmp_duplicate_delivery_profiles (
  source_id INT PRIMARY KEY,
  target_id INT NOT NULL
);

INSERT IGNORE INTO tmp_duplicate_delivery_profiles (source_id, target_id)
SELECT source.id, target.id
FROM t_print_profile source
JOIN t_print_profile target
  ON target.document_type = source.document_type
  AND target.is_builtin = 1
  AND target.name = CASE
    WHEN source.name IN ('9.5×5.5 连续纸', '21.8×14cm 连续纸', '21.8×14cm 针式连续纸')
      THEN '21.8×14cm 针式打印纸'
    WHEN source.name IN ('A5 横向', 'A5 打字纸')
      THEN 'A5 打字纸（横向）'
  END
JOIN t_print_profile_version source_version ON source_version.id = source.published_version_id
JOIN t_print_profile_version target_version ON target_version.id = target.published_version_id
WHERE source.document_type = 'delivery_note'
  AND source.is_builtin = 1
  AND source.name IN (
    '9.5×5.5 连续纸', '21.8×14cm 连续纸', '21.8×14cm 针式连续纸',
    'A5 横向', 'A5 打字纸'
  )
  AND JSON_CONTAINS(source.draft_config, target.draft_config)
  AND JSON_CONTAINS(target.draft_config, source.draft_config)
  AND JSON_CONTAINS(source_version.config_json, target_version.config_json)
  AND JSON_CONTAINS(target_version.config_json, source_version.config_json);

UPDATE t_print_document_setting setting_row
JOIN tmp_duplicate_delivery_profiles duplicate_row
  ON duplicate_row.source_id = setting_row.default_profile_id
SET setting_row.default_profile_id = duplicate_row.target_id,
    setting_row.updater_name = '系统迁移';

DELETE version_row
FROM t_print_profile_version version_row
JOIN tmp_duplicate_delivery_profiles duplicate_row
  ON duplicate_row.source_id = version_row.profile_id;

DELETE profile_row
FROM t_print_profile profile_row
JOIN tmp_duplicate_delivery_profiles duplicate_row
  ON duplicate_row.source_id = profile_row.id;

DROP TEMPORARY TABLE tmp_duplicate_delivery_profiles;

INSERT IGNORE INTO t_print_document_setting (document_type, default_profile_id, updater_name)
SELECT document_type, id, '系统内置'
FROM t_print_profile
WHERE is_builtin = 1 AND (
  (document_type = 'delivery_note' AND name = '21.8×14cm 针式打印纸')
  OR (document_type = 'inbound_note' AND name = '21.8×14cm 连续纸')
);

-- 已部署系统首次出现 A4 入库纸时切换默认；以「纸型此前是否存在」作一次性标记，
-- 避免今后重复执行 db:migrate 时覆盖管理员在界面中重新选择的默认纸型。
UPDATE t_print_document_setting s
JOIN t_print_profile p
  ON p.document_type = 'inbound_note' AND p.name = 'A4 打字纸（纵向）' AND p.is_builtin = 1
SET s.default_profile_id = p.id, s.updater_name = '系统内置'
WHERE s.document_type = 'inbound_note' AND @a4_inbound_existed = 0;
