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
import { Transform, Type } from 'class-transformer';
import { FINISHED_BIZ_TYPE } from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';

/** 建单可选的业务类型：红字冲销不走建单接口，只能由 reverse 生成 */
const CREATABLE_BIZ_TYPES = [
  FINISHED_BIZ_TYPE.INBOUND,
  FINISHED_BIZ_TYPE.OPENING_BALANCE,
  FINISHED_BIZ_TYPE.SALE_OUTBOUND,
];

const SIDE_VALUES = ['', 'left', 'right'];

/**
 * 出入库明细行（设计文档 §4.5）。
 * 客户端只传锚点 + 边别 + 数量，展示快照一律由服务端从订单侧读取落库（§5.5 防伪造）。
 */
export class CreateFinishedItemDto {
  /** 锚点：订单部件组ID */
  @Type(() => Number)
  @IsInt({ message: '请选择订单部件组' })
  @Min(1, { message: '请选择订单部件组' })
  orderPartGroupId: number;

  /** 边别：含卡口组合必填 left/right，非卡口必须留空 */
  @IsOptional()
  @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' })
  side?: string;

  /** 批次号（预留，默认空串） */
  @IsOptional() @IsString() @MaxLength(64) batchNo?: string;

  /** 数量（支），恒为正；出入方向由单头 direction 表达 */
  @Type(() => Number)
  @IsInt({ message: '数量必须为整数' })
  @Min(1, { message: '数量必须大于 0' })
  quantity: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;

  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
}

export class CreateFinishedDocDto {
  /** 业务类型：inbound 生产入库 / opening_balance 期初 / sale_outbound 销售出库 */
  @IsString({ message: '业务类型必填' })
  @IsIn(CREATABLE_BIZ_TYPES, { message: '业务类型只能是 生产入库 / 期初 / 销售出库；红字冲销请走冲销接口' })
  bizType: string;

  @IsDateString({}, { message: '单据日期格式不正确' })
  docDate: string;

  @IsOptional() @IsString() @MaxLength(64) workTeam?: string;

  @IsOptional() @IsString() @MaxLength(64) machineNo?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;

  @IsArray({ message: '明细必须为数组' })
  @ArrayNotEmpty({ message: '至少需要一条明细' })
  @ArrayMaxSize(200, { message: '单张单据明细不能超过 200 条' })
  @ValidateNested({ each: true })
  @Type(() => CreateFinishedItemDto)
  items: CreateFinishedItemDto[];
}

/** 更新 = 同结构整体重建（仅草稿可改，见 service） */
export class UpdateFinishedDocDto extends CreateFinishedDocDto {}

/** 红字冲销：可整单冲销，也可只冲部分明细行（按数量部分冲销） */
export class ReverseFinishedDocDto {
  @IsDateString({}, { message: '冲销单日期格式不正确' })
  docDate: string;

  @IsString({ message: '冲销原因必填' })
  @MaxLength(255)
  reason: string;

  /**
   * 要冲销的明细行与数量；不传 = 整单全额冲销。
   * 每行数量不得超过「原行数量 − 该行已被冲销数量」。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReverseItemDto)
  items?: ReverseItemDto[];
}

export class ReverseItemDto {
  @Type(() => Number)
  @IsInt({ message: '被冲明细行ID必填' })
  originItemId: number;

  @Type(() => Number)
  @IsInt({ message: '冲销数量必须为整数' })
  @Min(1, { message: '冲销数量必须大于 0' })
  quantity: number;
}

export class QueryFinishedDocDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：单号/订单号/客户/生产单号/产品型号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(32) bizType?: string;

  /** 方向：1入库 -1出库 */
  @IsOptional() @Type(() => Number) @IsInt() direction?: number;

  @IsOptional() @Type(() => Number) @IsInt() status?: number;

  @IsOptional() @IsDateString() dateFrom?: string;

  @IsOptional() @IsDateString() dateTo?: string;
}

/** 库存查询：按余额行，可按部件组/属性筛选 */
export class QueryBalanceDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：货号/型号/订单号/客户/生产单号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) @IsInt() orderPartGroupId?: number;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  /** 只看有结存（quantity <> 0），默认 true——零结存行是历史痕迹，日常不看 */
  @IsOptional() @Transform(toBoolean) onlyInStock?: boolean;
}

/** 可出入库的部件组选项（建单选行用） */
export class QueryStockGroupOptionDto {
  @IsOptional() @IsString() keyword?: string;

  /** 用途：inbound 入库（附可入库量）/ sale_outbound 出库（附当前结存） */
  @IsOptional() @IsString() @MaxLength(32) bizType?: string;

  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}
