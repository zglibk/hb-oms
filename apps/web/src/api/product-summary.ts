import request from '@/utils/request';
import { downloadXlsx } from '@/utils/download';

/**
 * 产品汇总查询（财务需求）：跨订单的「产品视角」汇总。
 * Tab1 累计口径复用台账 findLedger 二次聚合；Tab2 按单据日期区间做期间进销存。
 */

/* ===== Tab1 产品汇总（累计口径） ===== */

/** 展开行：该产品的逐订单明细 */
export interface SummaryOrderRow {
  orderProductId: number;
  orderId: number;
  orderDate: string | null;
  productionNo: string | null;
  orderNo: string | null;
  customerName: string | null;
  qtyPcs: number;
  inQty: number;
  outQty: number;
  stockQty: number;
  productionOwed: number;
  deliveryOwed: number;
  deliveryDate: string | null;
  overdue: boolean;
}

/** 聚合行：一行 = 一种「相同产品」（型号/节数/规格/料厚/表面处理/颜色 六要素相同） */
export interface ProductSummaryRow {
  key: string;
  productModel: string;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  /** 料厚签名（组级料厚按组序去重「/」并列） */
  thickness: string;
  surfaceType: string | null;
  color: string | null;
  customers: string[];
  orderCount: number;
  qtyPcs: number;
  inQty: number;
  outQty: number;
  stockQty: number;
  productionOwed: number;
  deliveryOwed: number;
  orders: SummaryOrderRow[];
}

export interface ProductSummarySummary {
  kinds: number;
  totalQty: number;
  totalIn: number;
  totalOut: number;
  totalStock: number;
  totalProductionOwed: number;
  totalDeliveryOwed: number;
}

export interface ProductSummaryQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  customerName?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  surfaceType?: string;
  productType?: string;
  orderStatus?: number;
  onlyOwed?: boolean;
  onlyStocked?: boolean;
}

export interface ProductSummaryResult {
  list: ProductSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: ProductSummarySummary;
}

export const getProductSummary = (params: ProductSummaryQuery) =>
  request.get<any, ProductSummaryResult>('/api/product-summary', { params });

/** Tab1 导出（Sheet1 产品汇总 + Sheet2 订单明细）；文件名由服务端响应头给出 */
export const downloadSummaryExport = (params: Omit<ProductSummaryQuery, 'page' | 'pageSize'>) =>
  downloadXlsx('/api/product-summary/export', params, '产品汇总.xlsx');

/* ===== Tab2 出入库汇总（期间进销存） ===== */

/** 展开行：期间内逐笔已确认单据 */
export interface PeriodFlowRow {
  docNo: string | null;
  docDate: string | null;
  bizType: string | null;
  /** 1入 −1出（数量恒正，方向由此表达） */
  direction: number;
  quantity: number;
  side: string;
  originDocNo: string | null;
  customerName: string | null;
  productionNo: string | null;
  surfaceType: string | null;
  color: string | null;
  creatorName: string | null;
}

/** 聚合行：期末结存 = 期初结存 + 期间入库 − 期间出库（同一份流水推算，天然勾稽） */
export interface PeriodSummaryRow {
  key: string;
  productModel: string;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  thickness: string;
  surfaceType: string | null;
  color: string | null;
  customers: string[];
  opening: number;
  periodIn: number;
  periodOut: number;
  periodEnd: number;
  flows: PeriodFlowRow[];
}

export interface PeriodSummaryQuery {
  page?: number;
  pageSize?: number;
  /** 单据日期区间（必填） */
  from: string;
  to: string;
  keyword?: string;
  customerName?: string;
  surfaceType?: string;
}

export interface PeriodSummaryResult {
  list: PeriodSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    kinds: number;
    totalOpening: number;
    totalIn: number;
    totalOut: number;
    totalEnd: number;
  };
}

export const getPeriodSummary = (params: PeriodSummaryQuery) =>
  request.get<any, PeriodSummaryResult>('/api/product-summary/period', { params });

/** Tab2 导出（Sheet1 出入库汇总 + Sheet2 出入库明细） */
export const downloadPeriodExport = (params: Omit<PeriodSummaryQuery, 'page' | 'pageSize'>) =>
  downloadXlsx('/api/product-summary/period/export', params, '出入库汇总.xlsx');
