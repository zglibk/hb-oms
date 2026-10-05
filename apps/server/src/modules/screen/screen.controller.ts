import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { ScreenService } from './screen.service';
import { QueryScreenDto } from './dto/query-screen.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SystemConfigService } from '../system-config/system-config.service';

/**
 * 数据可视化大屏（只读，两个入口返回完全相同的数据）
 *   GET /api/screen/data         后台入口：登录 + `stat:screen`
 *   GET /api/screen/public-data  车间电视免登录：请求头 `X-Screen-Key` 携带访问码
 *
 * 只读查询，按 §4.3 不标 `@OperationLog`。
 */
@Controller('screen')
export class ScreenController {
  constructor(
    private readonly service: ScreenService,
    private readonly config: SystemConfigService,
  ) {}

  @Get('data')
  @RequirePermissions('stat:screen')
  data(@Query() q: QueryScreenDto) {
    return this.service.load(q.from, q.to);
  }

  /**
   * 免登录入口：访问码由管理员在「系统配置 → 数据大屏」生成（库里只存摘要）。
   * 走请求头而不是查询串——查询串会进 Nginx access log。
   * 未开启与访问码错误给同一句提示，不暴露「是否开启了免登录」。
   */
  @Public()
  @Get('public-data')
  async publicData(@Headers('x-screen-key') key: string | undefined, @Query() q: QueryScreenDto) {
    if (!(await this.config.verifyScreenKey(key))) {
      throw new UnauthorizedException('大屏访问码无效或已停用，请联系管理员');
    }
    return this.service.load(q.from, q.to);
  }
}
