import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { sendXlsx } from '../../common/utils/excel-response.util';
import {
  AckAnnouncementDto,
  CreateAnnouncementReplyDto,
  PublishAnnouncementDto,
  QueryAnnouncementAdminDto,
  QueryAnnouncementHistoryDto,
  QueryAnnouncementReplyDto,
  SaveAnnouncementDraftDto,
} from './dto/announcement.dto';
import { AnnouncementService } from './announcement.service';
import { AnnouncementStreamService } from './announcement-stream.service';

@Controller('announcement')
export class AnnouncementController {
  constructor(
    private readonly service: AnnouncementService,
    private readonly stream: AnnouncementStreamService,
  ) {}

  @Get('pending')
  pending(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findPending(user);
  }

  @Get('history')
  history(@Query() query: QueryAnnouncementHistoryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findHistory(query, user);
  }

  @Get('stream')
  @SkipTransform()
  streamEvents(@CurrentUser() user: CurrentUserPayload, @Res() response: Response): void {
    this.stream.register(user.id, response);
  }

  @Post('ack')
  ack(@Body() dto: AckAnnouncementDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.ack(dto, user);
  }

  @Get('admin')
  @RequirePermissions('system:announcement')
  adminList(@Query() query: QueryAnnouncementAdminDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findAdminList(query, user);
  }

  @Post('admin')
  @RequirePermissions('announcement:create')
  @OperationLog('通知公告', '新建草稿')
  createDraft(@Body() dto: SaveAnnouncementDraftDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createDraft(dto, user);
  }

  @Put('admin/:id')
  @RequirePermissions('announcement:update')
  @OperationLog('通知公告', '修改草稿')
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveAnnouncementDraftDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateDraft(id, dto, user);
  }

  @Delete('admin/:id')
  @RequirePermissions('announcement:delete')
  @OperationLog('通知公告', '删除草稿')
  deleteDraft(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteDraft(id, user);
  }

  @Post('admin/:id/publish')
  @RequirePermissions('announcement:publish')
  @OperationLog('通知公告', '发布')
  publish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PublishAnnouncementDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.publish(id, dto, user);
  }

  @Post('admin/:id/withdraw')
  @RequirePermissions('announcement:withdraw')
  @OperationLog('通知公告', '撤回')
  withdraw(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.withdraw(id, user);
  }

  @Get('admin/:id/view-records')
  @RequirePermissions('system:announcement')
  viewRecords(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findViewRecords(id, user);
  }

  @Get('admin/:id/replies/export-count')
  @RequirePermissions('announcement:export')
  replyExportCount(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.replyExportCount(id, user);
  }

  @Get('admin/:id/replies/export')
  @RequirePermissions('announcement:export')
  @OperationLog('通知公告', '导出回复')
  @SkipTransform()
  async exportReplies(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserPayload,
    @Res() response: Response,
  ) {
    const result = await this.service.exportReplies(id, user);
    sendXlsx(response, result.buffer, `通知公告回复_${result.title}.xlsx`);
  }

  @Get(':id/replies')
  replies(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryAnnouncementReplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findReplies(id, query, user);
  }

  @Post(':id/replies')
  @OperationLog('通知公告', '追加回复', { redactBodyFields: ['content'] })
  createReply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAnnouncementReplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createReply(id, dto, user);
  }

  @Post(':id/view')
  view(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markViewed(id, user);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findDetail(id, user);
  }
}
