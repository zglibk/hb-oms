-- 分体出货（2026-08-12）：客户把一支滑轨拆成多行下单（如三节轨拆「外中轨」+「内轨」
-- 两行，同一订单文件），各行分开包装出货、不组装成整品。
-- 产品行加 is_split 标记；出货形态**不落库**，由该行部件组构成即时推导（组列表即事实源）。
-- 分体且只含单一部件的行（如内轨）没有装配环节，成品入库免装配闸门（共享包 needsAssemblyGate）。
-- 幂等：列不存在才添加

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 't_order_product' AND column_name = 'is_split');
SET @sql := IF(@has_col = 0, 'ALTER TABLE t_order_product ADD COLUMN is_split TINYINT NOT NULL DEFAULT 0 COMMENT ''分体出货：0整品 1分体（该行按部件组构成分体包装出货，不组装成整品；出货形态由组构成推导，单部件分体行免装配入库闸门）'' AFTER rail_section', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
