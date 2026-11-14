import { execFile, spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createGunzip, createGzip } from 'node:zlib';
import {
  DATABASE_RESTORE_JOB_ROOT,
  DATABASE_RESTORE_MAINTENANCE_PATH,
} from './database-restore.constants';

const execFileAsync = promisify(execFile);

interface RestoreJobConfig {
  jobId: string;
  databaseName: string;
  appRoot: string;
  serverRoot: string;
  mysqlPath: string;
  mysqldumpPath: string;
  pnpmPath: string;
  pm2Path: string;
  pm2Name: string;
  backupTime: string;
  backupFormat: 'signed' | 'legacy';
  originalFilename: string;
  operatorId: number | null;
  operatorName: string;
}

interface RestoreJobState {
  jobId: string;
  tokenHash: string;
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

function shanghaiNow(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
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
  options: { cwd?: string; timeout?: number } = {},
): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout || 60_000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return String(result.stdout || '').trim();
}

async function dumpDatabase(config: RestoreJobConfig, credentialPath: string, outputPath: string): Promise<void> {
  const args = [
    `--defaults-extra-file=${credentialPath}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events',
    '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF',
    '--default-character-set=utf8mb4', '--add-drop-database', '--databases', config.databaseName,
  ];
  const child = spawn(config.mysqldumpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-16_000); });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `mysqldump 退出码 ${code}`)));
  });
  try {
    await Promise.all([
      pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(outputPath, { mode: 0o600 })),
      exited,
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function importDatabase(config: RestoreJobConfig, credentialPath: string, inputPath: string): Promise<void> {
  const child = spawn(config.mysqlPath, [
    `--defaults-extra-file=${credentialPath}`,
    '--default-character-set=utf8mb4',
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-16_000); });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `mysql 退出码 ${code}`)));
  });
  try {
    await Promise.all([
      pipeline(createReadStream(inputPath), createGunzip(), child.stdin),
      exited,
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

function healthReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get('http://127.0.0.1:8100/api/health/ready', { timeout: 4_000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.once('timeout', () => { request.destroy(); resolve(false); });
    request.once('error', () => resolve(false));
  });
}

async function waitForHealth(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('OMS 后端数据库就绪探测在 90 秒内未恢复');
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function writeAuditLog(
  config: RestoreJobConfig,
  credentialPath: string,
  result: 0 | 1,
  description: string,
): Promise<void> {
  const sql = `INSERT INTO \`${config.databaseName}\`.t_operation_log ` +
    '(user_id,user_name,module,action,description,method,url,ip,params,biz_type,biz_id,result,created_at) VALUES (' +
    `${config.operatorId ?? 'NULL'},${sqlString(config.operatorName)},'数据库运维','还原数据库',` +
    `${sqlString(description)},'SYSTEM','database-restore-worker','127.0.0.1',NULL,NULL,NULL,${result},NOW())`;
  await run(config.mysqlPath, [
    `--defaults-extra-file=${credentialPath}`,
    '--default-character-set=utf8mb4',
    '--execute', sql,
  ], { timeout: 30_000 });
}

async function main(): Promise<void> {
  const jobId = process.argv[2] || '';
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error('还原任务编号无效');
  const jobDir = join(DATABASE_RESTORE_JOB_ROOT, jobId);
  const statePath = join(jobDir, 'state.json');
  const jobPath = join(jobDir, 'job.json');
  const credentialPath = join(jobDir, 'client.cnf');
  const restorePath = join(jobDir, 'restore.sql.gz');
  const safetyPath = join(jobDir, 'before-restore.sql.gz');
  const config = await readJson<RestoreJobConfig>(jobPath);
  let state = await readJson<RestoreJobState>(statePath);
  let databaseChanged = false;
  let safetyCreated = false;

  const update = async (patch: Partial<RestoreJobState>) => {
    state = { ...state, ...patch, updatedAt: shanghaiNow() };
    await writeJsonAtomic(statePath, state);
  };

  try {
    await update({ status: 'running', stage: 'safety-backup', progress: 10, message: '正在自动备份还原前的当前数据库' });
    await dumpDatabase(config, credentialPath, safetyPath);
    safetyCreated = true;

    await update({ stage: 'restore', progress: 35, message: `正在还原到 ${config.backupTime} 的完整备份` });
    databaseChanged = true;
    await importDatabase(config, credentialPath, restorePath);

    await update({ stage: 'migrate', progress: 65, message: '正在校准数据库结构迁移' });
    await run(config.pnpmPath, ['--filter', '@hb-oms/server', 'db:migrate'], {
      cwd: config.appRoot,
      timeout: 30 * 60 * 1000,
    });

    await update({ stage: 'restart', progress: 82, message: '正在重启 OMS 后端并执行就绪检查' });
    await run(config.pm2Path, ['restart', config.pm2Name, '--update-env'], {
      cwd: config.serverRoot,
      timeout: 120_000,
    });
    await waitForHealth();

    await writeAuditLog(
      config,
      credentialPath,
      1,
      `已从${config.backupFormat === 'signed' ? '签名备份包' : '旧版备份'}还原数据库，备份时间点 ${config.backupTime}`,
    ).catch(() => undefined);
    const completedAt = shanghaiNow();
    await update({
      status: 'succeeded', stage: 'completed', progress: 100,
      message: `数据库已安全还原到 ${config.backupTime}，结构迁移和就绪检查均已通过`,
      completedAt,
    });
    await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
    await Promise.all([
      rm(credentialPath, { force: true }), rm(restorePath, { force: true }),
      rm(safetyPath, { force: true }), rm(jobPath, { force: true }),
    ]);
  } catch (error) {
    const primaryError = errorText(error);
    if (databaseChanged && safetyCreated) {
      try {
        await update({ stage: 'rollback', progress: 72, message: '还原未完成，正在自动恢复操作前数据库' });
        await importDatabase(config, credentialPath, safetyPath);
        await run(config.pm2Path, ['restart', config.pm2Name, '--update-env'], {
          cwd: config.serverRoot,
          timeout: 120_000,
        });
        await waitForHealth();
        await writeAuditLog(
          config,
          credentialPath,
          0,
          `数据库还原失败，已自动恢复操作前数据库；失败原因：${primaryError}`,
        ).catch(() => undefined);
        await update({
          status: 'failed', stage: 'rolled-back', progress: 100,
          message: `还原失败，但已自动恢复操作前数据库：${primaryError}`,
          completedAt: shanghaiNow(), rollbackSucceeded: true,
        });
        await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
        await Promise.all([
          rm(credentialPath, { force: true }), rm(restorePath, { force: true }),
          rm(safetyPath, { force: true }), rm(jobPath, { force: true }),
        ]);
        return;
      } catch (rollbackError) {
        await update({
          status: 'critical', stage: 'rollback-failed', progress: 100,
          message: `还原失败且自动回滚未完成，系统继续保持维护模式，请立即联系运维人员。还原错误：${primaryError}；回滚错误：${errorText(rollbackError)}`,
          completedAt: shanghaiNow(), rollbackSucceeded: false,
        });
        process.exitCode = 2;
        return;
      }
    }

    await update({
      status: 'failed', stage: 'precheck-failed', progress: 100,
      message: `还原尚未改动数据库即停止：${primaryError}`,
      completedAt: shanghaiNow(), rollbackSucceeded: true,
    });
    await rm(DATABASE_RESTORE_MAINTENANCE_PATH, { force: true });
    await Promise.all([
      rm(credentialPath, { force: true }), rm(restorePath, { force: true }),
      rm(safetyPath, { force: true }), rm(jobPath, { force: true }),
    ]);
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`hb-oms database restore worker failed: ${errorText(error)}\n`);
  process.exitCode = 2;
});
