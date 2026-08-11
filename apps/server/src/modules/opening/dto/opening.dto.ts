import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartDimensionDto } from '../../part-stock/dto/part-stock.dto';

const SIDE_VALUES = ['', 'left', 'right'];

/**
 * 成品期初明细行（设计文档 §4.8）：**必须挂订单产品行**。
 *
 * 展示字段一律由服务端从订单侧快照读取，客户端传了也不采信（防伪造，§5.5）。
 *
 * 2026-08-11 起不再支持「纯属性行（不挂订单）」——已完结订单剩下的成品
 * 改由「物料管理 → 呆滞品管理」逐批建档跟踪，那里能记客户/生产单号，
 * 也能持续登记后续的出入库，本模块只管上线时把在做的订单存量搬进来。
 */
export class OpeningFinishedItemDto {
  @Type(() => Number)
  @IsInt({ message: '产品行ID必须为整数' })
  @Min(1, { message: '成品期初必须挂订单产品行' })
  orderProductId: number;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '批次号不能超过 64 个字符' }) batchNo?: string;

  @Type(() => Number)
  @IsInt({ message: '期初数量必须为整数' })
  @Min(1, { message: '期初数量必须大于 0' })
  quantity: number;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class OpeningFinishedDto {
  @IsDateString({}, { message: '期初日期格式不正确' })
  docDate: string;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;

  @IsArray({ message: '期初明细必须为数组' })
  @ArrayNotEmpty({ message: '至少需要一条期初明细' })
  @ArrayMaxSize(200, { message: '单次期初录入不能超过 200 条' })
  @ValidateNested({ each: true })
  @Type(() => OpeningFinishedItemDto)
  items: OpeningFinishedItemDto[];
}

/** 部件期初行：7 维属性 + 数量（走 part-stock 的调整通道，保证留痕） */
export class OpeningPartItemDto extends PartDimensionDto {
  @Type(() => Number)
  @IsInt({ message: '期初数量必须为整数' })
  @Min(1, { message: '期初数量必须大于 0' })
  quantity: number;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class OpeningPartDto {
  /** 期初原因，缺省为「期初录入」；会写进部件台账变动流水 */
  @IsOptional() @IsString() @MaxLength(255, { message: '原因不能超过 255 个字符' }) reason?: string;

  @IsArray({ message: '期初明细必须为数组' })
  @ArrayNotEmpty({ message: '至少需要一条期初明细' })
  @ArrayMaxSize(200, { message: '单次期初录入不能超过 200 条' })
  @ValidateNested({ each: true })
  @Type(() => OpeningPartItemDto)
  items: OpeningPartItemDto[];
}
