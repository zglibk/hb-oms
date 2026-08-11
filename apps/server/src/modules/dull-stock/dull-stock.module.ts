import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DullStock } from './entities/dull-stock.entity';
import { DullStockFlow } from './entities/dull-stock-flow.entity';
import { DullStockController } from './dull-stock.controller';
import { DullStockService } from './dull-stock.service';

/**
 * 呆滞品管理（2026-08-11 由「成品期初（不挂订单）」拆分独立）。
 *
 * 已完结订单剩下的成品存量，逐批建档并持续跟踪
 * 「期初数 / 入库数 / 出库数 / 结存数」四个数。
 *
 * **独立台账**：与订单跟踪台账四数、成品库存 `t_finished_balance` 完全不联动，
 * 故不导出 service——没有别的模块需要往这本账里写数。
 */
@Module({
  imports: [TypeOrmModule.forFeature([DullStock, DullStockFlow])],
  controllers: [DullStockController],
  providers: [DullStockService],
})
export class DullStockModule {}
