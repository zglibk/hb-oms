import request from '@/utils/request';
import type { PageResult } from './customer';

export interface ProcessInfoItem {
  id: number;
  drawingNo: string;
  drawingVersionOuter: string | null;
  drawingVersionMiddle: string | null;
  drawingVersionInner: string | null;
  dimension: string | null;
  customerId: number | null;
  customerName: string | null;
  productName: string | null;
  machines: string | null;
  machinesThick: string | null;
  lengthReqOuter: string | null;
  lengthReqMiddle: string | null;
  lengthReqInner: string | null;
  specialReqOuter: string | null;
  specialReqMiddle: string | null;
  specialReqInner: string | null;
  moldNoOuter: string | null;
  moldNoMiddle: string | null;
  moldNoInner: string | null;
  processUpdateNote: string | null;
  processUpdateImages: string | null;
  billingNoteOuter: string | null;
  billingNoteMiddle: string | null;
  billingNoteInner: string | null;
  reviewOpinion: string | null;
  reviewImages: string | null;
  reviewer: string | null;
  reviewDate: string | null;
  remark: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcessInfoQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export const getProcessInfoList = (params: ProcessInfoQuery) =>
  request.get<any, PageResult<ProcessInfoItem>>('/api/process-info', { params });

/** 按生产图号匹配（订单表单自动带入；未命中返回 null） */
export const getProcessInfoDetail = (id: number) =>
  request.get<any, ProcessInfoItem>(`/api/process-info/${id}`);

export const getProcessInfoByDrawing = (drawingNo: string) =>
  request.get<any, ProcessInfoItem | null>('/api/process-info/by-drawing', {
    params: { drawingNo },
  });

export const createProcessInfo = (data: Partial<ProcessInfoItem>) =>
  request.post('/api/process-info', data);

export const updateProcessInfo = (id: number, data: Partial<ProcessInfoItem>) =>
  request.put(`/api/process-info/${id}`, data);

export const deleteProcessInfo = (id: number) =>
  request.delete(`/api/process-info/${id}`);

/** 批量删除：整批校验，任一图号被订单部件组引用则整批拒绝（返回 errors 逐条原因） */
export const batchDeleteProcessInfos = (ids: number[]) =>
  request.post<any, { deleted: number; skipped: number }>('/api/process-info/batch-delete', { ids });

/** Excel 批量导入（overwrite=按图号覆盖更新非空列） */
export const importProcessInfos = (file: File, overwrite: boolean) => {
  const form = new FormData();
  form.append('file', file);
  return request.post<any, { created: number; updated: number; total: number }>(
    `/api/process-info/import?overwrite=${overwrite ? 1 : 0}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

/** 导入模板下载（axios blob） */
export const downloadProcessInfoTemplate = () =>
  request.get<any, Blob>('/api/process-info/import-template', { responseType: 'blob' });

/** 导出（手工工艺表格式：一图号三行+合并单元格；按当前筛选全量导出） */
export const exportProcessInfos = (params: { keyword?: string }) =>
  request.get<any, Blob>('/api/process-info/export', { params, responseType: 'blob' });

/** 修改履历条目（scope：product 产品级 / outer 外轨 / middle 中轨 / inner 内轨） */
export interface ProcessInfoHistoryItem {
  id: number;
  action: 'create' | 'update' | 'import';
  changes: Array<{ field: string; label: string; scope: string; old: string; new: string }>;
  operatorName: string | null;
  createdAt: string;
}

/** 修改履历（新增/修改/导入更新，时间倒序） */
export const getProcessInfoHistory = (id: number) =>
  request.get<any, ProcessInfoHistoryItem[]>(`/api/process-info/${id}/history`);
