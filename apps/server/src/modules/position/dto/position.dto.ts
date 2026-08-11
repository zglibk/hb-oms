import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../../common/utils/transform.util';

/**
 * 必填字段的**每个**约束都要给中文 message；且装饰器**自下而上**注册、
 * AllExceptionsFilter 只取错误数组第一条，故长度限制写在最上面、「必填」贴着属性写，
 * 否则字段留空时用户看到的会是「不能超过 64 个字符」这种驴唇不对马嘴的提示。
 */
export class CreatePositionDto {
  @MaxLength(64, { message: '岗位编码不能超过 64 个字符' })
  @IsNotEmpty({ message: '岗位编码必填' })
  @IsString({ message: '岗位编码必填' })
  positionCode: string;

  @MaxLength(64, { message: '岗位名称不能超过 64 个字符' })
  @IsNotEmpty({ message: '岗位名称必填' })
  @IsString({ message: '岗位名称必填' })
  positionName: string;

  /** 所属部门；不传或传空 = 通用岗位（不限部门） */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: '所属部门无效' })
  deptId?: number;

  @IsOptional() @IsString() @MaxLength(32, { message: '职级不能超过 32 个字符' }) jobLevel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '是否管理岗只能是 0 或 1' })
  isManager?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: '编制人数必须为整数' })
  @Min(0, { message: '编制人数不能为负' })
  headcount?: number;

  @IsOptional() @Type(() => Number) @IsInt({ message: '排序必须为整数' }) sort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '状态只能是 0 或 1' })
  status?: number;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class UpdatePositionDto extends CreatePositionDto {}

export class QueryPositionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  /** 关键字：岗位编码 / 名称 模糊 */
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) @IsInt() deptId?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) isManager?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: number;

  /**
   * 只看通用岗位（dept_id 为空）。布尔查询串必须用 toBoolean，
   * 不能用 @Type(() => Boolean)——全局 ValidationPipe 开了 enableImplicitConversion，
   * 字符串 "false" 会被隐式转成 true（§一 已踩）。
   */
  @IsOptional() @Transform(toBoolean) onlyCommon?: boolean;
}

/** 下拉专用查询：按部门取可选岗位 */
export class PositionOptionQueryDto {
  /**
   * 按部门过滤。传了就回「该部门岗位 + 通用岗位」，不传回全部启用岗位。
   * 过滤只是录入引导，服务端**不校验**员工岗位与部门是否匹配
   * （借调、一人多岗是现实存在的）。
   */
  @IsOptional() @Type(() => Number) @IsInt() deptId?: number;
}
