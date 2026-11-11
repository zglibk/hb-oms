import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  DULL_STOCK_FLOW_TYPE_OPTIONS,
  UNIT,
} from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';

const SIDE_VALUES = ['', 'left', 'right'];
const UNIT_VALUES = [UNIT.SET, UNIT.PIECE];
const FLOW_TYPE_VALUES = DULL_STOCK_FLOW_TYPE_OPTIONS.map((item) => item.value);

/**
 * 呆滞品档案的属性字段（新增与编辑共用）。
 *
 * 与部件台账不同，这些属性**不参与任何唯一键**——同货号同客户可能有多批呆滞，
 * 逐批建档，所以属性只是描述与筛选依据，可以随时改。
 *
 * 必填字段的**每个**约束都要给中文 message：字段缺省时多个约束会同时失败，
 * 只要有一个没给 message，用户看到的就是「must be a string」这类英文提示（§5.6 已踩）。
 *
 * ⚠️ 装饰器顺序有讲究：TS 装饰器**自下而上**注册，而 AllExceptionsFilter 只取
 * 错误数组的**第一条**当 message。故长度限制要写在**最上面**，「必填」类约束贴着属性写——
 * 否则字段留空时用户看到的会是「货号不能超过 64 个字符」这种驴唇不对马嘴的提示。
 */
export class DullStockAttrDto {
  @MaxLength(64, { message: '产品代码不能超过 64 个字符' })
  @IsNotEmpty({ message: '产品代码必填' })
  @IsString({ message: '产品代码必填' })
  itemNo: string;

  @IsOptional() @IsString() @MaxLength(128, { message: '产品名称不能超过 128 个字符' }) productName?: string;

  @IsOptional() @IsString() @MaxLength(128, { message: '客户名称不能超过 128 个字符' }) customerName?: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '生产单号不能超过 64 个字符' }) productionNo?: string;

  @IsOptional() @IsString() @MaxLength(128, { message: '产品型号不能超过 128 个字符' }) productModel?: string;

  /** 产品类型多选组合串；服务端经共享包 normalizeProductTypes 规范化后入库 */
  @IsOptional() @IsString() @MaxLength(128, { message: '产品类型组合不能超过 128 个字符' }) productType?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '轨道节数不能超过 32 个字符' }) railSection?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '规格必须为整数' })
  @Min(0, { message: '规格不能为负' })
  dimensionMm?: number;

  @IsOptional() @IsString() @MaxLength(64, { message: '规格文本不能超过 64 个字符' }) dimensionText?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '料厚不能超过 32 个字符' }) materialThickness?: string;

  @IsOptional() @IsString() @MaxLength(32, { message: '表面处理不能超过 32 个字符' }) surfaceType?: string;

  @IsOptional() @IsString() @MaxLength(64, { message: '颜色不能超过 64 个字符' }) color?: string;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class CreateDullStockDto extends DullStockAttrDto {
  /** 数量单位：本行四个数量列一律按它计（1套=2支）；建档后有流水就不能再改 */
  @IsIn(UNIT_VALUES, { message: '单位只能是「套」或「支」' })
  unit: string;

  @IsDateString({}, { message: '建档日期格式不正确' })
  filingDate: string;

  @Type(() => Number)
  @IsInt({ message: '期初数必须为整数' })
  @Min(0, { message: '期初数不能为负' })
  openingQty: number;
}

/** 编辑档案：属性 + 期初数可改；入库数/出库数/结存数是流水累计值，不在此列 */
export class UpdateDullStockDto extends CreateDullStockDto {}

/** 登记一笔出入库（入库数/出库数的唯一写入口） */
export class CreateDullStockFlowDto {
  @IsIn(FLOW_TYPE_VALUES, { message: '流水类型只能是客户退货、生产领料、生产入库或出货' })
  flowType: string;

  @Type(() => Number)
  @IsInt({ message: '数量必须为整数' })
  @Min(1, { message: '数量必须大于 0' })
  quantity: number;

  @IsDateString({}, { message: '发生日期格式不正确' })
  flowDate: string;

  /** 类型已经说明业务含义；这里只补充可选说明。 */
  @IsOptional() @IsString() @MaxLength(255, { message: '说明不能超过 255 个字符' }) reason?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class QueryDullStockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：产品代码 / 产品名称 / 技术型号 / 客户 / 生产单号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  @IsOptional() @IsIn(SIDE_VALUES, { message: '边别只能是「左」或「右」' }) side?: string;

  /** 月度台账的起止日期；页面按自然月成对传入，返回月初、分类变动和月末结存。 */
  @IsOptional() @IsDateString({}, { message: '出入库开始日期格式不正确' }) flowDateFrom?: string;

  @IsOptional() @IsDateString({}, { message: '出入库结束日期格式不正确' }) flowDateTo?: string;

  /**
   * 只看有结存，默认 false（全量加载）。普通视图按当前结存判断，月度视图按月末结存判断。
   * 布尔参数必须用 toBoolean，不能用 @Type(() => Boolean)：全局 ValidationPipe
   * 开了 enableImplicitConversion，字符串 "false" 会被隐式转成 true（§一 已踩）。
   */
  @IsOptional() @Transform(toBoolean) onlyInStock?: boolean;
}

/** 流水查询：按档案行下钻 */
export class QueryDullStockFlowDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  @IsOptional() @Type(() => Number) @IsInt() dullId?: number;

  @IsOptional() @IsDateString({}, { message: '流水开始日期格式不正确' }) flowDateFrom?: string;

  @IsOptional() @IsDateString({}, { message: '流水结束日期格式不正确' }) flowDateTo?: string;
}

/** 呆滞品出货送货单打印参数，与成品送货单使用同一纸型体系。 */
export class DullStockPrintQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) profileId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
  @IsOptional() @IsString() @MaxLength(32) templateCode?: string;
}
