import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, posix, isAbsolute } from 'path';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { FileEntity } from './entities/file.entity';
import { NumberGeneratorService } from '../../common/services/number-generator.service';
import { sniffFileType, SniffedKind } from './file-type.util';

/** 允许上传的真实文件类型白名单（文档 19.5；安全审查 P1）
 * 判定依据为「文件内容魔数」而非客户端声明的 MIME；
 * SVG has executable XML features and is deliberately rejected rather than
 * sanitized with an incomplete regular-expression parser. */
const ALLOWED_KINDS: SniffedKind[] = [
  'jpeg',
  'png',
  'webp',
  'gif',
  'ico',
  'pdf',
];

@Injectable()
export class FileService {
  private readonly uploadRoot: string;
  private readonly maxImage: number;
  private readonly maxPdf: number;

  constructor(
    private readonly config: ConfigService,
    private readonly numberGen: NumberGeneratorService,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
  ) {
    // uploads 目录在 server 应用根目录下
    // UPLOAD_DIR 支持绝对路径（生产：/var/www/hb-mes/apps/server/uploads）
    // 或相对路径（开发：uploads，相对于 cwd）
    const uploadDirCfg = this.config.get<string>('UPLOAD_DIR') || 'uploads';
    this.uploadRoot = isAbsolute(uploadDirCfg)
      ? uploadDirCfg
      : join(process.cwd(), uploadDirCfg);
    this.maxImage = Number(this.config.get('MAX_IMAGE_SIZE')) || 10 * 1024 * 1024;
    this.maxPdf = Number(this.config.get('MAX_PDF_SIZE')) || 20 * 1024 * 1024;
  }

  /**
   * 保存上传文件：白名单+大小校验 → UUID 重命名 → 日期子目录 → 写库。
   * @returns 含相对路径(file_path)的文件记录
   */
  async save(
    file: Express.Multer.File,
    bizType: string,
    bizId: number | null,
    creatorId: number | null,
  ): Promise<FileEntity> {
    if (!file) throw new BadRequestException('未接收到文件');

    // 按文件内容嗅探真实类型：客户端 MIME 与原始扩展名均不可信
    // （伪装成 image/png 的 .html、内嵌脚本的 SVG 会造成同源存储型 XSS）
    const sniffed = sniffFileType(file.buffer);
    if (!ALLOWED_KINDS.includes(sniffed.kind)) {
      throw new BadRequestException(
        '文件类型不被允许，仅支持 JPG/PNG/WEBP/GIF/ICO 图片或 PDF 文件',
      );
    }

    const { isImage, isPdf } = sniffed;
    if (isImage && file.size > this.maxImage) {
      throw new BadRequestException('图片大小不能超过 10MB');
    }
    if (isPdf && file.size > this.maxPdf) {
      throw new BadRequestException('PDF 大小不能超过 20MB');
    }

    // 日期子目录 uploads/2026/06/30/
    const datePath = dayjs().format('YYYY/MM/DD');
    const absDir = join(this.uploadRoot, datePath);
    if (!existsSync(absDir)) {
      mkdirSync(absDir, { recursive: true });
    }

    // UUID 重命名 + 服务端派生扩展名，防路径遍历与扩展名伪装（文档 19.5）
    // 注意：绝不能沿用 originalname 的扩展名，否则可落地 .html/.js 等可执行文件
    const filename = `${uuidv4()}${sniffed.ext}`;
    const absFile = join(absDir, filename);
    writeFileSync(absFile, file.buffer);

    // 相对路径统一正斜杠（Windows/Linux 通用，文档 1.8.5）
    // 固定使用 'uploads' 作为前缀，与 UPLOAD_DIR 的绝对路径设置解耦：
    // 数据库存 'uploads/2026/07/06/xxx.png'，前端访问 '/uploads/...' 由 Nginx 静态托管
    const relPath = posix.join('uploads', datePath, filename);

    const fileNo = await this.numberGen.generate('FILE');
    const entity = this.fileRepo.create({
      fileNo,
      bizType,
      bizId,
      filePath: relPath,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: sniffed.mime, // 以服务端嗅探结果为准，不落库客户端声明值
      creatorId,
    });
    return this.fileRepo.save(entity);
  }
}
