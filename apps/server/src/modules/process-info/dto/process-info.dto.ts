import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

export class BatchDeleteProcessInfoDto {
  @IsArray({ message: 'ids 必须为数组' })
  @ArrayNotEmpty({ message: '请选择要删除的工艺记录' })
  @ArrayMaxSize(500, { message: '单次批量删除不能超过 500 条' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'ids 必须为整数数组' })
  ids: number[];
}

export class CreateProcessInfoDto {
  @IsString({ message: '生产图号必须为字符串' })
  @MaxLength(128, { message: '生产图号不能超过128字符' })
  drawingNo: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  drawingVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  productName?: string;

  /** 生产机台（多值逗号串，前端多标签录入后拼接） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  machines?: string;

  /** 生产机台-厚料（多值逗号存储） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  machinesThick?: string;

  @IsOptional() @IsString() @MaxLength(128) lengthReqOuter?: string;
  @IsOptional() @IsString() @MaxLength(128) lengthReqMiddle?: string;
  @IsOptional() @IsString() @MaxLength(128) lengthReqInner?: string;

  @IsOptional() @IsString() @MaxLength(255) specialReqOuter?: string;
  @IsOptional() @IsString() @MaxLength(255) specialReqMiddle?: string;
  @IsOptional() @IsString() @MaxLength(255) specialReqInner?: string;

  @IsOptional() @IsString() @MaxLength(64) moldNoOuter?: string;
  @IsOptional() @IsString() @MaxLength(64) moldNoMiddle?: string;
  @IsOptional() @IsString() @MaxLength(64) moldNoInner?: string;

  @IsOptional()
  @IsString()
  processUpdateNote?: string;

  /** 工艺更新附图 URL JSON 数组串（由前端上传后回填） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  processUpdateImages?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class UpdateProcessInfoDto extends PartialType(CreateProcessInfoDto) {}

export class QueryProcessInfoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  /** 关键字：图号/客户/产品名称 模糊 */
  @IsOptional()
  @IsString()
  keyword?: string;
}
