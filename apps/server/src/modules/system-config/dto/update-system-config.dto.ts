import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
}
