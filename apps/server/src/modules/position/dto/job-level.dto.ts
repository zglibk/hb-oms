import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { POSITION_NATURE_VALUES } from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';

/**
 * 必填字段的每个约束都要给中文 message；装饰器**自下而上**注册、
 * AllExceptionsFilter 只取第一条，故长度限制写最上面、「必填」贴着属性写。
 */
export class CreateJobLevelDto {
  @MaxLength(64, { message: '职级名称不能超过 64 个字符' })
  @IsNotEmpty({ message: '职级名称必填' })
  @IsString({ message: '职级名称必填' })
  levelName: string;

  /** 所属序列 = 岗位性质 */
  @IsIn(POSITION_NATURE_VALUES, { message: '所属序列只能是 普通岗 / 管理岗 / 技术岗' })
  positionNature: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '等级必须为整数' })
  @Min(0, { message: '等级不能为负' })
  levelRank?: number;

  @IsOptional() @Type(() => Number) @IsInt({ message: '排序必须为整数' }) sort?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1], { message: '状态只能是 0 或 1' }) status?: number;

  @IsOptional() @IsString() @MaxLength(255, { message: '备注不能超过 255 个字符' }) remark?: string;
}

export class UpdateJobLevelDto extends CreateJobLevelDto {}

export class QueryJobLevelDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;

  @IsOptional() @IsString() keyword?: string;

  @IsOptional()
  @IsIn(POSITION_NATURE_VALUES, { message: '所属序列只能是 普通岗 / 管理岗 / 技术岗' })
  positionNature?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: number;

  /** 只看启用（下拉用）；布尔查询串必须走 toBoolean，见 §一 */
  @IsOptional() @Transform(toBoolean) onlyEnabled?: boolean;
}
