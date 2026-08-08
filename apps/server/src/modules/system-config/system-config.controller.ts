import { Body, Controller, Get, Post, Put, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { SystemConfigService } from './system-config.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

/**
 * 系统配置接口
 *   GET  /api/system/config             管理员读取完整配置
 *   PUT  /api/system/config             管理员更新配置
 *   GET  /api/system/config/public      公开接口（登录页免登读取 logo + favicon + 默认背景）
 *   GET  /api/system/config/share-html  公开接口（分享爬虫抓取，实时 og/twitter meta）
 */
@Controller('system/config')
export class SystemConfigController {
  // 注：hb-mes 的审批管理（approval）按业务决策不移植——OMS 无审核流（设计文档决策 #2）
  constructor(private readonly service: SystemConfigService) {}

  /** 管理员读取完整配置 */
  @Get()
  @RequirePermissions('system:config')
  get() {
    return this.service.get();
  }

  /** 更新配置 */
  @Put()
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '更新系统配置')
  update(
    @Body() dto: UpdateSystemConfigDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(dto, user);
  }

  /** 公开接口（登录页免登读取 logo + favicon + 默认背景） */
  @Public()
  @Get('public')
  getPublic() {
    return this.service.getPublic();
  }

  /**
   * 公开接口：渲染供社交分享爬虫抓取的 HTML（含实时系统配置的 og/twitter meta）
   * 由 Nginx 在检测到爬虫 UA 时转发到此端点，普通用户仍访问静态前端。
   */
  @Public()
  @SkipTransform()
  @Get('share-html')
  async getShareHtml(@Req() req: Request, @Res() res: Response) {
    // 优先用反代传入的协议/主机头拼接来源，兜底用请求本身
    const proto =
      (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
    const origin = `${proto}://${host}`;
    const html = await this.service.renderShareHtml(origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // 允许分享平台短时缓存，同时不至于长时间陈旧
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  }

  /**
   * 危险操作：清理业务测试数据
   * 仅 admin 角色可执行；订单数 > 50 时视为已正式使用，拒绝清理。
   * 前端需输入确认口令「清理」二次确认。
   */
  @Post('cleanup')
  @RequirePermissions('system:danger')
  @OperationLog('系统管理', '清理业务测试数据')
  async cleanup(@Body() body: { confirm?: string }, @CurrentUser() user: CurrentUserPayload) {
    // 仅 admin 角色可执行此操作（权限 + 角色双重校验）
    if (!user.roleCodes?.includes('admin')) {
      throw new (await import('@nestjs/common')).ForbiddenException('仅系统管理员可执行此操作');
    }
    const result = await this.service.cleanupBusinessData(
      { id: user.id, username: user.username, realName: user.realName },
      body.confirm ?? '',
    );
    return {
      ...result,
      message: `已清理 ${result.truncated.length} 张业务表，原订单数 ${result.orderCount}。系统配置与主数据已保留。`,
    };
  }
}
