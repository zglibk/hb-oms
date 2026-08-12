import request from '@/utils/request';
import type { PageResult } from './customer';

/**
 * 职级主数据行。
 * 职级是「**本序列内的等级**」——质检员分初/中/高级，工程师分助理/工程师/高级/资深，
 * 管理分班组长/主管/经理/高管。`positionNature` 即所属序列（与岗位性质同一套值）。
 */
export interface JobLevelRow {
  id: number;
  levelName: string;
  positionNature: string;
  levelRank: number;
  sort: number;
  status: number;
  remark: string | null;
  /** 引用该职级的岗位数（被引用则不能删） */
  positionCount?: number;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 下拉选项（投影收窄） */
export interface JobLevelOption {
  id: number;
  levelName: string;
  positionNature: string;
  levelRank: number;
}

export interface JobLevelQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  positionNature?: string;
  status?: number;
  onlyEnabled?: boolean;
}

export interface JobLevelPayload {
  levelName: string;
  positionNature: string;
  levelRank?: number;
  sort?: number;
  status?: number;
  remark?: string;
}

export const getJobLevelList = (params: JobLevelQuery) =>
  request.get<any, PageResult<JobLevelRow>>('/api/job-level', { params });

/** 职级下拉；传 positionNature 只回该序列的等级。仅需登录 */
export const getJobLevelOptions = (params?: { positionNature?: string }) =>
  request.get<any, JobLevelOption[]>('/api/job-level/all', { params });

export const createJobLevel = (data: JobLevelPayload) =>
  request.post<any, { id: number }>('/api/job-level', data);

export const updateJobLevel = (id: number, data: JobLevelPayload) =>
  request.put<any, { id: number }>(`/api/job-level/${id}`, data);

export const deleteJobLevel = (id: number) => request.delete(`/api/job-level/${id}`);
