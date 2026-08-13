import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinishedDoc } from './entities/finished-doc.entity';
import { FinishedItem } from './entities/finished-item.entity';
import { FinishedBalance } from './entities/finished-balance.entity';
import { FinishedStockController } from './finished-stock.controller';
import { FinishedStockService } from './finished-stock.service';
import { SystemConfigModule } from '../system-config/system-config.module';

/**
 * 成品出入库（M4）：单据头 + 明细 + 余额三表，确认驱动余额、更正走红字冲销。
 * 入库闸门口径不在本模块实现——直接复用 assembly/assembly-quota.util.ts，
 * 保证与装配模块同一份算式（CLAUDE.md §5.6）。
 *
 * 引入 SystemConfigModule 只为导出侧读「颜色」字段开关（§5.7）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FinishedDoc, FinishedItem, FinishedBalance]),
    SystemConfigModule,
  ],
  controllers: [FinishedStockController],
  providers: [FinishedStockService],
  exports: [FinishedStockService],
})
export class FinishedStockModule {}
