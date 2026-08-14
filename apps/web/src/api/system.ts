import request from '@/utils/request';

// ===== 用户 =====
export const getUserList = (params: any) =>
  request.get('/api/system/user', { params });
export const getUserDetail = (id: number) =>
  request.get(`/api/system/user/${id}`);
export const createUser = (data: any) => request.post('/api/system/user', data);
export const updateUser = (id: number, data: any) =>
  request.put(`/api/system/user/${id}`, data);
export const assignUserRoles = (id: number, roleIds: number[]) =>
  request.post(`/api/system/user/${id}/roles`, { roleIds });
export const resetUserPassword = (id: number, password: string) =>
  request.post(`/api/system/user/${id}/reset-password`, { password });
export const toggleUserStatus = (id: number, status: number) =>
  request.post(`/api/system/user/${id}/status/${status}`);
export const deleteUsers = (ids: number[]) =>
  request.delete('/api/system/user', { data: { ids } });

// ===== 角色 =====
export const getRoleList = () => request.get<any, any[]>('/api/system/role');
export const createRole = (data: any) => request.post('/api/system/role', data);
export const updateRole = (id: number, data: any) =>
  request.put(`/api/system/role/${id}`, data);
export const deleteRole = (id: number) =>
  request.delete(`/api/system/role/${id}`);
export const getRolePermissions = (id: number) =>
  request.get<any, number[]>(`/api/system/role/${id}/permissions`);
export const assignRolePermissions = (id: number, permissionIds: number[]) =>
  request.post(`/api/system/role/${id}/permissions`, { permissionIds });

// ===== 菜单/权限 =====
export const getMenuTree = () =>
  request.get<any, any[]>('/api/system/menu/tree');
export const createMenu = (data: any) => request.post('/api/system/menu', data);
export const updateMenu = (id: number, data: any) =>
  request.put(`/api/system/menu/${id}`, data);
export const deleteMenu = (id: number) =>
  request.delete(`/api/system/menu/${id}`);

// ===== 字典 =====
export const getDictList = (dictType?: string) =>
  request.get<any, any[]>('/api/system/dict', { params: { dictType } });
export const getDictTypes = () =>
  request.get<any, string[]>('/api/system/dict/types');
export const getDictByType = (type: string) =>
  request.get<any, any[]>(`/api/system/dict/type/${type}`);
export const createDict = (data: any) => request.post('/api/system/dict', data);
export const updateDict = (id: number, data: any) =>
  request.put(`/api/system/dict/${id}`, data);
export const deleteDict = (id: number) =>
  request.delete(`/api/system/dict/${id}`);

// 字典批量导入/导出
export interface DictImportResult {
  total: number;
  success: number;
  failed: number;
  aborted: boolean;
  errors: { row: number; message: string }[];
}

/** 下载字典导入模板，触发浏览器下载 */
export async function downloadDictTemplate(): Promise<void> {
  const resp: any = await request.get('/api/system/dict/template', {
    responseType: 'blob',
    __raw: true,
  } as any);
  const blob: Blob = resp.data ?? resp;
  const disposition: string | undefined = resp.headers?.['content-disposition'];
  let filename = '字典导入模板.xlsx';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (star?.[1]) {
    try {
      filename = decodeURIComponent(star[1]);
    } catch {
      /* ignore */
    }
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/** 上传 xlsx 批量导入字典 */
export const importDict = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post<any, DictImportResult>('/api/system/dict/import', fd);
};

/** 导出字典为 Excel（可按类型筛选，或按 ids 导出勾选记录），触发浏览器下载 */
export async function exportDictList(
  dictType?: string,
  ids?: number[],
): Promise<void> {
  const params: any = { dictType };
  if (ids && ids.length) params.ids = ids.join(',');
  const resp: any = await request.get('/api/system/dict/export', {
    params,
    responseType: 'blob',
    __raw: true,
  } as any);
  const blob: Blob = resp.data ?? resp;
  const disposition: string | undefined = resp.headers?.['content-disposition'];
  let filename = '数据字典.xlsx';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (star?.[1]) {
    try {
      filename = decodeURIComponent(star[1]);
    } catch {
      /* ignore */
    }
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ===== 部门 =====
export const getDeptList = () => request.get<any, any[]>('/api/system/dept');

/* ===== 部门信息（基础数据）===== */
export interface DeptNode {
  id: number;
  deptCode: string;
  deptName: string;
  /** 部门人事编码（员工编号第 5-7 位，如 005）；空=该部门不参与员工编码 */
  hrCode: string | null;
  parentId: number;
  sort: number;
  leader: string | null;
  phone: string | null;
  status: number;
  children: DeptNode[];
  /**
   * 前端标注的层级（1 起，公司=1、部门=2、班组=3…），**接口不返回**。
   * el-table 树形插槽不给节点深度，而部门图标要按层级取，故取到树后自行标注。
   */
  _level?: number;
}
export const getDeptTree = () => request.get<any, DeptNode[]>('/api/system/dept/tree');
export const createDept = (data: Partial<DeptNode>) => request.post('/api/system/dept', data);
export const updateDept = (id: number, data: Partial<DeptNode>) =>
  request.put(`/api/system/dept/${id}`, data);
export const deleteDept = (id: number) => request.delete(`/api/system/dept/${id}`);

// ===== 日志 =====
export const getLogList = (params: any) =>
  request.get('/api/system/log', { params });
export const getLogModules = () =>
  request.get<any, string[]>('/api/system/log/modules');
export const getLogActions = (module?: string) =>
  request.get<any, string[]>('/api/system/log/actions', {
    params: module ? { module } : {},
  });
export const deleteLogs = (ids: number[]) =>
  request.delete('/api/system/log', { data: { ids } });

// ===== 物料主数据 =====
export const getMaterialByCode = (code: string) =>
  request.get<any, any>('/api/system/material/by-code', { params: { code } });
export const getMaterialItemNumbers = () =>
  request.get<any, string[]>('/api/system/material/item-nos');
export const getMaterialList = (params: any) =>
  request.get<any, { list: any[]; total: number; page: number; pageSize: number }>(
    '/api/system/material',
    { params },
  );
export const createMaterial = (data: any) =>
  request.post('/api/system/material', data);
export const updateMaterial = (id: number, data: any) =>
  request.put(`/api/system/material/${id}`, data);
export const deleteMaterial = (id: number) =>
  request.delete(`/api/system/material/${id}`);

// ===== 物料批量导入 =====
export interface MaterialImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; materialCode: string; message: string }[];
}

/** 下载物料批量导入模板（带样式的 xlsx），触发浏览器下载 */
export async function downloadMaterialTemplate(): Promise<void> {
  const resp: any = await request.get('/api/system/material/template', {
    responseType: 'blob',
    __raw: true,
  } as any);
  const blob: Blob = resp.data ?? resp;
  const disposition: string | undefined = resp.headers?.['content-disposition'];
  let filename = '物料导入模板.xlsx';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (star?.[1]) {
    try {
      filename = decodeURIComponent(star[1]);
    } catch {
      /* ignore */
    }
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/** 上传 xlsx 批量导入物料 */
export const importMaterial = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post<any, MaterialImportResult>(
    '/api/system/material/import',
    fd,
  );
};

/** 导出物料清单为 Excel（遵循当前筛选条件；params.ids 存在时仅导出勾选记录），触发浏览器下载 */
export async function exportMaterialList(params: any): Promise<void> {
  const reqParams: any = { ...params };
  if (Array.isArray(reqParams.ids) && reqParams.ids.length) {
    reqParams.ids = reqParams.ids.join(',');
  } else {
    delete reqParams.ids;
  }
  const resp: any = await request.get('/api/system/material/export', {
    params: reqParams,
    responseType: 'blob',
    __raw: true,
  } as any);
  const blob: Blob = resp.data ?? resp;
  const disposition: string | undefined = resp.headers?.['content-disposition'];
  let filename = '物料清单.xlsx';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (star?.[1]) {
    try {
      filename = decodeURIComponent(star[1]);
    } catch {
      /* ignore */
    }
  }
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ===== 系统配置 =====
export interface SystemConfig {
  logoUrl: string | null;
  faviconUrl: string | null;
  companyName: string | null;
  systemName: string | null;
  contactPhone: string | null;
  companyAddress: string | null;
  bankAccount: string | null;
  taxNo: string | null;
  copyrightInfo: string | null;
  loginBgUrl: string | null;
  loginBgSetAsDefault: number;
  /** 「颜色」字段全局启用开关：1启用 0停用 */
  colorFieldEnabled: number;
  /** 「客户图号」字段全局启用开关：1启用 0停用 */
  customerDrawingNoEnabled: number;
  /** 「呆滞品颜色」字段启用开关：1启用 0停用（**独立于** colorFieldEnabled） */
  dullStockColorEnabled: number;
  /** 「产品要求描述」字段启用开关：1启用 0停用（订单产品级的特殊要求文本） */
  productRequirementEnabled: number;
  /** 英寸换算系数：1 英寸 = N mm（缺省 25，我司口径）；不重算已落库的 mm */
  inchToMm: number;
  /** 规格默认查看单位：mm / inch（三张汇总页初始视图 + 两个导出的规格列） */
  dimensionViewUnit: string;
  /** 送货单全局默认模板编码（客户资料未单独绑定模板时才用它） */
  deliveryTemplateDefault: string;
  /** 审计（单例配置行只有更新侧语义，接口只回不收） */
  updaterName?: string | null;
  updatedAt?: string | null;
}

/**
 * 业务字段开关（仅需登录即可读）：各业务页据此决定字段显隐。
 * 与 PublicSystemConfig 分开——那个是登录页免登读的品牌信息，这个是登录后的业务开关。
 */
export interface FeatureFlags {
  /** 「颜色」字段是否启用（与「表面处理」配套的业务字段，非主题色） */
  colorFieldEnabled: boolean;
  /** 「客户图号」字段是否启用（客户来图图号，非部件组的生产图号） */
  customerDrawingNoEnabled: boolean;
  /**
   * 呆滞品管理页的「颜色」是否启用。
   * **独立于 colorFieldEnabled**：呆滞品的表面处理与颜色是配套联动带出的辨货依据，
   * 与订单/外发口径要不要颜色是两回事，故各管各的（见后端实体注释）。
   */
  dullStockColorEnabled: boolean;
  /** 「产品要求描述」字段是否启用（订单产品级的特殊要求文本） */
  productRequirementEnabled: boolean;
  /**
   * 英寸换算系数（1 英寸 = N mm）。**非布尔项**——管理员在系统配置里设定，
   * 缺省 25（我司口径，非国标 25.4）。只影响之后的录入折算与寸视图显示，
   * 已落库的 mm 不重算。
   */
  inchToMm: number;
  /** 规格默认查看单位：三张汇总页的初始视图与两个导出的规格列都看它 */
  dimensionViewUnit: 'mm' | 'inch';
  /**
   * 送货单默认模板编码（**非布尔项**）：客户资料未单独绑定模板时用它。
   * 版式定义在 constants/delivery-note.ts；取到未知编码时打印页回落通用模板。
   */
  deliveryTemplateDefault: string;
}

/** 公开接口返回的脱敏配置（不含银行账号/税号/联系电话/公司地址） */
export interface PublicSystemConfig {
  logoUrl: string | null;
  faviconUrl: string | null;
  companyName: string | null;
  systemName: string | null;
  copyrightInfo: string | null;
  loginBgUrl: string | null;
  loginBgSetAsDefault: number;
}

/** 管理员读取完整配置 */
export const getSystemConfig = () =>
  request.get<any, SystemConfig>('/api/system/config');
/** 管理员更新配置 */
export const updateSystemConfig = (data: Partial<SystemConfig>) =>
  request.put('/api/system/config', data);
/** 公开接口（登录页免登读取） */
export const getPublicSystemConfig = () =>
  request.get<any, PublicSystemConfig>('/api/system/config/public');
/** 业务字段开关（仅需登录，无需菜单权限） */
export const getFeatureFlags = () =>
  request.get<any, FeatureFlags>('/api/system/config/features');

/* 审批管理不移植：OMS 无审核流（设计文档决策 #2） */

/** 危险操作：清理业务测试数据（仅 admin） */
export interface CleanupResult {
  truncated: string[];
  orderCount: number;
  message: string;
}
export const cleanupBusinessData = (confirm: string) =>
  request.post<any, CleanupResult>('/api/system/config/cleanup', { confirm });
