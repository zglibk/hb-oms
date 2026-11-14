import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { auditDisplayName } from '../../common/utils/audit.util';
import { businessDateTime } from '../../common/utils/date-range.util';
import { DatabaseOpsService } from './database-ops.service';
import {
  DATABASE_UPGRADE_JOB_ROOT,
  DATABASE_UPGRADE_JOB_TTL_MS,
} from './database-upgrade.constants';
import { DATABASE_RESTORE_MAINTENANCE_PATH } from './database-restore.constants';

const execFileAsync = promisify(execFile);
const MYSQL_SERVER_PACKAGES = [
  'mysql-server',
  'mysql-community-server',
  'mysql-server-8.4',
  'mysql-server-8.0',
] as const;

export interface DatabaseUpgradeInfo {
  supported: boolean;
  runtimeVersion: string;
  packageName: string;
  installedVersion: string;
  candidateVersion: string;
  currentSeries: string;
  candidateSeries: string;
  checkedAt: string;
  repositoryUpdatedAt: string;
  updateAvailable: boolean;
  sameSeries: boolean;
  canUpgrade: boolean;
  reason: string;
}

export interface DatabaseUpgradeJobPublicState {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'critical';
  stage: string;
  message: string;
  progress: number;
  packageName: string;
  fromVersion: string;
  targetVersion: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  runtimeVersion?: string;
  safetyBackupFilename?: string;
}

interface DatabaseUpgradeJobState extends DatabaseUpgradeJobPublicState {
  tokenHash: string;
}

@Injectable()
export class DatabaseUpgradeService {
  private refreshing = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly databaseOps: DatabaseOpsService,
  ) {}

  private canManageSystem(): boolean {
    return process.platform === 'linux'
      && (typeof process.getuid !== 'function' || process.getuid() === 0);
  }

  private async run(
    command: string,
    args: string[],
    timeout = 30_000,
  ): Promise<string> {
    const result = await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    return String(result.stdout || '').trim();
  }

  private async findCommand(command: string): Promise<string> {
    try {
      const result = await this.run('which', [command], 8_000);
      if (!result.startsWith('/')) throw new Error('not absolute');
      return result;
    } catch {
      throw new BadRequestException(`生产服务器缺少 ${command}，无法安全执行数据库升级`);
    }
  }

  private seriesOf(version: string): string {
    const match = /^(?:\d+:)?(\d+)\.(\d+)/.exec(version.trim());
    return match ? `${match[1]}.${match[2]}` : '';
  }

  private async runtimeVersion(): Promise<string> {
    try {
      const rows = await this.dataSource.query('SELECT VERSION() AS version');
      return String(rows?.[0]?.version || '').trim() || '未知';
    } catch {
      return '未知';
    }
  }

  private async installedServerPackage(): Promise<{ name: string; version: string } | null> {
    const output = await this.run('dpkg-query', [
      '-W',
      '-f=${binary:Package}\t${Version}\t${db:Status-Abbrev}\n',
    ]);
    const packages = new Map<string, string>();
    for (const line of output.split('\n')) {
      const [binaryName = '', version = '', status = ''] = line.split('\t');
      if (!status.startsWith('ii')) continue;
      const name = binaryName.replace(/:[A-Za-z0-9_-]+$/, '');
      if ((MYSQL_SERVER_PACKAGES as readonly string[]).includes(name)) packages.set(name, version);
    }
    for (const name of MYSQL_SERVER_PACKAGES) {
      const version = packages.get(name);
      if (version) return { name, version };
    }
    return null;
  }

  private async candidateOf(packageName: string): Promise<string> {
    const output = await this.run('apt-cache', ['policy', packageName]);
    return /^\s*Candidate:\s*(\S+)\s*$/m.exec(output)?.[1] || '';
  }

  private async versionIsNewer(installed: string, candidate: string): Promise<boolean> {
    try {
      await this.run('dpkg', ['--compare-versions', installed, 'lt', candidate], 8_000);
      return true;
    } catch (error: any) {
      if (Number(error?.code) === 1) return false;
      throw error;
    }
  }

  private async repositoryUpdatedAt(): Promise<string> {
    try {
      const root = '/var/lib/apt/lists';
      const entries = await readdir(root, { withFileTypes: true });
      let latest = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const info = await stat(join(root, entry.name));
        latest = Math.max(latest, info.mtimeMs);
      }
      return latest ? businessDateTime(new Date(latest)) : '未知';
    } catch {
      return '未知';
    }
  }

  private async maintenanceActive(): Promise<boolean> {
    try {
      await stat(DATABASE_RESTORE_MAINTENANCE_PATH);
      return true;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async getVersionInfo(refreshRepository = false): Promise<DatabaseUpgradeInfo> {
    const runtimeVersion = await this.runtimeVersion();
    const checkedAt = businessDateTime(new Date());
    const supported = this.canManageSystem();
    if (!supported) {
      return {
        supported: false,
        runtimeVersion,
        packageName: '—', installedVersion: '—', candidateVersion: '—',
        currentSeries: this.seriesOf(runtimeVersion), candidateSeries: '',
        checkedAt, repositoryUpdatedAt: '未知', updateAvailable: false,
        sameSeries: false, canUpgrade: false,
        reason: '版本检查与升级仅支持具备系统管理权限的 Linux 生产服务器',
      };
    }

    if (refreshRepository) {
      if (this.refreshing) throw new ConflictException('软件源正在刷新，请稍后查看结果');
      if (await this.maintenanceActive()) throw new ConflictException('已有数据库维护任务正在执行，暂不能刷新软件源');
      this.refreshing = true;
      try {
        await this.run('apt-get', ['update'], 10 * 60 * 1000);
      } catch (error: any) {
        throw new BadRequestException(`刷新服务器软件源失败：${String(error?.stderr || error?.message || error).replace(/\s+/g, ' ').slice(0, 500)}`);
      } finally {
        this.refreshing = false;
      }
    }

    let installed: { name: string; version: string } | null = null;
    try {
      installed = await this.installedServerPackage();
    } catch {
      // 下方统一给出“未识别安装包”，避免状态页整体失败。
    }
    if (!installed) {
      return {
        supported: true,
        runtimeVersion,
        packageName: '未识别', installedVersion: '未知', candidateVersion: '未知',
        currentSeries: this.seriesOf(runtimeVersion), candidateSeries: '',
        checkedAt, repositoryUpdatedAt: await this.repositoryUpdatedAt(), updateAvailable: false,
        sameSeries: false, canUpgrade: false,
        reason: '未识别受支持的 MySQL Server 安装包，禁止从页面升级',
      };
    }

    const candidateVersion = await this.candidateOf(installed.name).catch(() => '');
    const currentSeries = this.seriesOf(runtimeVersion) || this.seriesOf(installed.version);
    const candidateSeries = this.seriesOf(candidateVersion);
    const updateAvailable = !!candidateVersion && candidateVersion !== '(none)'
      && await this.versionIsNewer(installed.version, candidateVersion).catch(() => false);
    const sameSeries = !!currentSeries && currentSeries === candidateSeries;
    let reason = '当前安装包已是服务器软件源中的可用版本';
    if (!candidateVersion || candidateVersion === '(none)') reason = '当前服务器软件源未提供该 MySQL 安装包候选版本';
    else if (updateAvailable && !sameSeries) reason = `候选版本属于 ${candidateSeries || '未知'} 系列，跨系列升级须专项评估`;
    else if (updateAvailable) reason = `检测到同系列可用更新 ${candidateVersion}`;

    return {
      supported: true,
      runtimeVersion,
      packageName: installed.name,
      installedVersion: installed.version,
      candidateVersion: candidateVersion && candidateVersion !== '(none)' ? candidateVersion : '—',
      currentSeries,
      candidateSeries,
      checkedAt,
      repositoryUpdatedAt: await this.repositoryUpdatedAt(),
      updateAvailable,
      sameSeries,
      canUpgrade: updateAvailable && sameSeries,
      reason,
    };
  }

  async refreshVersionInfo(): Promise<DatabaseUpgradeInfo> {
    return this.getVersionInfo(true);
  }

  private async availableDiskBytes(): Promise<number> {
    const output = await this.run('df', ['-Pk', '/var/lib/mysql']);
    const line = output.split('\n').filter(Boolean).at(-1) || '';
    const fields = line.trim().split(/\s+/);
    const availableKiB = Number(fields[3]);
    if (!Number.isFinite(availableKiB)) throw new BadRequestException('无法读取数据库磁盘剩余空间');
    return availableKiB * 1024;
  }

  private async requiredDiskBytes(): Promise<number> {
    const rows = await this.dataSource.query(
      'SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables',
    );
    const databaseBytes = Number(rows?.[0]?.bytes || 0);
    return Math.max(2 * 1024 ** 3, databaseBytes * 2 + 512 * 1024 ** 2);
  }

  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, path);
  }

  private async cleanupExpired(): Promise<void> {
    await mkdir(DATABASE_UPGRADE_JOB_ROOT, { recursive: true, mode: 0o700 });
    const entries = await readdir(DATABASE_UPGRADE_JOB_ROOT, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(DATABASE_UPGRADE_JOB_ROOT, entry.name);
      try {
        const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')) as DatabaseUpgradeJobState;
        if (!state.completedAt) continue;
        const completed = Date.parse(state.completedAt.replace(' ', 'T') + '+08:00');
        if (Number.isFinite(completed) && now - completed > DATABASE_UPGRADE_JOB_TTL_MS) {
          await rm(dir, { recursive: true, force: true });
        }
      } catch {
        // 不删除无法识别的目录，避免误清理人工放置文件。
      }
    }
  }

  async startUpgrade(
    targetVersion: string,
    confirm: string,
    user: CurrentUserPayload,
  ): Promise<{ jobId: string; upgradeToken: string; fromVersion: string; targetVersion: string; packageName: string }> {
    if (!this.canManageSystem()) throw new BadRequestException('数据库升级仅能在具备系统管理权限的 Linux 生产服务器执行');
    if (confirm !== '升级数据库') throw new BadRequestException('请输入正确的确认口令“升级数据库”');
    await this.cleanupExpired();
    const version = await this.getVersionInfo(false);
    if (!version.canUpgrade) throw new BadRequestException(version.reason);
    if (version.candidateVersion !== targetVersion) {
      throw new ConflictException(`软件源候选版本已变化（当前为 ${version.candidateVersion}），请重新检查并确认`);
    }
    const [available, required] = await Promise.all([this.availableDiskBytes(), this.requiredDiskBytes()]);
    if (available < required) {
      throw new BadRequestException(`数据库所在磁盘可用空间不足；至少需要 ${(required / 1024 ** 3).toFixed(1)} GiB，当前 ${(available / 1024 ** 3).toFixed(1)} GiB`);
    }

    const commandNames = ['mysql', 'mysqldump', 'mysqlcheck', 'apt-get', 'apt-cache', 'dpkg-query', 'systemd-run', 'fuser', 'rm'] as const;
    const commandPaths = await Promise.all(commandNames.map((name) => this.findCommand(name)));
    const commands = Object.fromEntries(commandNames.map((name, index) => [name.replace('-', ''), commandPaths[index]]));
    const signingKey = this.config.get<string>('DB_BACKUP_SIGNING_KEY')?.trim();
    if (!signingKey || signingKey.length < 32) throw new BadRequestException('数据库备份签名密钥未配置或长度不足，不能在升级前生成安全备份');

    const jobId = randomUUID();
    const upgradeToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(upgradeToken).digest('hex');
    const jobDir = join(DATABASE_UPGRADE_JOB_ROOT, jobId);
    const startedAt = businessDateTime(new Date());
    await mkdir(jobDir, { recursive: false, mode: 0o700 });
    try {
      await writeFile(DATABASE_RESTORE_MAINTENANCE_PATH, JSON.stringify({ operation: 'upgrade', jobId, startedAt }), {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      });
    } catch (error: any) {
      await rm(jobDir, { recursive: true, force: true });
      if (error?.code === 'EEXIST') throw new ConflictException('已有数据库维护任务正在执行，请先等待其完成');
      throw error;
    }

    try {
      await writeFile(join(jobDir, 'client.cnf'), this.databaseOps.createMysqlCredentialContent(), { encoding: 'utf8', mode: 0o600 });
      await writeFile(join(jobDir, 'signing.key'), signingKey, { encoding: 'utf8', mode: 0o600 });
      const job = {
        jobId,
        databaseName: this.databaseOps.databaseName,
        packageName: version.packageName,
        fromVersion: version.installedVersion,
        targetVersion,
        currentSeries: version.currentSeries,
        commands,
        healthPort: Number(this.config.get('PORT')) || 8100,
        operatorId: user.id ?? null,
        operatorName: auditDisplayName(user) || '超级管理员',
      };
      const state: DatabaseUpgradeJobState = {
        jobId,
        tokenHash,
        status: 'queued',
        stage: 'queued',
        message: '数据库升级任务已进入安全执行队列',
        progress: 2,
        packageName: version.packageName,
        fromVersion: version.installedVersion,
        targetVersion,
        startedAt,
        updatedAt: startedAt,
      };
      await this.writeJsonAtomic(join(jobDir, 'job.json'), job);
      await this.writeJsonAtomic(join(jobDir, 'state.json'), state);
      const workerPath = join(__dirname, 'database-upgrade.worker.js');
      const unit = `hb-oms-db-upgrade-${jobId.replace(/-/g, '')}`;
      await this.run(commands.systemdrun, [
        `--unit=${unit}`,
        '--collect',
        '--property=Type=exec',
        process.execPath,
        workerPath,
        jobId,
      ], 15_000);
      return { jobId, upgradeToken, fromVersion: version.installedVersion, targetVersion, packageName: version.packageName };
    } catch (error: any) {
      await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
      await rm(jobDir, { recursive: true, force: true });
      throw new InternalServerErrorException(`数据库升级任务启动失败：${String(error?.stderr || error?.message || error).replace(/\s+/g, ' ').slice(0, 500)}`);
    }
  }

  async getStatus(jobId: string, upgradeToken: string): Promise<DatabaseUpgradeJobPublicState> {
    if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new NotFoundException('升级任务不存在');
    if (!upgradeToken) throw new UnauthorizedException('缺少升级进度访问凭证');
    let state: DatabaseUpgradeJobState;
    try {
      state = JSON.parse(await readFile(join(DATABASE_UPGRADE_JOB_ROOT, jobId, 'state.json'), 'utf8'));
    } catch {
      throw new NotFoundException('升级任务不存在或状态保留期已结束');
    }
    const actual = createHash('sha256').update(upgradeToken).digest();
    const expected = Buffer.from(state.tokenHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('升级进度访问凭证无效');
    }
    const { tokenHash: _tokenHash, ...publicState } = state;
    return publicState;
  }
}
