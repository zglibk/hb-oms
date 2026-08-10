import request from '@/utils/request';
import type { PageResult } from './customer';

/**
 * 外发件回厂记录（2026-08-10 形态）。
 * 一行 = 一次回厂；没有发坯单、没有单据号、没有状态。
 */
export interface OutsourcePartRow {
  id: number;
  orderId: number;
  orderProductId: number;
  orderPartGroupId: number;
  /** ===== 订单侧快照（只读展示） ===== */
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  cycleCode: string | null;
  orderQty: number;
  unit: string | null;
  drawingNo: string | null;
  materialThickness: string | null;
  /** ===== 录入项 ===== */
  processorName: string;
  surfaceType: string | null;
  color: string | null;
  /** 实际回厂日期 */
  backDate: string;
  returnWeight: string;
  unitWeight: string;
  returnQty: number;
  remark: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 可外发部件组选项（录入表单选择器） */
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
  /** 组需求支数（参考用） */
  qtyPcs: number;
  /** 该组累计已回厂支数 */
  returnedQty: number;
  orderQty: number;
  unit: string | null;
  drawingNo: string | null;
  materialThickness: string | null;
  /** 单重（kg/支）：回厂折算默认值 */
  unitWeight: number;
}

export interface OutsourceQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  processorName?: string;
  surfaceType?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** 登记回厂：一次可录多行（共用加工商与回厂日期） */
export interface OutsourcePartItemPayload {
  orderPartGroupId: number;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  surfaceType?: string;
  color?: string;
  remark?: string;
}

export interface OutsourcePartPayload {
  processorName: string;
  backDate: string;
  items: OutsourcePartItemPayload[];
}

/** 编辑单条（锚点与订单侧快照不可改） */
export interface OutsourcePartUpdatePayload {
  processorName: string;
  backDate: string;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  surfaceType?: string;
  color?: string;
  remark?: string;
}

export const getOutsourceList = (params: OutsourceQuery) =>
  request.get<any, PageResult<OutsourcePartRow>>('/api/outsource', { params });

export const getOutsourceDetail = (id: number) =>
  request.get<any, OutsourcePartRow>(`/api/outsource/${id}`);

export const getPartGroupOptions = (params: {
  keyword?: string;
  surfaceType?: string;
  limit?: number;
}) => request.get<any, PartGroupOption[]>('/api/outsource/part-group-options', { params });

export const createOutsourceParts = (data: OutsourcePartPayload) =>
  request.post<any, { count: number; ids: number[] }>('/api/outsource', data);

export const updateOutsourcePart = (id: number, data: OutsourcePartUpdatePayload) =>
  request.put(`/api/outsource/${id}`, data);

export const removeOutsourcePart = (id: number) => request.delete(`/api/outsource/${id}`);
