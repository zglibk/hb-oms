-- 首页「系统更新」弹窗（2026-10-05）
--
-- 每轮发布后，用户首次进入首页时弹出本次更新明细。已读状态记在服务端（按人），
-- 换电脑 / 换浏览器不会重复弹。水位线 = 本人已看过的最大 t_changelog.id：
-- 新发布的更新日志 id 更大，自然重新触发；改旧条目的文字不会再弹一遍。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_user' AND column_name = 'changelog_seen_id');
SET @s := IF(@c = 0,
  'ALTER TABLE t_user ADD COLUMN changelog_seen_id INT NULL COMMENT ''更新日志已读水位线：本人已看过的最大 t_changelog.id，NULL=从未看过（首页只弹最新一个版本）'' AFTER token_invalid_before',
  'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
