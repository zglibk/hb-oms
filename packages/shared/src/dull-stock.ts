/** 呆滞品流水业务类型：方向由类型唯一决定，前后端不得各自维护映射。 */
export const DULL_STOCK_FLOW_TYPE = {
  CUSTOMER_RETURN: 'customer_return',
  PRODUCTION_ISSUE: 'production_issue',
  PRODUCTION_INBOUND: 'production_inbound',
  SHIPMENT: 'shipment',
} as const;

export type DullStockFlowType =
  (typeof DULL_STOCK_FLOW_TYPE)[keyof typeof DULL_STOCK_FLOW_TYPE];

export const DULL_STOCK_FLOW_TYPE_OPTIONS: Array<{
  value: DullStockFlowType;
  label: string;
  direction: 1 | -1;
}> = [
  { value: DULL_STOCK_FLOW_TYPE.CUSTOMER_RETURN, label: '客户退货', direction: 1 },
  { value: DULL_STOCK_FLOW_TYPE.PRODUCTION_ISSUE, label: '生产领料', direction: -1 },
  { value: DULL_STOCK_FLOW_TYPE.PRODUCTION_INBOUND, label: '生产入库', direction: 1 },
  { value: DULL_STOCK_FLOW_TYPE.SHIPMENT, label: '出货', direction: -1 },
];

export function dullStockFlowDirection(type: string): 1 | -1 | 0 {
  return DULL_STOCK_FLOW_TYPE_OPTIONS.find((item) => item.value === type)?.direction ?? 0;
}

export function dullStockFlowTypeLabel(type: string): string {
  return DULL_STOCK_FLOW_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}
