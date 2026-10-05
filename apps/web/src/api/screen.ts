import request from '@/utils/request';

export interface ScreenOwedRow {
  orderProductId: number;
  customerName: string | null;
  productionNo: string | null;
  productName: string | null;
  productModel: string;
  days: number;
  deliveryOwed: number;
}

export interface ScreenOutsourceRow {
  id: number;
  backDate: string | null;
  processorName: string | null;
  productName: string | null;
  productionNo: string | null;
  returnQty: number;
}

export interface ScreenData {
  range: { from: string; to: string; bucket: 'day' | 'month' };
  generatedAt: string;
  cards: {
    activeOrders: number;
    productionOwed: number;
    deliveryOwed: number;
    overdueOrders: number;
    stockQty: number;
    rangeOutbound: number;
  };
  orderStatus: Array<{ status: number; label: string; count: number }>;
  customerOwedTop: Array<{ customerName: string; deliveryOwed: number }>;
  flow: {
    orderQty: number;
    outsourceReturned: number;
    assembled: number;
    inbound: number;
    outbound: number;
    completionRate: number;
    deliveryRate: number;
  };
  trend: { labels: string[]; inbound: number[]; outbound: number[]; outsource: number[] };
  workshopOutput: Array<{ workshop: string; qty: number }>;
  overdueOrders: ScreenOwedRow[];
  recentOutsource: ScreenOutsourceRow[];
  summary: { dullStockPcs: number; partBalanceItems: number; newOrders: number };
}

export interface ScreenRange {
  from: string;
  to: string;
}

/** 后台入口：登录 + stat:screen */
export function getScreenData(params: ScreenRange) {
  return request.get<any, ScreenData>('/api/screen/data', { params });
}

/** 访问码无效时抛出的错误（页面据此切到「请输入访问码」状态） */
export class ScreenKeyError extends Error {}

/**
 * 车间电视免登录入口：访问码走请求头。
 * **刻意不用 utils/request**：那里的 401 会触发刷新 token / 跳登录页，
 * 而电视根本没有登录态，访问码错了只该提示，不能被踢去登录页。
 */
export async function getPublicScreenData(params: ScreenRange, key: string): Promise<ScreenData> {
  const qs = new URLSearchParams({ from: params.from, to: params.to }).toString();
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/screen/public-data?${qs}`, {
    headers: { 'X-Screen-Key': key },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401) throw new ScreenKeyError(body?.message || '大屏访问码无效或已停用');
  if (!res.ok) throw new Error(body?.message || `加载失败（HTTP ${res.status}）`);
  return body.data as ScreenData;
}
