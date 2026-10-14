import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreatePrintProfileDto, RuntimePrintProfileQueryDto, SetPrintDefaultDto, UpdatePrintProfileDto } from './dto/print-config.dto';
import { PrintConfigService } from './print-config.service';
import type { PrintDocumentType } from './print-config.types';

@Controller('system/print-config')
export class PrintConfigController {
  constructor(private readonly service: PrintConfigService) {}

  @Get('profiles')
  @RequirePermissions('system:print-template')
  list(@Query('documentType') documentType?: PrintDocumentType) { return this.service.list(documentType); }

  @Get('profiles/:id')
  @RequirePermissions('system:print-template')
  detail(@Param('id', ParseIntPipe) id: number) { return this.service.detail(id); }

  @Post('profiles')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '新增针式打印纸型')
  create(@Body() dto: CreatePrintProfileDto, @CurrentUser() user: CurrentUserPayload) { return this.service.create(dto, user); }

  @Put('profiles/:id')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '保存针式打印纸型草稿')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePrintProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete('profiles/:id')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '删除针式打印纸型')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }

  @Post('profiles/:id/publish')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '发布针式打印纸型')
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) { return this.service.publish(id, user); }

  @Get('profiles/:id/versions')
  @RequirePermissions('system:print-template')
  versions(@Param('id', ParseIntPipe) id: number) { return this.service.versions(id); }

  @Post('profiles/:id/rollback/:version')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '回退针式打印纸型')
  rollback(@Param('id', ParseIntPipe) id: number, @Param('version', ParseIntPipe) version: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rollback(id, version, user);
  }

  @Get('defaults')
  @RequirePermissions('system:print-template')
  defaults() { return this.service.defaults(); }

  @Put('defaults')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '设置单据默认纸型')
  setDefault(@Body() dto: SetPrintDefaultDto, @CurrentUser() user: CurrentUserPayload) { return this.service.setDefault(dto, user); }

  /** 打印页跨菜单引用：只要求成品出入库查看权限，不要求进入系统管理。 */
  @Get('runtime')
  @RequireAnyPermissions('finished-stock', 'system:print-template')
  runtime(@Query() query: RuntimePrintProfileQueryDto) { return this.service.runtime(query); }
}
