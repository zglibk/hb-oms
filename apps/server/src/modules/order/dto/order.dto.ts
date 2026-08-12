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

/** 部件行微调（部件行由服务端按蓝图展开，客户端仅可微调追溯码/备注） */
export class OrderPartTweakDto {
  @IsString() @MaxLength(32) partType: string;

  @IsOptional() @IsString() @MaxLength(16) side?: string;

  @IsOptional() @IsString() @MaxLength(64) cycleCode?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

export class CreateOrderPartGroupDto {
  /** 部件组类型（字典 part_group_type）：whole/outer_middle/inner/outer/middle */
  @IsString({ message: '部件组类型必填' })
  @MaxLength(32)
  groupType: string;

  @IsOptional() @IsString() @MaxLength(128) drawingNo?: string;

  @IsOptional() @IsString() @MaxLength(32) drawingVersion?: string;

  @IsOptional() @IsString() @MaxLength(32) materialThickness?: string;

  /** 组支数口径；缺省 = 产品行支数 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) qtyPcs?: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;

  @IsOptional() @Type(() => Number) @IsInt() sort?: number;

  /** 部件行微调（追溯码/备注）；行集合由服务端按 组类型+节数+卡口 蓝图展开 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPartTweakDto)
  parts?: OrderPartTweakDto[];
}

export class CreateOrderProductDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2], { message: '订单类型：1销售订单 2库存备货' }) orderType?: number;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) isNewOrder?: number;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) isExport?: number;

  @IsOptional() @IsString() @MaxLength(64) exportCountry?: string;

  @IsOptional() @Type(() => Number) @IsInt() materialId?: number;

  @IsOptional() @IsString() @MaxLength(64) materialCode?: string;

  @IsOptional() @IsString() @MaxLength(64) itemNo?: string;

  /** 客户图号：客户来图上的图号，区别于部件组的生产图号 drawingNo */
  @IsOptional()
  @IsString({ message: '客户图号必须是文本' })
  @MaxLength(128, { message: '客户图号不能超过 128 个字符' })
  customerDrawingNo?: string;

  @IsOptional() @IsString() @MaxLength(128) productName?: string;

  /** 产品类型多选组合（数组或逗号串均可，服务端经共享包规范化） */
  @IsOptional() @IsString() @MaxLength(128) productType?: string;

  @IsOptional() @IsString() @MaxLength(32) railSection?: string;

  /** 分体出货：1=该行按部件组构成分体包装出货（不组装成整品），形态由组构成推导 */
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1], { message: '分体出货标记只能是 0 或 1' }) isSplit?: number;

  @IsOptional() @Type(() => Number) @IsInt() dimensionMm?: number;

  @IsOptional() @IsString() @MaxLength(32) dimensionRaw?: string;

  @IsOptional() @IsString() @MaxLength(8) dimensionUnit?: string;

  /** 表面处理（字典 surface_type），none=不外发 */
  @IsOptional() @IsString() @MaxLength(32) surfaceType?: string;

  @IsOptional() @IsString() @MaxLength(64) color?: string;

  @IsOptional() @IsString() @MaxLength(64) sheetMaterial?: string;

  @Type(() => Number)
  @IsInt({ message: '订单数量必须为整数' })
  @Min(1, { message: '订单数量必须大于 0' })
  orderQty: number;

  /** 单位：set 套 / piece 支（仅此两种，共享包 UNIT 唯一口径） */
  @IsString()
  @IsIn(['set', 'piece'], { message: '单位仅支持 套(set) / 支(piece)' })
  unit: string;

  // productionNo 已上移订单级（CreateOrderDto.productionNo）；assemblyWorkshop 已移除
  // ——订单环节不安排装配车间，车间在装配批次录入。两者不再接收产品级入参。

  @IsOptional() @IsDateString({}, { message: '交货日期格式应为 YYYY-MM-DD' }) deliveryDate?: string;

  @IsOptional() @IsString() @MaxLength(255) deliveryAddress?: string;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;

  @IsOptional() @Type(() => Number) @IsInt() sort?: number;

  /** 部件组；缺省 = 服务端默认一个整品组（whole） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '部件组不能超过 5 个' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderPartGroupDto)
  partGroups?: CreateOrderPartGroupDto[];
}

export class CreateOrderDto {
  /** PO#：客户订单文件上的订单编号，手工填写 */
  @IsOptional() @IsString() @MaxLength(64) poNo?: string;

  /** 生产单号：订单级，与 PO# 一对一；台账「订单编号」展示此号 */
  @IsOptional()
  @IsString({ message: '生产单号必须是文本' })
  @MaxLength(64, { message: '生产单号不能超过 64 个字符' })
  productionNo?: string;

  @IsOptional() @Type(() => Number) @IsInt() customerId?: number;

  @IsString({ message: '客户名称必填' })
  @MaxLength(128)
  customerName: string;

  @IsDateString({}, { message: '订单日期格式应为 YYYY-MM-DD' })
  orderDate: string;

  @IsOptional() @IsString() @MaxLength(64) salesman?: string;

  @IsOptional() @IsString() @MaxLength(64) merchandiser?: string;

  @IsOptional() @IsString() @MaxLength(32) orderSource?: string;

  /** 附件URL JSON数组串 */
  @IsOptional() @IsString() @MaxLength(512) attachmentIds?: string;

  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) isOpening?: number;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;

  /**
   * 订单备注（图文混排 HTML，wangEditor 输出）。
   * 上限 64KB 对齐 MySQL TEXT 容量——不限长的话一张图直接内联 base64 就能把
   * INSERT 顶爆（图片本身走上传接口存 URL，正文里只该有 <img src>）。
   */
  @IsOptional() @IsString() @MaxLength(65535, { message: '订单备注内容过长' }) otherReq?: string;

  @IsArray({ message: '产品行必须为数组' })
  @ArrayNotEmpty({ message: '至少需要一条产品行' })
  @ArrayMaxSize(50, { message: '单张订单产品行不能超过 50 条' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderProductDto)
  products: CreateOrderProductDto[];
}

/** 更新 = 同结构整体重建（订单被下游引用后禁改，见 service） */
export class UpdateOrderDto extends CreateOrderDto {}

export class QueryOrderDto {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;

  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;

  /** 关键字：订单号/PO#/客户/生产单号/货号 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) @IsInt() status?: number;

  @IsOptional() @IsDateString() dateFrom?: string;

  @IsOptional() @IsDateString() dateTo?: string;
}
