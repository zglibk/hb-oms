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
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { FinishedStockService } from './finished-stock.service';
import { PdfService } from '../../common/services/pdf.service';
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
  constructor(
    private readonly service: FinishedStockService,
    // 送货单 PDF 走同一个单例浏览器（@Global 的 CommonModule 已 exports），
    // 内存纪律见 PdfService 头注释
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @RequirePermissions('finished-stock')
  async list(@Query() query: QueryFinishedDocDto) {
    return this.service.findList(query);
  }

  /**
   * 导出当前筛选的出入库记录（一行一条明细）；@SkipTransform 返回文件流。
   * **必须注册在 `:id` 之前**——否则 `export` 会被参数路由吃掉，ParseIntPipe 直接报错。
   */
  @Get('export')
  @SkipTransform()
  @RequirePermissions('finished-stock:export')
  @OperationLog('成品出入库', '导出出入库记录')
  async exportList(@Query() query: QueryFinishedDocDto, @Res() res: Response) {
    const buffer = await this.service.exportExcel(query);
    sendXlsx(res, buffer, '成品出入库记录.xlsx');
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

  /**
   * 送货单取数（打印页用）。读权限即页面菜单码（§2.1）——能看出库单就能看这张单的送货信息。
   * 两段路径不会被上面的 `:id` 拦截（`:id` 只匹配单段），无需调整注册顺序。
   */
  @Get(':id/delivery-note')
  @RequirePermissions('finished-stock')
  async deliveryNote(@Param('id', ParseIntPipe) id: number) {
    return this.service.buildDeliveryNote(id);
  }

  /**
   * 送货单 PDF：服务端用无头浏览器渲染**前端那张打印页**再回传文件，点一下直接下载。
   * 不另拼一份 HTML 模板——两套模板必然漂移（同生产任务单先例）。
   */
  @Get(':id/delivery-note-pdf')
  @SkipTransform()
  @RequirePermissions('finished-stock:print')
  @OperationLog('成品出入库', '导出送货单PDF')
  async deliveryNotePdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 先取一次数：单据不存在/不是销售出库/已作废时直接报错，省得白起浏览器
    const note = await this.service.buildDeliveryNote(id);
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const buf = await this.pdfService.renderPrintPage(this.printPageUrl(id), token);
    const filename = `送货单-${note.deliveryNo || note.docNo}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="delivery-note.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  }

  /**
   * 打印页在**服务器内网**的地址（同 order.controller 的 printPageUrl）。
   * 生产：Nginx 的 `/oms/admin/`（SPA base）；开发：Vite dev server 5174。
   */
  private printPageUrl(id: number): string {
    const base = (process.env.PRINT_BASE_URL || 'http://127.0.0.1:5174').replace(/\/+$/, '');
    return `${base}/finished-stock/delivery-note?id=${id}`;
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
