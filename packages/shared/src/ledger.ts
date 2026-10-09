/** 台账支持的排序字段：前后端共用白名单，均在分页前排序。 */
export const LEDGER_SORT_FIELDS = [
  'orderDate',
  'deliveryDate',
  'customerName',
  'productionNo',
  'materialCode',
  'dimensionMm',
  'orderQty',
  'returnedQty',
  'assembledQty',
  'qtyPcs',
  'inQty',
  'productionOwed',
  'outQty',
  'deliveryOwed',
  'stockQty',
] as const;

export type LedgerSortField = typeof LEDGER_SORT_FIELDS[number];
export type LedgerSortOrder = 'asc' | 'desc';
