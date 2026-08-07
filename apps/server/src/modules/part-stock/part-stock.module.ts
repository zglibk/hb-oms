import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartBalance } from './entities/part-balance.entity';
import { PartAdjust } from './entities/part-adjust.entity';
import { PartStockController } from './part-stock.controller';
import { PartStockService } from './part-stock.service';

/**
 * 部件台账（M5）：7 维属性锚定的**独立参考台账**。
 *
 * V1 只有「期初录入 + 手工调整」两个入口，**不与外发/成品单据联动**（设计文档 §2.1）——
 * 本项目不做报工，部件产出没有采集点，强行联动没有数据基础；联动列入 V2（§10）。
 * 导出 PartStockService 供 M5 期初模块复用同一条调整通道（保证期初也留痕）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PartBalance, PartAdjust])],
  controllers: [PartStockController],
  providers: [PartStockService],
  exports: [PartStockService],
})
export class PartStockModule {}
