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
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OrderService } from './order.service';
import { OrderLedgerService } from './order-ledger.service';
import { PdfService } from '../../common/services/pdf.service';
import { CreateOrderDto, QueryOrderDto, UpdateOrderDto } from './dto/order.dto';
import { QueryLedgerDetailDto, QueryLedgerDto } from './dto/ledger.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 读权限口径（§二）：列表/详情用菜单权限点 `order`，台账用 `ledger`。
 * 只勾这两个菜单、不勾 order:* 按钮，即为「只读订单/台账」角色。
 */
@Controller('order')
export class OrderController {
  constructor(
    private readonly service: OrderService,
    private readonly ledgerService: OrderLedgerService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @RequirePermissions('order')
  async list(@Query() query: QueryOrderDto) {
    return this.service.findList(query);
  }

  /**
   * 订单跟踪台账（系统核心页面，§5.1）：按部件组一行，四数实时聚合。
   * **必须注册在 `:id` 之前**，否则 /order/ledger 会被参数路由吞掉（ParseIntPipe 直接 400）。
   */
  @Get('ledger')
  @RequirePermissions('ledger')
  async ledger(@Query() query: QueryLedgerDto) {
    return this.ledgerService.findLedger(query);
  }

  /**
   * 台账行内展开：某产品行的出入库/外发/装配三条流水（§5.1）。
   * 同样**必须在 `:id` 之前**注册。只读查询，不标 @OperationLog。
   */
  @Get('ledger/detail')
  @RequirePermissions('ledger')
  async ledgerDetail(@Query() query: QueryLedgerDetailDto) {
    return this.ledgerService.findRowDetail(query.orderProductId);
  }

  /**
   * 台账 Excel 导出（§5.1）：按当前筛选全量导出，列序对齐台账页。
   * 同样**必须在 `:id` 之前**注册；文件流用 @SkipTransform 跳过统一包装。
   * 只读导出，按 §4.3 不标 @OperationLog。
   */
  @Get('ledger/export')
  @RequirePermissions('ledger:export')
  @SkipTransform()
  async ledgerExport(@Query() query: QueryLedgerDto, @Res() res: Response) {
    const buf = await this.ledgerService.exportExcel(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent('订单跟踪台账.xlsx')}"`,
    );
    res.send(buf);
  }

  /**
   * 导出总计划（订单列表页，对齐 hb-mes）：按当前筛选全量导出，一行 = 一个产品行。
   * 同样**必须在 `:id` 之前**注册，否则被参数路由吞掉（ParseIntPipe 直接 400）。
   * 四数复用台账口径（见 order-ledger.service）；只读导出，按 §4.3 不标 @OperationLog。
   */
  @Get('export/total-plan')
  @RequirePermissions('order:export')
  @SkipTransform()
  async exportTotalPlan(@Query() query: QueryOrderDto, @Res() res: Response) {
    const buf = await this.ledgerService.exportTotalPlan(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent('总计划.xlsx')}"`,
    );
    res.send(buf);
  }

  /**
   * 《生产任务单》PDF（服务端渲染打印页出 PDF，前端一键下载、无需打印对话框）。
   *
   * 实现上**不另拼一份 HTML 模板**：用无头浏览器打开前端那张打印页
   * （`/order/print?id=`）截成 PDF——版式与屏幕上看到的、以及 Ctrl+P 打出来的
   * 完全是同一份，避免两套模板必然发生的漂移。
   *
   * 路径放在 `:id` 之前？不需要——它是 `:id/xxx` 两段式，与单段的 `:id` 不冲突；
   * 但仍须在**任何** `:id/:sub` 通配之前，故置于 detail 上方保持醒目。
   */
  @Get(':id/task-order-pdf')
  @RequirePermissions('order:export')
  @SkipTransform()
  async exportTaskOrderPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const order = await this.service.findOne(id); // 不存在直接 404，省得白起浏览器
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const buf = await this.pdfService.renderPrintPage(this.printPageUrl(id), token);
    const filename = `生产任务单-${order.productionNo || order.orderNo}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="task-order.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  }

  /**
   * 打印页在**服务器内网**的地址。
   * 生产：Nginx 的 `/oms/admin/`（SPA base）；开发：Vite dev server 5174。
   * 由 PRINT_BASE_URL 配置，两端都走各自的代理拿 `/api`，无需另开白名单。
   */
  private printPageUrl(id: number): string {
    const base = (process.env.PRINT_BASE_URL || 'http://127.0.0.1:5174').replace(/\/+$/, '');
    return `${base}/order/print?id=${id}`;
  }

  @Get(':id')
  @RequirePermissions('order')
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
