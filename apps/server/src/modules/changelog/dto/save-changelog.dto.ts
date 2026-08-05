import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 新增/更新更新日志 DTO
 */
export class SaveChangelogDto {
  @IsString()
  @MaxLength(32)
  version: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string | null;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Type(() => String)
  content: string[];

  @IsDateString()
  releasedAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  status?: number;
}
