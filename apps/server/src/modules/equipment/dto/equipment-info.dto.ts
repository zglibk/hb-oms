import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

export class CreateEquipmentInfoDto {
  @IsString({ message: '机台号必填' })
  @MaxLength(32, { message: '机台号不能超过32字符' })
  machineNo: string;

  @IsOptional() @IsString() @MaxLength(128) productModel?: string;

  /** 部件（字典 part_type） */
  @IsOptional() @IsString() @MaxLength(32) partType?: string;

  @IsOptional() @IsString() @MaxLength(64) mechanic?: string;

  @IsOptional() @IsString() @MaxLength(128) materialSpec?: string;

  @IsOptional() @IsString() @MaxLength(128) drawingNo?: string;

  @IsOptional() @IsString() @MaxLength(64) commonThickness?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class UpdateEquipmentInfoDto extends PartialType(CreateEquipmentInfoDto) {}

export class QueryEquipmentInfoDto {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;

  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;

  /** 关键字：机台号/产品型号/图号/机修员 模糊 */
  @IsOptional() @IsString() keyword?: string;

  /** 按部件筛选（字典 part_type） */
  @IsOptional() @IsString() partType?: string;
}
