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
  // 订单备注（图文混排 HTML）
  'migration-order-other-req.sql',
  // 外发取消发出环节：删发外日期与发出重量/单重，发出数量改应回数量
  'migration-outsource-drop-send.sql',
  // 外发再简化：三张表塌缩为「外发件回厂记录」单表
  'migration-outsource-rebuild-part.sql',
  // 业务字段全局启用开关（系统配置 → 业务字段）：颜色 / 客户图号
  'migration-field-switches.sql',
  // 修正 t_material.part_type 列注释（原注释的 *_rail 取值从未在库中出现）
  'migration-material-part-type-comment.sql',
  // 跟踪锚点分层：装配与成品从部件组升到产品行（含一次性清空测试数据）
  'migration-product-level-tracking.sql',
  // 供应商主数据（基础数据）：外发「加工商」等下拉的来源
  'migration-supplier.sql',
  // 呆滞品管理：由「成品期初（不挂订单）」拆分独立，含成品出入库相关列注释订正
  'migration-dull-stock.sql',
  // 人事档案（HR 一级菜单；可读部门，暂不对外供数）
  'migration-employee.sql',
  // 员工编码规则：厂区列 + 部门人事编码 + 9 个部门回填 + 实习生字典
  'migration-employee-code.sql',
  // 岗位由字典 hr_position 升级为独立主数据 t_position（含 t_employee.position → position_id）
  'migration-position.sql',
  // 职级字典按公司实际职级序列重定（该文件的种子段已作废，见文件内说明）
  'migration-job-level.sql',
  // 岗位性质三值化（普通/管理/技术）+ 职级升级为独立主数据 t_job_level
  'migration-position-nature.sql',
  // 人事档案扩展：籍贯/民族/学历背景/政治面貌/婚姻状况
  'migration-employee-profile.sql',
  // 呆滞品 / 部件台账的批量导入导出权限点（仅授权，无表结构变更）
  'migration-stock-import-export.sql',
  // 分体出货：产品行 is_split 标记（三节轨拆「外中轨」+「内轨」分行下单，形态由组构成推导）
  'migration-order-split-shipping.sql',
  // 成品库存的批量导入导出权限点（仅授权，无表结构变更）
  'migration-stock-balance-import-export.sql',
  // 免装配口径下线 + 入库单班组改车间（注释订正）+ assembly_workshop 字典补装九
  'migration-assembly-required-workshop9.sql',
  // 订单产品级「产品要求描述」（配套开关列在 migration-field-switches.sql 追加）
  'migration-product-requirement.sql',
  // 装配管理「导出装配记录」权限点（仅授权，无表结构变更）
  'migration-assembly-export.sql',
  // 送货单打印：客户绑定模板 + 全局默认模板两列
  'migration-delivery-note.sql',
  // 成品出入库「导出出入库记录」权限点（仅授权，无表结构变更）
  'migration-finished-stock-export.sql',
  // 生产BOM：同图号多版本表头 + 物料明细
  'migration-production-bom.sql',
  // 版本号「01.0 / 02.0」还原为「01 / 02」（旧 normalizeVersion 误补 .0 的历史数据，仅数据修复）
  'migration-version-leading-zero.sql',
  // 更新日志 v1.1.0「用户反馈问题优化」（仅数据，同版本同标题已存在即跳过）
  'migration-changelog-v1.1.0.sql',
  // 业务记录修改权收紧：订单/外发/装配/成品出入库四个「主管角色」配置列 + 主管角色补授按钮权限
  'migration-record-edit-roles.sql',
  // 首页「系统更新」弹窗：t_user 增加更新日志已读水位线
  'migration-changelog-seen.sql',
  // 数据可视化大屏：车间电视免登录访问码（只存 SHA-256 摘要）
  'migration-screen.sql',
  // 超管角色只允许唯一内置 admin 账号持有；清理普通账号历史误绑定
  'migration-admin-role-isolation.sql',
];

/**
 * 结构验证：**不该再存在**的列。
 * 弃用列删干净后若被误恢复（如有人照旧版 01-schema.sql 重建表），程序不会报错
 * 但会悄悄回到"两处都有生产单号"的分叉状态，故在此显式盯住。
 */
const forbiddenColumns = [
  't_order_product.production_no', // 已上移 t_order.production_no
  't_order_product.assembly_workshop', // 已下沉 t_assembly_batch.workshop
  // 外发三张旧表（发坯单头/明细/回货流水）已于 2026-08-10 整体删除，
  // 盯住任一列即可发现"旧版 schema 把表重建复活"的情况
  't_outsource_doc.blank_no',
  't_outsource_item.doc_id',
  't_outsource_return.item_id',
  // 装配与成品的锚点已于 2026-08-10 从部件组升到产品行（migration-product-level-tracking.sql）。
  // 这三列若被旧版 schema 重建复活，闸门与台账会退回按组核算而程序不报错，故显式盯住。
  // 注意：外发 t_outsource_part.order_part_group_id **仍在使用**，不在此列。
  't_assembly_batch.order_part_group_id',
  't_finished_item.order_part_group_id',
  't_finished_balance.order_part_group_id',
  // 岗位于 2026-08-11 由字典值升级为 t_position 引用；旧列若被旧版 schema 重建复活，
  // 岗位会退回"存字典值"而程序不报错，故显式盯住
  't_employee.position',
  // 岗位性质于 2026-08-12 由布尔升级为三值、职级升级为主数据引用；
  // 这两列若被旧版 schema 重建复活，「技术岗」与分序列职级会静默丢失
  't_position.is_manager',
  't_position.job_level',
];

/** 结构验证：关键表.列 存在性检查（随里程碑扩充） */
const expectedColumns = [
  't_user.token_invalid_before',
  't_user.changelog_seen_id',
  't_system_config.screen_key_hash',
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
  // 生产BOM（同图号多版本表头 + 物料明细）
  't_production_bom.drawing_no',
  't_production_bom.version',
  't_production_bom.prepared_by',
  't_production_bom_item.bom_id',
  't_production_bom_item.item_name',
  't_production_bom_item.quantity_per_set',
  't_production_bom_item.unit_consumption',
  // M3 外发——2026-08-10 收敛为「外发件回厂记录」单表（发坯单三表已删）
  't_outsource_part.order_part_group_id',
  't_outsource_part.processor_name',
  't_outsource_part.back_date',
  't_outsource_part.return_qty',
  't_outsource_part.order_qty',
  't_outsource_part.drawing_no',
  // M3.5 装配批次
  't_assembly_batch.order_product_id',
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
  't_finished_item.order_product_id',
  't_finished_item.side',
  't_finished_item.quantity',
  't_finished_item.origin_item_id',
  't_finished_balance.order_product_id',
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
  // 分体出货标记（形态由组构成推导；分体行同样走装配与闸门）
  't_order_product.is_split',
  // 产品要求描述（客户对该产品的特殊要求，随业务字段开关显隐）
  't_order_product.product_requirement',
  // 供应商主数据（外发加工商等下拉来源）
  't_supplier.supplier_code',
  't_supplier.supplier_name',
  't_supplier.status',
  // 呆滞品管理（由「成品期初（不挂订单）」拆分独立）
  't_dull_stock.unit',
  't_dull_stock.opening_qty',
  't_dull_stock.inbound_qty',
  't_dull_stock.outbound_qty',
  't_dull_stock.balance_qty',
  't_dull_stock.customer_name',
  't_dull_stock.production_no',
  't_dull_stock_flow.dull_id',
  't_dull_stock_flow.direction',
  't_dull_stock_flow.flow_date',
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
  't_outsource_part.updater_name',
  't_system_config.updater_name',
  't_file.creator_name',
  // 业务字段开关
  't_system_config.color_field_enabled',
  't_system_config.customer_drawing_no_enabled',
  // 呆滞品颜色（独立于全局颜色开关）
  't_system_config.dull_stock_color_enabled',
  't_system_config.product_requirement_enabled',
  // 单位换算（非布尔配置：换算系数 + 默认查看单位）
  't_system_config.inch_to_mm',
  't_system_config.dimension_view_unit',
  // 送货单打印：客户绑定模板 + 全局默认模板
  't_customer.delivery_template',
  't_system_config.delivery_template_default',
  // 业务记录修改主管角色（只许创建人与这些角色修改）
  't_system_config.order_edit_roles',
  't_system_config.outsource_edit_roles',
  't_system_config.assembly_edit_roles',
  't_system_config.finished_edit_roles',
  // 查看权限（只读角色）
  't_permission.access_type',
  // 订单备注（图文混排）
  't_order.other_req',
  // 人事档案
  't_employee.emp_no',
  't_employee.emp_name',
  't_employee.job_status',
  't_employee.dept_id',
  't_employee.supervisor_id',
  // 员工编码规则：厂区（第1-2位）与部门人事编码（第5-7位）
  't_employee.plant_code',
  't_department.hr_code',
  // 岗位主数据（由字典 hr_position 升级）
  't_position.position_code',
  't_position.position_name',
  't_position.dept_id',
  't_position.position_nature',
  't_position.job_level_id',
  't_position.headcount',
  't_employee.position_id',
  // 职级主数据（由字典 job_level 升级）
  't_job_level.level_name',
  't_job_level.position_nature',
  't_job_level.level_rank',
  't_employee.native_place',
  't_employee.education',
  't_employee.education_type',
  't_employee.graduate_school',
  't_employee.marital_status',
  't_employee.political_status',
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
