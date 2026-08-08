import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PartStockService } from './part-stock.service';
import {
  AdjustPartStockDto,
  QueryPartAdjustDto,
  QueryPartStockDto,
} from './dto/part-stock.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§二）：全部只读接口用菜单权限点 `part-stock`，调整余量另需 part-stock:adjust */
@Controller('part-stock')
export class PartStockController {
  constructor(private readonly service: PartStockService) {}

  @Get()
  @RequirePermissions('part-stock')
  async list(@Query() query: QueryPartStockDto) {
    return this.service.findList(query);
  }

  /** 当前筛选条件下的余量合计（页面汇总用） */
  @Get('summary')
  @RequirePermissions('part-stock')
  async summary(@Query() query: QueryPartStockDto) {
    return this.service.findSummary(query);
  }

  /** 变动流水：按余量行下钻或按货号全局查 */
  @Get('adjust')
  @RequirePermissions('part-stock')
  async adjustList(@Query() query: QueryPartAdjustDto) {
    return this.service.findAdjustList(query);
  }

  /**
   * 手工调整 / 期初录入 —— **余量的唯一写入口**。
   * 没有「直接设置余量」的接口：§4.6 要求不直接改数无痕，一切变动带 delta + 原因走流水。
   */
  @Post('adjust')
  @RequirePermissions('part-stock:adjust')
  @OperationLog('部件台账', '调整余量')
  async adjust(@Body() dto: AdjustPartStockDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.adjust(dto, user);
  }
}
