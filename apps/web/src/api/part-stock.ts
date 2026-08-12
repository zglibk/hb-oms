import request from '@/utils/request';
import { downloadXlsx } from '@/utils/download';
import type { PageResult } from './customer';

/** 部件台账余量行（7 维属性锚定） */
export interface PartBalanceRow {
  id: number;
  partType: string;
  side: string;
  itemNo: string;
  railSection: string;
  productType: string;
  materialThickness: string;
  dimensionMm: number;
  quantity: number;
  remark: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 变动流水行 */
export interface PartAdjustRow {
  id: number;
  balanceId: number;
  partType: string;
  side: string;
  itemNo: string;
  railSection: string;
  productType: string;
  materialThickness: string;
  dimensionMm: number;
  /** opening 期初录入 / manual 手工调整 */
  source: string;
  /** 正为增、负为减 */
  delta: number;
  quantityAfter: number;
  reason: string;
  creatorName: string | null;
  createdAt: string;
}

export interface PartStockQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  partType?: string;
  side?: string;
  railSection?: string;
  productType?: string;
  dimensionMm?: number;
  onlyInStock?: boolean;
}

export interface PartStockSummary {
  rows: number;
  totalQty: number;
}

/** 调整入参：7 维定位 + delta + 原因（余量的唯一写通道） */
export interface AdjustPartStockPayload {
  partType: string;
  side?: string;
  itemNo: string;
  railSection?: string;
  productType?: string;
  materialThickness?: string;
  dimensionMm?: number;
  delta: number;
  reason: string;
  source?: string;
  remark?: string;
}

export const getPartStockList = (params: PartStockQuery) =>
  request.get<any, PageResult<PartBalanceRow>>('/api/part-stock', { params });

export const getPartStockSummary = (params: PartStockQuery) =>
  request.get<any, PartStockSummary>('/api/part-stock/summary', { params });

export const getPartAdjustList = (params: {
  page?: number;
  pageSize?: number;
  balanceId?: number;
  keyword?: string;
  source?: string;
}) => request.get<any, PageResult<PartAdjustRow>>('/api/part-stock/adjust', { params });

export const adjustPartStock = (data: AdjustPartStockPayload) =>
  request.post<any, { id: number; quantity: number; delta: number }>('/api/part-stock/adjust', data);

/** 导出当前筛选结果（服务端按筛选全量导出，超 5000 行会拒绝） */
export const downloadPartStockExport = (params: PartStockQuery) =>
  downloadXlsx('/api/part-stock/export', params, '部件台账.xlsx');

/** 下载导入模板；模板列是「调整量 + 调整原因」，不是余量 */
export const downloadPartStockTemplate = () =>
  downloadXlsx('/api/part-stock/import-template', undefined, '部件台账导入模板.xlsx');

/**
 * 批量导入 = **批量调整余量**（部件台账没有「直接设余量」的通道）。
 * 整批全有全无：任一行失败整批回滚，逐行原因经 err.errors 回传。
 */
export const importPartStock = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post<any, { total: number; affected: number }>('/api/part-stock/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
