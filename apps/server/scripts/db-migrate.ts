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
  't_no_sequence.seq_key',
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

  console.log('\n结构验证:');
  if (missing.length) {
    for (const c of missing) console.log(`  ✗ 缺失 ${c}`);
    await db.end();
    throw new Error(`结构验证失败，缺失 ${missing.length} 项（全新库请先执行 pnpm db:init）`);
  }
  console.log(`  ✓ ${expectedColumns.length} 项关键列全部存在`);

  await db.end();
  console.log('\n🎉 迁移完成');
}

main().catch((err) => {
  console.error('✗ 迁移失败：', err);
  process.exit(1);
});
