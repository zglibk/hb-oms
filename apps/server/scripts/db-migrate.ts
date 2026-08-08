/**
 * 存量库增量迁移（幂等，可重复执行）
 *   pnpm --filter @hb-oms/server db:migrate
 * 读取 apps/server/.env 中的 DB_* 配置，按 MIGRATIONS 顺序执行 scripts/sql/migration-*.sql。
 *
 * 约定（沿袭 hb-mes 迁移规范）：
 *   1. 新迁移文件放 scripts/sql/，命名 migration-*.sql，必须幂等；
 *   2. 在下方 MIGRATIONS 数组【末尾】登记（顺序即执行顺序），本数组是唯一执行清单；
 *   3. 同步更新 01-schema.sql（供全新安装 db:init 使用）；
 *   4. 新增关键表/字段时在 expectedColumns 补充结构验证。
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import * as mysql from 'mysql2/promise';

config({ path: resolve(__dirname, '..', '.env') });

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'haibao_oms',
} = process.env;

/** 迁移清单（顺序执行；全新库由 db:init 直接建最新结构，无需跑历史迁移） */
const MIGRATIONS: string[] = [
  // 台账对齐：表面处理字典化(none保留值) + 部件组类型 + 装配车间字典（决策 #4/#11/#12）
  'migration-surface-assembly-dicts.sql',
  'migration-customer-name-drop-unique.sql',
  'migration-process-machines-thick.sql',
  'migration-process-review-history.sql',
  'migration-process-billing-part-level.sql',
  'migration-order-tables.sql',
  'migration-equipment-info.sql',
  'migration-dept-leader-phone.sql',
  'migration-changelog-systemconfig.sql',
  'migration-part-info-fields.sql',
  'migration-billing-info-rev.sql',
  'migration-outsource-tables.sql',
  'migration-assembly-batch.sql',
  'migration-assembly-plan-start.sql',
  'migration-finished-stock.sql',
  'migration-part-stock.sql',
  'migration-builtin-roles.sql',
  'migration-order-field-adjust.sql',
  'migration-drop-deprecated-order-cols.sql',
  // 审计追溯六件套补齐 + t_permission.access_type（查看/操作）+ stat:dashboard
  'migration-audit-trace-and-view-perm.sql',
];

/**
 * 结构验证：**不该再存在**的列。
 * 弃用列删干净后若被误恢复（如有人照旧版 01-schema.sql 重建表），程序不会报错
 * 但会悄悄回到"两处都有生产单号"的分叉状态，故在此显式盯住。
 */
const forbiddenColumns = [
  't_order_product.production_no', // 已上移 t_order.production_no
  't_order_product.assembly_workshop', // 已下沉 t_assembly_batch.workshop
];

/** 结构验证：关键表.列 存在性检查（随里程碑扩充） */
const expectedColumns = [
  't_user.token_invalid_before',
  't_dict.parent_value',
  't_operation_log.biz_type',
  't_operation_log.biz_id',
  't_material.item_no',
  't_customer.customer_code',
  't_customer.merchandiser',
  't_process_info.drawing_no',
  't_process_info.mold_no_inner',
  't_process_info.process_update_images',
  't_process_info.machines_thick',
  't_process_info.billing_note_outer',
  't_no_sequence.seq_key',
  // M2 订单四级结构
  't_order.order_no',
  't_order_product.qty_pcs',
  // t_order_product.assembly_workshop 已于 2026-08-07 删除，移入下方 forbiddenColumns
  't_order_part_group.group_type',
  't_order_part_group.drawing_no',
  't_order_part.part_group_id',
  't_equipment_info.machine_no',
  't_department.leader',
  't_changelog.version',
  't_system_config.system_name',
  't_material.unit_weight',
  't_process_info.dimension',
  't_process_info.drawing_version_outer',
  // M3 外发（发坯单）
  't_outsource_doc.blank_no',
  't_outsource_doc.actual_send_date',
  't_outsource_doc.close_reason',
  't_outsource_item.order_part_group_id',
  't_outsource_item.send_qty',
  't_outsource_item.returned_qty',
  't_outsource_return.item_id',
  't_outsource_return.return_qty',
  // M3.5 装配批次
  't_assembly_batch.order_part_group_id',
  't_assembly_batch.side',
  't_assembly_batch.workshop',
  't_assembly_batch.plan_start_date',
  't_assembly_batch.plan_date',
  't_assembly_batch.actual_date',
  't_assembly_batch.qty',
  't_assembly_batch.status',
  // M4 成品出入库
  't_finished_doc.doc_no',
  't_finished_doc.biz_type',
  't_finished_doc.direction',
  't_finished_doc.origin_doc_id',
  't_finished_doc.status',
  't_finished_item.order_part_group_id',
  't_finished_item.side',
  't_finished_item.quantity',
  't_finished_item.origin_item_id',
  't_finished_balance.order_part_group_id',
  't_finished_balance.side',
  't_finished_balance.attr_key',
  't_finished_balance.quantity',
  // M5 部件台账
  't_part_balance.part_type',
  't_part_balance.material_thickness',
  't_part_balance.dimension_mm',
  't_part_balance.quantity',
  't_part_adjust.balance_id',
  't_part_adjust.source',
  't_part_adjust.delta',
  't_part_adjust.reason',
  // 订单字段口径调整：生产单号上移订单级 + 产品级客户图号
  't_order.production_no',
  't_order_product.customer_drawing_no',
  // 审计追溯六件套（§5.5）：抽查各表的姓名快照列，缺了说明迁移没跑到
  't_dict.creator_name',
  't_dict.updater_name',
  't_department.creator_name',
  't_role.updater_name',
  't_permission.creator_name',
  't_permission.updated_at',
  't_user.creator_name',
  't_user.updated_by',
  't_changelog.creator_name',
  't_order_product.creator_name',
  't_order_part_group.creator_name',
  't_outsource_item.updater_name',
  't_system_config.updater_name',
  't_file.creator_name',
  // 查看权限（只读角色）
  't_permission.access_type',
];

async function main() {
  const db = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  console.log(`→ 连接 ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

  for (const file of MIGRATIONS) {
    const path = join(__dirname, 'sql', file);
    if (!existsSync(path)) {
      throw new Error(`缺少迁移文件: ${path}`);
    }
    const sql = readFileSync(path, 'utf-8');
    console.log(`→ 执行 ${file}`);
    await db.query(sql);
    console.log('  ✓ 完成');
  }

  // 结构验证
  const [rows]: any = await db.query(
    `SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS col
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const actual = new Set<string>(rows.map((r: any) => r.col));
  const missing = expectedColumns.filter((c) => !actual.has(c));
  const lingering = forbiddenColumns.filter((c) => actual.has(c));

  console.log('\n结构验证:');
  if (missing.length || lingering.length) {
    for (const c of missing) console.log(`  ✗ 缺失 ${c}`);
    for (const c of lingering) console.log(`  ✗ 已弃用列仍存在 ${c}`);
    await db.end();
    throw new Error(
      `结构验证失败：缺失 ${missing.length} 项、残留弃用列 ${lingering.length} 项` +
        '（全新库请先执行 pnpm db:init）',
    );
  }
  console.log(`  ✓ ${expectedColumns.length} 项关键列全部存在`);
  console.log(`  ✓ ${forbiddenColumns.length} 项已弃用列均已清除`);

  await db.end();
  console.log('\n🎉 迁移完成');
}

main().catch((err) => {
  console.error('✗ 迁移失败：', err);
  process.exit(1);
});
