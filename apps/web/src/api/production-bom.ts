import request from '@/utils/request';
import { downloadXlsx } from '@/utils/download';
import type { PageResult } from './customer';

export const PRODUCTION_BOM_EXPORT_LIMIT = 100;

export interface ProductionBomItem {
  id?: number;
  bomId?: number;
  materialId: number | null;
  itemName: string;
  itemCode: string | null;
  spec: string | null;
  quantityPerSet: number | null;
  quantityUnit: string;
  splitLeftRight: boolean;
  materialThickness: string | null;
  unitConsumption: number | null;
  surfaceTreatment: string | null;
  sheetMaterial: string | null;
  supplierId: number | null;
  supplierName: string | null;
  remark: string | null;
  sort?: number;
}

export interface ProductionBomRow {
  id: number;
  processInfoId: number | null;
  drawingNo: string;
  customerId: number | null;
  customerName: string | null;
  productName: string;
  version: string;
  preparedBy: string;
  preparedDate: string;
  itemCount: number;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionBomDetail extends Omit<ProductionBomRow, 'itemCount'> {
  items: ProductionBomItem[];
}

export interface ProductionBomQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  customerId?: number;
  version?: string;
  ids?: string;
}

export interface ProcessBomOption {
  id: number;
  drawingNo: string;
  customerId: number | null;
  customerName: string | null;
  productName: string | null;
  dimension: string | null;
}

export interface MaterialBomOption {
  id: number;
  materialCode: string;
  itemNo: string | null;
  productName: string | null;
  spec: string | null;
  drawingNo: string | null;
  materialThickness: string | null;
  unitWeight: string | number | null;
  sheetMaterial: string | null;
}

export type ProductionBomPayload = Pick<
  ProductionBomDetail,
  'processInfoId' | 'drawingNo' | 'customerId' | 'customerName' | 'productName' | 'version' | 'preparedBy' | 'preparedDate' | 'items'
>;

export const getProductionBomList = (params: ProductionBomQuery) =>
  request.get<any, PageResult<ProductionBomRow>>('/api/production-bom', { params });

export const getProductionBomDetail = (id: number) =>
  request.get<any, ProductionBomDetail>(`/api/production-bom/${id}`);

export const createProductionBom = (data: ProductionBomPayload) =>
  request.post<any, { id: number }>('/api/production-bom', data);

export const updateProductionBom = (id: number, data: ProductionBomPayload) =>
  request.put(`/api/production-bom/${id}`, data);

export const deleteProductionBom = (id: number) =>
  request.delete(`/api/production-bom/${id}`);

export const getProductionBomProcessOptions = (keyword?: string) =>
  request.get<any, ProcessBomOption[]>('/api/production-bom/process-options', { params: { keyword } });

export const getProductionBomMaterialOptions = (keyword?: string) =>
  request.get<any, MaterialBomOption[]>('/api/production-bom/material-options', { params: { keyword } });

export const downloadProductionBomTemplate = () =>
  downloadXlsx('/api/production-bom/import-template', {}, '生产BOM导入模板.xlsx');

export const importProductionBoms = (file: File, overwrite: boolean) => {
  const form = new FormData();
  form.append('file', file);
  return request.post<any, { created: number; updated: number; total: number; itemTotal: number }>(
    `/api/production-bom/import?overwrite=${overwrite ? 1 : 0}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

export const exportProductionBoms = (params: ProductionBomQuery) =>
  downloadXlsx('/api/production-bom/export', params, `生产BOM_${new Date().toISOString().slice(0, 10)}.xlsx`);

export const exportSingleProductionBom = (id: number, drawingNo: string, version: string) =>
  downloadXlsx(
    `/api/production-bom/${id}/export`,
    {},
    `${drawingNo}_${version}_BOM.xlsx`,
  );
