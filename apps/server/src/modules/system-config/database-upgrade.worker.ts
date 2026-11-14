import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGzip } from 'node:zlib';
import { writeSignedBackupPackage } from './database-backup-format';
import { DATABASE_UPGRADE_JOB_ROOT } from './database-upgrade.constants';
import { DATABASE_RESTORE_MAINTENANCE_PATH } from './database-restore.constants';

const execFileAsync = promisify(execFile);

interface UpgradeCommands {
  mysql: string;
  mysqldump: string;
  mysqlcheck: string;
  aptget: string;
  aptcache: string;
  dpkgquery: string;
  systemdrun: string;
  fuser: string;
  rm: string;
}

interface UpgradeJobConfig {
  jobId: string;
  databaseName: string;
  packageName: string;
  fromVersion: string;
  targetVersion: string;
  currentSeries: string;
  commands: UpgradeCommands;
  healthPort: number;
  operatorId: number | null;
  operatorName: string;
}

interface UpgradeJobState {
  jobId: string;
  tokenHash: string;
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

function shanghaiNow(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await rename(temp, path);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function errorText(error: unknown): string {
  const item = error as any;
  return String(item?.stderr || item?.message || error || '未知错误').replace(/\s+/g, ' ').slice(0, 800);
}

async function run(
  command: string,
  args: string[],
  options: { timeout?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const result = await execFileAsync(command, args, {
    timeout: options.timeout || 60_000,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', ...options.env },
  });
  return String(result.stdout || '').trim();
}

function seriesOf(version: string): string {
  const match = /^(?:\d+:)?(\d+)\.(\d+)/.exec(version.trim());
  return match ? `${match[1]}.${match[2]}` : '';
}

async function assertPackageManagerIdle(fuserPath: string): Promise<void> {
  try {
    await run(fuserPath, [
      '/var/lib/dpkg/lock-frontend',
      '/var/lib/dpkg/lock',
      '/var/lib/apt/lists/lock',
      '/var/cache/apt/archives/lock',
    ], { timeout: 8_000 });
    throw new Error('APT/DPKG 正被其它任务占用，请等待系统更新结束后重试');
  } catch (error: any) {
    if (Number(error?.code) === 1) return;
    throw error;
  }
}

async function candidateOf(config: UpgradeJobConfig): Promise<string> {
  const output = await run(config.commands.aptcache, ['policy', config.packageName]);
  return /^\s*Candidate:\s*(\S+)\s*$/m.exec(output)?.[1] || '';
}

async function installedVersionOf(config: UpgradeJobConfig): Promise<string> {
  return run(config.commands.dpkgquery, ['-W', '-f=${Version}', config.packageName]);
}

async function databaseVersion(config: UpgradeJobConfig, credentialPath: string): Promise<string> {
  const output = await run(config.commands.mysql, [
    `--defaults-extra-file=${credentialPath}`,
    '--batch', '--skip-column-names',
    '--execute', 'SELECT VERSION()',
  ], { timeout: 15_000 });
  return output.split('\n')[0]?.trim() || '';
}

async function waitForDatabase(config: UpgradeJobConfig, credentialPath: string): Promise<string> {
  const deadline = Date.now() + 5 * 60 * 1000;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const version = await databaseVersion(config, credentialPath);
      if (version) return version;
    } catch (error) {
      lastError = errorText(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`MySQL 在升级后 5 分钟内未恢复连接：${lastError}`);
}

async function waitForOmsHealth(port: number): Promise<void> {
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    const healthy = await new Promise<boolean>((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: '/api/health/ready', timeout: 5_000 }, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.once('timeout', () => { request.destroy(); resolve(false); });
      request.once('error', () => resolve(false));
    });
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error('MySQL 已恢复，但 OMS 数据库就绪探测在 3 分钟内未通过');
}

async function scheduleSuccessfulJobCleanup(
  config: UpgradeJobConfig,
  jobId: string,
  jobDir: string,
): Promise<void> {
  const unit = `hb-oms-db-upgrade-cleanup-${jobId.replace(/-/g, '')}`;
  try {
    await run(config.commands.systemdrun, [
      `--unit=${unit}`,
      '--on-active=7d',
      '--collect',
      config.commands.rm,
      '-rf',
      '--',
      jobDir,
    ], { timeout: 15_000 });
  } catch (error) {
    // 清理定时器失败不影响已经完成的升级；服务端下次启动任务时仍会兜底清理过期目录。
    process.stderr.write(`schedule database upgrade cleanup failed: ${errorText(error)}\n`);
  }
}

async function dumpSafetyBackup(
  config: UpgradeJobConfig,
  jobDir: string,
  credentialPath: string,
  signingKeyPath: string,
): Promise<string> {
  const startedAt = shanghaiNow();
  const stamp = startedAt.replace(/[-: ]/g, '');
  const filename = `${config.databaseName}_before_upgrade_${stamp}.hbomsbak`;
  const dumpPart = join(jobDir, 'before-upgrade.sql.gz.part');
  const dumpPath = join(jobDir, 'before-upgrade.sql.gz');
  const packagePart = join(jobDir, `${filename}.part`);
  const packagePath = join(jobDir, filename);
  const args = [
    `--defaults-extra-file=${credentialPath}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events',
    '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF',
    '--default-character-set=utf8mb4', '--add-drop-database', '--databases', config.databaseName,
  ];
  const child = spawn(config.commands.mysqldump, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-16_000); });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `mysqldump 退出码 ${code}`)));
  });
  try {
    await Promise.all([
      pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(dumpPart, { mode: 0o600 })),
      exited,
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
  await rename(dumpPart, dumpPath);
  const signingKey = (await readFile(signingKeyPath, 'utf8')).trim();
  await writeSignedBackupPackage(dumpPath, packagePart, {
    formatVersion: 1,
    system: 'hb-oms',
    databaseName: config.databaseName,
    timezone: 'Asia/Shanghai',
    backupStartedAt: startedAt,
    backupCompletedAt: shanghaiNow(),
  }, signingKey);
  await rename(packagePart, packagePath);
  await Promise.all([rm(dumpPath, { force: true }), rm(signingKeyPath, { force: true })]);
  return filename;
}

async function main(): Promise<void> {
  const jobId = process.argv[2] || '';
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error('升级任务编号无效');
  const jobDir = join(DATABASE_UPGRADE_JOB_ROOT, jobId);
  const statePath = join(jobDir, 'state.json');
  const jobPath = join(jobDir, 'job.json');
  const credentialPath = join(jobDir, 'client.cnf');
  const signingKeyPath = join(jobDir, 'signing.key');
  const config = await readJson<UpgradeJobConfig>(jobPath);
  let state = await readJson<UpgradeJobState>(statePath);
  let installationStarted = false;

  const update = async (patch: Partial<UpgradeJobState>) => {
    state = { ...state, ...patch, updatedAt: shanghaiNow() };
    await writeJsonAtomic(statePath, state);
  };

  try {
    await update({ status: 'running', stage: 'precheck', progress: 6, message: '正在检查软件包占用、目标版本与数据库连接' });
    await assertPackageManagerIdle(config.commands.fuser);
    const currentInstalled = await installedVersionOf(config);
    if (currentInstalled !== config.fromVersion) {
      throw new Error(`当前安装包版本已由 ${config.fromVersion} 变化为 ${currentInstalled}，任务已停止`);
    }
    if (await candidateOf(config) !== config.targetVersion) {
      throw new Error('软件源候选版本已变化，任务已停止，请重新检查版本');
    }

    await update({ stage: 'compatibility', progress: 14, message: '正在执行 MySQL 全库升级兼容性检查' });
    await run(config.commands.mysqlcheck, [
      `--defaults-extra-file=${credentialPath}`,
      '--all-databases', '--check-upgrade',
    ], { timeout: 30 * 60 * 1000 });

    await update({ stage: 'backup', progress: 25, message: '兼容性检查通过，正在生成升级前完整签名备份' });
    const safetyBackupFilename = await dumpSafetyBackup(config, jobDir, credentialPath, signingKeyPath);
    await update({ safetyBackupFilename, progress: 42, message: `升级前安全备份已生成：${safetyBackupFilename}` });

    await update({ stage: 'repository', progress: 48, message: '正在刷新生产服务器软件源并重新锁定目标版本' });
    await assertPackageManagerIdle(config.commands.fuser);
    await run(config.commands.aptget, ['update'], { timeout: 10 * 60 * 1000 });
    const refreshedCandidate = await candidateOf(config);
    if (refreshedCandidate !== config.targetVersion) {
      throw new Error(`刷新后候选版本变为 ${refreshedCandidate || '未知'}，与已确认目标不一致，安装已取消`);
    }
    if (seriesOf(refreshedCandidate) !== config.currentSeries) {
      throw new Error(`刷新后的候选版本属于 ${seriesOf(refreshedCandidate) || '未知'} 系列，禁止跨系列自动升级`);
    }

    await update({ stage: 'install', progress: 58, message: `正在安装 ${config.packageName} ${config.targetVersion}，MySQL 将自动重启` });
    installationStarted = true;
    await run(config.commands.aptget, [
      '-o', 'Dpkg::Options::=--force-confold',
      'install', '-y', '--only-upgrade', `${config.packageName}=${config.targetVersion}`,
    ], { timeout: 60 * 60 * 1000, env: { DEBIAN_FRONTEND: 'noninteractive' } });

    await update({ stage: 'database-health', progress: 84, message: '软件包安装完成，正在等待 MySQL 重启并执行 SQL 健康检查' });
    const runtimeVersion = await waitForDatabase(config, credentialPath);
    if (seriesOf(runtimeVersion) !== config.currentSeries) {
      throw new Error(`升级后数据库运行版本 ${runtimeVersion} 超出已确认的 ${config.currentSeries} 系列`);
    }
    const installedVersion = await installedVersionOf(config);
    if (installedVersion !== config.targetVersion) {
      throw new Error(`软件包安装结果为 ${installedVersion}，与目标 ${config.targetVersion} 不一致`);
    }

    await update({ stage: 'oms-health', progress: 94, message: '数据库运行正常，正在验证 OMS 就绪状态' });
    await waitForOmsHealth(config.healthPort);
    const completedAt = shanghaiNow();
    await update({
      status: 'succeeded', stage: 'completed', progress: 100,
      message: `数据库已由 ${config.fromVersion} 安全升级到 ${config.targetVersion}，SQL 与 OMS 健康检查均已通过`,
      runtimeVersion, completedAt,
    });
    await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
    await Promise.all([
      rm(credentialPath, { force: true }), rm(signingKeyPath, { force: true }), rm(jobPath, { force: true }),
    ]);
    await scheduleSuccessfulJobCleanup(config, jobId, jobDir);
  } catch (error) {
    const failure = errorText(error);
    let databaseHealthy = false;
    let runtimeVersion = '';
    try {
      runtimeVersion = await databaseVersion(config, credentialPath);
      databaseHealthy = !!runtimeVersion;
    } catch {
      databaseHealthy = false;
    }

    if (!installationStarted) {
      await update({
        status: 'failed', stage: 'precheck-failed', progress: 100,
        message: `升级在修改软件包前已安全停止：${failure}`,
        runtimeVersion: runtimeVersion || undefined,
        completedAt: shanghaiNow(),
      });
      await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
      await Promise.all([rm(credentialPath, { force: true }), rm(signingKeyPath, { force: true }), rm(jobPath, { force: true })]);
      process.exitCode = 1;
      return;
    }

    await update({
      status: 'critical',
      stage: databaseHealthy ? 'install-needs-review' : 'database-unhealthy',
      progress: 100,
      message: databaseHealthy
        ? `软件包安装阶段未正常完成；数据库当前仍可连接，但系统将继续保持维护模式，等待运维人员核验软件包与 OMS 状态：${failure}`
        : `软件包升级后数据库未恢复，系统继续保持维护模式，且不会尝试不受支持的原地降级。请立即联系服务器运维人员：${failure}`,
      runtimeVersion: runtimeVersion || undefined,
      completedAt: shanghaiNow(),
    });
    await Promise.all([
      rm(credentialPath, { force: true }), rm(signingKeyPath, { force: true }), rm(jobPath, { force: true }),
    ]);
    process.exitCode = 2;
  }
}

void main().catch((error) => {
  process.stderr.write(`hb-oms database upgrade worker failed: ${errorText(error)}\n`);
  process.exitCode = 2;
});
