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
import { CustomerService } from './customer.service';
import {
  BatchDeleteCustomerDto,
  CreateCustomerDto,
  QueryCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** 读权限口径（§二）：客户资料页用菜单权限点 `basic:customer` */
@Controller('customer')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get()
  @RequirePermissions('basic:customer')
  async list(@Query() query: QueryCustomerDto) {
    return this.service.findList(query);
  }

  /**
   * 全量启用客户（订单/开单信息表单下拉，无分页）。
   * **跨页引用型只读接口，刻意只要求登录**：录订单的人未必有客户资料菜单，
   * 挂 basic:customer 会让订单表单的客户下拉直接 403（只回客户代码/名称，无敏感字段）。
   */
  @Get('all')
  async all() {
    return this.service.findAllEnabled();
  }

  @Post()
  @RequirePermissions('customer:create')
  @OperationLog('客户资料', '新增客户')
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('customer:update')
  @OperationLog('客户资料', '编辑客户')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('customer:delete')
  @OperationLog('客户资料', '删除客户')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  /** 批量删除（整批校验：任一被订单引用则整批拒绝；权限复用单删） */
  @Post('batch-delete')
  @RequirePermissions('customer:delete')
  @OperationLog('客户资料', '批量删除客户')
  async batchRemove(@Body() dto: BatchDeleteCustomerDto) {
    return this.service.batchRemove(dto.ids);
  }

  /** 下载导入模板 */
  @Get('import-template')
  @RequirePermissions('customer:import')
  @SkipTransform()
  async importTemplate(@Res() res: Response) {
    const buf = await this.service.buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent('客户导入模板.xlsx')}"`,
    );
    res.send(buf);
  }

  /** Excel 批量导入（整批校验、逐行错误；overwrite=1 按客户代码覆盖更新） */
  @Post('import')
  @RequirePermissions('customer:import')
  @OperationLog('客户资料', '批量导入客户')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Query('overwrite') overwrite: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的 Excel 文件');
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx')) {
      throw new BadRequestException('仅支持 .xlsx 格式文件');
    }
    return this.service.importFromExcel(file.buffer, overwrite === '1', user);
  }
}
