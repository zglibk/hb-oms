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
import { ProcessInfoService } from './process-info.service';
import {
  BatchDeleteProcessInfoDto,
  CreateProcessInfoDto,
  QueryProcessInfoDto,
  UpdateProcessInfoDto,
} from './dto/process-info.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§二）：开单信息页用菜单权限点 `basic:process-info` */
@Controller('process-info')
export class ProcessInfoController {
  constructor(private readonly service: ProcessInfoService) {}

  @Get()
  @RequirePermissions('basic:process-info')
  async list(@Query() query: QueryProcessInfoDto) {
    return this.service.findList(query);
  }

  /**
   * 按生产图号匹配（订单表单自动带入；未命中返回 null）。
   * **跨页引用型只读接口，刻意只要求登录**：录订单的人未必有开单信息菜单，
   * 挂 basic:process-info 会让订单表单的图号带入直接 403。
   */
  @Get('by-drawing')
  async byDrawing(@Query('drawingNo') drawingNo: string) {
    return this.service.findByDrawingNo(drawingNo);
  }

  /** 导出（手工工艺表格式：一图号三行+合并单元格；按当前筛选全量导出） */
  @Get('export')
  @RequirePermissions('process-info:export')
  @SkipTransform()
  async exportExcel(@Query() query: QueryProcessInfoDto, @Res() res: Response) {
    const buf = await this.service.exportExcel(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent('开单信息.xlsx')}"`,
    );
    res.send(buf);
  }

  /** 下载导入模板（注意：必须注册在 @Get(':id') 之前，否则被参数路由拦截） */
  @Get('import-template')
  @RequirePermissions('process-info:import')
  @SkipTransform()
  async importTemplate(@Res() res: Response) {
    const buf = await this.service.buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent('开单信息导入模板.xlsx')}"`,
    );
    res.send(buf);
  }

  /** 修改履历（新增/修改/导入更新，产品级+部件级明细，时间倒序；读权限同页面） */
  @Get(':id/history')
  @RequirePermissions('basic:process-info')
  async history(@Param('id', ParseIntPipe) id: number) {
    return this.service.findHistory(id);
  }

  @Get(':id')
  @RequirePermissions('basic:process-info')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('process-info:create')
  @OperationLog('开单信息', '新增开单信息')
  async create(@Body() dto: CreateProcessInfoDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  /** Excel 批量导入（整批校验、逐行错误；overwrite=1 按生产图号覆盖更新） */
  @Post('import')
  @RequirePermissions('process-info:import')
  @OperationLog('开单信息', '批量导入开单信息')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Query('overwrite') overwrite: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      throw new BadRequestException('仅支持 .xlsx 格式文件');
    }
    return this.service.importFromExcel(file.buffer, overwrite === '1', user);
  }

  /** 批量删除（整批校验：任一图号被订单部件组引用则整批拒绝；权限复用单删） */
  @Post('batch-delete')
  @RequirePermissions('process-info:delete')
  @OperationLog('开单信息', '批量删除开单信息')
  async batchRemove(@Body() dto: BatchDeleteProcessInfoDto) {
    return this.service.batchRemove(dto.ids);
  }

  @Put(':id')
  @RequirePermissions('process-info:update')
  @OperationLog('开单信息', '编辑开单信息')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProcessInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('process-info:delete')
  @OperationLog('开单信息', '删除开单信息')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
