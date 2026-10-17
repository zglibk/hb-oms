import { SetMetadata } from '@nestjs/common';

export interface OperationLogMeta {
  module: string;
  action: string;
  /** 仅影响日志参数，业务接口仍接收原始请求体。 */
  redactBodyFields?: string[];
}

/** 声明该接口需记录操作日志，如 @OperationLog('订单', '新增订单') */
export const OPERATION_LOG_KEY = 'operationLog';
export const OperationLog = (
  module: string,
  action: string,
  options: Pick<OperationLogMeta, 'redactBodyFields'> = {},
) => SetMetadata(OPERATION_LOG_KEY, { module, action, ...options } as OperationLogMeta);
