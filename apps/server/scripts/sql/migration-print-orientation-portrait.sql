-- 针式连续纸驱动方向纠正 —— 2026-10-15
-- Windows 自定义表单（如 OMS 9.5x5.5）按纸张实际走向定义为 241.3×140，驱动须选「纵向」；
-- 选「横向」时驱动把页面转 90° 并缩小。上一版把这类纸型的方向写成了横向。
-- 判定「错误值」：驱动纸型名不是 A3~A6/B4~B6/Letter/Legal 等标准纸型、进纸宽 > 高、方向为横向
-- （标准纸型在 Windows 中均按竖长定义，A5 打横版选横向是对的，不在此列）。
-- 发布版本是不可变快照：不 UPDATE 历史 config_json，而是复制当前发布配置为新版本（方向改纵向）
-- 并切换发布指针；草稿同步纠正。
-- 只生效一次：以本迁移署名的发布版本为标记，已处理过的档案不再处理，之后管理员手工改回也不会被覆盖。

DROP TEMPORARY TABLE IF EXISTS tmp_print_orientation_fix;
CREATE TEMPORARY TABLE tmp_print_orientation_fix (
  profile_id        INT PRIMARY KEY,
  source_version_id INT NOT NULL,
  next_version_no   INT NOT NULL,
  published_wrong   TINYINT NOT NULL,
  draft_wrong       TINYINT NOT NULL
);

INSERT INTO tmp_print_orientation_fix (profile_id, source_version_id, next_version_no, published_wrong, draft_wrong)
SELECT t.id, t.version_id, t.next_version_no, t.published_wrong, t.draft_wrong
FROM (
  SELECT
    p.id,
    v.id AS version_id,
    (SELECT MAX(x.version_no) + 1 FROM t_print_profile_version x WHERE x.profile_id = p.id) AS next_version_no,
    -- 缺方向字段的旧配置判定结果为 NULL（无需纠正，运行时按新规则推断），COALESCE 防写入 NOT NULL 列报错
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.config_json, '$.paper.driverOrientation')) = 'landscape'
      AND JSON_EXTRACT(v.config_json, '$.paper.widthMm') > JSON_EXTRACT(v.config_json, '$.paper.heightMm')
      AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.config_json, '$.paper.driverFormName')), ''))
        NOT REGEXP '^(a[3-6]|b[4-6]|letter|legal)([^a-z0-9_]|$)', 0) AS published_wrong,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.draft_config, '$.paper.driverOrientation')) = 'landscape'
      AND JSON_EXTRACT(p.draft_config, '$.paper.widthMm') > JSON_EXTRACT(p.draft_config, '$.paper.heightMm')
      AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.draft_config, '$.paper.driverFormName')), ''))
        NOT REGEXP '^(a[3-6]|b[4-6]|letter|legal)([^a-z0-9_]|$)', 0) AS draft_wrong
  FROM t_print_profile p
  JOIN t_print_profile_version v ON v.id = p.published_version_id
  WHERE NOT EXISTS (
    SELECT 1 FROM t_print_profile_version m
    WHERE m.profile_id = p.id AND m.publisher_name = '系统迁移·方向纠正'
  )
) t
WHERE t.published_wrong = 1 OR t.draft_wrong = 1;

INSERT INTO t_print_profile_version (profile_id, version_no, config_json, publisher_name)
SELECT f.profile_id, f.next_version_no,
       CASE WHEN f.published_wrong = 1
         THEN JSON_SET(v.config_json, '$.paper.driverOrientation', 'portrait')
         ELSE v.config_json END,
       '系统迁移·方向纠正'
FROM tmp_print_orientation_fix f
JOIN t_print_profile_version v ON v.id = f.source_version_id;

UPDATE t_print_profile p
JOIN tmp_print_orientation_fix f ON f.profile_id = p.id
JOIN t_print_profile_version nv ON nv.profile_id = f.profile_id AND nv.version_no = f.next_version_no
SET p.published_version_id = nv.id,
    p.draft_config = CASE WHEN f.draft_wrong = 1
      THEN JSON_SET(p.draft_config, '$.paper.driverOrientation', 'portrait')
      ELSE p.draft_config END,
    p.updater_name = '系统迁移';

DROP TEMPORARY TABLE tmp_print_orientation_fix;
