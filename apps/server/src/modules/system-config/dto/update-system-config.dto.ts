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
}
