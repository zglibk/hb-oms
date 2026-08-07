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
 * 成品期初明细行（设计文档 §4.8）：**两种形态二选一**
 * - 挂订单：填 `orderPartGroupId`，其余展示字段由服务端从订单侧快照读取（客户端传了也不采信）；
 * - 纯属性（不挂订单）：省略 `orderPartGroupId`，改填货号等属性，只进库存数、不参与订单欠数。
 *
 * 这里不用 class-validator 表达"二选一"（写出来晦涩且报错难懂），
 * 改由 service 逐行判定并给出明确中文提示。
 */
export class OpeningFinishedItemDto {
  /** 挂订单时填部件组ID；省略或 0 = 纯属性行 */
  @IsOptional() @Type(() => Number) @IsInt({ message: '部件组ID必须为整数' }) orderPartGroupId?: number;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '批次号不能超过 64 个字符' }) batchNo?: string;

  @Type(() => Number)
  @IsInt({ message: '期初数量必须为整数' })
  @Min(1, { message: '期初数量必须大于 0' })
  quantity: number;

  /* ---- 以下仅纯属性行使用；挂订单行传了也会被订单快照覆盖 ---- */

  @IsOptional() @IsString() @MaxLength(64, { message: '货号不能超过 64 个字符' }) itemNo?: string;

  @IsOptional() @IsString() @MaxLength(128, { message: '产品型号不能超过 128 个字符' }) productModel?: string;

  @IsOptional() @IsString() @MaxLength(128, { message: '产品类型组合不能超过 128 个字符' }) productType?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '部件组类型不能超过 32 个字符' }) groupType?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '轨道节数不能超过 32 个字符' }) railSection?: string;

  @IsOptional() @Type(() => Number) @IsInt({ message: '规格必须为整数' }) @Min(0, { message: '规格不能为负' }) dimensionMm?: number;

  @IsOptional() @IsString() @MaxLength(64, { message: '规格文本不能超过 64 个字符' }) dimensionText?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '表面处理不能超过 32 个字符' }) surfaceType?: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '颜色不能超过 64 个字符' }) color?: string;

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
