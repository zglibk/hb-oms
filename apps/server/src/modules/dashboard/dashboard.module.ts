import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * 首页看板（设计文档 §5.2）。
 * 纯读模块：全部走原生 SQL 实时聚合，不注册实体、不落冗余列。
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  // 数据大屏（screen 模块）复用看板的卡片与列表口径
  exports: [DashboardService],
})
export class DashboardModule {}
