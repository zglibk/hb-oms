import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 逗号分隔的角色编码（允许空串） */
const ROLE_CODES = /^[A-Za-z0-9_-]*(,[A-Za-z0-9_-]+)*$/;

/**
 * 更新系统配置 DTO（所有字段可选，仅传需要更新的字段）
 */
export class UpdateSystemConfigDto {
  @IsOptional() @IsString() @MaxLength(512) logoUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(512) faviconUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(128) companyName?: string | null;
  @IsOptional() @IsString() @MaxLength(64)  systemName?: string | null;
  @IsOptional() @IsString() @MaxLength(64)  contactPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(255) companyAddress?: string | null;
  @IsOptional() @IsString() @MaxLength(64)  bankAccount?: string | null;
  @IsOptional() @IsString() @MaxLength(64)  taxNo?: string | null;
  @IsOptional() @IsString() @MaxLength(255) copyrightInfo?: string | null;
  @IsOptional() @IsString() @MaxLength(512) loginBgUrl?: string | null;
  @IsOptional() @IsIn([0, 1]) loginBgSetAsDefault?: number;
  /** 「颜色」字段全局启用开关：1启用 0停用 */
  @IsOptional() @IsIn([0, 1], { message: '颜色字段开关只能是 0 或 1' }) colorFieldEnabled?: number;
  /** 「客户图号」字段全局启用开关：1启用 0停用 */
  @IsOptional() @IsIn([0, 1], { message: '客户图号字段开关只能是 0 或 1' }) customerDrawingNoEnabled?: number;
  /** 「呆滞品颜色」字段启用开关：1启用 0停用（独立于 colorFieldEnabled） */
  @IsOptional() @IsIn([0, 1], { message: '呆滞品颜色字段开关只能是 0 或 1' }) dullStockColorEnabled?: number;

  /** 「产品要求描述」字段启用开关：1启用 0停用 */
  @IsOptional() @IsIn([0, 1], { message: '产品要求描述字段开关只能是 0 或 1' }) productRequirementEnabled?: number;

  /**
   * 英寸换算系数（1 英寸 = N mm）。上限 999 是防手滑（把 25 输成 2500 会让全厂规格失真），
   * 下限 0.001 只挡 0 与负数——不同行业口径差异大，不该在这里替客户定死取值。
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: '换算系数最多三位小数' })
  @Min(0.001, { message: '换算系数必须大于 0' })
  @Max(999, { message: '换算系数不能大于 999' })
  inchToMm?: number;

  /** 规格默认查看单位：mm / inch */
  @IsOptional()
  @IsIn(['mm', 'inch'], { message: '默认规格单位只能是 mm 或 inch' })
  dimensionViewUnit?: string;

  /**
   * 送货单默认模板编码（客户资料未单独配置时用它）。
   * **刻意不加 @IsIn 值域**：版式定义在前端注册表，值域写死一份就得前后端两处改（同客户 DTO）。
   */
  @IsOptional()
  @IsString({ message: '送货单默认模板必须为字符串' })
  @MaxLength(32, { message: '送货单默认模板编码不能超过32字符' })
  deliveryTemplateDefault?: string;

  /*
   * 四个模块的修改主管角色：角色编码逗号分隔（空串 = 只有创建人能改）
   */
  @IsOptional()
  @IsString({ message: '订单修改主管角色必须为字符串' })
  @MaxLength(255, { message: '订单修改主管角色过多' })
  @Matches(ROLE_CODES, { message: '订单修改主管角色格式不正确' })
  orderEditRoles?: string;

  @IsOptional()
  @IsString({ message: '外发回厂记录修改主管角色必须为字符串' })
  @MaxLength(255, { message: '外发回厂记录修改主管角色过多' })
  @Matches(ROLE_CODES, { message: '外发回厂记录修改主管角色格式不正确' })
  outsourceEditRoles?: string;

  @IsOptional()
  @IsString({ message: '装配批次修改主管角色必须为字符串' })
  @MaxLength(255, { message: '装配批次修改主管角色过多' })
  @Matches(ROLE_CODES, { message: '装配批次修改主管角色格式不正确' })
  assemblyEditRoles?: string;

  @IsOptional()
  @IsString({ message: '成品出入库修改主管角色必须为字符串' })
  @MaxLength(255, { message: '成品出入库修改主管角色过多' })
  @Matches(ROLE_CODES, { message: '成品出入库修改主管角色格式不正确' })
  finishedEditRoles?: string;
}
