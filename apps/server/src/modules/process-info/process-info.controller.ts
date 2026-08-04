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
import { ProcessInfoService } from './process-info.service';
import {
  CreateProcessInfoDto,
  QueryProcessInfoDto,
  UpdateProcessInfoDto,
} from './dto/process-info.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('process-info')
export class ProcessInfoController {
  constructor(private readonly service: ProcessInfoService) {}

  @Get()
  async list(@Query() query: QueryProcessInfoDto) {
    return this.service.findList(query);
  }

  /** 按生产图号匹配（订单表单自动带入；未命中返回 null） */
  @Get('by-drawing')
  async byDrawing(@Query('drawingNo') drawingNo: string) {
    return this.service.findByDrawingNo(drawingNo);
  }

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('process-info:create')
  @OperationLog('工艺信息', '新增工艺')
  async create(@Body() dto: CreateProcessInfoDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('process-info:update')
  @OperationLog('工艺信息', '编辑工艺')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProcessInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('process-info:delete')
  @OperationLog('工艺信息', '删除工艺')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
