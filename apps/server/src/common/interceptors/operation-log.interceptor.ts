import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap, catchError, throwError } from 'rxjs';
import {
  OPERATION_LOG_KEY,
  OperationLogMeta,
} from '../decorators/operation-log.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { OperationLogWriterService } from '../services/operation-log-writer.service';
import { auditDisplayName } from '../utils/audit.util';
import {
  buildLogDescription,
  extractBizFromRequest,
  extractClientIp,
  serializeLogParams,
} from '../utils/operation-log.util';

/**
 * 操作日志拦截器（文档 18 验收项、7.6 权限审计）。
 * 标注了 @OperationLog 的接口在执行后自动写入 t_operation_log。
 * 成功/失败均记录，失败不影响主流程（写日志异常被吞掉）。
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly logWriter: OperationLogWriterService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<OperationLogMeta>(
      OPERATION_LOG_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user as CurrentUserPayload | undefined;
    const { bizType, bizId } = extractBizFromRequest(request);
    const base = {
      userId: user?.id ?? null,
      userName: auditDisplayName(user) || null,
      module: meta.module,
      action: meta.action,
      description: buildLogDescription(meta.action, bizId),
      method: request.method,
      url: request.originalUrl,
      ip: extractClientIp(request),
      params: serializeLogParams(request),
      bizType,
      bizId,
    };

    return next.handle().pipe(
      tap(() => this.logWriter.write({ ...base, result: 1 })),
      catchError((err) => {
        this.logWriter.write({ ...base, result: 0 });
        return throwError(() => err);
      }),
    );
  }
}
