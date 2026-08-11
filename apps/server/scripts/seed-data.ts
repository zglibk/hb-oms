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

// ---------- 内置角色：公司实际岗位编制，数据范围一律「全部」、一律内置 ----------
// data_scope：1全部 2本部门 3本部门及下级 4本人 5自定义
// 存量库由 migration-builtin-roles.sql 同步（含旧编码 salesman/merchandiser/warehouse
// 原地迁移为 BUS_OPR/DOC_OPR/WH_OPR，保住既有用户与权限绑定）；本数组供 db:init 全新安装。
export const ROLES = [
  { role_code: 'GEN_MGR', role_name: '总经理', data_scope: 1, sort: 1, remark: '公司经营决策' },
  { role_code: 'VICE_MGR', role_name: '副总经理', data_scope: 1, sort: 2, remark: '协助总经理分管业务' },
  { role_code: 'BUS_MGR', role_name: '业务经理', data_scope: 1, sort: 3, remark: '业务团队管理与客户维护' },
  { role_code: 'BUS_OPR', role_name: '业务员', data_scope: 1, sort: 4, remark: '录单/跟踪订单完成情况' },
  { role_code: 'DOC_OPR', role_name: '跟单员', data_scope: 1, sort: 5, remark: '订单跟踪/外发跟进' },
  { role_code: 'PLN_MGR', role_name: '计划经理', data_scope: 1, sort: 6, remark: '生产计划统筹' },
  { role_code: 'PLN_OPR', role_name: '计划员', data_scope: 1, sort: 7, remark: '排程与交期跟进' },
  { role_code: 'PROD_MGR', role_name: '生产经理', data_scope: 1, sort: 8, remark: '生产现场管理' },
  { role_code: 'PROD_OPR', role_name: '生产文员', data_scope: 1, sort: 9, remark: '生产数据录入与统计' },
  { role_code: 'WH_OPR', role_name: '仓管员', data_scope: 1, sort: 10, remark: '成品出入库操作' },
  { role_code: 'TECH_MGR', role_name: '技术经理', data_scope: 1, sort: 11, remark: '技术工艺管理' },
  { role_code: 'TECH_ENG', role_name: '技术工程师', data_scope: 1, sort: 12, remark: '工艺文件与图纸维护' },
  { role_code: 'QA_MGR', role_name: '品质经理', data_scope: 1, sort: 13, remark: '品质体系管理' },
  { role_code: 'PQE_ENG', role_name: 'PQE 工程师', data_scope: 1, sort: 14, remark: '制程品质工程' },
  { role_code: 'FIN_MGR', role_name: '财务经理', data_scope: 1, sort: 15, remark: '财务核算管理' },
  { role_code: 'PAY_OPR', role_name: '薪资核算员', data_scope: 1, sort: 16, remark: '计件与薪资核算' },
  { role_code: 'admin', role_name: '系统管理员', data_scope: 1, sort: 17, remark: '系统管理' },
];

// ---------- 权限树 ----------
// 权限清单在 src/modules/system/permission-manifest.ts（唯一事实源，
// 应用启动时由 PermissionSyncService 自动同步落库）。此处 re-export 供 db:init 使用。
export { PERMISSIONS } from '../src/modules/system/permission-manifest';
export type { PermSeed } from '../src/modules/system/permission-manifest';

// ---------- 角色 → 权限 绑定矩阵（值为 perm_code 列表；admin 特殊处理为全部）----------
// M1 仅基础数据/系统管理；订单/外发/出入库权限点随 M2~M4 落地后补充绑定
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // 业务员：基础数据维护（客户/开单信息/部件信息）
  BUS_OPR: [
    'basic', 'basic:customer', 'customer:create', 'customer:update', 'customer:import',
    'basic:process-info', 'process-info:create', 'process-info:update',
    'basic:material', 'material:create', 'material:update', 'material:import', 'material:export',
  ],
  // 跟单员：基础数据查看与维护
  DOC_OPR: [
    'basic', 'basic:customer', 'customer:create', 'customer:update',
    'basic:process-info', 'process-info:create', 'process-info:update',
    'basic:material',
  ],
  // 仓管员：成品出入库操作
  WH_OPR: [
    'material-mgmt', 'finished-stock', 'finished-stock:create', 'finished-stock:update',
    'finished-stock:confirm', 'finished-stock:cancel',
    'stock-balance', 'part-stock',
  ],
  // 其余内置角色不预置权限：岗位职责差异大，由管理员在「角色管理 → 分配权限」按需授予，
  // 预置一套猜测出来的权限反而会让人以为已经配好、不再核对。
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

  // 表面处理（字典驱动，设计文档决策 #4；none 为代码保留值——外发必填逻辑判断依据，禁删禁改值）
  { dict_type: 'surface_type', dict_label: '无', dict_value: 'none', sort: 1 },
  { dict_type: 'surface_type', dict_label: '封漆', dict_value: 'seal_paint', sort: 2 },
  { dict_type: 'surface_type', dict_label: '电泳', dict_value: 'electrophoresis', sort: 3 },
  { dict_type: 'surface_type', dict_label: '喷涂', dict_value: 'spray', sort: 4 },
  { dict_type: 'surface_type', dict_label: '平滑漆', dict_value: 'smooth_paint', sort: 5 },

  // 部件组类型（t_order_part_group.group_type，设计文档决策 #11；与共享包 PART_GROUP_OPTIONS 同步）
  { dict_type: 'part_group_type', dict_label: '整品', dict_value: 'whole', sort: 1 },
  { dict_type: 'part_group_type', dict_label: '外中轨', dict_value: 'outer_middle', sort: 2 },
  { dict_type: 'part_group_type', dict_label: '内轨', dict_value: 'inner', sort: 3 },
  { dict_type: 'part_group_type', dict_label: '外轨', dict_value: 'outer', sort: 4 },
  { dict_type: 'part_group_type', dict_label: '中轨', dict_value: 'middle', sort: 5 },

  // 装配车间（设计文档决策 #12；按手工台账现状 装一~装八，可在字典管理维护）
  { dict_type: 'assembly_workshop', dict_label: '装一', dict_value: 'assembly_1', sort: 1 },
  { dict_type: 'assembly_workshop', dict_label: '装二', dict_value: 'assembly_2', sort: 2 },
  { dict_type: 'assembly_workshop', dict_label: '装三', dict_value: 'assembly_3', sort: 3 },
  { dict_type: 'assembly_workshop', dict_label: '装四', dict_value: 'assembly_4', sort: 4 },
  { dict_type: 'assembly_workshop', dict_label: '装五', dict_value: 'assembly_5', sort: 5 },
  { dict_type: 'assembly_workshop', dict_label: '装六', dict_value: 'assembly_6', sort: 6 },
  { dict_type: 'assembly_workshop', dict_label: '装七', dict_value: 'assembly_7', sort: 7 },
  { dict_type: 'assembly_workshop', dict_label: '装八', dict_value: 'assembly_8', sort: 8 },

  // 表面处理颜色（常用值，可在字典管理维护）
  { dict_type: 'surface_color', dict_label: '黑色', dict_value: '黑色', sort: 1 },
  { dict_type: 'surface_color', dict_label: '白色', dict_value: '白色', sort: 2 },
  { dict_type: 'surface_color', dict_label: '灰色', dict_value: '灰色', sort: 3 },
  { dict_type: 'surface_color', dict_label: '蓝白锌', dict_value: '蓝白锌', sort: 4 },

  // 外发加工商（M3 外发单下拉，可在字典管理维护）
  { dict_type: 'processor', dict_label: '示例加工商', dict_value: '示例加工商', sort: 1 },

  // 人事档案：用工属性 / 岗位（HR 模块；可在字典管理维护）
  { dict_type: 'emp_type', dict_label: '正式工', dict_value: 'formal', sort: 1 },
  { dict_type: 'emp_type', dict_label: '临时工', dict_value: 'temp', sort: 2 },
  { dict_type: 'emp_type', dict_label: '派遣工', dict_value: 'dispatch', sort: 3 },
  { dict_type: 'emp_type', dict_label: '学徒', dict_value: 'apprentice', sort: 4 },
  { dict_type: 'hr_position', dict_label: '冲压工', dict_value: 'stamping', sort: 1 },
  { dict_type: 'hr_position', dict_label: '装配工', dict_value: 'assembly', sort: 2 },
  { dict_type: 'hr_position', dict_label: '质检', dict_value: 'qc', sort: 3 },
  { dict_type: 'hr_position', dict_label: '机修', dict_value: 'maintenance', sort: 4 },
  { dict_type: 'marital_status', dict_label: '未婚', dict_value: 'unmarried', sort: 1 },
  { dict_type: 'marital_status', dict_label: '已婚', dict_value: 'married', sort: 2 },
  { dict_type: 'marital_status', dict_label: '离异', dict_value: 'divorced', sort: 3 },
  { dict_type: 'marital_status', dict_label: '丧偶', dict_value: 'widowed', sort: 4 },
  { dict_type: 'political_status', dict_label: '群众', dict_value: 'masses', sort: 1 },
  { dict_type: 'political_status', dict_label: '共青团员', dict_value: 'league', sort: 2 },
  { dict_type: 'political_status', dict_label: '中共党员', dict_value: 'party', sort: 3 },
  { dict_type: 'political_status', dict_label: '民主党派', dict_value: 'democratic', sort: 4 },
  { dict_type: 'education', dict_label: '小学', dict_value: 'primary', sort: 1 },
  { dict_type: 'education', dict_label: '初中', dict_value: 'junior', sort: 2 },
  { dict_type: 'education', dict_label: '高中/中专', dict_value: 'senior', sort: 3 },
  { dict_type: 'education', dict_label: '大专', dict_value: 'college', sort: 4 },
  { dict_type: 'education', dict_label: '本科', dict_value: 'bachelor', sort: 5 },
  { dict_type: 'education', dict_label: '硕士', dict_value: 'master', sort: 6 },
  { dict_type: 'education', dict_label: '博士', dict_value: 'doctor', sort: 7 },
];

// ---------- 账号（plainPwd 在 db-init 中 bcrypt 加密）----------
export const USERS = [
  { username: 'admin', plainPwd: 'Admin@123', real_name: '系统管理员', dept_code: 'IT', roles: ['admin'] },
  { username: 'sales01', plainPwd: 'Sale@123', real_name: '业务员01', dept_code: 'SALE', roles: ['BUS_OPR'] },
  { username: 'follow01', plainPwd: 'Sale@123', real_name: '跟单员01', dept_code: 'SALE', roles: ['DOC_OPR'] },
  { username: 'wh01', plainPwd: 'Wh@12345', real_name: '仓管员01', dept_code: 'WAREHOUSE', roles: ['WH_OPR'] },
];
