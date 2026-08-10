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

/** 外发明细行（锚定订单部件组） */
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
  /** 应回数量（支）：回齐判定基准 */
  planReturnQty: number;
  /** 累计回货数（服务端汇总维护） */
  returnedQty: number;
  remark: string | null;
  sort: number;
  returns?: OutsourceReturnItem[];
  /** 详情接口附带：所属部件组的组需求支数 */
  qtyPcs?: number;
  /** 详情接口附带：该部件组「他单已安排」支数（已排除本单，口径同选择器） */
  arrangedQty?: number;
  /** 详情接口附带：单重（kg/支，自部件信息），回货登记折算默认值 */
  unitWeight?: number;
}

/** 发坯单（单头 + 明细汇总） */
export interface OutsourceDocItem {
  id: number;
  blankNo: string;
  processorName: string;
  surfaceType: string;
  color: string | null;
  /** 计划回货日期（后端列名仍为 require_back_date） */
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
  totalPlanReturnQty?: number;
  totalReturnedQty?: number;
  /** 最后一次回货日期（单头层面的「实际回货」口径，未回货为空） */
  lastReturnDate?: string | null;
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
  /** 他单已安排的应回支数 */
  arrangedQty: number;
  /** 剩余应安排 = 组需求 − 已安排 */
  remainQty: number;
  /** 单重（kg/支）：回货登记折算默认值 */
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
  planReturnQty: number;
  remark?: string;
  sort?: number;
}

export interface OutsourcePayload {
  processorName: string;
  surfaceType: string;
  color?: string;
  /** 计划回货日期 */
  requireBackDate?: string;
  remark?: string;
  items: OutsourceItemPayload[];
}

/** 应回数量修正（已有回货后的纠错通道，改完服务端自动重算回齐状态） */
export interface OutsourceItemUpdatePayload {
  planReturnQty: number;
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
  request.get<any, OutsourceDocItem & { totalPlanReturnQty: number }>(
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

export const closeOutsource = (id: number, closeReason: string) =>
  request.post(`/api/outsource/${id}/close`, { closeReason });

export const cancelOutsource = (id: number) => request.post(`/api/outsource/${id}/cancel`);

export const updateOutsourceItem = (itemId: number, data: OutsourceItemUpdatePayload) =>
  request.put(`/api/outsource/item/${itemId}`, data);

export const createOutsourceReturn = (itemId: number, data: OutsourceReturnPayload) =>
  request.post(`/api/outsource/item/${itemId}/return`, data);

export const removeOutsourceReturn = (id: number) => request.delete(`/api/outsource/return/${id}`);
