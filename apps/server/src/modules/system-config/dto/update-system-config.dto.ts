import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
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
}
