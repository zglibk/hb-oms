import request from '@/utils/request';
import type { PageResult } from './customer';

/** 设备信息（设备适产记录：机台适合生产的产品/部件及用料） */
export interface EquipmentInfoItem {
  id: number;
  machineNo: string;
  productModel: string | null;
  partType: string | null;
  mechanic: string | null;
  materialSpec: string | null;
  drawingNo: string | null;
  commonThickness: string | null;
  remark: string | null;
  creatorName?: string | null;
  updaterName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EquipmentInfoQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  partType?: string;
}

export const getEquipmentInfoList = (params: EquipmentInfoQuery) =>
  request.get<any, PageResult<EquipmentInfoItem>>('/api/equipment-info', { params });

export const createEquipmentInfo = (data: Partial<EquipmentInfoItem>) =>
  request.post('/api/equipment-info', data);

export const updateEquipmentInfo = (id: number, data: Partial<EquipmentInfoItem>) =>
  request.put(`/api/equipment-info/${id}`, data);

export const deleteEquipmentInfo = (id: number) =>
  request.delete(`/api/equipment-info/${id}`);
