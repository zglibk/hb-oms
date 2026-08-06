import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../../common/utils/transform.util';

/** 边别候选值：含卡口组合 left/right，其余空串（共享包 isValidSide 做业务级二次校验） */
const SIDE_VALUES = ['', 'left', 'right'];

/**
 * 装配批次 DTO（设计文档 §4.4 / §6）。
 * 展示快照（订单号/生产单号/产品型号/规格）一律由服务端从订单侧读取落库，
 * 客户端只传锚点 + 计划/实际完成时间 + 数量（§5.5 防伪造快照）。
 */
export class CreateAssemblyBatchDto {
  /** 锚点：订单部件组ID */
  @Type(() => Number)
  @IsInt({ message: '请选择订单部件组' })
  orderPartGroupId: number;

  /** 边别：含卡口组合必填 left/right，非卡口必须留空 */
  @IsOptional()
  @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' })
  side?: string;

  /** 装配车间（字典 assembly_workshop）；不传则继承产品行 assembly_workshop */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  workshop?: string;

  /** 计划完成时间 */
  @ValidateIf((o) => o.planDate !== null && o.planDate !== '' && o.planDate !== undefined)
  @IsDateString({}, { message: '计划完成时间格式不正确' })
  planDate?: string | null;

  /** 实际完成时间：留空 = 计划中，已填 = 已完成（该批数量计入可入库量） */
  @ValidateIf((o) => o.actualDate !== null && o.actualDate !== '' && o.actualDate !== undefined)
  @IsDateString({}, { message: '实际完成时间格式不正确' })
  actualDate?: string | null;

  /** 装配数量（支） */
  @Type(() => Number)
  @IsInt({ message: '装配数量必须为整数' })
  @Min(1, { message: '装配数量必须大于 0' })
  qty: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

/**
 * 编辑装配批次：**不含锚点**——部件组与边别不可改（改锚点等于换组，应删除后重录，
 * 否则原组的可入库量会被静默抽走）。按整行覆盖语义：未传 actualDate 即视为清空
 * （退回「计划中」），清空后可入库量不得低于已入库量（§7.14）。
 */
export class UpdateAssemblyBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  workshop?: string;

  @ValidateIf((o) => o.planDate !== null && o.planDate !== '' && o.planDate !== undefined)
  @IsDateString({}, { message: '计划完成时间格式不正确' })
  planDate?: string | null;

  @ValidateIf((o) => o.actualDate !== null && o.actualDate !== '' && o.actualDate !== undefined)
  @IsDateString({}, { message: '实际完成时间格式不正确' })
  actualDate?: string | null;

  @Type(() => Number)
  @IsInt({ message: '装配数量必须为整数' })
  @Min(1, { message: '装配数量必须大于 0' })
  qty: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

/** 装配管理列表查询：按**部件组**一行，聚合该组的装配进度 */
export class QueryAssemblyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：订单号/客户/生产单号/产品型号/货号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  /** 装配车间（字典 assembly_workshop）：匹配产品行计划车间或批次实际车间 */
  @IsOptional() @IsString() @MaxLength(32) workshop?: string;

  /** 交货日期区间 */
  @IsOptional() @IsDateString() deliveryFrom?: string;

  @IsOptional() @IsDateString() deliveryTo?: string;

  /** 只看装配未完成（已完成装配量 < 组支数） */
  @IsOptional() @Transform(toBoolean) @IsBoolean() onlyUnfinished?: boolean;

  /** 只看逾期（存在未完成批次且其计划完成时间已过） */
  @IsOptional() @Transform(toBoolean) @IsBoolean() onlyOverdue?: boolean;
}

/** 某部件组（可再按边别）下的装配批次明细 */
export class QueryAssemblyBatchDto {
  @IsOptional() @Type(() => Number) @IsInt() orderPartGroupId?: number;

  @IsOptional() @Type(() => Number) @IsInt() orderProductId?: number;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;
}

/** 可入库量查询（供 M4 成品入库表单校验前置展示） */
export class QueryInboundQuotaDto {
  @Type(() => Number)
  @IsInt({ message: '请指定订单部件组' })
  orderPartGroupId: number;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;
}

/** 可装配部件组选项（新增批次时选组） */
export class QueryAssemblyGroupOptionDto {
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(32) workshop?: string;

  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}
