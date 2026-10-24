-- 送货单自动分页尽量填满纸面 —— 2026-10-24
-- 内置送货单纸型最初把 rowsPerPage 设为 6/7；自动分页虽然已经按真实纸面高度测量，
-- 仍会先被这个配置上限截断，导致连续纸每页固定只打 6 行、下半页大量留白。
-- 本迁移只把两套内置送货单纸型仍保持初始自动分页上限的配置提升为 50，
-- 实际每页行数继续由纸面可用高度和真实折行高度决定；管理员主动修改过的值不覆盖。
-- 发布版本是不可变快照：复制当前发布配置为新版本并切换发布指针，不 UPDATE 历史 config_json。
-- 只生效一次：以本迁移署名的发布版本为标记，之后管理员手工调整不会被重复迁移覆盖。

DROP TEMPORARY TABLE IF EXISTS tmp_delivery_auto_fill;
CREATE TEMPORARY TABLE tmp_delivery_auto_fill (
  profile_id          INT PRIMARY KEY,
  source_version_id   INT NOT NULL,
  next_version_no     INT NOT NULL,
  published_legacy    TINYINT NOT NULL,
  draft_legacy        TINYINT NOT NULL
);

INSERT INTO tmp_delivery_auto_fill (
  profile_id, source_version_id, next_version_no, published_legacy, draft_legacy
)
SELECT t.id, t.version_id, t.next_version_no, t.published_legacy, t.draft_legacy
FROM (
  SELECT
    p.id,
    v.id AS version_id,
    (SELECT MAX(x.version_no) + 1 FROM t_print_profile_version x WHERE x.profile_id = p.id) AS next_version_no,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(v.config_json, '$.mode')) = 'blank'
      AND JSON_UNQUOTE(JSON_EXTRACT(v.config_json, '$.pagination.strategy')) = 'auto'
      AND JSON_EXTRACT(v.config_json, '$.pagination.rowsPerPage') = CASE
        WHEN p.name = '21.8×14cm 针式打印纸' THEN 6
        WHEN p.name = 'A5 打字纸（横向）' THEN 7
        ELSE -1
      END,
      0
    ) AS published_legacy,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(p.draft_config, '$.mode')) = 'blank'
      AND JSON_UNQUOTE(JSON_EXTRACT(p.draft_config, '$.pagination.strategy')) = 'auto'
      AND JSON_EXTRACT(p.draft_config, '$.pagination.rowsPerPage') = CASE
        WHEN p.name = '21.8×14cm 针式打印纸' THEN 6
        WHEN p.name = 'A5 打字纸（横向）' THEN 7
        ELSE -1
      END,
      0
    ) AS draft_legacy
  FROM t_print_profile p
  JOIN t_print_profile_version v ON v.id = p.published_version_id
  WHERE p.document_type = 'delivery_note'
    AND p.is_builtin = 1
    AND p.name IN ('21.8×14cm 针式打印纸', 'A5 打字纸（横向）')
    AND NOT EXISTS (
      SELECT 1 FROM t_print_profile_version m
      WHERE m.profile_id = p.id AND m.publisher_name = '系统迁移·自动分页填满'
    )
) t
WHERE t.published_legacy = 1 OR t.draft_legacy = 1;

INSERT INTO t_print_profile_version (profile_id, version_no, config_json, publisher_name)
SELECT f.profile_id, f.next_version_no,
       CASE WHEN f.published_legacy = 1
         THEN JSON_SET(v.config_json, '$.pagination.rowsPerPage', 50)
         ELSE v.config_json END,
       '系统迁移·自动分页填满'
FROM tmp_delivery_auto_fill f
JOIN t_print_profile_version v ON v.id = f.source_version_id;

UPDATE t_print_profile p
JOIN tmp_delivery_auto_fill f ON f.profile_id = p.id
JOIN t_print_profile_version nv ON nv.profile_id = f.profile_id AND nv.version_no = f.next_version_no
SET p.published_version_id = nv.id,
    p.draft_config = CASE WHEN f.draft_legacy = 1
      THEN JSON_SET(p.draft_config, '$.pagination.rowsPerPage', 50)
      ELSE p.draft_config END,
    p.updater_name = '系统迁移';

DROP TEMPORARY TABLE tmp_delivery_auto_fill;
