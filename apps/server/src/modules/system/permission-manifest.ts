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
 *
 * 【页面读权限 = 菜单权限点本身】
 * 各模块的 GET 接口一律用其所属菜单的 perm_code 作守卫（如 order / ledger /
 * outsource / basic:customer），只勾菜单、不勾增删改按钮即得只读角色。
 * 少数跨页引用型只读接口（客户下拉、字典、部门树等）例外，见各 controller 注释。
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
  /**
   * 权限性质：0 操作 / 1 查看（只读）。缺省由 accessTypeOf() 推导——
   * 菜单即页面读权限故记为查看，按钮默认是操作。按钮型的读权限点
   * （如「查看首页看板」）必须在此显式写 access_type: 1，否则会被
   * 角色权限树的「仅授只读」漏掉、也不会参与同页读权限补齐。
   */
  access_type?: number;
}

/** 权限性质缺省推导：菜单=查看、按钮=操作 */
export function accessTypeOf(p: PermSeed): number {
  return p.access_type ?? (p.perm_type === 1 ? 1 : 0);
}

export const PERMISSIONS: PermSeed[] = [
  // ===== 统计查看：首页看板不是菜单（静态路由），但它聚合全厂订单/欠数/库存，
  // 需要能按角色收回。分组容器 stat 刻意用 perm_type=2，建成菜单会在侧栏多出
  // 一条点不开的条目（buildMenuTree 只取 perm_type=1，故不影响侧栏）。 =====
  { perm_code: 'stat', perm_name: '统计查看', perm_type: 2, sort: 1 },
  { perm_code: 'stat:dashboard', perm_name: '查看首页看板', perm_type: 2, parent_code: 'stat', access_type: 1, sort: 1 },

  // ===== 订单跟踪台账：系统核心产出，按设计文档 §8 作「首页级入口」置于一级菜单最前 =====
  { perm_code: 'ledger', perm_name: '订单跟踪台账', perm_type: 1, menu_path: '/ledger', component: 'ledger/index', icon: 'DataAnalysis', sort: 4 },
  // 按钮权限（perm_type=2）不进菜单树（auth.service.buildMenuTree 只取 permType===1），
  // 所以挂在这里不会把台账从一级叶子菜单变成可展开的父菜单
  { perm_code: 'ledger:export', perm_name: '导出台账', perm_type: 2, parent_code: 'ledger', sort: 1 },

  // ===== 生产管理（订单管理挂其下；M3 外发/M3.5 装配/M4 出入库同入此组） =====
  { perm_code: 'production', perm_name: '生产管理', perm_type: 1, menu_path: '/production', icon: 'Operation', sort: 5 },

  { perm_code: 'order', perm_name: '订单管理', perm_type: 1, parent_code: 'production', menu_path: '/order', component: 'order/index', icon: 'Tickets', sort: 1 },
  { perm_code: 'order:create', perm_name: '新增订单', perm_type: 2, parent_code: 'order', sort: 1 },
  { perm_code: 'order:update', perm_name: '编辑订单', perm_type: 2, parent_code: 'order', sort: 2 },
  { perm_code: 'order:finish', perm_name: '完结/重开订单', perm_type: 2, parent_code: 'order', sort: 3 },
  // 2026-08-07：作废改为删除（两者限制条件相同——被下游引用即禁止，留废记录无价值）
  { perm_code: 'order:delete', perm_name: '删除订单', perm_type: 2, parent_code: 'order', sort: 4 },
  { perm_code: 'order:export', perm_name: '导出总计划', perm_type: 2, parent_code: 'order', sort: 5 },

  { perm_code: 'outsource', perm_name: '外发管理', perm_type: 1, parent_code: 'production', menu_path: '/outsource', component: 'outsource/index', icon: 'Van', sort: 2 },
  // 2026-08-10：外发两轮简化到「回厂流水」——发坯单连同 send / close / cancel /
  // return / return-cancel / print 一并下线，只剩增删改。库中残留权限行由
  // migration-outsource-rebuild-part.sql 清理（清单同步只增不删）。
  { perm_code: 'outsource:create', perm_name: '登记外发件回厂', perm_type: 2, parent_code: 'outsource', sort: 1 },
  { perm_code: 'outsource:update', perm_name: '编辑回厂记录', perm_type: 2, parent_code: 'outsource', sort: 2 },
  { perm_code: 'outsource:delete', perm_name: '删除回厂记录', perm_type: 2, parent_code: 'outsource', sort: 3 },

  { perm_code: 'assembly', perm_name: '装配管理', perm_type: 1, parent_code: 'production', menu_path: '/assembly', component: 'assembly/index', icon: 'Tools', sort: 3 },
  { perm_code: 'assembly:create', perm_name: '新增装配批次', perm_type: 2, parent_code: 'assembly', sort: 1 },
  { perm_code: 'assembly:update', perm_name: '编辑装配批次', perm_type: 2, parent_code: 'assembly', sort: 2 },
  { perm_code: 'assembly:delete', perm_name: '删除装配批次', perm_type: 2, parent_code: 'assembly', sort: 3 },
  { perm_code: 'assembly:export', perm_name: '导出装配记录', perm_type: 2, parent_code: 'assembly', sort: 4 },


  // ===== 工艺管理 =====
  { perm_code: 'process', perm_name: '工艺管理', perm_type: 1, menu_path: '/process', icon: 'SetUp', sort: 6 },

  { perm_code: 'basic:process-info', perm_name: '开单信息', perm_type: 1, parent_code: 'process', menu_path: '/basic/process-info', component: 'basic/process-info/index', icon: 'Document', sort: 1 },
  { perm_code: 'process-info:create', perm_name: '新增开单信息', perm_type: 2, parent_code: 'basic:process-info', sort: 1 },
  { perm_code: 'process-info:update', perm_name: '编辑开单信息', perm_type: 2, parent_code: 'basic:process-info', sort: 2 },
  { perm_code: 'process-info:delete', perm_name: '删除开单信息', perm_type: 2, parent_code: 'basic:process-info', sort: 3 },
  { perm_code: 'process-info:import', perm_name: '批量导入开单信息', perm_type: 2, parent_code: 'basic:process-info', sort: 4 },
  { perm_code: 'process-info:export', perm_name: '导出开单信息', perm_type: 2, parent_code: 'basic:process-info', sort: 5 },

  // ===== 物料管理（成品库存口径：出入库单据 + 结存查询） =====
  { perm_code: 'material-mgmt', perm_name: '物料管理', perm_type: 1, menu_path: '/material', icon: 'Box', sort: 7 },

  { perm_code: 'finished-stock', perm_name: '成品出入库', perm_type: 1, parent_code: 'material-mgmt', menu_path: '/finished-stock', component: 'finished-stock/index', icon: 'Goods', sort: 1 },
  { perm_code: 'finished-stock:create', perm_name: '新增出入库单', perm_type: 2, parent_code: 'finished-stock', sort: 1 },
  { perm_code: 'finished-stock:update', perm_name: '编辑出入库单', perm_type: 2, parent_code: 'finished-stock', sort: 2 },
  { perm_code: 'finished-stock:confirm', perm_name: '确认出入库单', perm_type: 2, parent_code: 'finished-stock', sort: 3 },
  { perm_code: 'finished-stock:cancel', perm_name: '作废出入库单', perm_type: 2, parent_code: 'finished-stock', sort: 4 },
  { perm_code: 'finished-stock:reverse', perm_name: '红字冲销', perm_type: 2, parent_code: 'finished-stock', sort: 5 },
  // 送货单：打印页取数走菜单读权限，出 PDF 走这个操作权限（§5.6 送货单打印）
  { perm_code: 'finished-stock:print', perm_name: '打印送货单', perm_type: 2, parent_code: 'finished-stock', sort: 6 },

  { perm_code: 'stock-balance', perm_name: '成品库存', perm_type: 1, parent_code: 'material-mgmt', menu_path: '/stock-balance', component: 'stock-balance/index', icon: 'Files', sort: 2 },
  // 导入 = 批量搬上线前的存量，落地成一张 FGO 期初单（余额只能由单据驱动，§5.6），
  // 故它是「能凭空加库存」的写权限，与只读的导出分开授予
  { perm_code: 'stock-balance:import', perm_name: '批量导入成品库存', perm_type: 2, parent_code: 'stock-balance', sort: 1 },
  { perm_code: 'stock-balance:export', perm_name: '导出成品库存', perm_type: 2, parent_code: 'stock-balance', sort: 2 },

  // 呆滞品管理（2026-08-11 由「成品期初（不挂订单）」拆分独立）：已完结订单剩下的成品，
  // 逐批建档跟踪 期初/入库/出库/结存 四个数。紧挨成品库存，同为成品口径
  { perm_code: 'dull-stock', perm_name: '呆滞品管理', perm_type: 1, parent_code: 'material-mgmt', menu_path: '/dull-stock', component: 'dull-stock/index', icon: 'Warning', sort: 3 },
  { perm_code: 'dull-stock:create', perm_name: '新增呆滞品', perm_type: 2, parent_code: 'dull-stock', sort: 1 },
  { perm_code: 'dull-stock:update', perm_name: '编辑呆滞品', perm_type: 2, parent_code: 'dull-stock', sort: 2 },
  { perm_code: 'dull-stock:delete', perm_name: '删除呆滞品', perm_type: 2, parent_code: 'dull-stock', sort: 3 },
  { perm_code: 'dull-stock:stock', perm_name: '登记出入库', perm_type: 2, parent_code: 'dull-stock', sort: 4 },
  { perm_code: 'dull-stock:import', perm_name: '批量导入呆滞品', perm_type: 2, parent_code: 'dull-stock', sort: 5 },
  { perm_code: 'dull-stock:export', perm_name: '导出呆滞品', perm_type: 2, parent_code: 'dull-stock', sort: 6 },

  { perm_code: 'part-stock', perm_name: '部件台账', perm_type: 1, parent_code: 'material-mgmt', menu_path: '/part-stock', component: 'part-stock/index', icon: 'Grid', sort: 4 },
  { perm_code: 'part-stock:adjust', perm_name: '调整部件余量', perm_type: 2, parent_code: 'part-stock', sort: 1 },
  // 导入 = 批量调整余量（部件台账没有「直接设余量」的通道），故与 adjust 同属写权限
  { perm_code: 'part-stock:import', perm_name: '批量导入调整', perm_type: 2, parent_code: 'part-stock', sort: 2 },
  { perm_code: 'part-stock:export', perm_name: '导出部件台账', perm_type: 2, parent_code: 'part-stock', sort: 3 },

  { perm_code: 'opening', perm_name: '期初录入', perm_type: 1, parent_code: 'material-mgmt', menu_path: '/opening', component: 'opening/index', icon: 'Upload', sort: 5 },
  { perm_code: 'opening:finished', perm_name: '成品期初录入', perm_type: 2, parent_code: 'opening', sort: 1 },
  { perm_code: 'opening:part', perm_name: '部件期初录入', perm_type: 2, parent_code: 'opening', sort: 2 },

  // ===== 统计分析（财务需求 2026-08-14：跨订单的产品维度汇总查询）=====
  // 刻意不预置给任何内置角色（种子只给 BUS_OPR/DOC_OPR/WH_OPR 预置权限的既有口径），
  // 上线后由管理员在「角色管理 → 分配权限」勾给财务相关角色；admin 由启动同步自动补授。
  { perm_code: 'analysis', perm_name: '统计分析', perm_type: 1, menu_path: '/analysis', icon: 'TrendCharts', sort: 8 },

  { perm_code: 'product-summary', perm_name: '产品汇总', perm_type: 1, parent_code: 'analysis', menu_path: '/analysis/product-summary', component: 'analysis/product-summary/index', icon: 'PieChart', sort: 1 },
  { perm_code: 'product-summary:export', perm_name: '导出产品汇总', perm_type: 2, parent_code: 'product-summary', sort: 1 },

  // ===== 设备管理（2026-08-14 sort 8→9：给「统计分析」腾出物料与设备之间的位置）=====
  { perm_code: 'equipment', perm_name: '设备管理', perm_type: 1, menu_path: '/equipment', icon: 'Cpu', sort: 9 },

  { perm_code: 'equipment:info', perm_name: '设备信息', perm_type: 1, parent_code: 'equipment', menu_path: '/equipment/info', component: 'equipment/info/index', icon: 'Monitor', sort: 1 },
  { perm_code: 'equipment-info:create', perm_name: '新增设备信息', perm_type: 2, parent_code: 'equipment:info', sort: 1 },
  { perm_code: 'equipment-info:update', perm_name: '编辑设备信息', perm_type: 2, parent_code: 'equipment:info', sort: 2 },
  { perm_code: 'equipment-info:delete', perm_name: '删除设备信息', perm_type: 2, parent_code: 'equipment:info', sort: 3 },

  // ===== HR 人力资源管理（可读部门等主数据；V1 暂不向业务模块对外供数）=====
  { perm_code: 'hr', perm_name: 'HR人力资源管理', perm_type: 1, menu_path: '/hr', icon: 'Avatar', sort: 15 },
  { perm_code: 'hr:employee', perm_name: '人事档案', perm_type: 1, parent_code: 'hr', menu_path: '/hr/employee', component: 'hr/employee/index', icon: 'User', sort: 1 },
  { perm_code: 'employee:create', perm_name: '新增员工', perm_type: 2, parent_code: 'hr:employee', sort: 1 },
  { perm_code: 'employee:update', perm_name: '编辑员工', perm_type: 2, parent_code: 'hr:employee', sort: 2 },
  { perm_code: 'employee:delete', perm_name: '删除员工', perm_type: 2, parent_code: 'hr:employee', sort: 3 },

  // ===== 基础数据 =====
  { perm_code: 'basic', perm_name: '基础数据', perm_type: 1, menu_path: '/basic', icon: 'Coin', sort: 10 },

  { perm_code: 'basic:customer', perm_name: '客户资料', perm_type: 1, parent_code: 'basic', menu_path: '/basic/customer', component: 'basic/customer/index', icon: 'OfficeBuilding', sort: 1 },
  { perm_code: 'customer:create', perm_name: '新增客户', perm_type: 2, parent_code: 'basic:customer', sort: 1 },
  { perm_code: 'customer:update', perm_name: '编辑客户', perm_type: 2, parent_code: 'basic:customer', sort: 2 },
  { perm_code: 'customer:delete', perm_name: '删除客户', perm_type: 2, parent_code: 'basic:customer', sort: 3 },
  { perm_code: 'customer:import', perm_name: '批量导入客户', perm_type: 2, parent_code: 'basic:customer', sort: 4 },

  // 供应商紧挨客户资料：两者都是往来单位主数据，维护人是同一批
  { perm_code: 'basic:supplier', perm_name: '供应商', perm_type: 1, parent_code: 'basic', menu_path: '/basic/supplier', component: 'basic/supplier/index', icon: 'Van', sort: 2 },
  { perm_code: 'supplier:create', perm_name: '新增供应商', perm_type: 2, parent_code: 'basic:supplier', sort: 1 },
  { perm_code: 'supplier:update', perm_name: '编辑供应商', perm_type: 2, parent_code: 'basic:supplier', sort: 2 },
  { perm_code: 'supplier:delete', perm_name: '删除供应商', perm_type: 2, parent_code: 'basic:supplier', sort: 3 },

  { perm_code: 'basic:dept', perm_name: '部门信息', perm_type: 1, parent_code: 'basic', menu_path: '/basic/dept', component: 'basic/dept/index', icon: 'School', sort: 3 },
  { perm_code: 'dept:create', perm_name: '新增部门', perm_type: 2, parent_code: 'basic:dept', sort: 1 },
  { perm_code: 'dept:update', perm_name: '编辑部门', perm_type: 2, parent_code: 'basic:dept', sort: 2 },
  { perm_code: 'dept:delete', perm_name: '删除部门', perm_type: 2, parent_code: 'basic:dept', sort: 3 },

  // 岗位管理（2026-08-11 由字典 hr_position 升级为主数据）：与部门同属组织类主数据，故紧挨部门信息
  { perm_code: 'basic:position', perm_name: '岗位管理', perm_type: 1, parent_code: 'basic', menu_path: '/basic/position', component: 'basic/position/index', icon: 'Postcard', sort: 4 },
  { perm_code: 'position:create', perm_name: '新增岗位', perm_type: 2, parent_code: 'basic:position', sort: 1 },
  { perm_code: 'position:update', perm_name: '编辑岗位', perm_type: 2, parent_code: 'basic:position', sort: 2 },
  { perm_code: 'position:delete', perm_name: '删除岗位', perm_type: 2, parent_code: 'basic:position', sort: 3 },
  { perm_code: 'position:import', perm_name: '批量导入岗位', perm_type: 2, parent_code: 'basic:position', sort: 4 },
  { perm_code: 'position:export', perm_name: '导出岗位', perm_type: 2, parent_code: 'basic:position', sort: 5 },

  // 职级管理（2026-08-12 由字典 job_level 升级为主数据）：职级是「序列内的等级」，
  // 按岗位性质分序列，紧挨岗位管理
  { perm_code: 'basic:job-level', perm_name: '职级管理', perm_type: 1, parent_code: 'basic', menu_path: '/basic/job-level', component: 'basic/job-level/index', icon: 'Rank', sort: 5 },
  { perm_code: 'job-level:create', perm_name: '新增职级', perm_type: 2, parent_code: 'basic:job-level', sort: 1 },
  { perm_code: 'job-level:update', perm_name: '编辑职级', perm_type: 2, parent_code: 'basic:job-level', sort: 2 },
  { perm_code: 'job-level:delete', perm_name: '删除职级', perm_type: 2, parent_code: 'basic:job-level', sort: 3 },

  // 部件信息（原物料信息，2026-08 改版；perm_code/路由/组件路径保持 material 内部标识稳定，
  // 2026-08-07 由「物料管理」移入「基础数据」——它本就是主数据，与出入库单据不同性质）
  { perm_code: 'basic:material', perm_name: '部件信息', perm_type: 1, parent_code: 'basic', menu_path: '/basic/material', component: 'system/material/index', icon: 'Grid', sort: 6 },
  { perm_code: 'material:create', perm_name: '新增部件', perm_type: 2, parent_code: 'basic:material', sort: 1 },
  { perm_code: 'material:update', perm_name: '编辑部件', perm_type: 2, parent_code: 'basic:material', sort: 2 },
  { perm_code: 'material:delete', perm_name: '删除部件', perm_type: 2, parent_code: 'basic:material', sort: 3 },
  { perm_code: 'material:import', perm_name: '批量导入部件', perm_type: 2, parent_code: 'basic:material', sort: 4 },
  { perm_code: 'material:export', perm_name: '导出部件清单', perm_type: 2, parent_code: 'basic:material', sort: 5 },

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

  // 更新日志（移植自 hb-mes）
  { perm_code: 'system:changelog', perm_name: '更新日志', perm_type: 1, parent_code: 'system', menu_path: '/system/changelog', component: 'system/changelog/index', icon: 'Memo', sort: 6 },
  { perm_code: 'changelog:create', perm_name: '新增版本', perm_type: 2, parent_code: 'system:changelog', sort: 1 },
  { perm_code: 'changelog:update', perm_name: '修改版本', perm_type: 2, parent_code: 'system:changelog', sort: 2 },
  { perm_code: 'changelog:delete', perm_name: '删除版本', perm_type: 2, parent_code: 'system:changelog', sort: 3 },

  // 系统配置（移植自 hb-mes，不含审批管理——OMS 无审核流）
  { perm_code: 'system:config', perm_name: '系统配置', perm_type: 1, parent_code: 'system', menu_path: '/system/config', component: 'system/config/index', icon: 'Tools', sort: 7 },
  { perm_code: 'config:update', perm_name: '修改配置', perm_type: 2, parent_code: 'system:config', sort: 1 },
  // 注：system:danger（清理业务测试数据）仅授予 admin
  { perm_code: 'system:danger', perm_name: '危险操作', perm_type: 2, parent_code: 'system:config', sort: 2 },

  /*
   * 打印模板（2026-08-14）：看每套送货单模板的实际效果、指定全局默认模板。
   * 纯前端页面，**没有自己的后端接口**——模板是代码定义的（前端注册表），
   * 「设为默认」复用系统配置的 PUT /system/config（故按钮挂 config:update）。
   * 因此这里只有菜单权限点，不需要配套的操作权限点。
   */
  { perm_code: 'system:print-template', perm_name: '打印模板', perm_type: 1, parent_code: 'system', menu_path: '/system/print-template', component: 'system/print-template/index', icon: 'Printer', sort: 8 },
];
