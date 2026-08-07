import { Module } from '@nestjs/common';
import { OpeningController } from './opening.controller';
import { OpeningService } from './opening.service';
import { FinishedStockModule } from '../finished-stock/finished-stock.module';
import { PartStockModule } from '../part-stock/part-stock.module';

/**
 * 期初录入（M5）：上线初始化把手工账存量搬进系统，菜单常驻可反复补录。
 * 纯编排模块——不持有实体、不自己写库，成品走 FinishedStockService、
 * 部件走 PartStockService，避免两套写库逻辑造成口径分叉。
 */
@Module({
  imports: [FinishedStockModule, PartStockModule],
  controllers: [OpeningController],
  providers: [OpeningService],
})
export class OpeningModule {}
