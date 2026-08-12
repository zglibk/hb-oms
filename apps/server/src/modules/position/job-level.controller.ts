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
import { JobLevelService } from './job-level.service';
import {
  CreateJobLevelDto,
  QueryJobLevelDto,
  UpdateJobLevelDto,
} from './dto/job-level.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§2.1）：职级管理页用菜单权限点 `basic:job-level` */
@Controller('job-level')
export class JobLevelController {
  constructor(private readonly service: JobLevelService) {}

  @Get()
  @RequirePermissions('basic:job-level')
  async list(@Query() query: QueryJobLevelDto) {
    return this.service.findList(query);
  }

  /**
   * 职级下拉（岗位维护页用），可按序列过滤。
   * **跨页引用型只读接口，只要求登录**——维护岗位的人未必有职级菜单。
   * **必须注册在 `:id` 之前**。
   */
  @Get('all')
  async all(@Query('positionNature') positionNature?: string) {
    return this.service.findOptions(positionNature);
  }

  @Post()
  @RequirePermissions('job-level:create')
  @OperationLog('职级管理', '新增职级')
  async create(@Body() dto: CreateJobLevelDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('job-level:update')
  @OperationLog('职级管理', '编辑职级')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobLevelDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('job-level:delete')
  @OperationLog('职级管理', '删除职级')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
