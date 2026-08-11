import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto, QuerySupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§二）：供应商页用菜单权限点 `basic:supplier` */
@Controller('supplier')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Get()
  @RequirePermissions('basic:supplier')
  async list(@Query() query: QuerySupplierDto) {
    return this.service.findList(query);
  }

  /**
   * 全量启用供应商（外发登记等表单下拉，无分页）。
   * **跨页引用型只读接口，刻意只要求登录**：登记回厂的人未必有供应商菜单，
   * 挂 basic:supplier 会让加工商下拉 403（只回编码/名称，无联系方式等字段）。
   * 必须注册在 `:id` 型路由之前。
   */
  @Get('all')
  async all() {
    return this.service.findAllEnabled();
  }

  @Post()
  @RequirePermissions('supplier:create')
  @OperationLog('供应商', '新增供应商')
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('supplier:update')
  @OperationLog('供应商', '编辑供应商')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('supplier:delete')
  @OperationLog('供应商', '删除供应商')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
