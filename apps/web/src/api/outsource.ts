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
  /** 卡口外轨、内轨为 left / right；中轨、非卡口为空串。 */
  side: string;
  /** 历史卡口外轨、内轨流水无边别来源，不能擅自拆分。 */
  legacyUnassigned?: boolean;
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
  /** 当前用户能否修改 / 删除（列表带出）：只有创建人与外发主管角色 */
  canModify?: boolean;
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
  /** 订单产品类型组合串（如 standard,self_lock） */
  productType: string | null;
  dimensionText: string | null;
  cycleCode: string | null;
  surfaceType: string;
  color: string | null;
  /** 当前部件/边别需求支数（参考用） */
  qtyPcs: number;
  /** 当前部件/边别累计已回厂支数 */
  returnedQty: number;
  groupQtyPcs: number;
  groupReturnedQty: number;
  legacyReturnedQty: number;
  side: string;
  orderQty: number;
  unit: string | null;
  drawingNo: string | null;
  materialThickness: string | null;
  /** 单重（kg/支）：回厂折算默认值 */
  unitWeight: number;
  /** 选择器本地全局搜索索引；仅展示候选时使用，不提交到回厂记录。 */
  searchText?: string;
}

/** 选择器中由可选记录全量去重得到的下拉项 */
export interface PartGroupFilterOptions {
  customerNames: string[];
  productModels: string[];
  /** 单值产品类型；组合类型拆开去重，筛选时按包含匹配 */
  productTypes: string[];
  surfaceTypes: string[];
}

export interface OutsourceQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  processorName?: string;
  surfaceType?: string;
  dateFrom?: string;
  dateTo?: string;
  /** 只看未回齐：卡口外轨、内轨按边别；其余按部件组累计。 */
  onlyUnreturned?: boolean;
}

/** 登记回厂：一次可录多行（共用加工商与回厂日期） */
export interface OutsourcePartItemPayload {
  orderPartGroupId: number;
  side?: string;
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
  orderNo?: string;
  customerName?: string;
  productionNo?: string;
  productModel?: string;
  productType?: string;
  surfaceType?: string;
  /** 隐藏已回齐（累计回厂 ≥ 组支数）的部件组 */
  hideReturned?: boolean;
  /** 只列已回齐的部件组（与 hideReturned 互斥） */
  onlyReturned?: boolean;
  limit?: number;
  /** 忽略默认保护上限，供打开选择器时一次取得完整候选快照。 */
  all?: boolean;
  /** 返回本地筛选所需的完整搜索文本。 */
  includeSearchText?: boolean;
}) => request.get<any, PartGroupOption[]>('/api/outsource/part-group-options', { params });

export const getPartGroupFilterOptions = (params: {
  customerName?: string;
  productModel?: string;
  productType?: string;
  surfaceType?: string;
  hideReturned?: boolean;
  onlyReturned?: boolean;
}) =>
  request.get<any, PartGroupFilterOptions>('/api/outsource/part-group-filter-options', { params });

/** 部件/边别回厂进度：保存前复核是否超出需求（excludeId = 编辑中的记录，不计其旧数量） */
export interface ReturnProgress {
  orderPartGroupId: number;
  side: string;
  qtyPcs: number;
  returnedQty: number;
}
export const getReturnProgress = (rows: Array<{ orderPartGroupId: number; side: string }>, excludeId?: number) =>
  request.get<any, ReturnProgress[]>('/api/outsource/return-progress', {
    params: {
      groupIds: rows.map((row) => row.orderPartGroupId).join(','),
      sides: rows.map((row) => row.side).join(','),
      excludeId,
    },
  });

export const createOutsourceParts = (data: OutsourcePartPayload) =>
  request.post<any, { count: number; ids: number[] }>('/api/outsource', data);

export const updateOutsourcePart = (id: number, data: OutsourcePartUpdatePayload) =>
  request.put(`/api/outsource/${id}`, data);

export const removeOutsourcePart = (id: number) => request.delete(`/api/outsource/${id}`);
