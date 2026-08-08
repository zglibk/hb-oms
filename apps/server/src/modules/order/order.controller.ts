import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderLedgerService } from './order-ledger.service';
import { CreateOrderDto, QueryOrderDto, UpdateOrderDto } from './dto/order.dto';
import { QueryLedgerDetailDto, QueryLedgerDto } from './dto/ledger.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('order')
export class OrderController {
  constructor(
    private readonly service: OrderService,
    private readonly ledgerService: OrderLedgerService,
  ) {}

  @Get()
  async list(@Query() query: QueryOrderDto) {
    return this.service.findList(query);
  }

  /**
   * 订单跟踪台账（系统核心页面，§5.1）：按部件组一行，四数实时聚合。
   * **必须注册在 `:id` 之前**，否则 /order/ledger 会被参数路由吞掉（ParseIntPipe 直接 400）。
   */
  @Get('ledger')
  async ledger(@Query() query: QueryLedgerDto) {
    return this.ledgerService.findLedger(query);
  }

  /**
   * 台账行内展开：某部件组的出入库/外发/装配三条流水（§5.1）。
   * 同样**必须在 `:id` 之前**注册。只读查询，不标 @OperationLog。
   */
  @Get('ledger/detail')
  async ledgerDetail(@Query() query: QueryLedgerDetailDto) {
    return this.ledgerService.findRowDetail(query.orderPartGroupId);
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('order:create')
  @OperationLog('订单管理', '新增订单')
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('order:update')
  @OperationLog('订单管理', '编辑订单')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/finish')
  @RequirePermissions('order:finish')
  @OperationLog('订单管理', '完结订单')
  async finish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.finish(id, user);
  }

  @Post(':id/reopen')
  @RequirePermissions('order:finish')
  @OperationLog('订单管理', '重开订单')
  async reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.reopen(id, user);
  }

  /** 删除（取代作废）：仅未被外发/装配/出入库引用的订单可删，连带删四级数据 */
  @Delete(':id')
  @RequirePermissions('order:delete')
  @OperationLog('订单管理', '删除订单')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
