import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { ProductionBomService } from './production-bom.service';
import { QueryProductionBomDto, SaveProductionBomDto } from './dto/production-bom.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { sendXlsx } from '../../common/utils/excel-response.util';

@Controller('production-bom')
export class ProductionBomController {
  constructor(private readonly service: ProductionBomService) {}

  @Get()
  @RequirePermissions('production-bom')
  list(@Query() query: QueryProductionBomDto) {
    return this.service.findList(query);
  }

  /** BOM 表单专用的开单信息远程选项，不要求额外拥有“开单信息”菜单。 */
  @Get('process-options')
  @RequirePermissions('production-bom')
  processOptions(@Query('keyword') keyword?: string) {
    return this.service.processOptions(keyword);
  }

  /** BOM 表单专用的部件远程选项，不要求额外拥有“部件信息”菜单。 */
  @Get('material-options')
  @RequirePermissions('production-bom')
  materialOptions(@Query('keyword') keyword?: string) {
    return this.service.materialOptions(keyword);
  }

  @Get('import-template')
  @RequirePermissions('production-bom:import')
  @SkipTransform()
  async importTemplate(@Res() res: Response) {
    sendXlsx(res, await this.service.buildImportTemplate(), '生产BOM导入模板.xlsx');
  }

  @Post('import')
  @RequirePermissions('production-bom:import')
  @OperationLog('生产BOM', '批量导入生产BOM')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Query('overwrite') overwrite: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    if (!(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('仅支持 .xlsx 格式文件');
    }
    return this.service.importFromExcel(file.buffer, overwrite === '1', user);
  }

  @Get('export')
  @RequirePermissions('production-bom:export')
  @OperationLog('生产BOM', '批量导出生产BOM')
  @SkipTransform()
  async exportExcel(@Query() query: QueryProductionBomDto, @Res() res: Response) {
    const buffer = await this.service.exportExcel(query);
    const date = new Date().toISOString().slice(0, 10);
    sendXlsx(res, buffer, `生产BOM_${date}.xlsx`);
  }

  @Get(':id/export')
  @RequirePermissions('production-bom:export')
  @OperationLog('生产BOM', '导出单份生产BOM')
  @SkipTransform()
  async exportSingle(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const result = await this.service.exportSingleExcel(id);
    sendXlsx(res, result.buffer, result.fileName);
  }

  @Get(':id')
  @RequirePermissions('production-bom')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('production-bom:create')
  @OperationLog('生产BOM', '新增生产BOM')
  create(@Body() dto: SaveProductionBomDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('production-bom:update')
  @OperationLog('生产BOM', '编辑生产BOM')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveProductionBomDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('production-bom:delete')
  @OperationLog('生产BOM', '删除生产BOM')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
