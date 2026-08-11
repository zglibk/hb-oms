import request from '@/utils/request';

export interface EmployeeRow {
  id: number;
  /** 员工编号：新增时由服务端按编码规则自动生成，终身不变（试用转正换发除外） */
  empNo: string;
  /** 厂区（编号第 1-2 位来源）：01总厂 02一号分厂 03二号分厂 */
  plantCode: string | null;
  empName: string;
  gender: number;
  idCard: string | null;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  emergencyContact: string | null;
  nativePlace: string | null;
  ethnicity: string | null;
  maritalStatus: string | null;
  politicalStatus: string | null;
  education: string | null;
  educationType: string | null;
  major: string | null;
  graduateSchool: string | null;
  graduateDate: string | null;
  empType: string;
  hireDate: string | null;
  probationMonths: number | null;
  contractEndDate: string | null;
  jobStatus: number;
  leaveDate: string | null;
  leaveReason: string | null;
  deptId: number | null;
  deptName?: string | null;
  teamGroup: string | null;
  /** 岗位：t_position.id（2026-08-11 由字典值改为主数据引用） */
  positionId: number | null;
  /** 岗位名称（服务端解析后带出，停用岗位也照常显示） */
  positionName?: string | null;
  supervisorId: number | null;
  supervisorName?: string | null;
  status: number;
  remark: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  deptId?: number;
  plantCode?: string;
  empType?: string;
  positionId?: number;
  jobStatus?: number;
  status?: number;
  forSupervisor?: boolean;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const getEmployeeList = (params: EmployeeQuery) =>
  request.get<any, PageResult<EmployeeRow> | EmployeeRow[]>('/api/employee', { params });

export const getEmployee = (id: number) =>
  request.get<any, EmployeeRow>(`/api/employee/${id}`);

/** 新增：编号由服务端生成并随响应回传，前端据此提示用户 */
export const createEmployee = (data: Partial<EmployeeRow>) =>
  request.post<any, { id: number; empNo: string }>('/api/employee', data);

/**
 * 编辑：**不传 empNo**（编号终身不变，服务端也会无视）。
 * 仅「实习生/临时工 转正」时传 regenerateEmpNo=true 换发正式编号。
 */
export const updateEmployee = (
  id: number,
  data: Partial<EmployeeRow> & { regenerateEmpNo?: boolean },
) => request.put<any, { id: number; empNo: string; empNoChanged: boolean }>(`/api/employee/${id}`, data);

export const deleteEmployee = (id: number) =>
  request.delete(`/api/employee/${id}`);
