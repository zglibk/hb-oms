import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 统一异常输出：{ code: <httpStatus>, message, data: null [, errors, failedCount, totalCount] }
 *
 * errors：业务侧抛 BadRequestException({ message, errors: string[] }) 时透传的
 * 逐条错误清单（批量导入/批量删除整批校验用），前端逐行展示。
 *
 * failedCount / totalCount：批量导入用，让前端能显示「N 条有问题（共 M 条）」。
 * **不透传就会在前端变成 undefined**（本会话已踩：excel.util 的 importRejected 带了这
 * 两个字段，但过滤器只挑 errors，前端拿不到计数）。新增此类字段务必在这里一并放行。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let errors: string[] | undefined;
    let failedCount: number | undefined;
    let totalCount: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const m = (res as any).message;
        message = Array.isArray(m) ? m[0] : m || exception.message;
        if (Array.isArray((res as any).errors)) errors = (res as any).errors;
        if (typeof (res as any).failedCount === 'number') failedCount = (res as any).failedCount;
        if (typeof (res as any).totalCount === 'number') totalCount = (res as any).totalCount;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      code: status,
      message,
      data: null,
      path: request.url,
      ...(errors ? { errors } : {}),
      ...(failedCount !== undefined ? { failedCount } : {}),
      ...(totalCount !== undefined ? { totalCount } : {}),
    });
  }
}
