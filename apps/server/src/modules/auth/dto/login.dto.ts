import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: '请输入账号' })
  @IsString()
  @MaxLength(64)
  username: string;

  @IsNotEmpty({ message: '请输入密码' })
  @IsString()
  @MaxLength(128)
  password: string;

  /** 滑块验证通过后签发的一次性凭证（/captcha/verify 返回） */
  @IsNotEmpty({ message: '请先完成滑块验证' })
  @IsString()
  @MaxLength(64)
  captchaToken: string;
}
