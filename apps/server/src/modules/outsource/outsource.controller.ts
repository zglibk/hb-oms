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
  CreateOutsourcePartDto,
  QueryOutsourcePartDto,
  QueryPartGroupOptionDto,
  QueryReturnProgressDto,
  UpdateOutsourcePartDto,
} from './dto/outsource.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 外发件回厂记录接口。
 *
 * 2026-08-10 起本模块只有一种记录（回厂流水），因此接口也只剩增删改查——
 * 原发坯单的 send / close / cancel / return / print 一并下线，
 * 对应权限点由迁移从库中清除。
 *
 * 读权限口径（§二）：只读接口用菜单权限点 `outsource`。
 */
@Controller('outsource')
export class OutsourceController {
  constructor(private readonly service: OutsourceService) {}

  @Get()
  @RequirePermissions('outsource')
  async list(@Query() query: QueryOutsourcePartDto) {
    return this.service.findList(query);
  }

  /** 可外发部件组选项（录入表单选择器）；注册在 :id 之前，避免被参数路由拦截 */
  @Get('part-group-options')
  @RequirePermissions('outsource')
  async partGroupOptions(@Query() query: QueryPartGroupOptionDto) {
    return this.service.findPartGroupOptions(query);
  }

  /**
   * 部件组回厂进度：保存前复核「累计回厂是否超过组支数」（登记页与编辑弹窗共用）。
   * 保存时现查而不用选择器打开时带回的数——两人同时登记同一批货时，那份数已经过期。
   */
  @Get('return-progress')
  @RequirePermissions('outsource')
  async returnProgress(@Query() query: QueryReturnProgressDto) {
    return this.service.findReturnProgress(query);
  }

  @Get(':id')
  @RequirePermissions('outsource')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  /** 登记回厂：一次可录多行（多个部件组共用加工商与回厂日期） */
  @Post()
  @RequirePermissions('outsource:create')
  @OperationLog('外发管理', '登记外发件回厂')
  async create(
    @Body() dto: CreateOutsourcePartDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('outsource:update')
  @OperationLog('外发管理', '编辑外发件回厂记录')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOutsourcePartDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('outsource:delete')
  @OperationLog('外发管理', '删除外发件回厂记录')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
