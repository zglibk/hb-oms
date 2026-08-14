import request from '@/utils/request';

export interface CustomerItem {
  id: number;
  customerCode: string;
  customerName: string;
  contactPerson: string | null;
  contactPhone: string | null;
  salesman: string | null;
  merchandiser: string | null;
  deliveryAddress: string | null;
  /** 送货单模板编码（版式见 constants/delivery-note.ts）；空 = 用系统配置的全局默认 */
  deliveryTemplate: string | null;
  status: number;
  remark: string | null;
  updaterName?: string | null;
  updatedAt?: string;
}

export interface CustomerQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const getCustomerList = (params: CustomerQuery) =>
  request.get<any, PageResult<CustomerItem>>('/api/customer', { params });

export const getAllCustomers = () =>
  request.get<any, CustomerItem[]>('/api/customer/all');

export const createCustomer = (data: Partial<CustomerItem>) =>
  request.post('/api/customer', data);

export const updateCustomer = (id: number, data: Partial<CustomerItem>) =>
  request.put(`/api/customer/${id}`, data);

export const deleteCustomer = (id: number) =>
  request.delete(`/api/customer/${id}`);

/** 批量删除：整批校验，任一被订单引用则整批拒绝（返回 errors 逐条原因） */
export const batchDeleteCustomers = (ids: number[]) =>
  request.post<any, { deleted: number; skipped: number }>('/api/customer/batch-delete', { ids });

/** 导入模板下载地址（走 axios blob 下载） */
export const downloadCustomerTemplate = () =>
  request.get<any, Blob>('/api/customer/import-template', { responseType: 'blob' });

/** Excel 批量导入；overwrite=true 按客户代码覆盖更新 */
export const importCustomers = (file: File, overwrite: boolean) => {
  const fd = new FormData();
  fd.append('file', file);
  return request.post<any, { created: number; updated: number; total: number }>(
    `/api/customer/import?overwrite=${overwrite ? 1 : 0}`,
    fd,
  );
};
