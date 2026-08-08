import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: '账号必填' })
  @IsString()
  @MaxLength(64)
  username: string;

  @IsNotEmpty({ message: '初始密码必填' })
  @IsString()
  @MinLength(6, { message: '密码至少6位' })
  password: string;

  @IsNotEmpty({ message: '姓名必填' })
  @IsString()
  realName: string;

  @IsOptional()
  @IsIn([0, 1, 2], { message: '性别取值非法' })
  gender?: number;

  @IsOptional()
  @IsInt()
  deptId?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  /** 角色ID列表 */
  @IsArray()
  @ArrayNotEmpty({ message: '请至少分配一个角色' })
  roleIds: number[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() realName?: string;
  @IsOptional() @IsIn([0, 1, 2], { message: '性别取值非法' }) gender?: number;
  @IsOptional() @IsInt() deptId?: number;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsString() avatar?: string;
  @IsOptional() @IsInt() status?: number;
}

export class AssignRolesDto {
  @IsArray()
  roleIds: number[];
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: '新密码必填' })
  @IsString()
  @MinLength(6, { message: '密码至少6位' })
  password: string;
}

export class QueryUserDto {
  @IsOptional() page?: number;
  @IsOptional() pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() deptId?: number;
  @IsOptional() status?: number;
}
