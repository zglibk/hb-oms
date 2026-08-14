import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

export class BatchDeleteCustomerDto {
  @IsArray({ message: 'ids 必须为数组' })
  @ArrayNotEmpty({ message: '请选择要删除的客户' })
  @ArrayMaxSize(500, { message: '单次批量删除不能超过 500 条' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'ids 必须为整数数组' })
  ids: number[];
}

export class CreateCustomerDto {
  @IsString({ message: '客户代码必须为字符串' })
  @MaxLength(64, { message: '客户代码不能超过64字符' })
  customerCode: string;

  @IsString({ message: '客户名称必须为字符串' })
  @MaxLength(128, { message: '客户名称不能超过128字符' })
  customerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salesman?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  merchandiser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deliveryAddress?: string;

  /**
   * 送货单模板编码（空 = 取系统配置的全局默认）。
   * **刻意不加 @IsIn 值域校验**：版式定义在前端注册表，值域再写死一份，
   * 加一套新客户模板就要前后端改两处、必然漂移（迁移 SQL 头注释同此理由）。
   */
  @IsOptional()
  @IsString({ message: '送货单模板必须为字符串' })
  @MaxLength(32, { message: '送货单模板编码不能超过32字符' })
  deliveryTemplate?: string;

  @IsOptional()
  @IsIn([0, 1], { message: '状态只能为 0 或 1' })
  status?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class QueryCustomerDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  /** 关键字：客户代码/名称/联系人 模糊 */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  status?: number;
}
