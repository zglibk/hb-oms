/**
 * 首页欢迎横幅副标题的「岗位 × 时段」提示文案（2026-09-25）。
 *
 * - **岗位组**：17 个内置业务角色按工作内容归成 7 组（管理层 / 业务 / 计划 / 生产 / 仓库 /
 *   技术品质 / 财务人事），系统管理员单独一组；界面上新建的自定义角色回落「通用」组。
 * - **多角色**：按 `GROUP_PRIORITY` 取第一个命中的组——取最能代表主要职责的一组，不拼接多组文案。
 * - **时段**：早上 / 上午 / 中午 / 下午 / 晚上 五个时段分岗位；深夜不分岗位，统一提醒休息。
 * - **实时数字**：`withData` 用首页看板已加载的统计数拼文案；无看板权限或数据尚未返回时
 *   传入 null，回落 `text`（不能拿初始的全 0 去拼，否则会先闪一句「没有逾期」再跳成真实数字）。
 *   `withData` 返回 null 表示该时段不用数字，同样回落 `text`。
 * - 提示只是文字、不带跳转；角色的实际权限可能被管理员改过，文案不按权限过滤（收益小、复杂度高）。
 *
 * 改措辞只改本文件。节假日当天的节日祝福优先于这里的所有文案（在 index.vue 里判断）。
 */

export type TipTone = 'night' | 'morning' | 'forenoon' | 'noon' | 'afternoon' | 'evening';
type DayTone = Exclude<TipTone, 'night'>;

/** 首页看板已有的统计数（口径见 dashboard.service） */
export interface TipData {
  /** 进行中订单（张） */
  activeOrders: number;
  /** 逾期订单（张，按订单去重） */
  overdueOrders: number;
  /** 逾期未发货（个产品，按订单产品行计） */
  overdueItems: number;
  /** N 天内到期且仍欠发货（个产品） */
  upcomingItems: number;
  /** 「临近交期」窗口天数 */
  upcomingDays: number;
  /** 总成品欠数（支） */
  productionOwed: number;
  /** 总发货欠数（支） */
  deliveryOwed: number;
  /** 今天回厂的外发记录（条） */
  todayBack: number;
}

interface Tip {
  /** 无数据时的文案 */
  text: string;
  /** 带实时数字的文案；返回 null 则用 text */
  withData?: (d: TipData) => string | null;
}

type TipGroup = 'admin' | 'mgmt' | 'biz' | 'plan' | 'prod' | 'wh' | 'tq' | 'fin' | 'generic';

/** 角色编码 → 岗位组（自定义角色不在表内，回落 generic） */
const ROLE_GROUP: Record<string, TipGroup> = {
  admin: 'admin',
  SYS_OPR: 'admin',
  GEN_MGR: 'mgmt',
  VICE_MGR: 'mgmt',
  BUS_MGR: 'biz',
  BUS_OPR: 'biz',
  DOC_OPR: 'biz',
  PLN_MGR: 'plan',
  PLN_OPR: 'plan',
  PROD_MGR: 'prod',
  PROD_OPR: 'prod',
  WH_OPR: 'wh',
  TECH_MGR: 'tq',
  TECH_ENG: 'tq',
  QA_MGR: 'tq',
  PQE_ENG: 'tq',
  FIN_MGR: 'fin',
  PAY_OPR: 'fin',
};

/** 多角色时的取组优先级 */
const GROUP_PRIORITY: TipGroup[] = ['admin', 'mgmt', 'biz', 'plan', 'prod', 'wh', 'tq', 'fin'];

const n = (v: number) => v.toLocaleString('zh-CN');

const NOON_REST: Tip = { text: '午间稍作休息，下午继续加油' };

const TIPS: Record<TipGroup, Record<DayTone, Tip>> = {
  admin: {
    morning: { text: '新的一天，先看看系统运行与权限配置是否正常' },
    forenoon: { text: '用户、角色或基础数据有变动时，记得及时维护' },
    noon: NOON_REST,
    afternoon: { text: '留意操作日志与系统配置，及时处理异常' },
    evening: { text: '辛苦了，离开前确认重要配置已妥善保存' },
  },
  mgmt: {
    morning: {
      text: '新的一天，先看看今天的交付重点',
      withData: (d) =>
        d.overdueOrders
          ? `进行中订单 ${n(d.activeOrders)} 张，其中 ${n(d.overdueOrders)} 张已逾期，先看看交付重点`
          : `进行中订单 ${n(d.activeOrders)} 张，目前没有逾期，交付节奏良好`,
    },
    forenoon: {
      text: '留意逾期订单与发货欠数的变化',
      withData: (d) => `总发货欠数 ${n(d.deliveryOwed)} 支，逾期订单 ${n(d.overdueOrders)} 张，点汇总卡可进台账看明细`,
    },
    noon: {
      text: '午间稍作休息，下午继续加油',
      withData: (d) => `午间小结：${d.upcomingDays} 天内还有 ${n(d.upcomingItems)} 个产品到期`,
    },
    afternoon: {
      text: '关注装配与入库进度',
      withData: (d) => `总成品欠数 ${n(d.productionOwed)} 支，关注装配与入库进度`,
    },
    evening: {
      text: '今天辛苦了，早点休息',
      withData: (d) =>
        d.overdueOrders ? `今天辛苦了，目前仍有 ${n(d.overdueOrders)} 张订单逾期` : '今天辛苦了，目前没有逾期订单',
    },
  },
  biz: {
    morning: {
      text: '新的一天，先看看有哪些订单要交付',
      withData: (d) =>
        d.overdueItems
          ? `${n(d.overdueItems)} 个产品已过交期未发货，先和客户同步进度`
          : '目前没有逾期未发货，交付良好',
    },
    forenoon: {
      text: '临近交期的订单，提前确认发货安排',
      withData: (d) =>
        d.upcomingItems
          ? `${d.upcomingDays} 天内有 ${n(d.upcomingItems)} 个产品到期，提前确认发货安排`
          : `${d.upcomingDays} 天内没有到期欠货的订单`,
    },
    noon: { text: '午间稍作休息，客户消息别漏回' },
    afternoon: {
      text: '跟进今天的出货进度',
      withData: (d) => `总发货欠数 ${n(d.deliveryOwed)} 支，跟进今天的出货进度`,
    },
    evening: { text: '收工前确认今天的新订单都已录入' },
  },
  plan: {
    morning: {
      text: '检查今天的装配排期',
      withData: (d) =>
        d.upcomingItems
          ? `${d.upcomingDays} 天内有 ${n(d.upcomingItems)} 个产品到期，检查装配排期是否跟得上`
          : '检查今天的装配排期',
    },
    forenoon: {
      text: '优先安排临近交期的产品',
      withData: (d) => `总成品欠数 ${n(d.productionOwed)} 支，优先安排临近交期的产品`,
    },
    noon: NOON_REST,
    afternoon: {
      text: '留意外发回厂能否衔接装配',
      withData: (d) =>
        d.todayBack
          ? `今天已回厂外发件 ${n(d.todayBack)} 条，确认能否衔接装配`
          : '今天还没有外发件回厂，留意会不会拖慢装配',
    },
    evening: { text: '收工前把明天的装配计划排好' },
  },
  prod: {
    morning: {
      text: '开工前核对要装配的部件是否到齐',
      withData: (d) => `总成品欠数 ${n(d.productionOwed)} 支，开工前核对部件是否到齐`,
    },
    forenoon: { text: '装配完工后记得及时登记实际完成' },
    noon: { text: '午间注意休息，下午注意安全生产' },
    afternoon: {
      text: '外发件回厂后及时安排装配',
      withData: (d) =>
        d.todayBack ? `今天已回厂外发件 ${n(d.todayBack)} 条，及时安排装配` : '今天还没有外发件回厂',
    },
    evening: { text: '收工前确认今天的装配完工都已登记' },
  },
  wh: {
    morning: { text: '开工前先看看有哪些待确认的出入库单' },
    forenoon: {
      text: '外发件回厂注意核对数量',
      withData: (d) => (d.todayBack ? `今天已回厂外发件 ${n(d.todayBack)} 条，注意核对数量` : null),
    },
    noon: NOON_REST,
    afternoon: {
      text: '发货前记得打印送货单，随货带走',
      withData: (d) => `总发货欠数 ${n(d.deliveryOwed)} 支，发货前记得打印送货单随货带走`,
    },
    evening: { text: '收工前确认今天的出入库都已登记' },
  },
  tq: {
    morning: { text: '新订单的开单信息与生产BOM，今天记得核对' },
    forenoon: {
      text: '外发回厂件留意表面处理质量',
      withData: (d) => (d.todayBack ? `今天已回厂外发件 ${n(d.todayBack)} 条，留意表面处理质量` : null),
    },
    noon: NOON_REST,
    afternoon: { text: '图纸版本有变更的，记得同步更新生产BOM' },
    evening: { text: '收工前确认今天的工艺资料都已更新' },
  },
  fin: {
    morning: {
      text: '新的一天，从对账开始',
      withData: (d) => `进行中订单 ${n(d.activeOrders)} 张，新的一天从对账开始`,
    },
    forenoon: { text: '产品汇总可按期间查看进销存，对账更方便' },
    noon: NOON_REST,
    afternoon: {
      text: '发货结算可对照产品汇总核对',
      withData: (d) => `总发货欠数 ${n(d.deliveryOwed)} 支，发货结算可对照产品汇总核对`,
    },
    evening: { text: '辛苦了，收工前确认今天的单据都已核对' },
  },
  generic: {
    morning: { text: '新的一天，先看看今天有哪些订单要交付' },
    forenoon: { text: '逾期与临近交期的订单，优先跟进' },
    noon: NOON_REST,
    afternoon: { text: '记得核对外发回厂与装配进度' },
    evening: { text: '辛苦了，收工前确认今天的出入库都已登记' },
  },
};

/** 按角色编码取岗位组（多角色按优先级取第一个命中的组） */
export function tipGroupOf(roles: readonly string[]): TipGroup {
  const groups = new Set(roles.map((r) => ROLE_GROUP[r]).filter(Boolean));
  return GROUP_PRIORITY.find((g) => groups.has(g)) ?? 'generic';
}

/** 取当前时段的提示；data 为 null（无看板权限 / 数据未到）时用无数字文案 */
export function welcomeTip(roles: readonly string[], tone: TipTone, data: TipData | null): string {
  if (tone === 'night') return '夜深了，注意休息';
  const tip = TIPS[tipGroupOf(roles)][tone];
  return (data && tip.withData?.(data)) || tip.text;
}
