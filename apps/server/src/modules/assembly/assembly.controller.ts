import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { AssemblyService } from './assembly.service';
import {
  CreateAssemblyBatchDto,
  QueryAssemblyBatchDto,
  QueryAssemblyDto,
  QueryInboundQuotaDto,
  UpdateAssemblyBatchDto,
} from './dto/assembly.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('assembly')
export class AssemblyController {
  constructor(private readonly service: AssemblyService) {}

  /** 装配管理列表：按部件组一行，附装配进度聚合 */
  @Get()
  async list(@Query() query: QueryAssemblyDto) {
    return this.service.findList(query);
  }

  /** 某部件组的批次明细 + 分边别小计与可入库量；注册在 :id 型路由之前 */
  @Get('batch')
  async batches(@Query() query: QueryAssemblyBatchDto) {
    return this.service.findBatches(query);
  }

  /** 可入库量（§4.4 闸门口径），供 M4 成品入库表单前置展示 */
  @Get('inbound-quota')
  async inboundQuota(@Query() query: QueryInboundQuotaDto) {
    return this.service.findInboundQuota(query);
  }

  @Post('batch')
  @RequirePermissions('assembly:create')
  @OperationLog('装配管理', '新增装配批次')
  async create(@Body() dto: CreateAssemblyBatchDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createBatch(dto, user);
  }

  @Put('batch/:id')
  @RequirePermissions('assembly:update')
  @OperationLog('装配管理', '编辑装配批次')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssemblyBatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateBatch(id, dto, user);
  }

  @Delete('batch/:id')
  @RequirePermissions('assembly:delete')
  @OperationLog('装配管理', '删除装配批次')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeBatch(id, user);
  }
}
