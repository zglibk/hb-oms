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
  /** 该部件组各装配批次的车间（去重）；车间已下沉批次级，一组多批可分在不同车间 */
  assemblyWorkshops: string[];
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

/* ===== 行内展开：该部件组的三条流水 ===== */

/** 成品出入库流水（只含已确认单据） */
export interface LedgerFinishedRow {
  docNo: string | null;
  bizType: string | null;
  /** 1入 −1出；数量恒为正，方向由此表达 */
  direction: number;
  docDate: string | null;
  side: string;
  quantity: number;
  /** 红字单被冲的原单号；非红字为 null */
  originDocNo: string | null;
  creatorName: string | null;
  remark: string | null;
}

/** 外发流水（排除已作废发坯单） */
export interface LedgerOutsourceRow {
  blankNo: string | null;
  processorName: string | null;
  surfaceType: string | null;
  color: string | null;
  status: number;
  sendDate: string | null;
  requireBackDate: string | null;
  sendWeight: number;
  unitWeight: number;
  sendQty: number;
  returnedQty: number;
  pendingQty: number;
}

/** 装配批次 */
export interface LedgerAssemblyRow {
  id: number;
  side: string;
  workshop: string | null;
  planStartDate: string | null;
  planDate: string | null;
  actualDate: string | null;
  qty: number;
  /** 实际完成日非空 = 已完成（服务端按 actual_date 派生，不读 status 列） */
  completed: boolean;
  creatorName: string | null;
  remark: string | null;
}

export interface LedgerRowDetail {
  finished: LedgerFinishedRow[];
  outsource: LedgerOutsourceRow[];
  assembly: LedgerAssemblyRow[];
}

/** 展开某台账行时按需加载，不随列表一起返回（一页几十行全查太重） */
export const getLedgerRowDetail = (orderPartGroupId: number) =>
  request.get<any, LedgerRowDetail>('/api/order/ledger/detail', {
    params: { orderPartGroupId },
  });

/** 导出 Excel：按当前筛选全量导出（不含分页参数），列序对齐台账页 */
export const exportLedger = (params: Omit<LedgerQuery, 'page' | 'pageSize'>) =>
  request.get<any, Blob>('/api/order/ledger/export', { params, responseType: 'blob' });
