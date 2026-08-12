import request from '@/utils/request';
import type { PageResult } from './customer';

/** 出入库明细行（锚定订单**产品行** + 边别） */
export interface FinishedItemRow {
  id: number;
  docId: number;
  orderId: number;
  orderProductId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  itemNo: string | null;
  productModel: string | null;
  productType: string | null;
  /** 部件组类型：挂订单的成品是整套滑轨故恒为 null，仅纯属性期初行可能有值 */
  groupType: string | null;
  railSection: string | null;
  dimensionText: string | null;
  dimensionMm: number | null;
  surfaceType: string | null;
  color: string | null;
  /** 边别：含卡口 left/right，其余 '' */
  side: string;
  batchNo: string;
  /** 数量恒为正，方向看单头 direction */
  quantity: number;
  originItemId: number | null;
  remark: string | null;
  sort: number;
  /** 详情附带：已被红字冲销数量 / 可再冲销余量 */
  reversedQty?: number;
  reversibleQty?: number;
}

/** 出入库单据头 */
export interface FinishedDocRow {
  id: number;
  docNo: string;
  bizType: string;
  /** 1入库 -1出库 */
  direction: number;
  docDate: string;
  workTeam: string | null;
  machineNo: string | null;
  originDocId: number | null;
  status: number;
  remark: string | null;
  creatorName: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
  items?: FinishedItemRow[];
  itemCount?: number;
  totalQty?: number;
}

/** 库存余额行（锚定订单**产品行** + 边别 + 批次；不挂订单的纯属性行锚点为 0） */
export interface BalanceRow {
  id: number;
  orderId: number;
  orderProductId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  itemNo: string;
  productModel: string;
  productType: string;
  groupType: string;
  railSection: string;
  dimensionMm: number;
  dimensionText: string;
  surfaceType: string;
  color: string;
  side: string;
  batchNo: string;
  quantity: number;
}

/** 产品行的某个边别：入库看 quota、出库看 stockQty */
export interface StockSideInfo {
  side: string;
  sideLabel: string;
  assembledQty: number;
  inboundQty: number;
  /** 可入库量（入库硬上限） */
  quota: number;
  /** 当前结存（出库硬上限） */
  stockQty: number;
}

/** 可出入库的**产品行**选项（2026-08-10 由部件组升级——入库对象是装配产出的整套滑轨） */
export interface StockGroupOption {
  orderProductId: number;
  orderId: number;
  orderNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  itemNo: string | null;
  productModel: string | null;
  /** 产品名称（同货号拆多行时的辅助区分） */
  productName: string | null;
  productType: string | null;
  dimensionText: string | null;
  surfaceType: string | null;
  color: string | null;
  /** 产品支数（订单数口径） */
  qtyPcs: number;
  socket: boolean;
  /** 免装配：分体且单部件出货（如内轨），入库不受装配额度约束 */
  assemblyExempt: boolean;
  sides: StockSideInfo[];
}

export interface FinishedDocQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  bizType?: string;
  direction?: number;
  status?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface FinishedItemPayload {
  orderProductId: number;
  side?: string;
  batchNo?: string;
  quantity: number;
  remark?: string;
  sort?: number;
}

export interface FinishedDocPayload {
  bizType: string;
  docDate: string;
  workTeam?: string;
  machineNo?: string;
  remark?: string;
  items: FinishedItemPayload[];
}

export interface ReversePayload {
  docDate: string;
  reason: string;
  /** 不传 = 整单按剩余可冲量全额冲销 */
  items?: Array<{ originItemId: number; quantity: number }>;
}

export const getFinishedDocList = (params: FinishedDocQuery) =>
  request.get<any, PageResult<FinishedDocRow>>('/api/finished-stock', { params });

export const getFinishedDocDetail = (id: number) =>
  request.get<any, FinishedDocRow & { totalQty: number }>(`/api/finished-stock/${id}`);

export const getStockBalance = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  orderProductId?: number;
  side?: string;
  surfaceType?: string;
  onlyInStock?: boolean;
}) => request.get<any, PageResult<BalanceRow>>('/api/finished-stock/balance', { params });

/**
 * 可出入库的订单产品行选项（成品出入库建单 + 期初录入共用）。
 * `onlyOpening`：期初录入页传 true，只列「期初补录」订单——期初豁免装配闸门，
 * 挂到正常订单上等于绕过闸门凭空加库存（服务端另有硬校验）。
 */
export const getStockGroupOptions = (params: {
  keyword?: string;
  bizType?: string;
  limit?: number;
  onlyOpening?: boolean;
}) => request.get<any, StockGroupOption[]>('/api/finished-stock/group-options', { params });

export const createFinishedDoc = (data: FinishedDocPayload) =>
  request.post<any, { id: number; docNo: string }>('/api/finished-stock', data);

export const updateFinishedDoc = (id: number, data: FinishedDocPayload) =>
  request.put(`/api/finished-stock/${id}`, data);

/** 确认/冲销后订单状态的自动同步结果（§3.1：发货欠数 ≤ 0 自动完结，回正自动重开） */
export interface FinishSyncResult {
  /** 本次被自动完结的订单号 */
  finished?: string[];
  /** 本次被自动重开的订单号 */
  reopened?: string[];
}

export const confirmFinishedDoc = (id: number) =>
  request.post<any, FinishSyncResult>(`/api/finished-stock/${id}/confirm`);

export const cancelFinishedDoc = (id: number) => request.post(`/api/finished-stock/${id}/cancel`);

export const reverseFinishedDoc = (id: number, data: ReversePayload) =>
  request.post<any, { id: number; docNo: string } & FinishSyncResult>(
    `/api/finished-stock/${id}/reverse`,
    data,
  );
