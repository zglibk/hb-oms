import { Module } from '@nestjs/common';
import { CaptchaController } from './captcha.controller';
import { CaptchaService } from './captcha.service';
import { CaptchaStoreService } from './captcha.store';

/**
 * 滑块验证码模块（零外部依赖：纯 SVG 生成 + 内存存储 + 内存限流）
 * 导出 CaptchaService 供 AuthModule 在登录流程中核销 verifyToken
 */
@Module({
  controllers: [CaptchaController],
  providers: [CaptchaService, CaptchaStoreService],
  exports: [CaptchaService],
})
export class CaptchaModule {}
