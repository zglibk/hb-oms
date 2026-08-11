import request from '@/utils/request';
import type { PageResult } from './customer';

/** 岗位主数据行 */
export interface PositionRow {
  id: number;
  positionCode: string;
  positionName: string;
  /** 所属部门；null = 通用岗位（不限部门） */
  deptId: number | null;
  deptName?: string | null;
  jobLevel: string | null;
  /** 1 是管理岗 / 0 否 */
  isManager: number;
  /** 编制人数；null = 不限编 */
  headcount: number | null;
  /** 在岗人数（只数在职员工），与 headcount 对照看是否超编 */
  employeeCount?: number;
  sort: number;
  status: number;
  remark: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 下拉选项（投影收窄，不含编制人数/备注） */
export interface PositionOption {
  id: number;
  positionCode: string;
  positionName: string;
  deptId: number | null;
  isManager: number;
}

export interface PositionQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  deptId?: number;
  isManager?: number;
  status?: number;
  onlyCommon?: boolean;
}

export interface PositionPayload {
  positionCode: string;
  positionName: string;
  deptId?: number;
  jobLevel?: string;
  isManager?: number;
  headcount?: number;
  sort?: number;
  status?: number;
  remark?: string;
}

export const getPositionList = (params: PositionQuery) =>
  request.get<any, PageResult<PositionRow>>('/api/position', { params });

/**
 * 岗位下拉。传 deptId 则回「该部门岗位 + 通用岗位」。
 * 该接口仅需登录（人事档案建档的人未必有基础数据菜单）。
 */
export const getPositionOptions = (params?: { deptId?: number }) =>
  request.get<any, PositionOption[]>('/api/position/all', { params });

export const createPosition = (data: PositionPayload) =>
  request.post<any, { id: number }>('/api/position', data);

export const updatePosition = (id: number, data: PositionPayload) =>
  request.put<any, { id: number }>(`/api/position/${id}`, data);

export const deletePosition = (id: number) => request.delete(`/api/position/${id}`);
