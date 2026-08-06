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
 * 外发（发坯单）DTO（设计文档 §4.3 / §6）。
 * 明细行只收锚点 orderPartGroupId + 数量口径，展示快照（订单号/型号/规格/周期码）
 * 一律由服务端从订单侧读取落库，不信任客户端传值（防伪造快照）。
 */
export class CreateOutsourceItemDto {
  /** 锚点：订单部件组ID */
  @Type(() => Number)
  @IsInt({ message: '明细行必须选择订单部件组' })
  orderPartGroupId: number;

  /** 发出重量（kg） */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '发出重量最多两位小数' })
  @Min(0, { message: '发出重量不能为负数' })
  sendWeight: number;

  /** 单重（kg/支）：为 0 时表示未填，发出数量需人工录入 */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '单重最多四位小数' })
  @Min(0, { message: '单重不能为负数' })
  unitWeight: number;

  /** 发出数量（支）：默认由重量÷单重折算，允许人工微调 */
  @Type(() => Number)
  @IsInt({ message: '发出数量必须为整数' })
  @Min(1, { message: '发出数量必须大于 0' })
  sendQty: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;

  @IsOptional() @Type(() => Number) @IsInt() sort?: number;
}

export class CreateOutsourceDto {
  @IsString({ message: '加工商必填' })
  @MaxLength(128)
  processorName: string;

  /** 表面处理（字典 surface_type）；保留值 none 不可外发，服务端二次校验 */
  @IsString({ message: '表面处理必填' })
  @MaxLength(32)
  surfaceType: string;

  @IsOptional() @IsString() @MaxLength(64) color?: string;

  @IsOptional() @IsDateString({}, { message: '计划发外日期格式不正确' }) planSendDate?: string;

  @IsOptional() @IsDateString({}, { message: '要求回货日期格式不正确' }) requireBackDate?: string;

  @IsOptional() @IsString() @MaxLength(2000) remark?: string;

  @IsArray({ message: '发出明细必须为数组' })
  @ArrayNotEmpty({ message: '至少需要一条发出明细' })
  @ArrayMaxSize(100, { message: '单张发坯单明细不能超过 100 条' })
  @ValidateNested({ each: true })
  @Type(() => CreateOutsourceItemDto)
  items: CreateOutsourceItemDto[];
}

/** 更新 = 同结构整体重建（仅待发出状态可改，见 service） */
export class UpdateOutsourceDto extends CreateOutsourceDto {}

/**
 * 发出明细数量修正（已发出后使用，设计文档 §7.3「发出数量修改需重算回齐状态」）。
 * 只改数量口径与备注，不改锚点、不增删行——行被回货引用后禁止删除。
 */
export class UpdateOutsourceItemDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '发出重量最多两位小数' })
  @Min(0, { message: '发出重量不能为负数' })
  sendWeight: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '单重最多四位小数' })
  @Min(0, { message: '单重不能为负数' })
  unitWeight: number;

  @Type(() => Number)
  @IsInt({ message: '发出数量必须为整数' })
  @Min(1, { message: '发出数量必须大于 0' })
  sendQty: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

/** 登记发出：填实际发外日期，状态 1 → 2 */
export class SendOutsourceDto {
  @IsDateString({}, { message: '实际发外日期格式不正确' })
  actualSendDate: string;
}

/** 手工关闭：3部分回货 → 4已回齐（尾数不回/损耗核销），原因必填 */
export class CloseOutsourceDto {
  @IsString({ message: '关闭原因必填' })
  @MaxLength(255)
  closeReason: string;
}

/** 回货登记（挂在发出明细行下，一行可多条 = 分批回货） */
export class CreateOutsourceReturnDto {
  @IsDateString({}, { message: '回货日期格式不正确' })
  backDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '收回重量最多两位小数' })
  @Min(0, { message: '收回重量不能为负数' })
  returnWeight: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '单重最多四位小数' })
  @Min(0, { message: '单重不能为负数' })
  unitWeight: number;

  @Type(() => Number)
  @IsInt({ message: '收回数量必须为整数' })
  @Min(1, { message: '收回数量必须大于 0' })
  returnQty: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class QueryOutsourceDto {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;

  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;

  /** 关键字：发坯单号/加工商/颜色/明细生产单号/明细产品型号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) @IsInt() status?: number;

  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  /** 日期区间（按计划发外日期过滤） */
  @IsOptional() @IsDateString() dateFrom?: string;

  @IsOptional() @IsDateString() dateTo?: string;
}

/** 可发外部件组查询：按订单/客户/型号筛选，返回剩余可发数 */
export class QueryPartGroupOptionDto {
  @IsOptional() @IsString() keyword?: string;

  /** 表面处理过滤：默认按单头表面处理匹配订单产品行的 surface_type */
  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  /** 排除指定发坯单的占用（编辑时排除本单旧明细，避免自己挤占自己的额度） */
  @IsOptional() @Type(() => Number) @IsInt() excludeDocId?: number;

  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}
