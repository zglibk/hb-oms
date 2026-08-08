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
} from '@nestjs/common';
import { OutsourceService } from './outsource.service';
import {
  CloseOutsourceDto,
  CreateOutsourceDto,
  CreateOutsourceReturnDto,
  QueryOutsourceDto,
  QueryPartGroupOptionDto,
  SendOutsourceDto,
  UpdateOutsourceDto,
  UpdateOutsourceItemDto,
} from './dto/outsource.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§二）：全部只读接口用菜单权限点 `outsource`，打印另需 outsource:print */
@Controller('outsource')
export class OutsourceController {
  constructor(private readonly service: OutsourceService) {}

  @Get()
  @RequirePermissions('outsource')
  async list(@Query() query: QueryOutsourceDto) {
    return this.service.findList(query);
  }

  /** 可发外部件组选项（表单选择器）；注册在 :id 之前，避免被参数路由拦截 */
  @Get('part-group-options')
  @RequirePermissions('outsource')
  async partGroupOptions(@Query() query: QueryPartGroupOptionDto) {
    return this.service.findPartGroupOptions(query);
  }

  @Get('print/:id')
  @RequirePermissions('outsource:print')
  async print(@Param('id', ParseIntPipe) id: number) {
    return this.service.findPrintData(id);
  }

  @Get(':id')
  @RequirePermissions('outsource')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('outsource:create')
  @OperationLog('外发管理', '新增发坯单')
  async create(@Body() dto: CreateOutsourceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('outsource:update')
  @OperationLog('外发管理', '编辑发坯单')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOutsourceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/send')
  @RequirePermissions('outsource:send')
  @OperationLog('外发管理', '登记发出')
  async send(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendOutsourceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.send(id, dto, user);
  }

  @Post(':id/close')
  @RequirePermissions('outsource:close')
  @OperationLog('外发管理', '关闭发坯单')
  async close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseOutsourceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.close(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('outsource:cancel')
  @OperationLog('外发管理', '作废发坯单')
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.cancel(id, user);
  }

  /** 发出明细数量修正（已发出后磅秤复核纠错；改完自动重算回齐状态） */
  @Put('item/:itemId')
  @RequirePermissions('outsource:update')
  @OperationLog('外发管理', '修正发出数量')
  async updateItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateOutsourceItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateItem(itemId, dto, user);
  }

  @Post('item/:itemId/return')
  @RequirePermissions('outsource:return')
  @OperationLog('外发管理', '回货登记')
  async createReturn(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: CreateOutsourceReturnDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createReturn(itemId, dto, user);
  }

  @Delete('return/:id')
  @RequirePermissions('outsource:return-cancel')
  @OperationLog('外发管理', '撤销回货登记')
  async removeReturn(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeReturn(id, user);
  }
}
