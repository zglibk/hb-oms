import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto, QueryOrderDto, UpdateOrderDto } from './dto/order.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('order')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Get()
  async list(@Query() query: QueryOrderDto) {
    return this.service.findList(query);
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

  @Post(':id/cancel')
  @RequirePermissions('order:cancel')
  @OperationLog('订单管理', '作废订单')
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.cancel(id, user);
  }
}
