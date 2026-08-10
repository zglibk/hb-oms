import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 外发件回厂 DTO（设计文档 §4.3 / §6）。
 *
 * 一行 = 一次回厂。新增支持**一次录多行**：勾选多个部件组共用同一个
 * 加工商与回厂日期，逐行只填重量/单重/数量——车间一次拉回来一批货，
 * 逐条重复填加工商和日期纯属折磨人。
 *
 * 展示快照（订单号/生产单号/型号/规格/订单数量/图号/料厚/周期码）一律由
 * 服务端从订单侧读取落库，不信任客户端传值（防伪造快照）。
 */
export class CreateOutsourcePartItemDto {
  /** 锚点：订单部件组ID */
  @Type(() => Number)
  @IsInt({ message: '每行必须选择订单部件组' })
  orderPartGroupId: number;

  /** 回厂重量（kg） */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '回厂重量最多两位小数' })
  @Min(0, { message: '回厂重量不能为负数' })
  returnWeight: number;

  /** 单重（kg/支）：为 0 表示未填，数量需人工录入 */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '单重最多四位小数' })
  @Min(0, { message: '单重不能为负数' })
  unitWeight: number;

  /** 回厂数量（支）：默认由重量÷单重折算，允许人工微调 */
  @Type(() => Number)
  @IsInt({ message: '回厂数量必须为整数' })
  @Min(1, { message: '回厂数量必须大于 0' })
  returnQty: number;

  /** 表面处理与颜色：自订单带出，允许改（实际做的与订单登记的可能不同） */
  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  @IsOptional() @IsString() @MaxLength(64) color?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateOutsourcePartDto {
  @IsString({ message: '加工商必填' })
  @MaxLength(128)
  processorName: string;

  /** 实际回厂日期：本模块只记录已回厂的件，故必填 */
  @IsDateString({}, { message: '回厂日期格式不正确' })
  backDate: string;

  @IsArray({ message: '回厂明细必须为数组' })
  @ArrayNotEmpty({ message: '至少需要一条回厂明细' })
  @ArrayMaxSize(100, { message: '单次录入不能超过 100 条' })
  @ValidateNested({ each: true })
  @Type(() => CreateOutsourcePartItemDto)
  items: CreateOutsourcePartItemDto[];
}

/** 编辑单条回厂记录（锚点不可改——改锚点等于换部件组，要换只能删了重录） */
export class UpdateOutsourcePartDto {
  @IsString({ message: '加工商必填' })
  @MaxLength(128)
  processorName: string;

  @IsDateString({}, { message: '回厂日期格式不正确' })
  backDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '回厂重量最多两位小数' })
  @Min(0, { message: '回厂重量不能为负数' })
  returnWeight: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '单重最多四位小数' })
  @Min(0, { message: '单重不能为负数' })
  unitWeight: number;

  @Type(() => Number)
  @IsInt({ message: '回厂数量必须为整数' })
  @Min(1, { message: '回厂数量必须大于 0' })
  returnQty: number;

  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  @IsOptional() @IsString() @MaxLength(64) color?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class QueryOutsourcePartDto {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;

  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;

  /** 关键字：加工商/订单号/生产单号/产品型号/生产图号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(128) processorName?: string;

  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  /** 回厂日期区间 */
  @IsOptional() @IsDateString() dateFrom?: string;

  @IsOptional() @IsDateString() dateTo?: string;
}

/** 可外发部件组查询：按订单/客户/型号筛选，附组需求与已回厂合计供参考 */
export class QueryPartGroupOptionDto {
  @IsOptional() @IsString() keyword?: string;

  /** 表面处理过滤（可选；不传则列出全部需外发的组） */
  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}
