/**
 * 权限清单（唯一事实源 / Single Source of Truth）
 *
 * 系统中所有权限点（菜单/按钮/接口）的权威定义。三个消费方：
 *   1. PermissionSyncService —— 应用启动时自动 upsert 到 t_permission，
 *      并将全库权限补授给 admin 角色（新增权限点无需再写迁移 SQL）。
 *   2. scripts/seed-data.ts —— db:init 种子复用本清单（re-export）。
 *   3. 开发约定：代码中新增 @RequirePermissions('xxx') / v-permission="'xxx'"
 *      时，必须同步在本文件登记，重启后端即自动落库生效。
 *
 * 注意：本清单只做"新增/更新"，不删除数据库中多余的权限行
 * （管理员通过菜单管理 UI 手工创建的权限予以保留）。
 */

// perm_type：1菜单 2按钮（接口权限与按钮 perm_code 复用守卫校验）
// parent_code 用于种子阶段建树，落库时转换为 parent_id
export interface PermSeed {
  perm_code: string;
  perm_name: string;
  perm_type: number;
  parent_code?: string;
  menu_path?: string;
  component?: string;
  icon?: string;
  sort: number;
}

export const PERMISSIONS: PermSeed[] = [
  // ===== 基础数据 =====
  { perm_code: 'basic', perm_name: '基础数据', perm_type: 1, menu_path: '/basic', icon: 'Coin', sort: 10 },

  { perm_code: 'basic:customer', perm_name: '客户资料', perm_type: 1, parent_code: 'basic', menu_path: '/basic/customer', component: 'basic/customer/index', icon: 'OfficeBuilding', sort: 1 },
  { perm_code: 'customer:create', perm_name: '新增客户', perm_type: 2, parent_code: 'basic:customer', sort: 1 },
  { perm_code: 'customer:update', perm_name: '编辑客户', perm_type: 2, parent_code: 'basic:customer', sort: 2 },
  { perm_code: 'customer:delete', perm_name: '删除客户', perm_type: 2, parent_code: 'basic:customer', sort: 3 },
  { perm_code: 'customer:import', perm_name: '批量导入客户', perm_type: 2, parent_code: 'basic:customer', sort: 4 },

  { perm_code: 'basic:process-info', perm_name: '工艺信息', perm_type: 1, parent_code: 'basic', menu_path: '/basic/process-info', component: 'basic/process-info/index', icon: 'Setting', sort: 2 },
  { perm_code: 'process-info:create', perm_name: '新增工艺', perm_type: 2, parent_code: 'basic:process-info', sort: 1 },
  { perm_code: 'process-info:update', perm_name: '编辑工艺', perm_type: 2, parent_code: 'basic:process-info', sort: 2 },
  { perm_code: 'process-info:delete', perm_name: '删除工艺', perm_type: 2, parent_code: 'basic:process-info', sort: 3 },
  { perm_code: 'process-info:import', perm_name: '批量导入工艺', perm_type: 2, parent_code: 'basic:process-info', sort: 4 },

  { perm_code: 'basic:material', perm_name: '物料管理', perm_type: 1, parent_code: 'basic', menu_path: '/basic/material', component: 'system/material/index', icon: 'Grid', sort: 3 },
  { perm_code: 'material:create', perm_name: '新增物料', perm_type: 2, parent_code: 'basic:material', sort: 1 },
  { perm_code: 'material:update', perm_name: '编辑物料', perm_type: 2, parent_code: 'basic:material', sort: 2 },
  { perm_code: 'material:delete', perm_name: '删除物料', perm_type: 2, parent_code: 'basic:material', sort: 3 },
  { perm_code: 'material:import', perm_name: '批量导入物料', perm_type: 2, parent_code: 'basic:material', sort: 4 },
  { perm_code: 'material:export', perm_name: '导出物料清单', perm_type: 2, parent_code: 'basic:material', sort: 5 },

  // ===== 系统管理 =====
  // SetUp：不用 Setting——后者在 el-sub-menu 展开重绘时偶发不渲染（沿袭 hb-mes 经验）
  { perm_code: 'system', perm_name: '系统管理', perm_type: 1, menu_path: '/system', icon: 'SetUp', sort: 90 },

  { perm_code: 'system:user', perm_name: '用户管理', perm_type: 1, parent_code: 'system', menu_path: '/system/user', component: 'system/user/index', icon: 'User', sort: 1 },
  { perm_code: 'user:create', perm_name: '新增用户', perm_type: 2, parent_code: 'system:user', sort: 1 },
  { perm_code: 'user:update', perm_name: '修改用户', perm_type: 2, parent_code: 'system:user', sort: 2 },
  { perm_code: 'user:delete', perm_name: '删除用户', perm_type: 2, parent_code: 'system:user', sort: 3 },
  { perm_code: 'user:reset_pwd', perm_name: '重置密码', perm_type: 2, parent_code: 'system:user', sort: 4 },
  { perm_code: 'user:assign_role', perm_name: '分配角色', perm_type: 2, parent_code: 'system:user', sort: 5 },

  { perm_code: 'system:role', perm_name: '角色管理', perm_type: 1, parent_code: 'system', menu_path: '/system/role', component: 'system/role/index', icon: 'UserFilled', sort: 2 },
  { perm_code: 'role:create', perm_name: '新增角色', perm_type: 2, parent_code: 'system:role', sort: 1 },
  { perm_code: 'role:update', perm_name: '修改角色', perm_type: 2, parent_code: 'system:role', sort: 2 },
  { perm_code: 'role:delete', perm_name: '删除角色', perm_type: 2, parent_code: 'system:role', sort: 3 },
  { perm_code: 'role:assign_perm', perm_name: '分配权限', perm_type: 2, parent_code: 'system:role', sort: 4 },

  { perm_code: 'system:menu', perm_name: '菜单权限', perm_type: 1, parent_code: 'system', menu_path: '/system/menu', component: 'system/menu/index', icon: 'Menu', sort: 3 },
  { perm_code: 'menu:create', perm_name: '新增菜单', perm_type: 2, parent_code: 'system:menu', sort: 1 },
  { perm_code: 'menu:update', perm_name: '修改菜单', perm_type: 2, parent_code: 'system:menu', sort: 2 },
  { perm_code: 'menu:delete', perm_name: '删除菜单', perm_type: 2, parent_code: 'system:menu', sort: 3 },

  { perm_code: 'system:dict', perm_name: '数据字典', perm_type: 1, parent_code: 'system', menu_path: '/system/dict', component: 'system/dict/index', icon: 'Collection', sort: 4 },
  { perm_code: 'dict:create', perm_name: '新增字典', perm_type: 2, parent_code: 'system:dict', sort: 1 },
  { perm_code: 'dict:update', perm_name: '修改字典', perm_type: 2, parent_code: 'system:dict', sort: 2 },
  { perm_code: 'dict:delete', perm_name: '删除字典', perm_type: 2, parent_code: 'system:dict', sort: 3 },
  { perm_code: 'dict:import', perm_name: '批量导入字典', perm_type: 2, parent_code: 'system:dict', sort: 4 },
  { perm_code: 'dict:export', perm_name: '导出字典', perm_type: 2, parent_code: 'system:dict', sort: 5 },

  { perm_code: 'system:log', perm_name: '操作日志', perm_type: 1, parent_code: 'system', menu_path: '/system/log', component: 'system/log/index', icon: 'Document', sort: 5 },
  // 注：log:delete 仅授予 admin 角色（db-init 中 admin 绑定全部权限；其他角色不应拥有）
  { perm_code: 'log:delete', perm_name: '删除日志', perm_type: 2, parent_code: 'system:log', sort: 1 },
];
