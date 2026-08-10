import request from '@/utils/request';

/**
 * 台账展开行：部件组明细。
 * 四数已升到产品级（主行），组级只剩「工艺属性 + 外发回厂进度」——外发仍锚部件组，
 * 这正是展开行存在的意义。随主行一起返回，展开时无需再请求。
 */
export interface LedgerPartGroup {
  orderPartGroupId: number;
  groupType: string | null;
  productModel: string | null;
  /** 生产图号（组级，内部技术图纸号） */
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  /** 组支数（组间是互补部件，各组默认都等于产品支数，非数量拆分） */
  qtyPcs: number;
  /** 该组外发已回货数量（支） */
  returnedQty: number;
  /** 该组外发欠数 = 组支数 − 已回货；不需要表面处理时为 null（不适用，界面显示 —） */
  outsourceOwed: number | null;
}

/** 订单跟踪台账行（按**订单产品行**一行，四数实时聚合） */
export interface LedgerRow {
  orderProductId: number;
  orderId: number;
  orderDate: string | null;
  salesman: string | null;
  merchandiser: string | null;
  customerName: string | null;
  /** 台账「订单编号」= 生产单号 */
  productionNo: string | null;
  orderNo: string | null;
  materialCode: string | null;
  itemNo: string | null;
  /** 产品型号 = 货号 + 类型中文组合 + 「滑轨」（组后缀在展开行里） */
  productModel: string | null;
  productType: string | null;
  railSection: string | null;
  dimensionMm: number | null;
  dimensionText: string | null;
  orderQty: number;
  unit: string | null;
  surfaceType: string | null;
  color: string | null;
  /** 该产品各装配批次的车间（去重）；车间已下沉批次级，多批可分在不同车间 */
  assemblyWorkshops: string[];
  /** 部件组明细（展开行）：工艺属性 + 各组外发回厂进度 */
  partGroups: LedgerPartGroup[];
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
  /** 外发已回货（该产品下各部件组合计） */
  returnedQty: number;
  /**
   * 外发欠数 = 应外发量(**Σ组支数**) − 已回货量。
   * 应外发量不是产品订单数——外发锚部件组，三节轨 20 支产品要送出去的是三个部件共 60 支。
   * 不需要表面处理的产品为 null（不适用，界面显示 —）。
   */
  outsourceOwed: number | null;
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

/* ===== 行内展开：该产品行的三条流水 ===== */

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

/** 外发回厂流水行（2026-08-10：外发已收敛为回厂记录，无单号无状态） */
export interface LedgerOutsourceRow {
  id: number;
  /** 外发仍锚**部件组**，故流水要标明是哪个部件回的厂 */
  groupType: string | null;
  /** 实际回厂日期 */
  backDate: string | null;
  processorName: string | null;
  surfaceType: string | null;
  color: string | null;
  returnWeight: number;
  unitWeight: number;
  returnQty: number;
  remark: string | null;
  creatorName: string | null;
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
export const getLedgerRowDetail = (orderProductId: number) =>
  request.get<any, LedgerRowDetail>('/api/order/ledger/detail', {
    params: { orderProductId },
  });

/** 导出 Excel：按当前筛选全量导出（不含分页参数），列序对齐台账页 */
export const exportLedger = (params: Omit<LedgerQuery, 'page' | 'pageSize'>) =>
  request.get<any, Blob>('/api/order/ledger/export', { params, responseType: 'blob' });
