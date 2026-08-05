-- 工艺信息：新增 开单注明/审核意见(含截图)/审核人/审核日期 四个产品级字段 + 修改履历表
-- 幂等：列不存在才添加；履历表 CREATE TABLE IF NOT EXISTS

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'billing_note');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN billing_note VARCHAR(255) NULL COMMENT ''开单注明（产品级）'' AFTER process_update_images', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'review_opinion');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN review_opinion TEXT NULL COMMENT ''审核意见（产品级，文字）'' AFTER billing_note', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'review_images');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN review_images VARCHAR(512) NULL COMMENT ''审核意见截图（多图URL JSON数组，可传领导聊天记录截图）'' AFTER review_opinion', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'reviewer');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN reviewer VARCHAR(64) NULL COMMENT ''审核人（产品级）'' AFTER review_images', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_process_info' AND column_name = 'review_date');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_process_info ADD COLUMN review_date DATE NULL COMMENT ''审核日期（产品级）'' AFTER reviewer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS t_process_info_history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  process_info_id INT          NOT NULL COMMENT '工艺记录ID（记录删除时履历级联删除）',
  drawing_no      VARCHAR(128) NOT NULL COMMENT '生产图号快照',
  action          VARCHAR(16)  NOT NULL COMMENT '动作：create新增 update修改 import导入更新',
  changes         TEXT         NULL COMMENT '变更明细 JSON 数组：[{field,label,scope,old,new}]；scope：product产品级/outer外轨/middle中轨/inner内轨',
  operator_id     INT          NULL COMMENT '操作人ID',
  operator_name   VARCHAR(64)  NULL COMMENT '操作人姓名快照',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  KEY idx_process (process_info_id),
  KEY idx_drawing (drawing_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺信息修改履历（新增/修改，产品级+部件级粒度）';
