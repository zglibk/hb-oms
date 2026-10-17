import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ANNOUNCEMENT_LEVEL,
  ANNOUNCEMENT_REPLY_SCOPE,
  ANNOUNCEMENT_STATUS,
} from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';

const LEVELS = Object.values(ANNOUNCEMENT_LEVEL);
const SCOPES = Object.values(ANNOUNCEMENT_REPLY_SCOPE);
const STATUSES = Object.values(ANNOUNCEMENT_STATUS);

export class SaveAnnouncementDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  summary: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content: string;

  @IsIn(LEVELS)
  level: string;

  @IsBoolean()
  requiresReply: boolean;

  /** ISO 日期时间；草稿不传时取当前时间。 */
  @IsOptional()
  @IsString()
  publishAt?: string;

  /** NULL/未传表示永久有效；非永久公告前端默认填发布时间后三天。 */
  @IsOptional()
  @IsString()
  expireAt?: string | null;
}

export class PublishAnnouncementDto {
  @IsOptional()
  @IsString()
  publishAt?: string;

  @IsOptional()
  @IsString()
  expireAt?: string | null;
}

export class QueryAnnouncementAdminDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(LEVELS)
  level?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  requiresReply?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;
}

export class QueryAnnouncementHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;
}

/** 回复正文可能较长，详情页按页读取，避免公告长期使用后一次加载全部记录。 */
export class QueryAnnouncementReplyDto extends QueryAnnouncementHistoryDto {}

export class AckAnnouncementDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids: number[];
}

export class CreateAnnouncementReplyDto {
  @IsIn(SCOPES)
  scope: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;
}
