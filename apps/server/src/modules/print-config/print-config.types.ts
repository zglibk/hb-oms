export type PrintDocumentType = 'delivery_note' | 'inbound_note';
export type PrintMode = 'blank' | 'preprinted';
export type PrintPaginationStrategy = 'auto' | 'fixed';

export interface PrintLayoutField {
  id: string;
  type: 'field' | 'staticText';
  field?: string;
  text?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
}

export interface PrintLayoutTableColumn {
  field: string;
  label: string;
  widthPct: number;
  align: 'left' | 'center' | 'right';
}

export interface PrintLayoutTable {
  id: string;
  type: 'table';
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rowHeightMm: number;
  showHeader: boolean;
  columns: PrintLayoutTableColumn[];
}

export interface PrintProfileConfig {
  schemaVersion: 1;
  mode: PrintMode;
  paper: {
    widthMm: number;
    heightMm: number;
    bodyWidthMm?: number;
    bodyHeightMm?: number;
    driverFormName: string;
  };
  margins: { top: number; right: number; bottom: number; left: number };
  offset: { x: number; y: number };
  style: { fontScale: number; borderWidthPt: number };
  pagination: { strategy: PrintPaginationStrategy; rowsPerPage: number };
  backgroundImageUrl?: string;
  layout?: { snapMm: number; elements: Array<PrintLayoutField | PrintLayoutTable> };
}

export const PRINT_DOCUMENT_TYPES: PrintDocumentType[] = ['delivery_note', 'inbound_note'];
