import request from '@/utils/request';

export interface EmployeeRow {
  id: number;
  empNo: string;
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
  position: string | null;
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
  empType?: string;
  position?: string;
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

export const createEmployee = (data: Partial<EmployeeRow>) =>
  request.post('/api/employee', data);

export const updateEmployee = (id: number, data: Partial<EmployeeRow>) =>
  request.put(`/api/employee/${id}`, data);

export const deleteEmployee = (id: number) =>
  request.delete(`/api/employee/${id}`);
