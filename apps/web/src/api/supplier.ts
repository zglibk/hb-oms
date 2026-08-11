import request from '@/utils/request';
import type { PageResult } from './customer';

/** 供应商主数据（基础数据；外发「加工商」等下拉的来源） */
export interface SupplierRow {
  id: number;
  supplierCode: string;
  supplierName: string;
  contactPerson: string | null;
  contactPhone: string | null;
  address: string | null;
  sort: number;
  /** 1启用 0停用；停用只是不再进下拉，历史记录不受影响 */
  status: number;
  remark: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 下拉用的精简结构（/all 只回这三个字段） */
export interface SupplierOption {
  id: number;
  supplierCode: string;
  supplierName: string;
}

export interface SupplierQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
}

export type SupplierPayload = Omit<
  SupplierRow,
  'id' | 'creatorName' | 'updaterName' | 'createdAt' | 'updatedAt'
>;

export const getSupplierList = (params: SupplierQuery) =>
  request.get<any, PageResult<SupplierRow>>('/api/supplier', { params });

/** 全量启用供应商（表单下拉用，无分页；仅需登录，见后端 controller 注释） */
export const getSupplierOptions = () =>
  request.get<any, SupplierOption[]>('/api/supplier/all');

export const createSupplier = (data: SupplierPayload) =>
  request.post<any, { id: number }>('/api/supplier', data);

export const updateSupplier = (id: number, data: SupplierPayload) =>
  request.put(`/api/supplier/${id}`, data);

export const deleteSupplier = (id: number) => request.delete(`/api/supplier/${id}`);
