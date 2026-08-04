import { IsNotEmpty, IsNumber, IsString, MaxLength } from 'class-validator';

export class VerifyCaptchaDto {
  @IsString()
  @IsNotEmpty({ message: '验证码ID不能为空' })
  @MaxLength(64)
  captchaId: string;

  @IsNumber({}, { message: '滑动坐标格式错误' })
  @IsNotEmpty({ message: '滑动坐标不能为空' })
  slideX: number;
}
