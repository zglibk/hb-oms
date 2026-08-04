/**
 * hb-oms 种子数据定义
 * 包含：部门、预置角色、权限树(re-export 权限清单)、数据字典、账号、角色-权限绑定矩阵
 * 字典 dict_value 与 @hb-oms/shared 常量口径一致（product_type/rail_section/part_type/order_unit）
 */

// ---------- 部门 ----------
export const DEPARTMENTS = [
  { dept_code: 'COMPANY', dept_name: '海宝五金', parent_id: 0, sort: 0 },
  { dept_code: 'SALE', dept_name: '业务部', parent_id: 1, sort: 1 },
  { dept_code: 'WAREHOUSE', dept_name: '仓库部', parent_id: 1, sort: 2 },
  { dept_code: 'PROD', dept_name: '生产部', parent_id: 1, sort: 3 },
  { dept_code: 'IT', dept_name: 'IT部', parent_id: 1, sort: 4 },
];

// ---------- 角色（data_scope：1全部 2本部门 3本部门及下级 4本人 5自定义）----------
export const ROLES = [
  { role_code: 'salesman', role_name: '业务员', data_scope: 1, sort: 1, remark: '录单/跟踪订单完成情况' },
  { role_code: 'merchandiser', role_name: '跟单员', data_scope: 1, sort: 2, remark: '订单跟踪/外发跟进' },
  { role_code: 'warehouse', role_name: '仓管员', data_scope: 1, sort: 3, remark: '成品出入库操作' },
  { role_code: 'admin', role_name: '系统管理员', data_scope: 1, sort: 9, remark: '系统管理' },
];

// ---------- 权限树 ----------
// 权限清单在 src/modules/system/permission-manifest.ts（唯一事实源，
// 应用启动时由 PermissionSyncService 自动同步落库）。此处 re-export 供 db:init 使用。
export { PERMISSIONS } from '../src/modules/system/permission-manifest';
export type { PermSeed } from '../src/modules/system/permission-manifest';

// ---------- 角色 → 权限 绑定矩阵（值为 perm_code 列表；admin 特殊处理为全部）----------
// M1 仅基础数据/系统管理；订单/外发/出入库权限点随 M2~M4 落地后补充绑定
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // 业务员：基础数据维护（客户/工艺/物料）
  salesman: [
    'basic', 'basic:customer', 'customer:create', 'customer:update', 'customer:import',
    'basic:process-info', 'process-info:create', 'process-info:update',
    'basic:material', 'material:create', 'material:update', 'material:import', 'material:export',
  ],
  // 跟单员：基础数据查看与维护
  merchandiser: [
    'basic', 'basic:customer', 'customer:create', 'customer:update',
    'basic:process-info', 'process-info:create', 'process-info:update',
    'basic:material',
  ],
  // 仓管员：M1 暂无专属菜单（成品出入库 M4 落地后补充）
  warehouse: [],
  // admin 在脚本中绑定全部权限
};

// ---------- 数据字典 ----------
// dict_value 与 @hb-oms/shared 的枚举值保持一致（共享包是口径唯一事实源，
// 字典仅承载可维护的下拉展示；新增类型值需两处同步）
export const DICTS: Array<{
  dict_type: string;
  dict_label: string;
  dict_value: string;
  sort: number;
  parent_value?: string;
}> = [
  // 产品类型（多选组合的候选项）
  { dict_type: 'product_type', dict_label: '普通', dict_value: 'standard', sort: 1 },
  { dict_type: 'product_type', dict_label: '缓冲', dict_value: 'buffer', sort: 2 },
  { dict_type: 'product_type', dict_label: '卡口', dict_value: 'socket', sort: 3 },
  { dict_type: 'product_type', dict_label: '反弹', dict_value: 'rebound', sort: 4 },
  { dict_type: 'product_type', dict_label: '自锁', dict_value: 'self_lock', sort: 5 },
  { dict_type: 'product_type', dict_label: '防倾倒', dict_value: 'anti_tilt', sort: 6 },

  // 轨道节数
  { dict_type: 'rail_section', dict_label: '二节轨', dict_value: 'two_section', sort: 1 },
  { dict_type: 'rail_section', dict_label: '三节轨', dict_value: 'three_section', sort: 2 },

  // 部件类型
  { dict_type: 'part_type', dict_label: '外轨', dict_value: 'outer', sort: 1 },
  { dict_type: 'part_type', dict_label: '中轨', dict_value: 'middle', sort: 2 },
  { dict_type: 'part_type', dict_label: '内轨', dict_value: 'inner', sort: 3 },

  // 订单单位（套=2支 换算逻辑在共享包 unit.ts）
  { dict_type: 'order_unit', dict_label: '套', dict_value: 'set', sort: 1 },
  { dict_type: 'order_unit', dict_label: '支', dict_value: 'piece', sort: 2 },

  // 表面处理颜色（常用值，可在字典管理维护）
  { dict_type: 'surface_color', dict_label: '黑色', dict_value: '黑色', sort: 1 },
  { dict_type: 'surface_color', dict_label: '白色', dict_value: '白色', sort: 2 },
  { dict_type: 'surface_color', dict_label: '灰色', dict_value: '灰色', sort: 3 },
  { dict_type: 'surface_color', dict_label: '蓝白锌', dict_value: '蓝白锌', sort: 4 },

  // 外发加工商（M3 外发单下拉，可在字典管理维护）
  { dict_type: 'processor', dict_label: '示例加工商', dict_value: '示例加工商', sort: 1 },
];

// ---------- 账号（plainPwd 在 db-init 中 bcrypt 加密）----------
export const USERS = [
  { username: 'admin', plainPwd: 'Admin@123', real_name: '系统管理员', dept_code: 'IT', roles: ['admin'] },
  { username: 'sales01', plainPwd: 'Sale@123', real_name: '业务员01', dept_code: 'SALE', roles: ['salesman'] },
  { username: 'follow01', plainPwd: 'Sale@123', real_name: '跟单员01', dept_code: 'SALE', roles: ['merchandiser'] },
  { username: 'wh01', plainPwd: 'Wh@12345', real_name: '仓管员01', dept_code: 'WAREHOUSE', roles: ['warehouse'] },
];
