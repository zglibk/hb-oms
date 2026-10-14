import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { PrintDocumentType, PrintProfileConfig } from '../print-config.types';

export class CreatePrintProfileDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsIn(['delivery_note', 'inbound_note'])
  documentType: PrintDocumentType;

  @IsObject()
  config: PrintProfileConfig;
}

export class UpdatePrintProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @IsObject()
  config?: PrintProfileConfig;
}

export class SetPrintDefaultDto {
  @IsIn(['delivery_note', 'inbound_note'])
  documentType: PrintDocumentType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  profileId: number;
}

export class RuntimePrintProfileQueryDto {
  @IsIn(['delivery_note', 'inbound_note'])
  documentType: PrintDocumentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  profileId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
