import request from '@/utils/request';
import type { PageResult } from './customer';

/** 装配批次行（锚定订单部件组 + 边别） */
export interface AssemblyBatchRow {
  id: number;
  orderId: number;
  orderProductId: number;
  orderPartGroupId: number;
  /** 边别：含卡口 left/right，其余 '' */
  side: string;
  workshop: string | null;
  /** 计划开始时间（预计开工日；纯计划属性，不参与闸门） */
  planStartDate: string | null;
  /** 计划完成时间（预计完工日） */
  planDate: string | null;
  /** 实际完成时间：null=计划中，非空=已完成（数量计入可入库量） */
  actualDate: string | null;
  qty: number;
  /** 派生状态：1计划中 2已完成 */
  status: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  productModel: string | null;
  dimensionText: string | null;
  remark: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 装配管理列表行：按部件组一行 */
export interface AssemblyGroupRow {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  orderNo: string | null;
  customerName: string | null;
  orderDate: string | null;
  productionNo: string | null;
  itemNo: string | null;
  materialCode: string | null;
  productModel: string | null;
  productType: string | null;
  groupType: string | null;
  railSection: string | null;
  dimensionText: string | null;
  assemblyWorkshop: string | null;
  deliveryDate: string | null;
  /** 组支数（订单数口径） */
  qtyPcs: number;
  /** 是否含卡口（批次与闸门按左右分开核算） */
  socket: boolean;
  batchCount: number;
  /** 已录批次总量（含计划中） */
  plannedQty: number;
  /** 已完成装配量 */
  doneQty: number;
  /** 未装配量 = 组支数 − 已完成装配量，可为负（超装配） */
  pendingQty: number;
  nextPlanDate: string | null;
  lastActualDate: string | null;
  overdue: boolean;
}

/** 可入库量（§4.4 闸门口径） */
export interface InboundQuotaRow {
  orderPartGroupId: number;
  side: string;
  /** Σ已完成装配量 */
  assembledQty: number;
  /** Σ已入库量（已确认入库单 + 其红字冲销） */
  inboundQty: number;
  /** 可入库量 = 已完成装配量 − 已入库量 */
  quota: number;
}

/** 分边别小计（批次弹窗用） */
export interface AssemblySideSummary extends InboundQuotaRow {
  sideLabel: string;
  /** 该边别已录批次总量（含计划中） */
  plannedQty: number;
}

export interface AssemblyBatchesResult {
  group: {
    orderPartGroupId: number;
    orderNo: string | null;
    customerName: string | null;
    productionNo: string | null;
    productModel: string | null;
    dimensionText: string | null;
    groupType: string | null;
    qtyPcs: number;
    assemblyWorkshop: string | null;
    socket: boolean;
  } | null;
  sides: AssemblySideSummary[];
  list: AssemblyBatchRow[];
}

export interface AssemblyQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  workshop?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  onlyUnfinished?: boolean;
  onlyOverdue?: boolean;
}

export interface AssemblyBatchPayload {
  orderPartGroupId: number;
  side?: string;
  workshop?: string;
  planStartDate?: string | null;
  planDate?: string | null;
  actualDate?: string | null;
  qty: number;
  remark?: string;
}

/** 编辑不含锚点：部件组与边别不可改（改锚点等于换组，应删除后重录） */
export type AssemblyBatchUpdatePayload = Omit<AssemblyBatchPayload, 'orderPartGroupId' | 'side'>;

export const getAssemblyList = (params: AssemblyQuery) =>
  request.get<any, PageResult<AssemblyGroupRow>>('/api/assembly', { params });

export const getAssemblyBatches = (params: {
  orderPartGroupId?: number;
  orderProductId?: number;
  side?: string;
}) => request.get<any, AssemblyBatchesResult>('/api/assembly/batch', { params });

export const getInboundQuota = (params: { orderPartGroupId: number; side?: string }) =>
  request.get<any, InboundQuotaRow>('/api/assembly/inbound-quota', { params });

export const createAssemblyBatch = (data: AssemblyBatchPayload) =>
  request.post<any, { id: number }>('/api/assembly/batch', data);

export const updateAssemblyBatch = (id: number, data: AssemblyBatchUpdatePayload) =>
  request.put(`/api/assembly/batch/${id}`, data);

export const removeAssemblyBatch = (id: number) => request.delete(`/api/assembly/batch/${id}`);
