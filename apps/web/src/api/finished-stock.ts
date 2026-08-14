import request from '@/utils/request';
import { downloadFile, downloadXlsx } from '@/utils/download';
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
  /** 车间（字典 assembly_workshop 值；2026-08-13 前是自由文本班组名，历史值原样返回） */
  workTeam: string | null;
  /** 机台号已停用录入，仅历史单据有值 */
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
  /** 车间（字典 assembly_workshop 值）；机台号已停用录入，payload 不再携带 */
  workTeam?: string;
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

export interface StockBalanceQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  orderProductId?: number;
  side?: string;
  surfaceType?: string;
  onlyInStock?: boolean;
}

export const getStockBalance = (params: StockBalanceQuery) =>
  request.get<any, PageResult<BalanceRow>>('/api/finished-stock/balance', { params });

/** 导出当前筛选的成品库存（服务端按筛选全量导出，超 5000 行会拒绝） */
export const downloadStockBalanceExport = (params: StockBalanceQuery) =>
  downloadXlsx('/api/finished-stock/balance/export', params, '成品库存.xlsx');

/** 下载导入模板：已预填可录期初的产品行，只需填「期初数量」列 */
export const downloadStockBalanceTemplate = () =>
  downloadXlsx('/api/finished-stock/balance/import-template', undefined, '成品库存导入模板.xlsx');

/**
 * 批量导入成品库存。
 *
 * 落地成**一张 FGO 期初单并立即生效**，由单据驱动余额——库存不会被直接改写
 * （§5.6：确认是唯一驱动余额的入口）。整批全有全无：任一行有问题会整批回滚，
 * 逐行原因经 err.errors 回传，err.failedCount / err.totalCount 给出计数。
 */
export const importStockBalance = (file: File, docDate: string, remark?: string) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('docDate', docDate);
  if (remark) fd.append('remark', remark);
  return request.post<any, { total: number; docNo: string; itemCount: number } & FinishSyncResult>(
    '/api/finished-stock/balance/import',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

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

/* ==================== 送货单打印 ==================== */

/**
 * 送货单一行——**模板无关的全字段行**：服务端把候选字段都给出来，
 * 哪几列上纸面、列叫什么名，由模板注册表 constants/delivery-note.ts 决定。
 */
export interface DeliveryNoteRow {
  seq: number;
  orderProductId: number;
  /** 采购单编号 / 合同编号 */
  poNo: string;
  /** 物料编码 / 产品编码（客户方编码） */
  materialCode: string;
  productName: string;
  /** 产品要求描述（耐斯克模板的「品名」栏取它） */
  productRequirement: string;
  /** 产品型号（上面两个都空时的回落值） */
  productModel: string;
  itemNo: string;
  /** 规格：英寸录入 → 17寸；mm 录入 → 425mm */
  specText: string;
  /** 已按订单单位折算后的数量（奇数支折套会出现 0.5） */
  qty: number;
  /** set / piece */
  unit: string;
  /** 套 / 支 */
  unitLabel: string;
  /** 支数原值（内部口径，对账用） */
  qtyPcs: number;
  /** 海宝内部单号 = 生产单号 */
  productionNo: string;
  orderNo: string;
  remark: string;
}

export interface DeliveryNote {
  docId: number;
  docNo: string;
  /** 纸面「NO:」——由出库单号派生（FGO260814-0001 → 20260814-0001），不采番 */
  deliveryNo: string;
  docDate: string;
  bizType: string;
  status: number;
  /** 单头备注 → 纸面合计行的备注格（车间写「共19托」这类装箱信息） */
  remark: string;
  /** 制单 = 开这张出库单的人 */
  creatorName: string;
  customerName: string;
  customerCode: string;
  customerPhone: string;
  customerAddress: string;
  /** 客户绑定的模板编码；空串 = 取系统配置的全局默认 */
  templateCode: string;
  salesman: string;
  merchandiser: string;
  rows: DeliveryNoteRow[];
  /** 分单位合计（混着套与支时并列，不加成一个数） */
  totals: Array<{ unit: string; unitLabel: string; qty: number }>;
  /** 全单单位是否一致 */
  unitConsistent: boolean;
  /** 一致时的单位中文；不一致为 null（表头退化为「数量」） */
  unitLabel: string | null;
}

/** 送货单取数（只有销售出库单可打；已作废/跨客户会被服务端拒绝） */
export const getDeliveryNote = (id: number) =>
  request.get<any, DeliveryNote>(`/api/finished-stock/${id}/delivery-note`);

/**
 * 《送货单》PDF：服务端用无头浏览器渲染 /finished-stock/delivery-note 打印页出 PDF，
 * 点一下直接下载（不弹打印对话框），同《生产任务单》做法。
 */
export const downloadDeliveryNotePdf = (id: number, fallbackName: string) =>
  downloadFile(`/api/finished-stock/${id}/delivery-note-pdf`, undefined, fallbackName);
