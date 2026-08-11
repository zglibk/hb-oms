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
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto, QueryEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限：菜单码 hr:employee；V1 不提供跨模块 options */
@Controller('employee')
export class EmployeeController {
  constructor(private readonly service: EmployeeService) {}

  @Get()
  @RequirePermissions('hr:employee')
  async list(@Query() query: QueryEmployeeDto) {
    return this.service.findList(query);
  }

  @Get(':id')
  @RequirePermissions('hr:employee')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('employee:create')
  @OperationLog('人事档案', '新增员工')
  async create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('employee:update')
  @OperationLog('人事档案', '编辑员工')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('employee:delete')
  @OperationLog('人事档案', '删除员工')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
