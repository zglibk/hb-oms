import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  MaxLength,
} from 'class-validator';

export class CreateMaterialDto {
  @IsNotEmpty({ message: '物料代码必填' })
  @IsString()
  @MaxLength(64)
  materialCode: string;

  @IsOptional() @IsString() @MaxLength(64) itemNo?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() spec?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsString() railSection?: string;
  @IsOptional() @IsString() partType?: string;
  @IsOptional() @IsString() drawingNo?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() remark?: string;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() @MaxLength(64) itemNo?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() spec?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsString() railSection?: string;
  @IsOptional() @IsString() partType?: string;
  @IsOptional() @IsString() drawingNo?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsInt() status?: number;
}

export class QueryMaterialDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() @MaxLength(64) itemNo?: string;
  @IsOptional() @IsInt() status?: number;
  @IsOptional() @IsInt() page?: number;
  @IsOptional() @IsInt() pageSize?: number;
  /** 导出时按 id 筛选，逗号分隔的 id 字符串（如 "1,2,3"） */
  @IsOptional() @IsString() ids?: string;
}
