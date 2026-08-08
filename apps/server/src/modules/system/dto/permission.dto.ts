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
  /** 权限性质：0操作 1查看；不传则按「菜单=查看、按钮=操作」推导 */
  @IsOptional() @IsInt() accessType?: number;
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
  /** 权限性质：0操作 1查看 */
  @IsOptional() @IsInt() accessType?: number;
}
