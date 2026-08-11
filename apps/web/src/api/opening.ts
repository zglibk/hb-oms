import request from '@/utils/request';

/**
 * 成品期初明细行：**必须挂订单产品行**，展示字段由服务端从订单侧快照读取。
 *
 * 2026-08-11 起不再支持「纯属性行（不挂订单）」——已完结订单剩下的成品
 * 改由「物料管理 → 呆滞品管理」逐批建档跟踪。
 */
export interface OpeningFinishedItemPayload {
  orderProductId: number;
  side?: string;
  batchNo?: string;
  quantity: number;
  remark?: string;
}

export interface OpeningFinishedPayload {
  docDate: string;
  remark?: string;
  items: OpeningFinishedItemPayload[];
}

export interface OpeningPartItemPayload {
  partType: string;
  side?: string;
  itemNo: string;
  railSection?: string;
  productType?: string;
  materialThickness?: string;
  dimensionMm?: number;
  quantity: number;
  remark?: string;
}

export interface OpeningPartPayload {
  reason?: string;
  items: OpeningPartItemPayload[];
}

/** 成品期初结果；finished/reopened 为因期初而自动完结/重开的订单号 */
export interface OpeningFinishedResult {
  id: number;
  docNo: string;
  itemCount: number;
  finished?: string[];
  reopened?: string[];
}

export const openingFinished = (data: OpeningFinishedPayload) =>
  request.post<any, OpeningFinishedResult>('/api/opening/finished', data);

export const openingPart = (data: OpeningPartPayload) =>
  request.post<any, { total: number; items: Array<{ index: number; itemNo: string; quantity: number }> }>(
    '/api/opening/part',
    data,
  );
