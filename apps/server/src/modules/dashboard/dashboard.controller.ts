import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * 首页看板汇总（设计文档 §5.2）。
   *
   * **不加 `@RequirePermissions`**：首页是所有登录用户的落地页（非权限菜单，
   * 路由在前端固定注册），挂权限点会让未获授权的用户看到一个报错的首页。
   * 全局 JwtAuthGuard 已保证必须登录，不存在匿名访问。
   *
   * 只读查询，按 §4.3 不标 `@OperationLog`。
   */
  @Get('summary')
  async summary() {
    return this.service.summary();
  }
}
