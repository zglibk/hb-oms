import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 供应商 DTO（基础数据）。
 *
 * 必填项的每个约束都给中文 message——字段缺省时多个约束同时失败，
 * 漏一个就会把「must be a string」这类英文抛给用户（部件台账已踩过）。
 *
 * ⚠️ 字段缺省时**实际抛出的是最后一条约束的 message**（框架只回一条，
 * 客户模块同样如此）。所以必填字段的 MaxLength 文案要写成两种情形都读得通的
 * 「必填，且不能超过 N 个字符」，否则用户漏填名称会看到「不能超过 128 个字符」。
 */
export class CreateSupplierDto {
  @IsString({ message: '供应商编码必填' })
  @MaxLength(64, { message: '供应商编码必填，且不能超过 64 个字符' })
  supplierCode: string;

  @IsString({ message: '供应商名称必填' })
  @MaxLength(128, { message: '供应商名称必填，且不能超过 128 个字符' })
  supplierName: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '联系人不能超过 64 个字符' }) contactPerson?: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '联系电话不能超过 64 个字符' }) contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: '地址不能超过 255 个字符' }) address?: string;

  @IsOptional() @Type(() => Number) @IsInt({ message: '排序必须为整数' }) @Min(0, { message: '排序不能为负' }) sort?: number;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1], { message: '状态只能是 1启用 / 0停用' }) status?: number;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class UpdateSupplierDto extends CreateSupplierDto {}

export class QuerySupplierDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：编码/名称/联系人 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) status?: number;
}
