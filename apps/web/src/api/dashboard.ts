import request from '@/utils/request';

/** 汇总卡四数（设计文档 §5.2） */
export interface DashboardCards {
  /** 进行中订单数 */
  activeOrders: number;
  /** 总生产欠数（支）：逐组取正后求和，超产不冲抵其他组 */
  productionOwed: number;
  /** 总发货欠数（支）：同上口径 */
  deliveryOwed: number;
  /** 逾期订单数（交期已过且仍欠发货） */
  overdueOrders: number;
}

/** 待办行：逾期未发货 / 临近交期共用 */
export interface DashboardOwedRow {
  orderPartGroupId: number;
  orderId: number;
  orderNo: string | null;
  customerName: string | null;
  salesman: string | null;
  merchandiser: string | null;
  productionNo: string | null;
  productModel: string | null;
  deliveryDate: string | null;
  /** 逾期列表＝已逾期天数；临近列表＝距交期天数（今天为 0） */
  days: number;
  qtyPcs: number;
  deliveryOwed: number;
}

/** 近期外发回厂行（原「超期未回齐」——不再登记计划回厂时间后已无超期基准） */
export interface DashboardOutsourceRow {
  id: number;
  backDate: string | null;
  processorName: string | null;
  surfaceType: string | null;
  color: string | null;
  productModel: string | null;
  productionNo: string | null;
  returnQty: number;
}

/** 三张待办列表的真实总条数（列表被 topLimit 截断，角标用这个而不是 list.length） */
export interface DashboardCounts {
  overdueOrders: number;
  upcomingOrders: number;
  recentOutsource: number;
}

export interface DashboardSummary {
  cards: DashboardCards;
  overdueOrders: DashboardOwedRow[];
  upcomingOrders: DashboardOwedRow[];
  recentOutsource: DashboardOutsourceRow[];
  counts: DashboardCounts;
  /** 列表区截断条数，界面据此提示「仅显示前 N 条」 */
  topLimit: number;
  /** 「临近交期」窗口天数 */
  upcomingDays: number;
}

/** 首页看板汇总（登录即可访问，不挂权限点） */
export const getDashboardSummary = () =>
  request.get<any, DashboardSummary>('/api/dashboard/summary');
