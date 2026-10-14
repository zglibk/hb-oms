-- 更新日志 v1.2.1「打印与台账稳定性修复」（2026-10-15）
--
-- 随代码发布写入生产环境；同版本号 + 同标题已存在时跳过，确保迁移可重复执行。

INSERT INTO t_changelog (version, title, content, released_at, category, sort, status, creator_name, updater_name)
SELECT 'v1.2.1',
       '打印与台账稳定性修复',
       JSON_ARRAY(
         '统一送货单内置纸型名称，安全合并配置完全相同的重复纸型，并保持纸型默认引用与发布版本关系不变',
         '纸型迁移不再改写历史发布版本，保证已发布配置可追溯、可回退',
         '送货单与入库单自动分页改为按纸张实际可用高度计算，避免长文本或字体缩放时跨页、遮挡签名栏',
         '订单跟踪台账重置时同步恢复交期倒序及表头排序状态',
         '无打印配置修改权限时禁用草稿编辑、底图上传、画布调整及默认纸型修改，只保留查看、缩放和试打'
       ),
       '2026-10-15',
       '修复',
       0,
       1,
       '系统',
       '系统'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM t_changelog
    WHERE version = 'v1.2.1' AND title = '打印与台账稳定性修复'
 );
