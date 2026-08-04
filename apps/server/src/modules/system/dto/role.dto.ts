import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsNotEmpty({ message: '角色编码必填' })
  @IsString()
  roleCode: string;

  @IsNotEmpty({ message: '角色名称必填' })
  @IsString()
  roleName: string;

  /** 数据范围：1全部 2本部门 3本部门及下级 4本人 5自定义 */
  @IsInt()
  dataScope: number;

  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsString() remark?: string;
  /** data_scope=5 时的自定义部门 */
  @IsOptional() @IsArray() deptIds?: number[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() roleName?: string;
  @IsOptional() @IsInt() dataScope?: number;
  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsInt() status?: number;
  @IsOptional() @IsArray() deptIds?: number[];
}

export class AssignPermsDto {
  @IsArray()
  permissionIds: number[];
}
