import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderProduct } from './entities/order-product.entity';
import { OrderPartGroup } from './entities/order-part-group.entity';
import { OrderPart } from './entities/order-part.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderLedgerService } from './order-ledger.service';
import { ProductSummaryController } from './product-summary.controller';
import { ProductSummaryService } from './product-summary.service';
// 台账/总计划/产品汇总导出要按「颜色字段启用开关」决定是否输出颜色列
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderProduct, OrderPartGroup, OrderPart]),
    SystemConfigModule,
  ],
  controllers: [OrderController, ProductSummaryController],
  providers: [OrderService, OrderLedgerService, ProductSummaryService],
  exports: [OrderService, OrderLedgerService],
})
export class OrderModule {}
