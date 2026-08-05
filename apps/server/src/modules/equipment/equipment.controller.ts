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
import { EquipmentService } from './equipment.service';
import {
  CreateEquipmentInfoDto,
  QueryEquipmentInfoDto,
  UpdateEquipmentInfoDto,
} from './dto/equipment-info.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('equipment-info')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Get()
  async list(@Query() query: QueryEquipmentInfoDto) {
    return this.service.findList(query);
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('equipment-info:create')
  @OperationLog('设备信息', '新增设备信息')
  async create(@Body() dto: CreateEquipmentInfoDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('equipment-info:update')
  @OperationLog('设备信息', '编辑设备信息')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('equipment-info:delete')
  @OperationLog('设备信息', '删除设备信息')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
