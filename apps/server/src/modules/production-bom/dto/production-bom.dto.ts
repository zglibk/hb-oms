import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductionBomItemDto {
  @IsOptional() @Type(() => Number) @IsInt() materialId?: number | null;

  @IsString({ message: '零件名称必填' })
  @MaxLength(128, { message: '零件名称不能超过128字符' })
  itemName: string;

  @IsOptional() @IsString() @MaxLength(128) itemCode?: string | null;
  @IsOptional() @IsString() @MaxLength(128) spec?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '数量/套必须是最多4位小数的数字' })
  @Min(0, { message: '数量/套不能小于0' })
  quantityPerSet?: number | null;

  @IsOptional() @IsString() @MaxLength(16) quantityUnit?: string | null;

  @Type(() => Boolean)
  @IsBoolean({ message: '是否分左右必须是布尔值' })
  splitLeftRight: boolean;

  @IsOptional() @IsString() @MaxLength(32) materialThickness?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 }, { message: '单耗必须是最多6位小数的数字' })
  @Min(0, { message: '单耗不能小于0' })
  unitConsumption?: number | null;

  @IsOptional() @IsString() @MaxLength(64) surfaceTreatment?: string | null;
  @IsOptional() @IsString() @MaxLength(64) sheetMaterial?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() supplierId?: number | null;
  @IsOptional() @IsString() @MaxLength(128) supplierName?: string | null;
  @IsOptional() @IsString() @MaxLength(255) remark?: string | null;
}

export class SaveProductionBomDto {
  @IsOptional() @Type(() => Number) @IsInt() processInfoId?: number | null;

  @IsString({ message: '生产图号必填' })
  @MaxLength(128, { message: '生产图号不能超过128字符' })
  drawingNo: string;

  @IsOptional() @Type(() => Number) @IsInt() customerId?: number | null;
  @IsOptional() @IsString() @MaxLength(128) customerName?: string | null;

  @IsString({ message: '产品名称必填' })
  @MaxLength(128, { message: '产品名称不能超过128字符' })
  productName: string;

  @IsString({ message: '版本号必填' })
  @MaxLength(32, { message: '版本号不能超过32字符' })
  version: string;

  @IsString({ message: '制表人必填' })
  @MaxLength(64, { message: '制表人不能超过64字符' })
  preparedBy: string;

  @IsDateString({}, { message: '制表日期格式应为YYYY-MM-DD' })
  preparedDate: string;

  @IsArray({ message: 'BOM明细必须为数组' })
  @ArrayMinSize(1, { message: '至少添加一条BOM明细' })
  @ArrayMaxSize(5000, { message: '单份BOM不能超过5000条明细' })
  @ValidateNested({ each: true })
  @Type(() => ProductionBomItemDto)
  items: ProductionBomItemDto[];
}

export class QueryProductionBomDto {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() customerId?: number;
  @IsOptional() @IsString() @MaxLength(32) version?: string;
  @IsOptional() @IsString() ids?: string;
}
