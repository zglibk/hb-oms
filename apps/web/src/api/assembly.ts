import request from '@/utils/request';
import type { PageResult } from './customer';

/** 装配批次行（锚定订单**产品行** + 边别） */
export interface AssemblyBatchRow {
  id: number;
  orderId: number;
  orderProductId: number;
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

/** 装配管理列表行：按**订单产品行**一行（排产是产品级活动） */
export interface AssemblyGroupRow {
  orderProductId: number;
  orderId: number;
  orderNo: string | null;
  customerName: string | null;
  orderDate: string | null;
  productionNo: string | null;
  itemNo: string | null;
  materialCode: string | null;
  productModel: string | null;
  /** 产品名称（同货号拆多行时的辅助区分） */
  productName: string | null;
  productType: string | null;
  railSection: string | null;
  /** 分体出货：0整品 1分体（形态已体现在 productModel 后缀，如 45#缓冲外中轨） */
  isSplit: number;
  /** 免装配：分体且单部件出货（如内轨）无装配环节——禁建批次，界面打标 */
  assemblyExempt: boolean;
  dimensionText: string | null;
  /** 该产品各装配批次的车间（去重）；订单环节不再安排装配车间 */
  assemblyWorkshops: string[];
  deliveryDate: string | null;
  /** 产品支数（订单数口径，也是排产数量默认值） */
  qtyPcs: number;
  /** 是否含卡口（批次与闸门按左右分开核算） */
  socket: boolean;
  batchCount: number;
  /** 已录批次总量（含计划中） */
  plannedQty: number;
  /** 已完成装配量 */
  doneQty: number;
  /** 未装配量 = 产品支数 − 已完成装配量，可为负（超装配） */
  pendingQty: number;
  nextPlanDate: string | null;
  lastActualDate: string | null;
  overdue: boolean;
}

/** 可入库量（§4.4 闸门口径） */
export interface InboundQuotaRow {
  orderProductId: number;
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
  product: {
    orderProductId: number;
    orderNo: string | null;
    customerName: string | null;
    productionNo: string | null;
    productModel: string | null;
    dimensionText: string | null;
    qtyPcs: number;
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
  orderProductId: number;
  side?: string;
  workshop?: string;
  planStartDate?: string | null;
  planDate?: string | null;
  actualDate?: string | null;
  qty: number;
  remark?: string;
}

/** 编辑不含锚点：产品行与边别不可改（改锚点等于换产品，应删除后重录） */
export type AssemblyBatchUpdatePayload = Omit<AssemblyBatchPayload, 'orderProductId' | 'side'>;

export const getAssemblyList = (params: AssemblyQuery) =>
  request.get<any, PageResult<AssemblyGroupRow>>('/api/assembly', { params });

export const getAssemblyBatches = (params: {
  orderProductId: number;
  side?: string;
}) => request.get<any, AssemblyBatchesResult>('/api/assembly/batch', { params });

export const getInboundQuota = (params: { orderProductId: number; side?: string }) =>
  request.get<any, InboundQuotaRow>('/api/assembly/inbound-quota', { params });

export const createAssemblyBatch = (data: AssemblyBatchPayload) =>
  request.post<any, { id: number }>('/api/assembly/batch', data);

export const updateAssemblyBatch = (id: number, data: AssemblyBatchUpdatePayload) =>
  request.put(`/api/assembly/batch/${id}`, data);

export const removeAssemblyBatch = (id: number) => request.delete(`/api/assembly/batch/${id}`);
