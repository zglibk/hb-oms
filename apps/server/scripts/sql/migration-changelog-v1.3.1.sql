-- 更新日志 v1.3.1“订单录入与成品选品优化”（2026-11-11）
-- 随代码发布写入生产环境；同版本号 + 同标题已存在时跳过，确保迁移可重复执行。
INSERT INTO t_changelog (version, title, content, released_at, category, sort, status, creator_name, updater_name)
SELECT 'v1.3.1',
       '订单录入与成品选品优化',
       JSON_ARRAY(
         '修复订单保存时连续点击或网络重复提交可能生成多张相同订单的问题；新增前端保存锁与服务端幂等校验，同一次录单只会生成一张订单',
         '成品入库和销售出库的“选择产品”列表增加产品代码，选品时可直接核对产品代码、生产单号、型号及规格'
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
    WHERE version = 'v1.3.1' AND title = '订单录入与成品选品优化'
 );
