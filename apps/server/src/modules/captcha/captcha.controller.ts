import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { VerifyCaptchaDto } from './dto/verify-captcha.dto';
import { Public } from '../../common/decorators/public.decorator';
import {
  RateLimitGuard,
  RateLimit,
} from '../../common/guards/rate-limit.guard';

/**
 * 滑块验证码接口（登录前调用，均为公开端点）
 *   GET  /api/captcha/slider   获取验证码（背景+滑块 SVG dataURL）
 *   POST /api/captcha/verify   校验滑动坐标，成功返回一次性 verifyToken
 *
 * 限流（进程内存滑动窗口，文档 20.6 技术债口径）：
 *   slider 20 次/分/IP —— 防恶意刷新消耗生成资源
 *   verify 10 次/分/IP —— 提升暴力试错成本
 *
 * 两个接口均不标 @OperationLog（§4.3 豁免）：登录前基础设施，无操作人可记，
 * 且每次登录都要调，记了全是噪音；恶意刷量由上面的限流应对。
 */
@Controller('captcha')
@UseGuards(RateLimitGuard)
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Public()
  @Get('slider')
  @RateLimit(20, 60)
  getSlider() {
    return this.captchaService.generate();
  }

  @Public()
  @Post('verify')
  @RateLimit(10, 60)
  verify(@Body() dto: VerifyCaptchaDto) {
    return this.captchaService.verify(dto.captchaId, dto.slideX);
  }
}
