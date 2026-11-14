import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { diskStorage } from 'multer';
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
import { SUPER_ADMIN_ROLE_CODE, SUPER_ADMIN_USERNAME } from '@hb-oms/shared';
import { DatabaseOpsService } from './database-ops.service';
import { ApplyDatabaseOpsDto, StartDatabaseRestoreDto, StartDatabaseUpgradeDto } from './dto/database-ops.dto';
import { DatabaseRestoreService } from './database-restore.service';
import { DatabaseUpgradeService } from './database-upgrade.service';
import { DATABASE_UPGRADE_STATUS_HEADER } from './database-upgrade.constants';
import {
  DATABASE_RESTORE_MAX_UPLOAD_SIZE,
  DATABASE_RESTORE_STATUS_HEADER,
} from './database-restore.constants';

/**
 * 系统配置接口
 *   GET  /api/system/config             有权限的管理员或超级管理员读取完整配置
 *   PUT  /api/system/config             有权限的管理员或超级管理员更新配置
 *   GET  /api/system/config/features    业务字段开关（仅需登录，各业务页读取决定字段显隐）
 *   GET  /api/system/config/public      公开接口（登录页免登读取 logo + favicon + 默认背景）
 *   GET  /api/system/config/share-html  公开接口（分享爬虫抓取，实时 og/twitter meta）
 *   GET/POST/DELETE /api/system/config/screen-key  数据大屏免登录访问码：状态 / 生成或重置 / 关闭
 */
@Controller('system/config')
export class SystemConfigController {
  // 注：hb-mes 的审批管理（approval）按业务决策不移植——OMS 无审核流（设计文档决策 #2）
  constructor(
    private readonly service: SystemConfigService,
    private readonly databaseOps: DatabaseOpsService,
    private readonly databaseRestore: DatabaseRestoreService,
    private readonly databaseUpgrade: DatabaseUpgradeService,
  ) {}

  private assertSuperAdmin(user: CurrentUserPayload): void {
    if (
      user.username !== SUPER_ADMIN_USERNAME ||
      !user.roleCodes?.includes(SUPER_ADMIN_ROLE_CODE)
    ) {
      throw new ForbiddenException('仅超级管理员可执行此操作');
    }
  }

  /** 有权限的管理员或超级管理员读取完整配置 */
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

  /** 数据大屏免登录访问码：是否已开启（不回摘要） */
  @Get('screen-key')
  @RequirePermissions('system:config')
  getScreenKeyStatus() {
    return this.service.getScreenKeyStatus();
  }

  /** 生成 / 重置访问码：明文只在本次响应里出现一次，旧访问码立即失效 */
  @Post('screen-key')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '重置数据大屏访问码')
  regenerateScreenKey(@CurrentUser() user: CurrentUserPayload) {
    return this.service.regenerateScreenKey(user);
  }

  /** 关闭免登录访问 */
  @Delete('screen-key')
  @RequirePermissions('config:update')
  @OperationLog('系统管理', '关闭数据大屏免登录访问')
  disableScreenKey(@CurrentUser() user: CurrentUserPayload) {
    return this.service.disableScreenKey(user);
  }

  /**
   * 业务字段开关（订单/外发/期初/库存/台账各页据此决定字段显隐）。
   *
   * **刻意只要求登录、不挂菜单权限点**（§2.1 的跨页引用型只读接口）：录订单的人
   * 没有「系统配置」菜单，挂 system:config 会让所有业务页 403。返回的只是几个
   * 布尔开关，不含任何业务数据。
   */
  @Get('features')
  getFeatureFlags() {
    return this.service.getFeatureFlags();
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
    // 仅内置 admin 超级管理员账号可执行此操作（权限 + 身份双重校验）
    if (
      user.username !== SUPER_ADMIN_USERNAME ||
      !user.roleCodes?.includes(SUPER_ADMIN_ROLE_CODE)
    ) {
      throw new ForbiddenException('仅超级管理员可执行此操作');
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

  /** 数据库运维状态与版本信息（权限与内置账号身份双重校验）。 */
  @Get('database-ops/status')
  @RequirePermissions('system:danger')
  async getDatabaseOpsStatus(@CurrentUser() user: CurrentUserPayload) {
    this.assertSuperAdmin(user);
    const [status, upgrade] = await Promise.all([
      this.databaseOps.getStatus(),
      this.databaseUpgrade.getVersionInfo(false),
    ]);
    return { ...status, upgrade };
  }

  /** 刷新服务器软件源元数据并重新计算可安全升级的候选版本。 */
  @Post('database-ops/upgrade/check')
  @RequirePermissions('system:danger')
  @OperationLog('数据库运维', '检查数据库可用版本')
  refreshDatabaseUpgrade(@CurrentUser() user: CurrentUserPayload) {
    this.assertSuperAdmin(user);
    return this.databaseUpgrade.refreshVersionInfo();
  }

  /** 二次确认后启动独立的同系列数据库补丁升级任务。 */
  @Post('database-ops/upgrade/start')
  @RequirePermissions('system:danger')
  @OperationLog('数据库运维', '启动受控数据库升级', { redactBodyFields: ['confirm'] })
  startDatabaseUpgrade(
    @Body() dto: StartDatabaseUpgradeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertSuperAdmin(user);
    return this.databaseUpgrade.startUpgrade(dto.targetVersion, dto.confirm, user);
  }

  /** 升级期间无需数据库鉴权；使用一次性高熵请求头凭证读取固定任务状态。 */
  @Public()
  @Get('database-ops/upgrade/status/:jobId')
  getDatabaseUpgradeStatus(
    @Param('jobId') jobId: string,
    @Headers(DATABASE_UPGRADE_STATUS_HEADER) upgradeToken: string,
  ) {
    return this.databaseUpgrade.getStatus(jobId, upgradeToken);
  }

  /** 启用/停用固定白名单运维动作；不接受命令、脚本或服务器路径。 */
  @Post('database-ops/apply')
  @RequirePermissions('system:danger')
  @OperationLog('数据库运维', '切换数据库保护配置')
  applyDatabaseOps(
    @Body() dto: ApplyDatabaseOpsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertSuperAdmin(user);
    return this.databaseOps.apply(dto.action, dto.enabled !== false, dto.confirm);
  }

  /** 完整逻辑备份（结构 + 数据）写入临时文件，校验成功后流式下载并立即清理。 */
  @Post('database-ops/backup')
  @RequirePermissions('system:danger')
  @OperationLog('数据库运维', '完整备份数据库')
  @SkipTransform()
  async backupDatabase(
    @CurrentUser() user: CurrentUserPayload,
    @Res() response: Response,
  ) {
    this.assertSuperAdmin(user);
    await this.databaseOps.sendBackup(response);
  }

  /** 上传灾备文件并在服务器端完成签名、摘要、目标库、SQL 与备份时间点预检。 */
  @Post('database-ops/restore/inspect')
  @RequirePermissions('system:danger')
  @OperationLog('数据库运维', '预检数据库还原备份')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: tmpdir(),
      filename: (_request, _file, callback) => callback(null, `hb-oms-restore-${randomUUID()}.upload`),
    }),
    limits: { files: 1, fileSize: DATABASE_RESTORE_MAX_UPLOAD_SIZE },
  }))
  async inspectDatabaseRestore(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      this.assertSuperAdmin(user);
    } catch (error) {
      if (file?.path) await rm(file.path, { force: true }).catch(() => undefined);
      throw error;
    }
    return this.databaseRestore.inspectUpload(file);
  }

  /** 二次确认后启动独立后台恢复任务；请求返回后由维护闸门阻止所有业务读写。 */
  @Post('database-ops/restore/start')
  @RequirePermissions('system:danger')
  @OperationLog('数据库运维', '启动数据库灾备还原', { redactBodyFields: ['confirm'] })
  startDatabaseRestore(
    @Body() dto: StartDatabaseRestoreDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.assertSuperAdmin(user);
    return this.databaseRestore.startRestore(dto.uploadId, dto.confirm, user);
  }

  /** 恢复期间无需数据库鉴权；使用一次性高熵请求头凭证读取固定任务状态。 */
  @Public()
  @Get('database-ops/restore/status/:jobId')
  getDatabaseRestoreStatus(
    @Param('jobId') jobId: string,
    @Headers(DATABASE_RESTORE_STATUS_HEADER) restoreToken: string,
  ) {
    return this.databaseRestore.getStatus(jobId, restoreToken);
  }
}
