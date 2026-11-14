import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditDisplayName } from '../../common/utils/audit.util';
import { businessDateTime } from '../../common/utils/date-range.util';
import {
  assertCompletionTimesConsistent,
  extractAndVerifySignedBackup,
  inspectGzipSqlDump,
  isSignedBackupPackage,
} from './database-backup-format';
import {
  DATABASE_RESTORE_JOB_ROOT,
  DATABASE_RESTORE_MAINTENANCE_PATH,
  DATABASE_RESTORE_UPLOAD_ROOT,
  DATABASE_RESTORE_UPLOAD_TTL_MS,
} from './database-restore.constants';

const execFileAsync = promisify(execFile);
const TERMINAL_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RestoreInspection {
  uploadId: string;
  filename: string;
  fileSize: number;
  databaseName: string;
  backupTime: string;
  dumpCompletedAt: string;
  format: 'signed' | 'legacy';
  signatureVerified: boolean;
  expiresAt: string;
  warnings: string[];
}

export interface RestoreJobPublicState {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'critical';
  stage: string;
  message: string;
  progress: number;
  backupTime: string;
  backupFormat: 'signed' | 'legacy';
  originalFilename: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  rollbackSucceeded?: boolean;
}

interface RestoreUploadMetadata extends RestoreInspection {
  createdAtEpoch: number;
  expiresAtEpoch: number;
}

interface RestoreJobState extends RestoreJobPublicState {
  tokenHash: string;
}

@Injectable()
export class DatabaseRestoreService {
  constructor(private readonly config: ConfigService) {}

  private get databaseName(): string {
    const name = this.config.get<string>('DB_NAME')?.trim();
    if (!name || !/^[A-Za-z0-9_$-]+$/.test(name)) {
      throw new InternalServerErrorException('数据库名称配置无效，无法执行灾备还原');
    }
    return name;
  }

  private get signingKey(): string {
    const key = this.config.get<string>('DB_BACKUP_SIGNING_KEY')?.trim();
    if (!key || key.length < 32) {
      throw new InternalServerErrorException('数据库备份签名密钥未配置或长度不足，无法校验灾备文件');
    }
    return key;
  }

  private assertSupported(): void {
    if (process.platform !== 'linux' || (typeof process.getuid === 'function' && process.getuid() !== 0)) {
      throw new BadRequestException('数据库灾备还原仅能在具备系统管理权限的 Linux 生产服务器执行');
    }
  }

  private mysqlOption(value: string): string {
    if (/\r|\n/.test(value)) throw new InternalServerErrorException('数据库连接配置包含非法换行');
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private mysqlCredentialContent(): string {
    const port = String(Number(this.config.get('DB_PORT')) || 3306);
    return [
      '[client]',
      `user=${this.mysqlOption(this.config.get<string>('DB_USER') || '')}`,
      `password=${this.mysqlOption(this.config.get<string>('DB_PASSWORD') || '')}`,
      `host=${this.mysqlOption(this.config.get<string>('DB_HOST') || '127.0.0.1')}`,
      `port=${port}`,
      'protocol=tcp',
      '',
    ].join('\n');
  }

  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, path);
  }

  private safeFilename(value: string): string {
    const name = [...basename(value || 'database-backup')]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .slice(0, 180);
    return name || 'database-backup';
  }

  private legacyStartTime(filename: string): string {
    const escapedDb = this.databaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^${escapedDb}_full_(\\d{14})\\.sql\\.gz$`, 'i').exec(filename);
    if (!match) {
      throw new BadRequestException(
        `旧版备份文件名必须符合 ${this.databaseName}_full_YYYYMMDDHHmmss.sql.gz，无法仅凭任意 .sql.gz 执行还原`,
      );
    }
    const stamp = match[1];
    return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ` +
      `${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}`;
  }

  private async copyThenRemove(source: string, destination: string): Promise<void> {
    try {
      await rename(source, destination);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
      await copyFile(source, destination);
      await rm(source, { force: true });
    }
    await chmod(destination, 0o600);
  }

  private async findCommand(command: string): Promise<string> {
    try {
      const result = await execFileAsync('which', [command], { timeout: 8_000, windowsHide: true });
      const path = String(result.stdout || '').trim();
      if (!path.startsWith('/')) throw new Error('not absolute');
      return path;
    } catch {
      throw new BadRequestException(`生产服务器缺少 ${command}，无法安全执行数据库还原`);
    }
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    await mkdir(DATABASE_RESTORE_UPLOAD_ROOT, { recursive: true, mode: 0o700 });
    await mkdir(DATABASE_RESTORE_JOB_ROOT, { recursive: true, mode: 0o700 });
    const uploads: Dirent[] = await readdir(DATABASE_RESTORE_UPLOAD_ROOT, { withFileTypes: true }).catch(() => []);
    await Promise.all(uploads.filter((item) => item.isDirectory()).map(async (item) => {
      const path = join(DATABASE_RESTORE_UPLOAD_ROOT, item.name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > DATABASE_RESTORE_UPLOAD_TTL_MS) {
        await rm(path, { recursive: true, force: true });
      }
    }));
    const jobs: Dirent[] = await readdir(DATABASE_RESTORE_JOB_ROOT, { withFileTypes: true }).catch(() => []);
    await Promise.all(jobs.filter((item) => item.isDirectory()).map(async (item) => {
      const path = join(DATABASE_RESTORE_JOB_ROOT, item.name);
      const statePath = join(path, 'state.json');
      const info = await stat(statePath).catch(() => null);
      if (!info || now - info.mtimeMs <= TERMINAL_JOB_TTL_MS) return;
      try {
        const state = JSON.parse(await readFile(statePath, 'utf8')) as RestoreJobState;
        if (['succeeded', 'failed'].includes(state.status)) {
          await rm(path, { recursive: true, force: true });
        }
      } catch { /* 状态不明的目录不自动删除，留给人工核查。 */ }
    }));
  }

  async inspectUpload(file: Express.Multer.File): Promise<RestoreInspection> {
    this.assertSupported();
    if (!file?.path || !file.size) throw new BadRequestException('请选择完整数据库备份文件');
    await this.cleanupExpired();
    const uploadId = randomUUID();
    const uploadDir = join(DATABASE_RESTORE_UPLOAD_ROOT, uploadId);
    const sourcePath = join(uploadDir, 'source.upload');
    const dumpPath = join(uploadDir, 'restore.sql.gz');
    const filename = this.safeFilename(file.originalname);
    await mkdir(uploadDir, { recursive: false, mode: 0o700 });
    try {
      await this.copyThenRemove(file.path, sourcePath);
      let format: 'signed' | 'legacy';
      let signatureVerified = false;
      let backupTime: string;
      let dumpCompletedAt: string;
      const warnings: string[] = [];

      if (await isSignedBackupPackage(sourcePath)) {
        format = 'signed';
        const manifest = await extractAndVerifySignedBackup(
          sourcePath,
          dumpPath,
          this.signingKey,
          this.databaseName,
        );
        const dump = await inspectGzipSqlDump(dumpPath, this.databaseName);
        assertCompletionTimesConsistent(manifest.backupCompletedAt, dump.completedAt, 24 * 60 * 60 * 1000);
        const startedMs = Date.parse(`${manifest.backupStartedAt.replace(' ', 'T')}+08:00`);
        const dumpCompletedMs = Date.parse(`${dump.completedAt.replace(' ', 'T')}+08:00`);
        if (!Number.isFinite(startedMs) || dumpCompletedMs < startedMs) {
          throw new BadRequestException('备份签名中的开始时间晚于 SQL 转储完成时间，已拒绝还原');
        }
        signatureVerified = true;
        backupTime = manifest.backupCompletedAt;
        dumpCompletedAt = dump.completedAt;
        await rm(sourcePath, { force: true });
      } else {
        format = 'legacy';
        const filenameStart = this.legacyStartTime(filename);
        await rename(sourcePath, dumpPath);
        const dump = await inspectGzipSqlDump(dumpPath, this.databaseName);
        const startMs = Date.parse(`${filenameStart.replace(' ', 'T')}+08:00`);
        const completeMs = Date.parse(`${dump.completedAt.replace(' ', 'T')}+08:00`);
        if (!Number.isFinite(startMs) || !Number.isFinite(completeMs) || completeMs < startMs || completeMs - startMs > 24 * 60 * 60 * 1000) {
          throw new BadRequestException('旧版备份文件名时间与 SQL 转储完成时间不一致，已拒绝还原');
        }
        backupTime = dump.completedAt;
        dumpCompletedAt = dump.completedAt;
        warnings.push('这是旧版无签名 .sql.gz 备份；系统已完成文件名、目标库、SQL 完整性和转储完成时间交叉校验。');
      }

      const now = Date.now();
      const expiresAtEpoch = now + DATABASE_RESTORE_UPLOAD_TTL_MS;
      const metadata: RestoreUploadMetadata = {
        uploadId,
        filename,
        fileSize: file.size,
        databaseName: this.databaseName,
        backupTime,
        dumpCompletedAt,
        format,
        signatureVerified,
        expiresAt: businessDateTime(new Date(expiresAtEpoch)),
        warnings,
        createdAtEpoch: now,
        expiresAtEpoch,
      };
      await this.writeJsonAtomic(join(uploadDir, 'metadata.json'), metadata);
      return metadata;
    } catch (error) {
      await rm(uploadDir, { recursive: true, force: true });
      await rm(file.path, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async startRestore(
    uploadId: string,
    confirm: string,
    user: CurrentUserPayload,
  ): Promise<{
    jobId: string;
    restoreToken: string;
    backupTime: string;
    backupFormat: 'signed' | 'legacy';
    originalFilename: string;
  }> {
    this.assertSupported();
    if (confirm !== '还原数据库') throw new BadRequestException('请输入正确的确认口令“还原数据库”');
    if (!/^[a-f0-9-]{36}$/i.test(uploadId)) throw new BadRequestException('上传校验编号无效');
    await this.cleanupExpired();
    const uploadDir = join(DATABASE_RESTORE_UPLOAD_ROOT, uploadId);
    let metadata: RestoreUploadMetadata;
    try {
      metadata = JSON.parse(await readFile(join(uploadDir, 'metadata.json'), 'utf8'));
    } catch {
      throw new NotFoundException('已校验的备份文件不存在或已过期，请重新上传');
    }
    if (metadata.uploadId !== uploadId || metadata.expiresAtEpoch < Date.now()) {
      await rm(uploadDir, { recursive: true, force: true });
      throw new BadRequestException('备份文件校验结果已过期，请重新上传');
    }
    if (metadata.databaseName !== this.databaseName) {
      throw new BadRequestException('备份目标数据库与当前配置不一致');
    }
    await stat(join(uploadDir, 'restore.sql.gz')).catch(() => {
      throw new NotFoundException('已校验的备份数据不存在，请重新上传');
    });

    const [mysqlPath, mysqldumpPath, pnpmPath, pm2Path, systemdRunPath] = await Promise.all([
      this.findCommand('mysql'), this.findCommand('mysqldump'), this.findCommand('pnpm'),
      this.findCommand('pm2'), this.findCommand('systemd-run'),
    ]);
    const jobId = randomUUID();
    const restoreToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(restoreToken).digest('hex');
    const jobDir = join(DATABASE_RESTORE_JOB_ROOT, jobId);
    const appRoot = (this.config.get<string>('OMS_APP_ROOT') || '/var/www/hb-oms/app').trim();
    const serverRoot = join(appRoot, 'apps/server');
    const startedAt = businessDateTime(new Date());

    try {
      await writeFile(DATABASE_RESTORE_MAINTENANCE_PATH, JSON.stringify({ operation: 'restore', jobId, startedAt }), {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      });
    } catch (error: any) {
      if (error?.code === 'EEXIST') throw new ConflictException('已有数据库维护任务正在执行，请先等待其完成');
      throw error;
    }

    try {
      await rename(uploadDir, jobDir);
      await writeFile(join(jobDir, 'client.cnf'), this.mysqlCredentialContent(), { encoding: 'utf8', mode: 0o600 });
      const job = {
        jobId,
        databaseName: this.databaseName,
        appRoot,
        serverRoot,
        mysqlPath,
        mysqldumpPath,
        pnpmPath,
        pm2Path,
        pm2Name: 'hb-oms-server',
        backupTime: metadata.backupTime,
        backupFormat: metadata.format,
        originalFilename: metadata.filename,
        operatorId: user.id ?? null,
        operatorName: auditDisplayName(user) || '超级管理员',
      };
      const state: RestoreJobState = {
        jobId,
        tokenHash,
        status: 'queued',
        stage: 'queued',
        message: '还原任务已进入安全执行队列',
        progress: 2,
        backupTime: metadata.backupTime,
        backupFormat: metadata.format,
        originalFilename: metadata.filename,
        startedAt,
        updatedAt: startedAt,
      };
      await this.writeJsonAtomic(join(jobDir, 'job.json'), job);
      await this.writeJsonAtomic(join(jobDir, 'state.json'), state);
      await rm(join(jobDir, 'metadata.json'), { force: true });

      const workerPath = join(__dirname, 'database-restore.worker.js');
      const unit = `hb-oms-db-restore-${jobId.replace(/-/g, '')}`;
      await execFileAsync(systemdRunPath, [
        `--unit=${unit}`,
        '--collect',
        '--property=Type=exec',
        process.execPath,
        workerPath,
        jobId,
      ], { timeout: 15_000, windowsHide: true, maxBuffer: 1024 * 1024 });
      return {
        jobId,
        restoreToken,
        backupTime: metadata.backupTime,
        backupFormat: metadata.format,
        originalFilename: metadata.filename,
      };
    } catch (error: any) {
      await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
      throw new InternalServerErrorException(`数据库还原任务启动失败：${String(error?.stderr || error?.message || error).slice(0, 500)}`);
    }
  }

  async getStatus(jobId: string, restoreToken: string): Promise<RestoreJobPublicState> {
    if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new NotFoundException('还原任务不存在');
    if (!restoreToken) throw new UnauthorizedException('缺少还原进度访问凭证');
    let state: RestoreJobState;
    try {
      state = JSON.parse(await readFile(join(DATABASE_RESTORE_JOB_ROOT, jobId, 'state.json'), 'utf8'));
    } catch {
      throw new NotFoundException('还原任务不存在或状态保留期已结束');
    }
    const actual = createHash('sha256').update(restoreToken).digest();
    const expected = Buffer.from(state.tokenHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('还原进度访问凭证无效');
    }
    const { tokenHash: _tokenHash, ...publicState } = state;
    return publicState;
  }
}
