-- 针式送货单默认字号 115% —— 2026-10-16
-- 用户反馈 EPSON LQ-730KII 实打字偏小。字体缩放已在纸型档案主表单可调（80–160），
-- 本迁移只把「送货单 / 21.8×14cm 针式打印纸」当前发布或草稿仍为 100 的档案调到 115。
-- 发布版本是不可变快照：复制为新版本并切换发布指针，不 UPDATE 历史 config_json。
-- 只生效一次：以本迁移署名的发布版本为标记，已处理过的档案不再处理，之后管理员手工改回也不会被覆盖。
-- A4/A5 与入库单保持 100。

DROP TEMPORARY TABLE IF EXISTS tmp_print_font_scale_115;
CREATE TEMPORARY TABLE tmp_print_font_scale_115 (
  profile_id          INT PRIMARY KEY,
  source_version_id   INT NOT NULL,
  next_version_no     INT NOT NULL,
  published_scale_100 TINYINT NOT NULL,
  draft_scale_100     TINYINT NOT NULL
);

INSERT INTO tmp_print_font_scale_115 (profile_id, source_version_id, next_version_no, published_scale_100, draft_scale_100)
SELECT t.id, t.version_id, t.next_version_no, t.published_scale_100, t.draft_scale_100
FROM (
  SELECT
    p.id,
    v.id AS version_id,
    (SELECT MAX(x.version_no) + 1 FROM t_print_profile_version x WHERE x.profile_id = p.id) AS next_version_no,
    COALESCE(JSON_EXTRACT(v.config_json, '$.style.fontScale') = 100, 1) AS published_scale_100,
    COALESCE(JSON_EXTRACT(p.draft_config, '$.style.fontScale') = 100, 1) AS draft_scale_100
  FROM t_print_profile p
  JOIN t_print_profile_version v ON v.id = p.published_version_id
  WHERE p.document_type = 'delivery_note'
    AND p.name = '21.8×14cm 针式打印纸'
    AND NOT EXISTS (
      SELECT 1 FROM t_print_profile_version m
      WHERE m.profile_id = p.id AND m.publisher_name = '系统迁移·字号115'
    )
) t
WHERE t.published_scale_100 = 1 OR t.draft_scale_100 = 1;

INSERT INTO t_print_profile_version (profile_id, version_no, config_json, publisher_name)
SELECT f.profile_id, f.next_version_no,
       CASE WHEN f.published_scale_100 = 1
         THEN JSON_SET(v.config_json, '$.style.fontScale', 115)
         ELSE v.config_json END,
       '系统迁移·字号115'
FROM tmp_print_font_scale_115 f
JOIN t_print_profile_version v ON v.id = f.source_version_id;

UPDATE t_print_profile p
JOIN tmp_print_font_scale_115 f ON f.profile_id = p.id
JOIN t_print_profile_version nv ON nv.profile_id = f.profile_id AND nv.version_no = f.next_version_no
SET p.published_version_id = nv.id,
    p.draft_config = CASE WHEN f.draft_scale_100 = 1
      THEN JSON_SET(p.draft_config, '$.style.fontScale', 115)
      ELSE p.draft_config END,
    p.updater_name = '系统迁移';

DROP TEMPORARY TABLE tmp_print_font_scale_115;
