import request from '@/utils/request';
import type { PageResult } from './customer';

export interface ProcessInfoItem {
  id: number;
  drawingNo: string;
  drawingVersion: string | null;
  customerId: number | null;
  customerName: string | null;
  productName: string | null;
  machines: string | null;
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
