import request from '@/utils/request';

/** 订单跟踪台账行（按部件组一行，四数实时聚合） */
export interface LedgerRow {
  orderPartGroupId: number;
  orderId: number;
  orderProductId: number;
  orderDate: string | null;
  salesman: string | null;
  merchandiser: string | null;
  customerName: string | null;
  /** 台账「订单编号」= 生产单号 */
  productionNo: string | null;
  orderNo: string | null;
  materialCode: string | null;
  itemNo: string | null;
  productModel: string | null;
  productType: string | null;
  groupType: string | null;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  orderQty: number;
  unit: string | null;
  surfaceType: string | null;
  color: string | null;
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  assemblyWorkshop: string | null;
  deliveryDate: string | null;
  isExport: number;
  exportCountry: string | null;
  socket: boolean;
  /** ===== 四数 ===== */
  qtyPcs: number;
  inQty: number;
  outQty: number;
  stockQty: number;
  productionOwed: number;
  deliveryOwed: number;
  returnedQty: number;
  assembledQty: number;
  assemblyPendingQty: number;
  nextAssemblyPlanDate: string | null;
  overdue: boolean;
}

export interface LedgerSummary {
  rows: number;
  totalQty: number;
  totalIn: number;
  totalOut: number;
  totalStock: number;
  totalProductionOwed: number;
  totalDeliveryOwed: number;
}

export interface LedgerQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  customerName?: string;
  salesman?: string;
  merchandiser?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  surfaceType?: string;
  assemblyWorkshop?: string;
  productType?: string;
  isExport?: number;
  orderStatus?: number;
  onlyOwed?: boolean;
  onlyOverdue?: boolean;
}

export interface LedgerResult {
  list: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: LedgerSummary;
}

export const getLedger = (params: LedgerQuery) =>
  request.get<any, LedgerResult>('/api/order/ledger', { params });
