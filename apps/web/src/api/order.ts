import request from '@/utils/request';
import { downloadFile } from '@/utils/download';
import type { PageResult } from './customer';

/** 订单部件行（服务端按蓝图展开；客户端仅可微调追溯码/备注） */
export interface OrderPartItem {
  id: number;
  orderId: number;
  productId: number;
  partGroupId: number;
  partType: string;
  side: string;
  cycleCode: string | null;
  qty: number;
  remark: string | null;
  sort: number;
}

/** 订单部件组（跟踪/台账锚点） */
export interface OrderPartGroupItem {
  id: number;
  orderId: number;
  orderProductId: number;
  groupType: string;
  drawingNo: string | null;
  drawingVersion: string | null;
  materialThickness: string | null;
  qtyPcs: number;
  productModel: string | null;
  remark: string | null;
  sort: number;
  parts?: OrderPartItem[];
  /** 该组的外发回厂记录条数（仅详情接口带出；> 0 即不能删、不能改组类型） */
  outsourceCount?: number;
}

/** 下游引用条数：外发回厂记录 / 装配批次 / 成品出入库明细 */
export interface OrderRefCounts {
  outsource: number;
  assembly: number;
  finished: number;
}

/**
 * 编辑守卫（仅详情接口带出）：订单只许创建人与「订单修改主管角色」修改（管理员与超级管理员均不例外）；
 * 被下游引用后还只能「更正」、不能动结构。
 */
export interface OrderEditGuard {
  referenced: boolean;
  refCounts: OrderRefCounts;
  /** 当前用户能否修改这张订单 */
  canEdit: boolean;
  /** 谁能改（提示文案），如「订单创建人（张三）或业务经理」 */
  editors: string;
}

export interface OrderProductItem {
  id: number;
  orderId: number;
  orderType: number;
  isNewOrder: number;
  isExport: number;
  exportCountry: string | null;
  materialId: number | null;
  materialCode: string | null;
  itemNo: string | null;
  /** 客户图号（客户来图图号，区别于部件组的生产图号 drawingNo） */
  customerDrawingNo: string | null;
  productName: string | null;
  productType: string | null;
  railSection: string | null;
  /** 产品要求描述（客户对该产品的特殊要求；随业务字段开关显隐） */
  productRequirement: string | null;
  /** 分体出货：0整品 1分体（该行按部件组构成分体包装出货，不组装成整品） */
  isSplit: number;
  dimensionMm: number | null;
  dimensionRaw: string | null;
  dimensionUnit: string | null;
  surfaceType: string;
  color: string | null;
  sheetMaterial: string | null;
  orderQty: number;
  unit: string;
  qtyPcs: number;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  remark: string | null;
  sort: number;
  partGroups: OrderPartGroupItem[];
  /** 该产品行的下游引用条数（仅详情接口带出） */
  refCounts?: OrderRefCounts;
}

export interface OrderItem {
  id: number;
  orderNo: string;
  poNo: string | null;
  /** 生产单号（订单级，与 PO# 一对一；台账「订单编号」口径） */
  productionNo: string | null;
  customerId: number | null;
  customerName: string;
  orderDate: string;
  salesman: string | null;
  merchandiser: string | null;
  orderSource: string | null;
  attachmentIds: string | null;
  status: number;
  isOpening: number;
  remark: string | null;
  /** 订单备注（图文混排 HTML）；列表接口不返回，仅详情带出 */
  otherReq?: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  products: OrderProductItem[];
  /** 编辑守卫（仅详情接口带出） */
  editGuard?: OrderEditGuard;
  /** 当前用户能否修改 / 删除（仅列表接口带出） */
  canModify?: boolean;
}

export interface OrderQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
  dateFrom?: string;
  dateTo?: string;
  /** PO# 精确匹配（新建保存前的同 PO# 软提醒用） */
  poNo?: string;
  /** 业务员 / 跟单员：姓名精确匹配 */
  salesman?: string;
  merchandiser?: string;
  /** 「更多」产品级条件：订单下任一产品行同时满足全部所填条件即入选 */
  customerDrawingNo?: string;
  drawingNo?: string;
  productType?: string;
  railSection?: string;
  surfaceType?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
}

/** 提交负载：产品行嵌套部件组（部件行由服务端蓝图展开，仅传微调） */
export interface OrderPartGroupPayload {
  /** 编辑时回传既有部件组 ID（服务端按它原地更新，外发回厂记录锚在它上面）；新增组不传 */
  id?: number;
  groupType: string;
  drawingNo?: string;
  drawingVersion?: string;
  materialThickness?: string;
  qtyPcs?: number;
  remark?: string;
  sort?: number;
  parts?: Array<{ partType: string; side?: string; cycleCode?: string; remark?: string }>;
}

export interface OrderProductPayload {
  /** 编辑时回传既有产品行 ID（服务端按它原地更新，装配/成品锚在它上面）；新增行不传 */
  id?: number;
  orderType?: number;
  isNewOrder?: number;
  isExport?: number;
  exportCountry?: string;
  materialId?: number;
  materialCode?: string;
  itemNo?: string;
  customerDrawingNo?: string;
  productName?: string;
  productType?: string;
  railSection?: string;
  productRequirement?: string;
  /** 分体出货标记：0整品 1分体 */
  isSplit?: number;
  dimensionMm?: number;
  dimensionRaw?: string;
  dimensionUnit?: string;
  surfaceType?: string;
  color?: string;
  sheetMaterial?: string;
  orderQty: number;
  unit: string;
  deliveryDate: string;
  deliveryAddress?: string;
  remark?: string;
  sort?: number;
  partGroups?: OrderPartGroupPayload[];
}

export interface OrderPayload {
  /** PO#（客户订单文件上的订单编号）——2026-09-25 起选填（口头 / 手写订单没有 PO 号），空传 null */
  poNo?: string | null;
  /** 生产单号（台账「订单编号」口径）——2026-08-14 起必填，服务端 DTO 同样硬校验 */
  productionNo: string;
  customerId?: number;
  customerName: string;
  orderDate: string;
  salesman?: string;
  merchandiser?: string;
  orderSource?: string;
  attachmentIds?: string;
  isOpening?: number;
  remark?: string;
  /** 订单备注（图文混排 HTML，wangEditor 输出） */
  otherReq?: string;
  products: OrderProductPayload[];
}

export const getOrderList = (params: OrderQuery) =>
  request.get<any, PageResult<OrderItem>>('/api/order', { params });

/** 订单里实际出现过的业务员 / 跟单员姓名（列表查询区下拉用，页面再与硬编码名单合并） */
export const getOrderStaffOptions = () =>
  request.get<any, { salesmen: string[]; merchandisers: string[] }>('/api/order/staff-options');

export const getOrderDetail = (id: number) =>
  request.get<any, OrderItem>(`/api/order/${id}`);

/** 导出总计划（按当前筛选全量导出，一行=一个产品行；四数与台账同口径） */
export const exportTotalPlan = (params: Omit<OrderQuery, 'page' | 'pageSize'>) =>
  request.get<any, Blob>('/api/order/export/total-plan', { params, responseType: 'blob' });

export const createOrder = (data: OrderPayload) =>
  request.post<any, { id: number; orderNo: string }>('/api/order', data);

/** 编辑结果：被引用订单的更正会回写下游快照，并可能自动完结 / 重开订单 */
export interface OrderUpdateResult {
  id: number;
  /** 是否为「更正已引用订单」 */
  corrected: boolean;
  /** 逐项改动明细（仅更正时有） */
  changes: string[];
  /** 同步到的下游记录条数（仅更正时有） */
  synced: OrderRefCounts | null;
  finished: string[];
  reopened: string[];
}

export const updateOrder = (id: number, data: OrderPayload) =>
  request.put<any, OrderUpdateResult>(`/api/order/${id}`, data);

export const finishOrder = (id: number) => request.post(`/api/order/${id}/finish`);
export const reopenOrder = (id: number) => request.post(`/api/order/${id}/reopen`);
/** 删除订单（取代作废）：仅未被外发/装配/出入库引用时可删，连带删四级数据 */
export const deleteOrder = (id: number) => request.delete(`/api/order/${id}`);

/**
 * 《生产任务单》PDF：服务端用无头浏览器渲染 /order/print 打印页出 PDF，
 * 点一下直接下载（不弹打印对话框）。文件名以响应头为准，兜底用调用方给的。
 */
export const downloadOrderTaskPdf = (id: number, fallbackName: string) =>
  downloadFile(`/api/order/${id}/task-order-pdf`, undefined, fallbackName);
