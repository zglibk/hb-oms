-- 版本号「01 / 02」被旧规则改成「01.0 / 02.0」的历史数据还原（2026-09-25）
--
-- 共享包 normalizeVersion 旧规则把一切纯数字补「.0」，带前导零的图纸版本（01、02、003）
-- 也被改成了 01.0 / 02.0。新规则起前导零纯数字原样保留，这里把已落库的还原。
-- 匹配条件：以 0 开头、至少两位数字、后跟「.0」（如 01.0、02.0、003.0）；「0.0」「1.0」「10.0」不动。
--
-- 幂等：还原后不再匹配，重复执行为空操作。
-- 显式 SET updated_at = updated_at：这些表的 updated_at 带 ON UPDATE，数据修复不应让记录看起来像被人编辑过。
-- t_process_info_history 是履历快照（记的是当时的样子），刻意不改。

-- 订单部件组
UPDATE t_order_part_group
   SET drawing_version = LEFT(drawing_version, CHAR_LENGTH(drawing_version) - 2),
       updated_at = updated_at
 WHERE drawing_version REGEXP '^0[0-9]+\\.0$';

-- 开单信息：外 / 中 / 内三列
UPDATE t_process_info
   SET drawing_version_outer = LEFT(drawing_version_outer, CHAR_LENGTH(drawing_version_outer) - 2),
       updated_at = updated_at
 WHERE drawing_version_outer REGEXP '^0[0-9]+\\.0$';
UPDATE t_process_info
   SET drawing_version_middle = LEFT(drawing_version_middle, CHAR_LENGTH(drawing_version_middle) - 2),
       updated_at = updated_at
 WHERE drawing_version_middle REGEXP '^0[0-9]+\\.0$';
UPDATE t_process_info
   SET drawing_version_inner = LEFT(drawing_version_inner, CHAR_LENGTH(drawing_version_inner) - 2),
       updated_at = updated_at
 WHERE drawing_version_inner REGEXP '^0[0-9]+\\.0$';

-- 生产BOM：(drawing_no, version) 唯一。若同图号下「01」与「01.0」已同时存在，还原会撞唯一键
-- 而中断整条迁移——这种行跳过不改（留给人工判断保留哪份）。
-- 自连接要套一层派生表：MySQL 不允许 UPDATE 的子查询直接引用目标表。
UPDATE t_production_bom b
  LEFT JOIN (SELECT drawing_no, version FROM (SELECT drawing_no, version FROM t_production_bom) t0) x
         ON x.drawing_no = b.drawing_no
        AND x.version = LEFT(b.version, CHAR_LENGTH(b.version) - 2)
   SET b.version = LEFT(b.version, CHAR_LENGTH(b.version) - 2),
       b.updated_at = b.updated_at
 WHERE b.version REGEXP '^0[0-9]+\\.0$'
   AND x.drawing_no IS NULL;
