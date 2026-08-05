import request from '@/utils/request';
import type { PageResult } from './customer';

/** 订单部件行（服务端按蓝图展开；客户端仅可微调追溯码/备注） */
export interface OrderPartItem {
  id: number;
  orderId: number;
  productId: number;
  partGroupId: number;
  partType: string;
  side: string;
  cycleCode: string | null;
  qty: number;
  remark: string | null;
  sort: number;
}

/** 订单部件组（跟踪/台账锚点） */
export interface OrderPartGroupItem {
  id: number;
  orderId: number;
  orderProductId: number;
  groupType: string;
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  qtyPcs: number;
  productModel: string | null;
  remark: string | null;
  sort: number;
  parts?: OrderPartItem[];
}

export interface OrderProductItem {
  id: number;
  orderId: number;
  orderType: number;
  isNewOrder: number;
  isExport: number;
  exportCountry: string | null;
  materialId: number | null;
  materialCode: string | null;
  itemNo: string | null;
  productName: string | null;
  productType: string | null;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionRaw: string | null;
  dimensionUnit: string | null;
  surfaceType: string;
  color: string | null;
  sheetMaterial: string | null;
  orderQty: number;
  unit: string;
  qtyPcs: number;
  productionNo: string | null;
  assemblyWorkshop: string | null;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  remark: string | null;
  sort: number;
  partGroups: OrderPartGroupItem[];
}

export interface OrderItem {
  id: number;
  orderNo: string;
  poNo: string | null;
  customerId: number | null;
  customerName: string;
  orderDate: string;
  salesman: string | null;
  merchandiser: string | null;
  orderSource: string | null;
  attachmentIds: string | null;
  status: number;
  isOpening: number;
  remark: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  products: OrderProductItem[];
}

export interface OrderQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
  dateFrom?: string;
  dateTo?: string;
}

/** 提交负载：产品行嵌套部件组（部件行由服务端蓝图展开，仅传微调） */
export interface OrderPartGroupPayload {
  groupType: string;
  drawingNo?: string;
  drawingVersion?: string;
  materialThickness?: string;
  qtyPcs?: number;
  remark?: string;
  sort?: number;
  parts?: Array<{ partType: string; side?: string; cycleCode?: string; remark?: string }>;
}

export interface OrderProductPayload {
  orderType?: number;
  isNewOrder?: number;
  isExport?: number;
  exportCountry?: string;
  materialId?: number;
  materialCode?: string;
  itemNo?: string;
  productName?: string;
  productType?: string;
  railSection?: string;
  dimensionMm?: number;
  dimensionRaw?: string;
  dimensionUnit?: string;
  surfaceType?: string;
  color?: string;
  sheetMaterial?: string;
  orderQty: number;
  unit: string;
  productionNo?: string;
  assemblyWorkshop?: string;
  deliveryDate?: string;
  deliveryAddress?: string;
  remark?: string;
  sort?: number;
  partGroups?: OrderPartGroupPayload[];
}

export interface OrderPayload {
  poNo?: string;
  customerId?: number;
  customerName: string;
  orderDate: string;
  salesman?: string;
  merchandiser?: string;
  orderSource?: string;
  attachmentIds?: string;
  isOpening?: number;
  remark?: string;
  products: OrderProductPayload[];
}

export const getOrderList = (params: OrderQuery) =>
  request.get<any, PageResult<OrderItem>>('/api/order', { params });

export const getOrderDetail = (id: number) =>
  request.get<any, OrderItem>(`/api/order/${id}`);

export const createOrder = (data: OrderPayload) =>
  request.post<any, { id: number; orderNo: string }>('/api/order', data);

export const updateOrder = (id: number, data: OrderPayload) =>
  request.put(`/api/order/${id}`, data);

export const finishOrder = (id: number) => request.post(`/api/order/${id}/finish`);
export const reopenOrder = (id: number) => request.post(`/api/order/${id}/reopen`);
export const cancelOrder = (id: number) => request.post(`/api/order/${id}/cancel`);
