import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PART_ADJUST_SOURCE } from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';

const SIDE_VALUES = ['', 'left', 'right'];
const PART_TYPES = ['outer', 'middle', 'inner'];

/**
 * 部件台账 7 维属性（设计文档 §4.6 唯一键）。
 * 所有维度都参与唯一键，**未填的一律按空串/0 落库**——留 null 会让 MySQL
 * 唯一键失效（多 NULL 不去重），同一档部件会分裂成多行。
 */
export class PartDimensionDto {
  // 必填字段的**每个**约束都要给中文 message：字段缺省时多个约束会同时失败，
  // 只要有一个没给 message，用户看到的就可能是「must be a string」这类英文提示（已踩）
  @IsString({ message: '部件必填' })
  @IsIn(PART_TYPES, { message: '部件只能是 外轨 / 中轨 / 内轨' })
  partType: string;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  @IsString({ message: '货号必填' })
  @IsNotEmpty({ message: '货号必填' })
  @MaxLength(64, { message: '货号不能超过 64 个字符' })
  itemNo: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '轨道节数不能超过 32 个字符' }) railSection?: string;

  /** 产品类型多选组合串；服务端经共享包 normalizeProductTypes 规范化后入库 */
  @IsOptional() @IsString() @MaxLength(128, { message: '产品类型组合不能超过 128 个字符' }) productType?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '料厚不能超过 32 个字符' }) materialThickness?: string;

  @IsOptional() @Type(() => Number) @IsInt({ message: '规格必须为整数' }) @Min(0, { message: '规格不能为负' }) dimensionMm?: number;
}

/**
 * 手工调整 / 期初录入：按 7 维定位（不存在则建行），把 delta 累加到余量。
 * **没有「直接设置余量」的接口**——设计文档 §4.6 要求不直接改数无痕，
 * 一切变动都必须带 delta 与原因走流水。
 */
export class AdjustPartStockDto extends PartDimensionDto {
  /** 调整量（支）：正为增、负为减；不接受 0（无意义的空流水） */
  @Type(() => Number)
  @IsInt({ message: '调整量必须为整数' })
  @NotEquals(0, { message: '调整量不能为 0' })
  delta: number;

  @IsString({ message: '调整原因必填' })
  @IsNotEmpty({ message: '调整原因必填' })
  @MaxLength(255, { message: '调整原因不能超过 255 个字符' })
  reason: string;

  /** 来源：manual 手工调整（默认）/ opening 期初录入 */
  @IsOptional()
  @IsIn([PART_ADJUST_SOURCE.MANUAL, PART_ADJUST_SOURCE.OPENING], { message: '变动来源不合法' })
  source?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class QueryPartStockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：货号 / 料厚 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsIn(PART_TYPES, { message: '部件只能是 外轨 / 中轨 / 内轨' }) partType?: string;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  @IsOptional() @IsString() @MaxLength(32) railSection?: string;

  /** 产品类型：组合串按**包含匹配**（FIND_IN_SET 单值命中即入选） */
  @IsOptional() @IsString() @MaxLength(32) productType?: string;

  @IsOptional() @Type(() => Number) @IsInt() dimensionMm?: number;

  /** 只看有余量（quantity <> 0），默认 true——归零行是历史痕迹，日常不看 */
  @IsOptional() @Transform(toBoolean) onlyInStock?: boolean;
}

/** 变动流水查询：可按余量行下钻，也可按货号全局查 */
export class QueryPartAdjustDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  @IsOptional() @Type(() => Number) @IsInt() balanceId?: number;

  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(16) source?: string;
}
