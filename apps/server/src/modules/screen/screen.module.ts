import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { ScreenController } from './screen.controller';
import { ScreenService } from './screen.service';

/**
 * 数据可视化大屏（只读）。
 * 纯读模块：卡片与列表复用 DashboardService，单据族口径复用 order-owed.util，不注册实体。
 */
@Module({
  imports: [DashboardModule, SystemConfigModule],
  controllers: [ScreenController],
  providers: [ScreenService],
})
export class ScreenModule {}
