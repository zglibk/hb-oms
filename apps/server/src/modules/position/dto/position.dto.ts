import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { POSITION_NATURE_VALUES } from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';

/**
 * 必填字段的**每个**约束都要给中文 message；且装饰器**自下而上**注册、
 * AllExceptionsFilter 只取错误数组第一条，故长度限制写在最上面、「必填」贴着属性写，
 * 否则字段留空时用户看到的会是「不能超过 64 个字符」这种驴唇不对马嘴的提示。
 */
export class CreatePositionDto {
  /**
   * 岗位编码：**服务端自动采番（POS+3位流水），客户端传了也不采信**；
   * 编辑接口同样恒取库中值。保留字段仅为兼容旧调用方。
   */
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '岗位编码不能超过 64 个字符' })
  positionCode?: string;

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

  /** 职级（t_job_level.id）；须与岗位性质属同一序列，服务端校验 */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: '职级无效' })
  jobLevelId?: number;

  /** 岗位性质：普通岗 / 管理岗 / 技术岗 */
  @IsOptional()
  @IsIn(POSITION_NATURE_VALUES, { message: '岗位性质只能是 普通岗 / 管理岗 / 技术岗' })
  positionNature?: string;

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

  @IsOptional()
  @IsIn(POSITION_NATURE_VALUES, { message: '岗位性质只能是 普通岗 / 管理岗 / 技术岗' })
  positionNature?: string;

  @IsOptional() @Type(() => Number) @IsInt() jobLevelId?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: number;

  /**
   * 只看通用岗位（dept_id 为空）。布尔查询串必须用 toBoolean，
   * 不能用 @Type(() => Boolean)——全局 ValidationPipe 开了 enableImplicitConversion，
   * 字符串 "false" 会被隐式转成 true（§一 已踩）。
   */
  @IsOptional() @Transform(toBoolean) onlyCommon?: boolean;
}

/** 批量删除：逐个尝试，被引用的跳过并回报，不因一条失败整批回滚 */
export class BatchDeletePositionDto {
  @IsArray({ message: '请选择要删除的岗位' })
  @ArrayNotEmpty({ message: '请选择要删除的岗位' })
  @Type(() => Number)
  @IsInt({ each: true, message: '岗位ID无效' })
  ids: number[];
}

/** 导入：整批校验通过才落库（沿用项目既有导入约定） */
export class ImportPositionDto {
  /** 覆盖更新：按「岗位名称 + 所属部门」匹配已有岗位并更新其余字段 */
  @IsOptional() @Transform(toBoolean) overwrite?: boolean;
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
