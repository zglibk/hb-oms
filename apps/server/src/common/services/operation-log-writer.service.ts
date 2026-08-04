import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLog } from '../../modules/system/entities/operation-log.entity';

/**
 * 操作日志写入器（供拦截器、登录审计等复用）。
 * 异步写入，失败静默，不阻塞主流程。
 */
@Injectable()
export class OperationLogWriterService {
  constructor(
    @InjectRepository(OperationLog)
    private readonly logRepo: Repository<OperationLog>,
  ) {}

  write(data: Partial<OperationLog>) {
    this.logRepo
      .save(this.logRepo.create(data))
      .catch(() => undefined);
  }
}
