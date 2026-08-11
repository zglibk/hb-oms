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

/* ===================== 外发 ===================== */

/**
 * 外发**没有状态枚举**（2026-08-10）。
 *
 * 模块两轮简化后只剩「外发件回厂流水」：一行 = 一次回厂，记录存在即已回厂，
 * 派生不出第二种状态。原 OUTSOURCE_STATUS（待发出/已发出/部分回货/已回齐/已作废）
 * 连同发坯单一并删除——留一个恒定值的状态列只会误导后来人。
 */

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

/* ===================== 部件台账 ===================== */

/**
 * 部件台账余量变动来源（t_part_adjust.source，设计文档 §4.6）。
 * 台账「不直接改数无痕」：期初录入与手工调整都写同一张流水表，
 * 靠本字段区分，任何一次余量变动都能追到人和原因。
 */
export const PART_ADJUST_SOURCE = {
  /** 期初录入（系统上线补录存量） */
  OPENING: 'opening',
  /** 手工调整（盘盈盘亏、纠错） */
  MANUAL: 'manual',
} as const;

export const PART_ADJUST_SOURCE_OPTIONS: Array<{ label: string; value: string; type: string }> = [
  { label: '期初录入', value: PART_ADJUST_SOURCE.OPENING, type: 'info' },
  { label: '手工调整', value: PART_ADJUST_SOURCE.MANUAL, type: 'warning' },
];

/* ===================== 人事档案（HR） ===================== */

/** 在职状态：1在职 2离职（t_employee.job_status） */
export const JOB_STATUS = {
  ACTIVE: 1,
  LEFT: 2,
} as const;

export const JOB_STATUS_OPTIONS: StatusOption[] = [
  { label: '在职', value: JOB_STATUS.ACTIVE, type: 'success' },
  { label: '离职', value: JOB_STATUS.LEFT, type: 'info' },
];

/** 性别：0未知 1男 2女（与 t_user.gender / t_employee.gender 同口径） */
export const GENDER = {
  UNKNOWN: 0,
  MALE: 1,
  FEMALE: 2,
} as const;

export const GENDER_OPTIONS: StatusOption[] = [
  { label: '未知', value: GENDER.UNKNOWN, type: 'info' },
  { label: '男', value: GENDER.MALE, type: 'primary' },
  { label: '女', value: GENDER.FEMALE, type: 'danger' },
];

/** 学历类型（t_employee.education_type）：全日制 / 非全日制 */
export const EDUCATION_TYPE = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
} as const;

export const EDUCATION_TYPE_OPTIONS: Array<{ label: string; value: string; type: string }> = [
  { label: '全日制', value: EDUCATION_TYPE.FULL_TIME, type: 'success' },
  { label: '非全日制', value: EDUCATION_TYPE.PART_TIME, type: 'warning' },
];

/**
 * 由出生日期算周岁；无效则返回 null。
 * 人事档案列表/详情展示用，年龄不落库。
 */
export function ageFromBirthDate(birthDate: string | Date | null | undefined): number | null {
  if (!birthDate) return null;
  const d = typeof birthDate === 'string' ? new Date(birthDate.slice(0, 10)) : birthDate;
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/**
 * 从 18 位身份证号解析出生日期（YYYY-MM-DD）；格式不对返回 null。
 */
export function birthDateFromIdCard(idCard: string | null | undefined): string | null {
  if (!idCard || !/^\d{17}[\dXx]$/.test(idCard.trim())) return null;
  const y = idCard.slice(6, 10);
  const m = idCard.slice(10, 12);
  const day = idCard.slice(12, 14);
  const d = new Date(`${y}-${m}-${day}`);
  if (Number.isNaN(d.getTime())) return null;
  return `${y}-${m}-${day}`;
}

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
