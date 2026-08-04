import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  @IsNotEmpty({ message: '权限标识必填' })
  @IsString()
  permCode: string;

  @IsNotEmpty({ message: '权限名称必填' })
  @IsString()
  permName: string;

  /** 1菜单 2按钮 3接口 */
  @IsInt()
  permType: number;

  @IsOptional() @IsInt() parentId?: number;
  @IsOptional() @IsString() menuPath?: string;
  @IsOptional() @IsString() component?: string;
  @IsOptional() @IsString() apiPattern?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sort?: number;
}

export class UpdatePermissionDto {
  @IsOptional() @IsString() permName?: string;
  @IsOptional() @IsInt() permType?: number;
  @IsOptional() @IsInt() parentId?: number;
  @IsOptional() @IsString() menuPath?: string;
  @IsOptional() @IsString() component?: string;
  @IsOptional() @IsString() apiPattern?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsInt() status?: number;
}
