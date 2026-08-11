import request from '@/utils/request';
import type { PageResult } from './customer';

/**
 * 呆滞品档案行（已完结订单剩下的成品，逐批建档）。
 *
 * 四个数量列一律按本行 `unit` 计（1套=2支）；
 * `结存数 = 期初数 + 入库数 − 出库数`，其中入库数/出库数是流水累计值。
 */
export interface DullStockRow {
  id: number;
  itemNo: string;
  customerName: string;
  productionNo: string;
  productModel: string;
  productType: string;
  railSection: string;
  dimensionMm: number;
  dimensionText: string;
  surfaceType: string;
  color: string;
  side: string;
  /** set 套 / piece 支 */
  unit: string;
  openingQty: number;
  inboundQty: number;
  outboundQty: number;
  balanceQty: number;
  remark: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 出入库流水行；balanceAfter 由服务端按 id 正序累计推导，不落库 */
export interface DullStockFlowRow {
  id: number;
  dullId: number;
  /** 1 入库 / -1 出库 */
  direction: number;
  quantity: number;
  balanceAfter: number;
  flowDate: string;
  reason: string;
  remark: string | null;
  creatorName: string | null;
  createdAt: string;
}

export interface DullStockQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  surfaceType?: string;
  side?: string;
  onlyInStock?: boolean;
}

export interface DullStockSummary {
  rows: number;
  /** 结存合计：各行单位不同，一律折成支再汇总 */
  totalBalancePcs: number;
}

/** 建档/编辑入参（属性 + 单位 + 期初数；入库数/出库数不在此列） */
export interface DullStockPayload {
  itemNo: string;
  customerName?: string;
  productionNo?: string;
  productModel?: string;
  productType?: string;
  railSection?: string;
  dimensionMm?: number;
  dimensionText?: string;
  surfaceType?: string;
  color?: string;
  side?: string;
  unit: string;
  openingQty: number;
  remark?: string;
}

/** 登记一笔出入库（入库数/出库数的唯一写入口） */
export interface DullStockFlowPayload {
  direction: number;
  quantity: number;
  flowDate: string;
  reason: string;
  remark?: string;
}

export const getDullStockList = (params: DullStockQuery) =>
  request.get<any, PageResult<DullStockRow>>('/api/dull-stock', { params });

export const getDullStockSummary = (params: DullStockQuery) =>
  request.get<any, DullStockSummary>('/api/dull-stock/summary', { params });

export const getDullStockFlows = (params: { dullId: number; page?: number; pageSize?: number }) =>
  request.get<any, PageResult<DullStockFlowRow>>('/api/dull-stock/flow', { params });

export const createDullStock = (data: DullStockPayload) =>
  request.post<any, { id: number; balanceQty: number }>('/api/dull-stock', data);

export const updateDullStock = (id: number, data: DullStockPayload) =>
  request.put<any, { id: number; balanceQty: number }>(`/api/dull-stock/${id}`, data);

export const deleteDullStock = (id: number) => request.delete(`/api/dull-stock/${id}`);

export const createDullStockFlow = (id: number, data: DullStockFlowPayload) =>
  request.post<any, { id: number; dullId: number; balanceQty: number }>(
    `/api/dull-stock/${id}/flow`,
    data,
  );

/** 删除录错的流水；服务端同事务回滚累计数 */
export const deleteDullStockFlow = (flowId: number) =>
  request.delete<any, { id: number; dullId: number; balanceQty: number }>(
    `/api/dull-stock/flow/${flowId}`,
  );
