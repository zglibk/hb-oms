import request from '@/utils/request';

/**
 * 成品期初明细行：**两种形态二选一**
 * - 挂订单：填 orderPartGroupId，展示字段由服务端从订单侧快照读取；
 * - 纯属性（不挂订单）：省略 orderPartGroupId，改填货号等属性，只进库存数、不参与订单欠数。
 */
export interface OpeningFinishedItemPayload {
  orderPartGroupId?: number;
  side?: string;
  batchNo?: string;
  quantity: number;
  /* 以下仅纯属性行使用 */
  itemNo?: string;
  productModel?: string;
  productType?: string;
  groupType?: string;
  railSection?: string;
  dimensionMm?: number;
  dimensionText?: string;
  surfaceType?: string;
  color?: string;
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
