-- 更新日志 v1.3.2“业务写入并发保护”（2026-11-11）
-- 同版本号 + 同标题已存在时跳过，确保迁移可重复执行。
INSERT INTO t_changelog (version, title, content, released_at, category, sort, status, creator_name, updater_name)
SELECT 'v1.3.2',
       '业务写入并发保护',
       JSON_ARRAY(
         '订单、外发回厂、装配批次、成品出入库、期初录入及红字冲销统一增加服务端幂等保护；连续点击、网络重试或并发提交只会落账一次',
         '成品单据编辑、确认、作废和冲销改为事务串行处理，避免重复确认导致库存重复增减，以及确认与编辑、作废同时发生造成单据和库存状态不一致',
         '订单编辑、删除及自动完结补齐行锁和事务内复核；下游建单会锁定所属订单，避免删除与建单并发产生孤立记录'
       ),
       '2026-11-11',
       '问题修复',
       0,
       1,
       '系统',
       '系统'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM t_changelog
    WHERE version = 'v1.3.2' AND title = '业务写入并发保护'
 );
