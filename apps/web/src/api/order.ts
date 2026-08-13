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
  /** 客户图号（客户来图图号，区别于部件组的生产图号 drawingNo） */
  customerDrawingNo: string | null;
  productName: string | null;
  productType: string | null;
  railSection: string | null;
  /** 产品要求描述（客户对该产品的特殊要求；随业务字段开关显隐） */
  productRequirement: string | null;
  /** 分体出货：0整品 1分体（该行按部件组构成分体包装出货，不组装成整品） */
  isSplit: number;
  dimensionMm: number | null;
  dimensionRaw: string | null;
  dimensionUnit: string | null;
  surfaceType: string;
  color: string | null;
  sheetMaterial: string | null;
  orderQty: number;
  unit: string;
  qtyPcs: number;
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
  /** 生产单号（订单级，与 PO# 一对一；台账「订单编号」口径） */
  productionNo: string | null;
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
  /** 订单备注（图文混排 HTML）；列表接口不返回，仅详情带出 */
  otherReq?: string | null;
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
  customerDrawingNo?: string;
  productName?: string;
  productType?: string;
  railSection?: string;
  productRequirement?: string;
  /** 分体出货标记：0整品 1分体 */
  isSplit?: number;
  dimensionMm?: number;
  dimensionRaw?: string;
  dimensionUnit?: string;
  surfaceType?: string;
  color?: string;
  sheetMaterial?: string;
  orderQty: number;
  unit: string;
  deliveryDate?: string;
  deliveryAddress?: string;
  remark?: string;
  sort?: number;
  partGroups?: OrderPartGroupPayload[];
}

export interface OrderPayload {
  poNo?: string;
  productionNo?: string;
  customerId?: number;
  customerName: string;
  orderDate: string;
  salesman?: string;
  merchandiser?: string;
  orderSource?: string;
  attachmentIds?: string;
  isOpening?: number;
  remark?: string;
  /** 订单备注（图文混排 HTML，wangEditor 输出） */
  otherReq?: string;
  products: OrderProductPayload[];
}

export const getOrderList = (params: OrderQuery) =>
  request.get<any, PageResult<OrderItem>>('/api/order', { params });

export const getOrderDetail = (id: number) =>
  request.get<any, OrderItem>(`/api/order/${id}`);

/** 导出总计划（按当前筛选全量导出，一行=一个产品行；四数与台账同口径） */
export const exportTotalPlan = (params: Omit<OrderQuery, 'page' | 'pageSize'>) =>
  request.get<any, Blob>('/api/order/export/total-plan', { params, responseType: 'blob' });

export const createOrder = (data: OrderPayload) =>
  request.post<any, { id: number; orderNo: string }>('/api/order', data);

export const updateOrder = (id: number, data: OrderPayload) =>
  request.put(`/api/order/${id}`, data);

export const finishOrder = (id: number) => request.post(`/api/order/${id}/finish`);
export const reopenOrder = (id: number) => request.post(`/api/order/${id}/reopen`);
/** 删除订单（取代作废）：仅未被外发/装配/出入库引用时可删，连带删四级数据 */
export const deleteOrder = (id: number) => request.delete(`/api/order/${id}`);
