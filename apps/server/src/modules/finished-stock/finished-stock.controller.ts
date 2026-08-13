import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FinishedStockService } from './finished-stock.service';
import {
  CreateFinishedDocDto,
  QueryBalanceDto,
  QueryFinishedDocDto,
  QueryStockGroupOptionDto,
  ReverseFinishedDocDto,
  UpdateFinishedDocDto,
} from './dto/finished-stock.dto';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { sendXlsx } from '../../common/utils/excel-response.util';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 读权限口径（§二）：单据列表/详情用菜单权限点 `finished-stock`，
 * 结存查询是独立菜单故用 `stock-balance`（两个页面可分开授权）。
 */
@Controller('finished-stock')
export class FinishedStockController {
  constructor(private readonly service: FinishedStockService) {}

  @Get()
  @RequirePermissions('finished-stock')
  async list(@Query() query: QueryFinishedDocDto) {
    return this.service.findList(query);
  }

  /** 成品库存（结存查询）；注册在 :id 之前，避免被参数路由拦截 */
  @Get('balance')
  @RequirePermissions('stock-balance')
  async balance(@Query() query: QueryBalanceDto) {
    return this.service.findBalance(query);
  }

  /**
   * 导出当前筛选的成品库存；@SkipTransform 返回文件流。
   * 与下面两个 balance/* 路由一样，**必须注册在 `:id` 之前**。
   */
  @Get('balance/export')
  @SkipTransform()
  @RequirePermissions('stock-balance:export')
  @OperationLog('成品库存', '导出成品库存')
  async balanceExport(@Query() query: QueryBalanceDto, @Res() res: Response) {
    const buffer = await this.service.exportBalance(query);
    sendXlsx(res, buffer, '成品库存.xlsx');
  }

  /** 下载导入模板（预填可录期初的产品行，只留「期初数量」待填） */
  @Get('balance/import-template')
  @SkipTransform()
  @RequirePermissions('stock-balance:import')
  async balanceImportTemplate(@Res() res: Response) {
    const buffer = await this.service.buildBalanceImportTemplate();
    sendXlsx(res, buffer, '成品库存导入模板.xlsx');
  }

  /**
   * 批量导入成品库存：汇成一张 FGO 期初单并立即生效，**由单据驱动余额**
   * （§5.6：确认是唯一驱动余额的入口，任何地方都不得直接改 t_finished_balance）。
   * 整批全有全无，失败时 errors 逐行回传。
   */
  @Post('balance/import')
  @RequirePermissions('stock-balance:import')
  @OperationLog('成品库存', '批量导入成品库存')
  @UseInterceptors(FileInterceptor('file'))
  async balanceImport(
    @UploadedFile() file: Express.Multer.File,
    @Body('docDate') docDate: string,
    @Body('remark') remark: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file?.buffer) throw new BadRequestException('请选择要导入的 Excel 文件');
    return this.service.importBalanceFromExcel(file.buffer, { docDate, remark }, user);
  }

  /**
   * 可出入库的**订单产品行**选项（附可入库量与当前结存）。
   * 路径沿用 group-options：前端已在用，改路径要动前端与权限说明，收益为零。
   * 跨页引用：成品出入库表单与期初录入页共用，故任一菜单即可（OR）。
   */
  @Get('group-options')
  @RequireAnyPermissions('finished-stock', 'opening')
  async groupOptions(@Query() query: QueryStockGroupOptionDto) {
    return this.service.findGroupOptions(query);
  }

  @Get(':id')
  @RequirePermissions('finished-stock')
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
