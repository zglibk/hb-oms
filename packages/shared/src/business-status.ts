/**
 * 业务状态枚举——前后端**唯一事实源**。
 *
 * 后端 apps/server/src/common/constants/business-status.ts 与
 * 前端 apps/web/src/constants/dict.ts 均从本文件 re-export，
 * 禁止在两端各自重复定义状态数值或中文文案。
 *
 * XXX_STATUS：数值常量（逻辑判断用）；
 * XXX_STATUS_OPTIONS：展示映射（label 中文名 / value 数值 / type el-tag 颜色）。
 * 二者必须同步维护。
 */

/** 展示选项：label 中文名，value 状态值，type 前端 el-tag 颜色（后端可忽略） */
export interface StatusOption {
  label: string;
  value: number;
  type: string;
}

/* ===================== 订单 ===================== */

/** 订单状态：1进行中 2已完结 9已作废（设计文档 §3.1） */
export const ORDER_STATUS = {
  ACTIVE: 1,
  FINISHED: 2,
  CANCELLED: 9,
} as const;

export const ORDER_STATUS_OPTIONS: StatusOption[] = [
  { label: '进行中', value: ORDER_STATUS.ACTIVE, type: 'primary' },
  { label: '已完结', value: ORDER_STATUS.FINISHED, type: 'success' },
  { label: '已作废', value: ORDER_STATUS.CANCELLED, type: 'danger' },
];

/** 订单类型：1销售订单 2库存备货 */
export const ORDER_TYPE = {
  SALE: 1,
  STOCK: 2,
} as const;

export const ORDER_TYPE_OPTIONS: StatusOption[] = [
  { label: '销售订单', value: ORDER_TYPE.SALE, type: 'primary' },
  { label: '库存备货', value: ORDER_TYPE.STOCK, type: 'info' },
];

/** 下单来源（t_order.order_source，字符串枚举） */
export const ORDER_SOURCE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '订单文件', value: 'official_doc' },
  { label: '口头', value: 'verbal' },
  { label: '电话', value: 'phone' },
  { label: '微信/QQ', value: 'social' },
];

/* ===================== 表面处理 ===================== */

/**
 * 表面处理为**字典驱动**（dict_type='surface_type'，设计文档决策 #4）：
 * 初始值 none 无 / seal_paint 封漆 / electrophoresis 电泳 / spray 喷涂 /
 * smooth_paint 平滑漆，业务可经字典管理自行增减，**不在代码里枚举**。
 * 仅保留 `none` 哨兵值——镀锌板等不外发产品，控制外发必填逻辑；
 * 字典管理界面禁止删除/改值该项（§7.16）。
 */
export const SURFACE_NONE = 'none';

/** 是否需要外发表面处理（none/空 = 不外发） */
export function needsOutsource(surfaceType: string | null | undefined): boolean {
  return !!surfaceType && surfaceType !== SURFACE_NONE;
}

/* ===================== 外发（发坯单） ===================== */

/** 外发单状态：1待发出 2已发出 3部分回货 4已回齐 9已作废（设计文档 §3.2） */
export const OUTSOURCE_STATUS = {
  PENDING: 1,
  SENT: 2,
  PARTIAL_RETURNED: 3,
  RETURNED_ALL: 4,
  CANCELLED: 9,
} as const;

export const OUTSOURCE_STATUS_OPTIONS: StatusOption[] = [
  { label: '待发出', value: OUTSOURCE_STATUS.PENDING, type: 'info' },
  { label: '已发出', value: OUTSOURCE_STATUS.SENT, type: 'primary' },
  { label: '部分回货', value: OUTSOURCE_STATUS.PARTIAL_RETURNED, type: 'warning' },
  { label: '已回齐', value: OUTSOURCE_STATUS.RETURNED_ALL, type: 'success' },
  { label: '已作废', value: OUTSOURCE_STATUS.CANCELLED, type: 'danger' },
];

/* ===================== 装配 ===================== */

/**
 * 装配批次状态：1计划中 2已完成（设计文档 §3.4）。
 * 派生自实际完成时间（actual_date）是否已填：NULL=计划中，非空=已完成。
 */
export const ASSEMBLY_STATUS = {
  PLANNING: 1,
  COMPLETED: 2,
} as const;

export const ASSEMBLY_STATUS_OPTIONS: StatusOption[] = [
  { label: '计划中', value: ASSEMBLY_STATUS.PLANNING, type: 'warning' },
  { label: '已完成', value: ASSEMBLY_STATUS.COMPLETED, type: 'success' },
];

/* ===================== 成品出入库 ===================== */

/** 成品单据状态：1草稿 2已确认 9已作废（仅草稿可作废；已确认只可红字冲销）（设计文档 §3.3） */
export const FINISHED_DOC_STATUS = {
  DRAFT: 1,
  CONFIRMED: 2,
  CANCELLED: 9,
} as const;

export const FINISHED_DOC_STATUS_OPTIONS: StatusOption[] = [
  { label: '草稿', value: FINISHED_DOC_STATUS.DRAFT, type: 'info' },
  { label: '已确认', value: FINISHED_DOC_STATUS.CONFIRMED, type: 'success' },
  { label: '已作废', value: FINISHED_DOC_STATUS.CANCELLED, type: 'danger' },
];

/** 库存方向：1入库 -1出库（红字单方向与被冲原单相反） */
export const STOCK_DIRECTION = {
  IN: 1,
  OUT: -1,
} as const;

/** 成品单据业务类型（t_finished_doc.biz_type，字符串枚举） */
export const FINISHED_BIZ_TYPE = {
  /** 生产入库 */
  INBOUND: 'inbound',
  /** 期初录入 */
  OPENING_BALANCE: 'opening_balance',
  /** 销售出库 */
  SALE_OUTBOUND: 'sale_outbound',
  /** 红字冲销 */
  REVERSAL: 'reversal',
} as const;

export const FINISHED_BIZ_TYPE_OPTIONS: Array<{ label: string; value: string; type: string }> = [
  { label: '生产入库', value: FINISHED_BIZ_TYPE.INBOUND, type: 'success' },
  { label: '期初录入', value: FINISHED_BIZ_TYPE.OPENING_BALANCE, type: 'info' },
  { label: '销售出库', value: FINISHED_BIZ_TYPE.SALE_OUTBOUND, type: 'primary' },
  { label: '红字冲销', value: FINISHED_BIZ_TYPE.REVERSAL, type: 'danger' },
];

/* ===================== 通用启停 ===================== */

/** 基础数据启停：1启用 0停用 */
export const ENABLE_STATUS = {
  ENABLED: 1,
  DISABLED: 0,
} as const;

export const ENABLE_STATUS_OPTIONS: StatusOption[] = [
  { label: '启用', value: ENABLE_STATUS.ENABLED, type: 'success' },
  { label: '停用', value: ENABLE_STATUS.DISABLED, type: 'info' },
];
