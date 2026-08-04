import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsNotEmpty({ message: '请输入姓名' })
  @IsString()
  @MaxLength(50)
  realName: string;

  @IsOptional()
  @IsIn([0, 1, 2], { message: '性别取值非法' })
  gender?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string;
}
