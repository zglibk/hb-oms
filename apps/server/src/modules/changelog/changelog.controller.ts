import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ChangelogService } from './changelog.service';
import { SaveChangelogDto } from './dto/save-changelog.dto';
import { MarkChangelogSeenDto } from './dto/mark-changelog-seen.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/**
 * 更新日志接口
 *   GET    /api/changelog        前台公开查询（登录即可访问，仅启用记录）
 *   GET    /api/changelog/unseen 本人未读的更新（首页弹窗，登录即可）
 *   POST   /api/changelog/seen   登记已读（首页弹窗关闭时，登录即可）
 *   GET    /api/changelog/all    后台管理查询（需 system:changelog 权限，全部记录）
 *   POST   /api/changelog        新增（需 changelog:create）
 *   PUT    /api/changelog/:id    修改（需 changelog:update）
 *   DELETE /api/changelog/:id    删除（需 changelog:delete）
 */
@Controller('changelog')
export class ChangelogController {
  constructor(private readonly service: ChangelogService) {}

  /** 前台展示：登录即可访问，不加 @RequirePermissions */
  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** 首页「系统更新」弹窗：本人未读的启用记录（登录即可，与前台展示同口径） */
  @Get('unseen')
  findUnseen(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findUnseen(user.id);
  }

  /**
   * 登记已读。不标 @OperationLog（§4.3 豁免）：每人每次发布关一次弹窗的系统簿记，
   * 不是业务数据变更，记了全是噪音。
   */
  @Post('seen')
  markSeen(
    @Body() dto: MarkChangelogSeenDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.markSeen(user.id, dto.id);
  }

  /** 后台管理：全部记录 */
  @Get('all')
  @RequirePermissions('system:changelog')
  findAllForAdmin() {
    return this.service.findAllForAdmin();
  }

  @Post()
  @RequirePermissions('changelog:create')
  @OperationLog('更新日志', '新增版本')
  create(
    @Body() dto: SaveChangelogDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermissions('changelog:update')
  @OperationLog('更新日志', '修改版本')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveChangelogDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('changelog:delete')
  @OperationLog('更新日志', '删除版本')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
