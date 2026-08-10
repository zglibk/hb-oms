-- 订单备注（图文混排）—— 2026-08-08
--
-- t_order 加 other_req TEXT：承载客户来函要求、包装示意图等需要配图说明的内容，
-- 由 wangEditor 产出 HTML，图片走 /upload/editor-image 存真实 URL（正文只存 <img src>）。
-- 与既有的 remark VARCHAR(255) 并存——后者是列表可见的一句话摘要，两者用途不同。
--
-- 幂等：列不存在才添加。

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 't_order' AND column_name = 'other_req');
SET @s := IF(@c = 0,
  'ALTER TABLE t_order ADD COLUMN other_req TEXT NULL COMMENT ''订单备注（图文混排HTML，wangEditor 输出）'' AFTER remark',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
