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
import { DullStockService } from './dull-stock.service';
import {
  CreateDullStockDto,
  CreateDullStockFlowDto,
  QueryDullStockDto,
  QueryDullStockFlowDto,
  UpdateDullStockDto,
} from './dto/dull-stock.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 读权限口径（§2.1）：全部只读接口用菜单权限点 `dull-stock`，
 * 写操作另需 `dull-stock:create` / `:update` / `:delete` / `:stock`。
 */
@Controller('dull-stock')
export class DullStockController {
  constructor(private readonly service: DullStockService) {}

  @Get()
  @RequirePermissions('dull-stock')
  async list(@Query() query: QueryDullStockDto) {
    return this.service.findList(query);
  }

  /** 当前筛选下的行数与结存合计（各行单位不同，合计一律折成支） */
  @Get('summary')
  @RequirePermissions('dull-stock')
  async summary(@Query() query: QueryDullStockDto) {
    return this.service.findSummary(query);
  }

  /** 出入库流水（按档案行下钻），逐行附推导出的「变动后结存」 */
  @Get('flow')
  @RequirePermissions('dull-stock')
  async flowList(@Query() query: QueryDullStockFlowDto) {
    return this.service.findFlowList(query);
  }

  @Post()
  @RequirePermissions('dull-stock:create')
  @OperationLog('呆滞品管理', '新增呆滞品')
  async create(@Body() dto: CreateDullStockDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  /**
   * 删除录错的出入库流水，同事务回滚累计数。
   * **必须注册在 `:id` 型路由之前**，否则 `flow` 会被当成 id 走进 ParseIntPipe。
   */
  @Delete('flow/:flowId')
  @RequirePermissions('dull-stock:stock')
  @OperationLog('呆滞品管理', '删除出入库流水')
  async removeFlow(
    @Param('flowId', ParseIntPipe) flowId: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeFlow(flowId, user);
  }

  @Get(':id')
  @RequirePermissions('dull-stock')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('dull-stock:update')
  @OperationLog('呆滞品管理', '编辑呆滞品')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDullStockDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('dull-stock:delete')
  @OperationLog('呆滞品管理', '删除呆滞品')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  /** 登记一笔出入库 —— 入库数/出库数的唯一写入口 */
  @Post(':id/flow')
  @RequirePermissions('dull-stock:stock')
  @OperationLog('呆滞品管理', '登记出入库')
  async createFlow(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDullStockFlowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createFlow(id, dto, user);
  }
}
