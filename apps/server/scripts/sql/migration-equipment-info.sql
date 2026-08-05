-- 设备管理：设备信息表（设备适产记录——机台适合生产的产品/部件及用料）
-- 幂等 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS t_equipment_info (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  machine_no       VARCHAR(32)  NOT NULL COMMENT '机台号（如 89、362）',
  product_model    VARCHAR(128) NULL COMMENT '产品型号（如 45#缓冲滑轨）',
  part_type        VARCHAR(32)  NULL COMMENT '部件（字典 part_type）：outer外轨 middle中轨 inner内轨',
  mechanic         VARCHAR(64)  NULL COMMENT '机修员',
  material_spec    VARCHAR(128) NULL COMMENT '用料规格（如 卷料 65×1.2）',
  drawing_no       VARCHAR(128) NULL COMMENT '图号',
  common_thickness VARCHAR(64)  NULL COMMENT '常用料厚（如 1.2 / 1.2×1.0×1.2）',
  remark           VARCHAR(255) NULL COMMENT '备注',
  creator_id       INT          NULL COMMENT '创建人ID',
  creator_name     VARCHAR(64)  NULL COMMENT '创建人姓名快照',
  updated_by       INT          NULL COMMENT '最后更新人ID',
  updater_name     VARCHAR(64)  NULL COMMENT '最后更新人姓名快照',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_machine_no (machine_no),
  KEY idx_drawing_no (drawing_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备信息（设备适产记录）';
