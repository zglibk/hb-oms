import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  RateLimitGuard,
  RateLimit,
} from '../../common/guards/rate-limit.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 登录：独立限流 5 次/分/IP（滑块设计文档进阶项4），配合账号锁定。
   * 不标 @OperationLog（§4.3 豁免）：拦截器从 JWT 取操作人，登录前拿不到；
   * 登录成败已由用户表的成功/失败计数簿记（§5.5），再记一遍是重复账。
   */
  @Public()
  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit(5, 60)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  /** 刷新 token：不标 @OperationLog（§4.3 豁免）——纯 token 机械动作，每 401 自动触发，记了全是噪音 */
  @Public()
  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @OperationLog('系统认证', '退出登录')
  logout(@Req() req: Request) {
    return this.authService.logout((req as any).tokenJti);
  }

  /** 获取当前用户信息 + 权限 + 菜单 */
  @Get('profile')
  profile(@CurrentUser('id') userId: number) {
    return this.authService.getProfile(userId);
  }

  /** 个人中心自助更新（姓名/手机/备注/头像） */
  @Put('profile')
  @OperationLog('个人中心', '更新个人资料')
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  // 密码字段由 serializeLogParams 统一脱敏（oldPassword/newPassword → ***）
  @Post('change-password')
  @OperationLog('个人中心', '修改密码')
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }
}
