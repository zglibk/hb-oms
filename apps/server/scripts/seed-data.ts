/**
 * hb-oms 种子数据定义
 * 包含：部门、预置角色、权限树(re-export 权限清单)、数据字典、账号、角色-权限绑定矩阵
 * 字典 dict_value 与 @hb-oms/shared 常量口径一致（product_type/rail_section/part_type/order_unit）
 */

// ---------- 部门 ----------
/**
 * 部门种子。
 *
 * `hr_code` 是**员工编号第 5-7 位**的来源（《员工编码管理规则》）：没有它就没法给
 * 员工建档，所以全新安装必须把这份映射一并种下去，不能只靠迁移
 * （`db:init` 不跑 migrations）。存量库由 `migration-employee-code.sql` 回填，
 * 两条路径的终态必须一致——**改这里记得同步改那个迁移**。
 *
 * 编码 001~011 出自规则《海宝五金员工编码管理规则》第三段的部门编码表。
 */
export const DEPARTMENTS = [
  { dept_code: 'COMPANY', dept_name: '海宝五金', hr_code: null, parent_id: 0, sort: 0 },
  { dept_code: 'PROD', dept_name: '生产部', hr_code: '001', parent_id: 1, sort: 3 },
  { dept_code: 'WAREHOUSE', dept_name: '仓库部', hr_code: '002', parent_id: 1, sort: 2 },
  { dept_code: 'HR_ADMIN', dept_name: '行政人事部', hr_code: '003', parent_id: 1, sort: 13 },
  { dept_code: 'SALE', dept_name: '业务部', hr_code: '004', parent_id: 1, sort: 1 },
  { dept_code: 'HR_QC', dept_name: '品检部', hr_code: '005', parent_id: 1, sort: 15 },
  { dept_code: 'HR_RD', dept_name: '技术研发部', hr_code: '006', parent_id: 1, sort: 16 },
  { dept_code: 'HR_FIN', dept_name: '财务部', hr_code: '007', parent_id: 1, sort: 17 },
  { dept_code: 'HR_PUR', dept_name: '采购部', hr_code: '008', parent_id: 1, sort: 18 },
  { dept_code: 'HR_MOULD', dept_name: '模具部', hr_code: '009', parent_id: 1, sort: 19 },
  { dept_code: 'IT', dept_name: 'IT部', hr_code: '010', parent_id: 1, sort: 4 },
  { dept_code: 'HR_PLAN', dept_name: '计划部', hr_code: '011', parent_id: 1, sort: 21 },
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

  // 人事档案：用工属性（HR 模块；可在字典管理维护）
  // ⚠️ 岗位**不在字典里**——2026-08-11 已升级为 t_position 主数据，见下方 POSITIONS
  { dict_type: 'emp_type', dict_label: '正式工', dict_value: 'formal', sort: 1 },
  { dict_type: 'emp_type', dict_label: '临时工', dict_value: 'temp', sort: 2 },
  { dict_type: 'emp_type', dict_label: '派遣工', dict_value: 'dispatch', sort: 3 },
  { dict_type: 'emp_type', dict_label: '学徒', dict_value: 'apprentice', sort: 4 },
  { dict_type: 'emp_type', dict_label: '实习生', dict_value: 'intern', sort: 5 },
  // 职级（岗位主数据用）：公司实际职级序列，可在数据字典自行增减
  { dict_type: 'job_level', dict_label: '普工', dict_value: 'general_worker', sort: 1 },
  { dict_type: 'job_level', dict_label: '操作工', dict_value: 'operator', sort: 2 },
  { dict_type: 'job_level', dict_label: '维修工', dict_value: 'maintenance_worker', sort: 3 },
  { dict_type: 'job_level', dict_label: '机长', dict_value: 'machine_leader', sort: 4 },
  { dict_type: 'job_level', dict_label: '助理', dict_value: 'assistant', sort: 5 },
  { dict_type: 'job_level', dict_label: '专员（计划 / 跟单 / 财务）', dict_value: 'specialist', sort: 6 },
  { dict_type: 'job_level', dict_label: '班组长', dict_value: 'team_leader', sort: 7 },
  { dict_type: 'job_level', dict_label: '技术员', dict_value: 'technician', sort: 8 },
  { dict_type: 'job_level', dict_label: '主管', dict_value: 'supervisor', sort: 9 },
  { dict_type: 'job_level', dict_label: '工程师', dict_value: 'engineer', sort: 10 },
  { dict_type: 'job_level', dict_label: '主任', dict_value: 'director', sort: 11 },
  { dict_type: 'job_level', dict_label: '副经理', dict_value: 'deputy_manager', sort: 12 },
  { dict_type: 'job_level', dict_label: '经理', dict_value: 'manager', sort: 13 },
  { dict_type: 'job_level', dict_label: '副总经理', dict_value: 'deputy_gm', sort: 14 },
  { dict_type: 'job_level', dict_label: '总经理', dict_value: 'general_manager', sort: 15 },
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

/**
 * 岗位主数据种子（2026-08-11 由字典 hr_position 升级而来）。
 *
 * `db:init` **不跑 migrations**，漏了这份新库就一个岗位都没有、员工岗位下拉是空的
 * （本会话已在 `t_department.hr_code` 上踩过同款坑）。存量库由
 * `migration-position.sql` 从旧字典搬运，两条路径终态一致——**改这里记得同步改那个迁移**。
 *
 * `dept_id` 一律留空 = 通用岗位（不限部门）：旧字典没有部门概念，不臆造归属，
 * 由 HR 上线后在「基础数据 → 岗位管理」里自行指定。
 */
export const POSITIONS = [
  { position_code: 'stamping', position_name: '冲压工', sort: 1 },
  { position_code: 'assembly', position_name: '装配工', sort: 2 },
  { position_code: 'qc', position_name: '质检', sort: 3 },
  { position_code: 'maintenance', position_name: '机修', sort: 4 },
];

// ---------- 账号（plainPwd 在 db-init 中 bcrypt 加密）----------
export const USERS = [
  { username: 'admin', plainPwd: 'Admin@123', real_name: '系统管理员', dept_code: 'IT', roles: ['admin'] },
  { username: 'sales01', plainPwd: 'Sale@123', real_name: '业务员01', dept_code: 'SALE', roles: ['BUS_OPR'] },
  { username: 'follow01', plainPwd: 'Sale@123', real_name: '跟单员01', dept_code: 'SALE', roles: ['DOC_OPR'] },
  { username: 'wh01', plainPwd: 'Wh@12345', real_name: '仓管员01', dept_code: 'WAREHOUSE', roles: ['WH_OPR'] },
];
