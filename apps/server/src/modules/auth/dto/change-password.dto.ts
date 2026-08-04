import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsNotEmpty({ message: '请输入原密码' })
  @IsString()
  oldPassword: string;

  @IsNotEmpty({ message: '请输入新密码' })
  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(128)
  newPassword: string;
}
