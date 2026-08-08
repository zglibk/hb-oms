import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { auditDisplayName } from '../../common/utils/audit.util';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller('upload')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /** 通用文件上传（唛头/附件） */
  @Post()
  @OperationLog('文件管理', '上传文件')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('bizType') bizType: string,
    @Body('bizId') bizId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const saved = await this.fileService.save(
      file,
      bizType || 'common',
      bizId ? Number(bizId) : null,
      user.id,
      auditDisplayName(user) || null,
    );
    return { url: '/' + saved.filePath, fileNo: saved.fileNo, id: saved.id };
  }

  /** wangEditor 富文本图片上传（返回其约定格式，文档 1.8.5） */
  @SkipTransform()
  @Post('editor-image')
  @OperationLog('文件管理', '上传富文本图片')
  @UseInterceptors(FileInterceptor('file'))
  async editorImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const saved = await this.fileService.save(
      file,
      'editor_image',
      null,
      user.id,
      auditDisplayName(user) || null,
    );
    // wangEditor 自定义上传返回格式
    return {
      errno: 0,
      data: {
        url: '/' + saved.filePath,
        alt: saved.originalName,
        href: '/' + saved.filePath,
      },
    };
  }
}
