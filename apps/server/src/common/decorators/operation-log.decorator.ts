import { SetMetadata } from '@nestjs/common';

export interface OperationLogMeta {
  module: string;
  action: string;
}

/** 声明该接口需记录操作日志，如 @OperationLog('订单', '新增订单') */
export const OPERATION_LOG_KEY = 'operationLog';
export const OperationLog = (module: string, action: string) =>
  SetMetadata(OPERATION_LOG_KEY, { module, action } as OperationLogMeta);
