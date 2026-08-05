-- 台账对齐（设计文档决策 #4/#11/#12）：表面处理字典化 + 部件组类型 + 装配车间字典
-- 幂等：按 (dict_type, dict_value) 不存在才插入
-- 说明：surface_type 的 none 为代码保留值（外发必填逻辑判断依据），禁删禁改值

INSERT INTO t_dict (dict_type, dict_label, dict_value, sort)
SELECT v.dict_type, v.dict_label, v.dict_value, v.sort
FROM (
  SELECT 'surface_type' AS dict_type, '无'     AS dict_label, 'none'            AS dict_value, 1 AS sort UNION ALL
  SELECT 'surface_type', '封漆',   'seal_paint',       2 UNION ALL
  SELECT 'surface_type', '电泳',   'electrophoresis',  3 UNION ALL
  SELECT 'surface_type', '喷涂',   'spray',            4 UNION ALL
  SELECT 'surface_type', '平滑漆', 'smooth_paint',     5 UNION ALL
  SELECT 'part_group_type', '整品',   'whole',        1 UNION ALL
  SELECT 'part_group_type', '外中轨', 'outer_middle', 2 UNION ALL
  SELECT 'part_group_type', '内轨',   'inner',        3 UNION ALL
  SELECT 'part_group_type', '外轨',   'outer',        4 UNION ALL
  SELECT 'part_group_type', '中轨',   'middle',       5 UNION ALL
  SELECT 'assembly_workshop', '装一', 'assembly_1', 1 UNION ALL
  SELECT 'assembly_workshop', '装二', 'assembly_2', 2 UNION ALL
  SELECT 'assembly_workshop', '装三', 'assembly_3', 3 UNION ALL
  SELECT 'assembly_workshop', '装四', 'assembly_4', 4 UNION ALL
  SELECT 'assembly_workshop', '装五', 'assembly_5', 5 UNION ALL
  SELECT 'assembly_workshop', '装六', 'assembly_6', 6 UNION ALL
  SELECT 'assembly_workshop', '装七', 'assembly_7', 7 UNION ALL
  SELECT 'assembly_workshop', '装八', 'assembly_8', 8
) v
WHERE NOT EXISTS (
  SELECT 1 FROM t_dict d
  WHERE d.dict_type = v.dict_type AND d.dict_value = v.dict_value
);
