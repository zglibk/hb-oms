import request from '@/utils/request';
import type { PageResult } from './customer';

/** 回货登记（一条 = 一次分批回货） */
export interface OutsourceReturnItem {
  id: number;
  docId: number;
  itemId: number;
  backDate: string;
  returnWeight: string;
  unitWeight: string;
  returnQty: number;
  remark: string | null;
  creatorName: string | null;
  createdAt: string;
}

/** 发出明细行（锚定订单部件组） */
export interface OutsourceItemRow {
  id: number;
  docId: number;
  orderId: number;
  orderProductId: number;
  orderPartGroupId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  cycleCode: string | null;
  sendWeight: string;
  unitWeight: string;
  sendQty: number;
  /** 累计回货数（服务端汇总维护） */
  returnedQty: number;
  remark: string | null;
  sort: number;
  returns?: OutsourceReturnItem[];
}

/** 发坯单（单头 + 明细汇总） */
export interface OutsourceDocItem {
  id: number;
  blankNo: string;
  processorName: string;
  surfaceType: string;
  color: string | null;
  planSendDate: string | null;
  actualSendDate: string | null;
  requireBackDate: string | null;
  status: number;
  closeReason: string | null;
  remark: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OutsourceItemRow[];
  /** 列表附带的汇总字段 */
  itemCount?: number;
  totalSendQty?: number;
  totalReturnedQty?: number;
  totalSendWeight?: number;
}

/** 可发外部件组选项 */
export interface PartGroupOption {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  cycleCode: string | null;
  surfaceType: string;
  color: string | null;
  qtyPcs: number;
  sentQty: number;
  remainQty: number;
  unitWeight: number;
}

export interface OutsourceQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
  surfaceType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface OutsourceItemPayload {
  orderPartGroupId: number;
  sendWeight: number;
  unitWeight: number;
  sendQty: number;
  remark?: string;
  sort?: number;
}

export interface OutsourcePayload {
  processorName: string;
  surfaceType: string;
  color?: string;
  planSendDate?: string;
  requireBackDate?: string;
  remark?: string;
  items: OutsourceItemPayload[];
}

/** 发出明细数量修正（已发出后纠错，改完服务端自动重算回齐状态） */
export interface OutsourceItemUpdatePayload {
  sendWeight: number;
  unitWeight: number;
  sendQty: number;
  remark?: string;
}

export interface OutsourceReturnPayload {
  backDate: string;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  remark?: string;
}

export const getOutsourceList = (params: OutsourceQuery) =>
  request.get<any, PageResult<OutsourceDocItem>>('/api/outsource', { params });

export const getOutsourceDetail = (id: number) =>
  request.get<any, OutsourceDocItem>(`/api/outsource/${id}`);

export const getOutsourcePrintData = (id: number) =>
  request.get<any, OutsourceDocItem & { totalSendQty: number; totalSendWeight: number }>(
    `/api/outsource/print/${id}`,
  );

export const getPartGroupOptions = (params: {
  keyword?: string;
  surfaceType?: string;
  excludeDocId?: number;
  limit?: number;
}) => request.get<any, PartGroupOption[]>('/api/outsource/part-group-options', { params });

export const createOutsource = (data: OutsourcePayload) =>
  request.post<any, { id: number; blankNo: string }>('/api/outsource', data);

export const updateOutsource = (id: number, data: OutsourcePayload) =>
  request.put(`/api/outsource/${id}`, data);

export const sendOutsource = (id: number, actualSendDate: string) =>
  request.post(`/api/outsource/${id}/send`, { actualSendDate });

export const closeOutsource = (id: number, closeReason: string) =>
  request.post(`/api/outsource/${id}/close`, { closeReason });

export const cancelOutsource = (id: number) => request.post(`/api/outsource/${id}/cancel`);

export const updateOutsourceItem = (itemId: number, data: OutsourceItemUpdatePayload) =>
  request.put(`/api/outsource/item/${itemId}`, data);

export const createOutsourceReturn = (itemId: number, data: OutsourceReturnPayload) =>
  request.post(`/api/outsource/item/${itemId}/return`, data);

export const removeOutsourceReturn = (id: number) => request.delete(`/api/outsource/return/${id}`);
