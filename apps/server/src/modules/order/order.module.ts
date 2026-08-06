import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderProduct } from './entities/order-product.entity';
import { OrderPartGroup } from './entities/order-part-group.entity';
import { OrderPart } from './entities/order-part.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderLedgerService } from './order-ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderProduct, OrderPartGroup, OrderPart])],
  controllers: [OrderController],
  providers: [OrderService, OrderLedgerService],
  exports: [OrderService, OrderLedgerService],
})
export class OrderModule {}
