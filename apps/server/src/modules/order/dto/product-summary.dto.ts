import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../../common/utils/transform.util';

/**
 * 产品汇总查询（财务需求，设计文档「产品汇总查询」章）。
 * 布尔筛选一律用 toBoolean —— 未勾选的复选框以 `?onlyOwed=false` 发出，
 * `@Type(() => Boolean)` 会把 "false" 判成 true（见 transform.util.ts 注释）。
 */
export class QueryProductSummaryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：订单号/客户/生产单号/产品型号/货号/产品编码 模糊（透传台账口径） */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(128) customerName?: string;

  /** 下单日期区间 */
  @IsOptional() @IsDateString() orderDateFrom?: string;

  @IsOptional() @IsDateString() orderDateTo?: string;

  /** 表面处理（字典 surface_type） */
  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  /** 产品类型：多选组合按包含匹配，传单值即可 */
  @IsOptional() @IsString() @MaxLength(32) productType?: string;

  /** 订单状态：1进行中 2已完结（已作废不进汇总，与台账同口径） */
  @IsOptional() @Type(() => Number) @IsInt() orderStatus?: number;

  /**
   * 只看有欠数（聚合行成品欠数 > 0 或 发货欠数 > 0）。
   * ⚠️ 在**聚合行**上过滤，绝不透传给 findLedger——那边是订单行级过滤，
   * 会把同产品已交清的订单行剔掉，聚合合计直接失真。
   */
  @IsOptional() @Transform(toBoolean) onlyOwed?: boolean;

  /** 只看有库存（聚合行库存数 > 0） */
  @IsOptional() @Transform(toBoolean) onlyStocked?: boolean;
}

/** 出入库期间汇总（Tab2 进销存）：单据日期区间必填 */
export class QueryPeriodSummaryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  @IsDateString({}, { message: '开始日期格式不正确（应为 YYYY-MM-DD）' })
  from: string;

  @IsDateString({}, { message: '结束日期格式不正确（应为 YYYY-MM-DD）' })
  to: string;

  /** 关键字：货号/生产单号/订单号/客户/组型号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(128) customerName?: string;

  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;
}
