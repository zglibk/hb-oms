import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProductSummaryService } from './product-summary.service';
import { QueryPeriodSummaryDto, QueryProductSummaryDto } from './dto/product-summary.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { sendXlsx } from '../../common/utils/excel-response.util';

/**
 * 产品汇总查询（财务需求）：跨订单的「产品视角」汇总。
 * 页面读权限 = 菜单权限点 `product-summary`（§2.1）；全部只读查询，
 * 按 §4.3 不标 @OperationLog。独立路径、无 `:id` 参数路由，不存在吞路由问题。
 */
@Controller('product-summary')
export class ProductSummaryController {
  constructor(private readonly service: ProductSummaryService) {}

  /** Tab1 产品汇总（累计口径） */
  @Get()
  @RequirePermissions('product-summary')
  async summary(@Query() query: QueryProductSummaryDto) {
    return this.service.findSummary(query);
  }

  /** Tab1 导出（Sheet1 产品汇总 + Sheet2 订单明细） */
  @Get('export')
  @RequirePermissions('product-summary:export')
  @SkipTransform()
  async exportSummary(@Query() query: QueryProductSummaryDto, @Res() res: Response) {
    const buf = await this.service.exportSummary(query);
    sendXlsx(res, buf, '产品汇总.xlsx');
  }

  /** Tab2 出入库汇总（期间进销存） */
  @Get('period')
  @RequirePermissions('product-summary')
  async period(@Query() query: QueryPeriodSummaryDto) {
    return this.service.findPeriod(query);
  }

  /** Tab2 导出（Sheet1 出入库汇总 + Sheet2 出入库明细） */
  @Get('period/export')
  @RequirePermissions('product-summary:export')
  @SkipTransform()
  async exportPeriod(@Query() query: QueryPeriodSummaryDto, @Res() res: Response) {
    const buf = await this.service.exportPeriod(query);
    sendXlsx(res, buf, `出入库汇总_${query.from}_${query.to}.xlsx`);
  }
}
