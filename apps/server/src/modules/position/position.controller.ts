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
import { PositionService } from './position.service';
import {
  BatchDeletePositionDto,
  CreatePositionDto,
  ImportPositionDto,
  PositionOptionQueryDto,
  QueryPositionDto,
  UpdatePositionDto,
} from './dto/position.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** xlsx 文件流响应（与字典/部件导出同一套头，中文名走 filename* 兼容各浏览器） */
function sendXlsx(res: Response, buffer: Buffer, filename: string) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="position.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

/** 读权限口径（§2.1）：岗位管理页用菜单权限点 `basic:position` */
@Controller('position')
export class PositionController {
  constructor(private readonly service: PositionService) {}

  @Get()
  @RequirePermissions('basic:position')
  async list(@Query() query: QueryPositionDto) {
    return this.service.findList(query);
  }

  /**
   * 岗位下拉（人事档案建档用）。
   * **跨页引用型只读接口，刻意只要求登录**——建档的 HR 未必有基础数据菜单。
   * **必须注册在 `:id` 型路由之前**，否则 `all` 会被当成 id 走进 ParseIntPipe。
   */
  @Get('all')
  async all(@Query() query: PositionOptionQueryDto) {
    return this.service.findOptions(query);
  }

  /** 导出当前筛选结果；@SkipTransform 返回文件流，**必须注册在 `:id` 之前** */
  @Get('export')
  @SkipTransform()
  @RequirePermissions('position:export')
  @OperationLog('岗位管理', '导出岗位')
  async exportExcel(@Query() query: QueryPositionDto, @Res() res: Response) {
    const buffer = await this.service.exportExcel(query);
    sendXlsx(res, buffer, '岗位清单.xlsx');
  }

  /** 下载导入模板 */
  @Get('import-template')
  @SkipTransform()
  @RequirePermissions('position:import')
  async importTemplate(@Res() res: Response) {
    const buffer = await this.service.buildImportTemplate();
    sendXlsx(res, buffer, '岗位导入模板.xlsx');
  }

  @Get(':id')
  @RequirePermissions('basic:position')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('position:create')
  @OperationLog('岗位管理', '新增岗位')
  async create(@Body() dto: CreatePositionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('position:update')
  @OperationLog('岗位管理', '编辑岗位')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePositionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  /** 批量导入；整批校验通过才落库，失败时 errors 数组逐行回传 */
  @Post('import')
  @RequirePermissions('position:import')
  @OperationLog('岗位管理', '批量导入岗位')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportPositionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file?.buffer) throw new BadRequestException('请选择要导入的 Excel 文件');
    return this.service.importFromExcel(file.buffer, body.overwrite === true, user);
  }

  /** 批量删除。用 POST 而非 DELETE：需要请求体传 ids，部分网关会丢 DELETE 的 body */
  @Post('batch-delete')
  @RequirePermissions('position:delete')
  @OperationLog('岗位管理', '批量删除岗位')
  async removeBatch(@Body() dto: BatchDeletePositionDto) {
    return this.service.removeBatch(dto.ids);
  }

  @Delete(':id')
  @RequirePermissions('position:delete')
  @OperationLog('岗位管理', '删除岗位')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
