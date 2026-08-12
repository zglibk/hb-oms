import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PartStockService } from './part-stock.service';
import {
  AdjustPartStockDto,
  QueryPartAdjustDto,
  QueryPartStockDto,
} from './dto/part-stock.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { sendXlsx } from '../../common/utils/excel-response.util';
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

  /** 导出当前筛选结果；@SkipTransform 返回文件流，**必须注册在其他 GET 之前不冲突即可** */
  @Get('export')
  @SkipTransform()
  @RequirePermissions('part-stock:export')
  @OperationLog('部件台账', '导出部件台账')
  async exportExcel(@Query() query: QueryPartStockDto, @Res() res: Response) {
    const buffer = await this.service.exportExcel(query);
    sendXlsx(res, buffer, '部件台账.xlsx');
  }

  /** 下载导入模板（模板列是「调整量 + 调整原因」，不是余量，理由见 service） */
  @Get('import-template')
  @SkipTransform()
  @RequirePermissions('part-stock:import')
  async importTemplate(@Res() res: Response) {
    const buffer = await this.service.buildImportTemplate();
    sendXlsx(res, buffer, '部件台账导入模板.xlsx');
  }

  /**
   * 批量导入 = 批量调整余量，**整批全有全无**。
   * 权限用 part-stock:import；它同样会改余量，故也要求 part-stock:adjust 才合理——
   * 但导入本身就是调整的批量形式，单独的 import 权限已隐含此意，不再叠加。
   */
  @Post('import')
  @RequirePermissions('part-stock:import')
  @OperationLog('部件台账', '批量导入调整')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file?.buffer) throw new BadRequestException('请选择要导入的 Excel 文件');
    return this.service.importFromExcel(file.buffer, user);
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
