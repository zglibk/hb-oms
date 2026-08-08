import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * 首页看板汇总（设计文档 §5.2）。
   *
   * 权限点 `stat:dashboard`：首页虽是静态路由、人人可达，但本接口聚合的是
   * 全厂订单/双欠数/库存，不该"登录即可见"。迁移已把该权限补授给全部存量
   * 角色（上线行为不变），需要时可按角色收回。
   * 前端在无此权限时**不发请求、不弹 403**，首页其余部分照常可用。
   *
   * 只读查询，按 §4.3 不标 `@OperationLog`。
   */
  @Get('summary')
  @RequirePermissions('stat:dashboard')
  async summary() {
    return this.service.summary();
  }
}
