import request from '@/utils/request';
import { downloadXlsx } from '@/utils/download';
import type { PageResult } from './customer';

/** 岗位主数据行 */
export interface PositionRow {
  id: number;
  positionCode: string;
  positionName: string;
  /** 所属部门；null = 通用岗位（不限部门） */
  deptId: number | null;
  deptName?: string | null;
  /** 岗位性质：normal普通岗 / manager管理岗 / tech技术岗 */
  positionNature: string;
  /** 职级（t_job_level.id）；须与岗位性质同序列 */
  jobLevelId: number | null;
  /** 职级名称（服务端解析后带出，停用职级也照常显示） */
  jobLevelName?: string | null;
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
  positionNature: string;
}

export interface PositionQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  deptId?: number;
  positionNature?: string;
  jobLevelId?: number;
  status?: number;
  onlyCommon?: boolean;
}

/** 建档/编辑入参；**不含 positionCode**——编码由服务端采番、编辑时不可改 */
export interface PositionPayload {
  positionName: string;
  deptId?: number;
  positionNature?: string;
  jobLevelId?: number;
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

/** 新增：编码由服务端采番并随响应回传 */
export const createPosition = (data: PositionPayload) =>
  request.post<any, { id: number; positionCode: string }>('/api/position', data);

export const updatePosition = (id: number, data: PositionPayload) =>
  request.put<any, { id: number; positionCode: string }>(`/api/position/${id}`, data);

export const deletePosition = (id: number) => request.delete(`/api/position/${id}`);

/** 批量删除；服务端逐条尝试，被引用的跳过并在 failed 里说明原因 */
export const batchDeletePositions = (ids: number[]) =>
  request.post<any, { deleted: number; failed: string[] }>('/api/position/batch-delete', { ids });

/** 上传 xlsx 批量导入；整批校验通过才落库，失败时 err.errors 逐行回传 */
export const importPositions = (file: File, overwrite: boolean) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('overwrite', overwrite ? 'true' : 'false');
  return request.post<any, { total: number; created: number; updated: number }>(
    '/api/position/import',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

/** 导出当前筛选结果 */
export const downloadPositionExport = (params: PositionQuery) =>
  downloadXlsx('/api/position/export', params, '岗位清单.xlsx');

/** 下载导入模板 */
export const downloadPositionTemplate = () =>
  downloadXlsx('/api/position/import-template', undefined, '岗位导入模板.xlsx');
