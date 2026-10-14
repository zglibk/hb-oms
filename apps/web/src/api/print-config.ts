import request from '@/utils/request';

export type PrintDocumentType = 'delivery_note' | 'inbound_note';
export type PrintMode = 'blank' | 'preprinted';

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
    /** Windows 驱动进纸尺寸（连续纸包含左右打孔边）。 */
    widthMm: number;
    heightMm: number;
    /** 撕除打孔边后的成品纸面；旧配置缺省时按进纸尺寸回落。 */
    bodyWidthMm?: number;
    bodyHeightMm?: number;
    driverFormName: string;
  };
  margins: { top: number; right: number; bottom: number; left: number };
  offset: { x: number; y: number };
  style: { fontScale: number; borderWidthPt: number };
  pagination: { strategy: 'auto' | 'fixed'; rowsPerPage: number };
  backgroundImageUrl?: string;
  layout?: { snapMm: number; elements: Array<PrintLayoutField | PrintLayoutTable> };
}

export interface PrintProfileSummary {
  id: number;
  name: string;
  documentType: PrintDocumentType;
  status: number;
  isBuiltin: number;
  publishedVersionId: number | null;
  publishedVersionNo: number | null;
  updatedAt: string;
}

export interface PrintProfileDetail extends PrintProfileSummary {
  draftConfig: PrintProfileConfig;
  publishedConfig: PrintProfileConfig | null;
  creatorName: string | null;
  updaterName: string | null;
}

export interface RuntimePrintProfile {
  profileId: number;
  profileName: string;
  documentType: PrintDocumentType;
  version: number;
  config: PrintProfileConfig;
  defaultProfileId: number | null;
  options: Array<{ id: number; name: string; isBuiltin: number; version: number }>;
}

export const getPrintProfiles = (documentType?: PrintDocumentType) =>
  request.get<any, PrintProfileSummary[]>('/api/system/print-config/profiles', { params: { documentType } });
export const getPrintProfile = (id: number) =>
  request.get<any, PrintProfileDetail>(`/api/system/print-config/profiles/${id}`);
export const createPrintProfile = (data: { name: string; documentType: PrintDocumentType; config: PrintProfileConfig }) =>
  request.post('/api/system/print-config/profiles', data);
export const updatePrintProfile = (id: number, data: { name?: string; status?: number; config?: PrintProfileConfig }) =>
  request.put(`/api/system/print-config/profiles/${id}`, data);
export const deletePrintProfile = (id: number) => request.delete(`/api/system/print-config/profiles/${id}`);
export const publishPrintProfile = (id: number) => request.post(`/api/system/print-config/profiles/${id}/publish`);
export const getPrintProfileVersions = (id: number) => request.get<any, any[]>(`/api/system/print-config/profiles/${id}/versions`);
export const rollbackPrintProfile = (id: number, version: number) => request.post(`/api/system/print-config/profiles/${id}/rollback/${version}`);
export const getPrintDefaults = () => request.get<any, Array<{ documentType: PrintDocumentType; defaultProfileId: number }>>('/api/system/print-config/defaults');
export const setPrintDefault = (documentType: PrintDocumentType, profileId: number) =>
  request.put('/api/system/print-config/defaults', { documentType, profileId });
export const getRuntimePrintProfile = (documentType: PrintDocumentType, profileId?: number, version?: number) =>
  request.get<any, RuntimePrintProfile>('/api/system/print-config/runtime', { params: { documentType, profileId, version } });

export function defaultPrintConfig(documentType: PrintDocumentType): PrintProfileConfig {
  return {
    schemaVersion: 1,
    mode: 'blank',
    paper: {
      widthMm: 241.3,
      heightMm: 140,
      bodyWidthMm: 218,
      bodyHeightMm: 140,
      driverFormName: 'OMS 9.5x5.5',
    },
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
    offset: { x: 0, y: 0 },
    style: { fontScale: 100, borderWidthPt: 0.75 },
    pagination: { strategy: 'auto', rowsPerPage: documentType === 'delivery_note' ? 6 : 7 },
    layout: { snapMm: 0.5, elements: [] },
  };
}
