import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { EDUCATION_TYPE, EMP_PLANT_CODES, JOB_STATUS } from '@hb-oms/shared';
import { toBoolean } from '../../../common/utils/transform.util';
import { Transform } from 'class-transformer';

const EDUCATION_TYPE_VALUES = [EDUCATION_TYPE.FULL_TIME, EDUCATION_TYPE.PART_TIME];

export class CreateEmployeeDto {
  /**
   * 员工编号：**服务端自动生成，客户端传了也不采信**（防伪造，§5.5）。
   * 保留字段仅为兼容 update 的 merged 结构，生成规则见 EmployeeService.generateEmpNo。
   */
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '员工编号不能超过32字符' })
  empNo?: string;

  /** 厂区（员工编号第 1-2 位）。新增必填，由服务端校验并给出中文提示 */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsIn(EMP_PLANT_CODES, { message: '厂区只能是 总厂 / 一号分厂 / 二号分厂' })
  plantCode?: string;

  @IsString({ message: '请填写姓名' })
  @MinLength(1, { message: '请填写姓名' })
  @MaxLength(64, { message: '姓名不能超过64字符' })
  empName: string;

  @Type(() => Number)
  @IsInt({ message: '性别无效' })
  @IsIn([0, 1, 2], { message: '性别只能为未知/男/女' })
  gender: number;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  @Matches(/^(\d{17}[\dXx])?$/, { message: '身份证号格式不正确' })
  idCard?: string;

  @IsOptional()
  @IsDateString({}, { message: '出生日期格式不正确' })
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nativePlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ethnicity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  politicalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  education?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @IsIn(EDUCATION_TYPE_VALUES, { message: '学历类型只能为全日制或非全日制' })
  educationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  major?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  graduateSchool?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
    return value;
  })
  @IsDateString({}, { message: '毕业时间格式不正确' })
  graduateDate?: string;

  @IsString({ message: '请选择用工属性' })
  @MinLength(1, { message: '请选择用工属性' })
  @MaxLength(32)
  empType: string;

  @IsOptional()
  @IsDateString({}, { message: '入职日期格式不正确' })
  hireDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '试用期须为整数月' })
  @Min(0)
  @Max(36)
  probationMonths?: number;

  @IsOptional()
  @IsDateString({}, { message: '合同到期日格式不正确' })
  contractEndDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([JOB_STATUS.ACTIVE, JOB_STATUS.LEFT], { message: '在职状态无效' })
  jobStatus?: number;

  @IsOptional()
  @IsDateString({}, { message: '离职日期格式不正确' })
  leaveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  leaveReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '所属部门无效' })
  deptId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  teamGroup?: string;

  /** 岗位：t_position.id（2026-08-11 由字典值改为主数据引用） */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: '岗位无效' })
  positionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '直属主管无效' })
  supervisorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: '档案状态只能为 0 或 1' })
  status?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  /**
   * 试用转正时换发正式编码（规则五）。**必须由用户在界面上确认后显式传 true**，
   * 服务端还会二次校验确实是「实习生/临时工 → 正式用工属性」才允许换号；
   * 其余任何编辑一律沿用原编号（规则四.1 编号终身不变）。
   */
  @IsOptional()
  @Transform(toBoolean)
  regenerateEmpNo?: boolean;
}

export class QueryEmployeeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  /** 关键字：工号/姓名/手机/身份证 */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deptId?: number;

  @IsOptional()
  @IsIn(EMP_PLANT_CODES, { message: '厂区只能是 总厂 / 一号分厂 / 二号分厂' })
  plantCode?: string;

  @IsOptional()
  @IsString()
  empType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([JOB_STATUS.ACTIVE, JOB_STATUS.LEFT])
  jobStatus?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  status?: number;

  /**
   * 仅返回在职启用员工精简列表（本模块内主管下拉用）。
   * 不是对外业务 options，仍守卫 hr:employee。
   */
  @IsOptional()
  @Transform(toBoolean)
  forSupervisor?: boolean;
}
