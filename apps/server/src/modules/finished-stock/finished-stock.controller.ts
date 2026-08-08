import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { FinishedStockService } from './finished-stock.service';
import {
  CreateFinishedDocDto,
  QueryBalanceDto,
  QueryFinishedDocDto,
  QueryStockGroupOptionDto,
  ReverseFinishedDocDto,
  UpdateFinishedDocDto,
} from './dto/finished-stock.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('finished-stock')
export class FinishedStockController {
  constructor(private readonly service: FinishedStockService) {}

  @Get()
  async list(@Query() query: QueryFinishedDocDto) {
    return this.service.findList(query);
  }

  /** 成品库存（结存查询）；注册在 :id 之前，避免被参数路由拦截 */
  @Get('balance')
  async balance(@Query() query: QueryBalanceDto) {
    return this.service.findBalance(query);
  }

  /** 可出入库部件组选项（附可入库量与当前结存） */
  @Get('group-options')
  async groupOptions(@Query() query: QueryStockGroupOptionDto) {
    return this.service.findGroupOptions(query);
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('finished-stock:create')
  @OperationLog('成品出入库', '新增单据')
  async create(@Body() dto: CreateFinishedDocDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('finished-stock:update')
  @OperationLog('成品出入库', '编辑单据')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFinishedDocDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  /** 确认：入库校验装配闸门、出库校验结存，同事务驱动余额 */
  @Post(':id/confirm')
  @RequirePermissions('finished-stock:confirm')
  @OperationLog('成品出入库', '确认单据')
  async confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.confirm(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('finished-stock:cancel')
  @OperationLog('成品出入库', '作废单据')
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.cancel(id, user);
  }

  /** 红字冲销：生成方向相反的 FGR 单并自动确认，原单不变 */
  @Post(':id/reverse')
  @RequirePermissions('finished-stock:reverse')
  @OperationLog('成品出入库', '红字冲销')
  async reverse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReverseFinishedDocDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reverse(id, dto, user);
  }
}
