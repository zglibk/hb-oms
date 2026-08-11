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
import { PositionService } from './position.service';
import {
  CreatePositionDto,
  PositionOptionQueryDto,
  QueryPositionDto,
  UpdatePositionDto,
} from './dto/position.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

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

  @Delete(':id')
  @RequirePermissions('position:delete')
  @OperationLog('岗位管理', '删除岗位')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
