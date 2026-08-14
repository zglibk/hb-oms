import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
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

  /** 产品要求描述（客户对该产品的特殊要求；随业务字段开关显隐，停用时前端仍原样回传保历史值） */
  @IsOptional()
  @IsString({ message: '产品要求描述必须是文本' })
  @MaxLength(255, { message: '产品要求描述不能超过 255 个字符' })
  productRequirement?: string;

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
  /*
   * PO# 与生产单号 2026-08-14 起**必填**（业务部门要求）：两者都是对账用的业务键——
   * PO# 是客户订单文件上的号（送货单按各客户叫法印成「采购单编号」「合同编号」），
   * 生产单号是车间与台账认的「订单编号」。任一为空，下游单据那一栏就是空白。
   *
   * 更新走 UpdateOrderDto extends CreateOrderDto，故编辑同样受此约束——
   * 编辑存量空值订单时会被要求补填，这是有意的（顺带把历史数据补齐）。
   * 「期初补录」订单不豁免：is_opening 只是区分标记，从不改变校验行为（§5.6）。
   */
  /*
   * ⚠️ `@IsNotEmpty` 必须写在**最靠近属性**的一行：装饰器自下而上注册，
   * 而错误消息取 constraints 的第一条。放在上面的话，字段缺失（undefined）时
   * 会报「不能超过 64 个字符」这种驴唇不对马嘴的提示（已实测）。
   */
  /** PO#：客户订单文件上的订单编号，手工填写 */
  @IsString({ message: 'PO# 必须是文本' })
  @MaxLength(64, { message: 'PO# 不能超过 64 个字符' })
  @IsNotEmpty({ message: '请填写 PO#（客户订单文件上的订单编号）' })
  poNo: string;

  /** 生产单号：订单级，与 PO# 一对一；台账「订单编号」展示此号 */
  @IsString({ message: '生产单号必须是文本' })
  @MaxLength(64, { message: '生产单号不能超过 64 个字符' })
  @IsNotEmpty({ message: '请填写生产单号' })
  productionNo: string;

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

  /** PO# 精确匹配（新建订单保存前的同 PO# 软提醒用；作废单也计入——重复录单后被作废的历史同样值得提醒） */
  @IsOptional() @IsString() poNo?: string;

  @IsOptional() @Type(() => Number) @IsInt() status?: number;

  @IsOptional() @IsDateString() dateFrom?: string;

  @IsOptional() @IsDateString() dateTo?: string;
}
