import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../../common/utils/transform.util';

/**
 * 订单跟踪台账查询（设计文档 §5.1）。
 * 布尔筛选一律用 toBoolean —— 未勾选的复选框以 `?onlyOwed=false` 发出，
 * `@Type(() => Boolean)` 会把 "false" 判成 true（见 transform.util.ts 注释）。
 */
export class QueryLedgerDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：订单号/客户/生产单号/产品型号/货号/产品编码 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(128) customerName?: string;

  @IsOptional() @IsString() @MaxLength(64) salesman?: string;

  @IsOptional() @IsString() @MaxLength(64) merchandiser?: string;

  /** 交期区间 */
  @IsOptional() @IsDateString() deliveryFrom?: string;

  @IsOptional() @IsDateString() deliveryTo?: string;

  /**
   * 下单日期区间。台账页暂未用，由「导出总计划」复用本查询时传入——
   * 订单列表按下单日期筛选，总计划的四数又必须走台账这一份口径，
   * 故把筛选条件补进来，而不是在导出侧另写一份聚合 SQL。
   */
  @IsOptional() @IsDateString() orderDateFrom?: string;

  @IsOptional() @IsDateString() orderDateTo?: string;

  /** 表面处理（字典 surface_type） */
  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  /** 装配车间（字典 assembly_workshop） */
  @IsOptional() @IsString() @MaxLength(32) assemblyWorkshop?: string;

  /** 产品类型：多选组合按**包含匹配**，传单值即可（FIND_IN_SET 命中） */
  @IsOptional() @IsString() @MaxLength(32) productType?: string;

  /** 是否出口：0否 1是 */
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) isExport?: number;

  /** 订单状态：1进行中 2已完结（已作废不进台账） */
  @IsOptional() @Type(() => Number) @IsInt() orderStatus?: number;

  /** 只看有欠数（生产欠数 > 0 或 发货欠数 > 0） */
  @IsOptional() @Transform(toBoolean) onlyOwed?: boolean;

  /** 只看逾期（交期已过且仍欠发货） */
  @IsOptional() @Transform(toBoolean) onlyOverdue?: boolean;
}

/** 台账行内展开：查某部件组的出入库/外发/装配三条流水 */
export class QueryLedgerDetailDto {
  @Type(() => Number)
  @IsInt({ message: '部件组ID必须是整数' })
  @Min(1, { message: '部件组ID不合法' })
  orderPartGroupId: number;
}
