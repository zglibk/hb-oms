import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DatabaseOpsService } from './database-ops.service';

/** 供负载均衡/监控探测的数据库就绪端点；失败时统一返回 HTTP 503。 */
@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly databaseOps: DatabaseOpsService) {}

  @Public()
  @Get('ready')
  ready() {
    return this.databaseOps.readiness();
  }
}
