-- 数据可视化大屏（2026-10-05）
--
-- 车间电视免登录访问大屏用的「访问码」：库里只存 SHA-256 摘要，明文只在生成当次显示一次。
-- 为空 = 免登录访问关闭（只能登录后经「数据可视化」按钮进入）。
-- 管理员在「系统配置 → 数据大屏」生成 / 重置 / 关闭；重置后旧访问码立即失效。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_system_config' AND column_name = 'screen_key_hash');
SET @s := IF(@c = 0,
  'ALTER TABLE t_system_config ADD COLUMN screen_key_hash CHAR(64) NULL COMMENT ''数据大屏免登录访问码的 SHA-256 摘要（十六进制）；NULL=免登录访问关闭，明文不落库'' AFTER finished_edit_roles',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
