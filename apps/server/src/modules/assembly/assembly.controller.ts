import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AssemblyService } from './assembly.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { sendXlsx } from '../../common/utils/excel-response.util';
import {
  CreateAssemblyBatchDto,
  QueryAssemblyBatchDto,
  QueryAssemblyDto,
  QueryInboundQuotaDto,
  UpdateAssemblyBatchDto,
} from './dto/assembly.dto';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§二）：只读接口用菜单权限点 `assembly`；可入库量另放行成品出入库页 */
@Controller('assembly')
export class AssemblyController {
  constructor(private readonly service: AssemblyService) {}

  /** 装配管理列表：按**订单产品行**一行，附装配进度聚合 */
  @Get()
  @RequirePermissions('assembly')
  async list(@Query() query: QueryAssemblyDto) {
    return this.service.findList(query);
  }

  /**
   * 导出装配记录（汇总 + 批次明细两张表）；@SkipTransform 返回文件流。
   * 与列表同筛选条件，服务端对空结果与超限一律拒绝（不给空表、不静默截断）。
   */
  @Get('export')
  @SkipTransform()
  @RequirePermissions('assembly:export')
  @OperationLog('装配管理', '导出装配记录')
  async exportExcel(@Query() query: QueryAssemblyDto, @Res() res: Response) {
    const buffer = await this.service.exportExcel(query);
    sendXlsx(res, buffer, '装配记录.xlsx');
  }

  /** 某产品行的批次明细 + 分边别小计与可入库量；注册在 :id 型路由之前 */
  @Get('batch')
  @RequirePermissions('assembly')
  async batches(@Query() query: QueryAssemblyBatchDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findBatches(query, user);
  }

  /**
   * 可入库量（§4.4 闸门口径），供 M4 成品入库表单前置展示。
   * 跨页引用：装配页与成品出入库页都会看，故任一菜单即可（OR），
   * 否则仓管员开入库单时会因没有装配菜单而 403。
   */
  @Get('inbound-quota')
  @RequireAnyPermissions('assembly', 'finished-stock')
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
