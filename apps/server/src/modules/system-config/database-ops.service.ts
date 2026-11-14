import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { execFile, spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { Response } from 'express';
import type { DatabaseOpsAction } from './dto/database-ops.dto';
import { businessDateTime } from '../../common/utils/date-range.util';

const execFileAsync = promisify(execFile);

const OPS_MARKER = '# Managed by hb-oms database operations';
const APT_POLICY_PATH = '/etc/apt/apt.conf.d/52hb-oms-mysql-maintenance';
const MYSQL_SYSTEMD_DIR = '/etc/systemd/system/mysql.service.d';
const MYSQL_SYSTEMD_PATH = `${MYSQL_SYSTEMD_DIR}/hb-oms-recovery.conf`;
const WATCHDOG_SCRIPT_PATH = '/usr/local/sbin/hb-oms-mysql-watchdog';
const WATCHDOG_CREDENTIAL_PATH = '/etc/hb-oms/mysql-watchdog.cnf';
const WATCHDOG_SERVICE_PATH = '/etc/systemd/system/hb-oms-mysql-watchdog.service';
const WATCHDOG_TIMER_PATH = '/etc/systemd/system/hb-oms-mysql-watchdog.timer';
const WATCHDOG_STATE_PATH = '/var/lib/hb-oms-ops/mysql-watchdog-state';
const WATCHDOG_FAILURES_PATH = '/var/lib/hb-oms-ops/mysql-watchdog-failures';
// 必须排在发行版自带 mysqld.cnf 之后，否则后者会把 bind-address 覆盖回公网监听。
const MYSQL_LOCAL_BIND_PATH = '/etc/mysql/mysql.conf.d/zz-hb-oms-local-only.cnf';

export interface DatabaseOpsItemStatus {
  applied: boolean;
  healthy: boolean;
  summary: string;
  details: string[];
}

export interface DatabaseOpsStatus {
  supported: boolean;
  platform: NodeJS.Platform;
  databaseName: string;
  updatePolicy: DatabaseOpsItemStatus;
  restartGuard: DatabaseOpsItemStatus;
  watchdog: DatabaseOpsItemStatus;
  readiness: DatabaseOpsItemStatus;
  localBind: DatabaseOpsItemStatus & { remoteConnections: number };
  backup: DatabaseOpsItemStatus;
}

export interface PreparedBackup {
  filename: string;
  filePath: string;
  size: number;
  cleanup: () => Promise<void>;
}

/**
 * 数据库运维固定动作。
 *
 * 安全边界：路径、文件内容、可执行程序和参数全部由服务端写死；接口不接收服务器
 * 路径或命令文本，避免“运维页”退化成远程 shell。身份校验仍由 controller 做
 * system:danger + 内置 admin 双重校验。
 */
@Injectable()
export class DatabaseOpsService {
  private backupRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private get databaseName(): string {
    const name = this.config.get<string>('DB_NAME')?.trim();
    if (!name || !/^[A-Za-z0-9_$-]+$/.test(name)) {
      throw new InternalServerErrorException('数据库名称配置无效，无法执行运维操作');
    }
    return name;
  }

  private isLinux(): boolean {
    return process.platform === 'linux';
  }

  private canManageSystem(): boolean {
    return this.isLinux() && (typeof process.getuid !== 'function' || process.getuid() === 0);
  }

  private unsupportedItem(summary = '需要 Linux/systemd 且服务进程具备系统管理权限'): DatabaseOpsItemStatus {
    return { applied: false, healthy: false, summary, details: ['当前环境不会修改操作系统配置'] };
  }

  private async readText(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') return '';
      throw error;
    }
  }

  private async managedFileApplied(path: string): Promise<boolean> {
    return (await this.readText(path)).includes(OPS_MARKER);
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  /**
   * 停用动作只能删除本模块自己写入的固定文件。若同名文件由人工或其它系统创建，
   * 宁可拒绝操作，也不能把未知配置当成 OMS 配置清掉。
   */
  private async managedExistingPaths(paths: string[], label: string): Promise<string[]> {
    const existing: string[] = [];
    for (const path of paths) {
      if (!(await this.fileExists(path))) continue;
      const content = await this.readText(path);
      if (!content.includes(OPS_MARKER)) {
        throw new ConflictException(`检测到同名的非 OMS 托管${label}，为避免误删已拒绝停用`);
      }
      existing.push(path);
    }
    return existing;
  }

  private async run(command: string, args: string[], timeout = 15_000): Promise<string> {
    const { stdout } = await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return String(stdout || '').trim();
  }

  private async commandAvailable(command: string, args = ['--version']): Promise<boolean> {
    try {
      await this.run(command, args, 8_000);
      return true;
    } catch {
      return false;
    }
  }

  private mysqlOption(value: string): string {
    if (/\r|\n/.test(value)) {
      throw new InternalServerErrorException('数据库连接配置包含非法换行');
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private mysqlCredentialContent(): string {
    const user = this.config.get<string>('DB_USER') || '';
    const password = this.config.get<string>('DB_PASSWORD') || '';
    const host = this.config.get<string>('DB_HOST') || '127.0.0.1';
    const port = String(Number(this.config.get('DB_PORT')) || 3306);
    return [
      '[client]',
      `user=${this.mysqlOption(user)}`,
      `password=${this.mysqlOption(password)}`,
      `host=${this.mysqlOption(host)}`,
      `port=${port}`,
      'protocol=tcp',
      '',
    ].join('\n');
  }

  private async writeManagedFile(path: string, content: string, mode: number): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true });
    const temp = `${path}.hb-oms-${process.pid}.tmp`;
    await writeFile(temp, content, { encoding: 'utf8', mode });
    await chmod(temp, mode);
    await rename(temp, path);
  }

  private async remoteConnectionCount(): Promise<number> {
    const grants = await this.dataSource.query('SHOW GRANTS');
    const grantText = grants
      .flatMap((row: Record<string, unknown>) => Object.values(row))
      .map(String)
      .join('\n');
    if (!/\bPROCESS\b/i.test(grantText) && !/ALL PRIVILEGES ON \*\.\*/i.test(grantText)) {
      throw new BadRequestException('当前数据库账号缺少 PROCESS 权限，无法可靠核验远程连接，已拒绝执行本机监听限制');
    }
    const rows = await this.dataSource.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.PROCESSLIST
      WHERE ID <> CONNECTION_ID()
        AND HOST NOT LIKE 'localhost%'
        AND HOST NOT LIKE '127.0.0.1:%'
        AND HOST NOT LIKE '::1%'
    `);
    return Number(rows?.[0]?.cnt ?? 0);
  }

  async readiness(): Promise<{ ready: true; latencyMs: number }> {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1 AS ok');
      return { ready: true, latencyMs: Date.now() - started };
    } catch (error) {
      throw new ServiceUnavailableException('数据库连接暂不可用，系统正在自动恢复，请稍后重试');
    }
  }

  async getStatus(): Promise<DatabaseOpsStatus> {
    const supported = this.canManageSystem();
    let readiness: DatabaseOpsItemStatus;
    try {
      const ready = await this.readiness();
      readiness = {
        applied: true,
        healthy: true,
        summary: '数据库连接正常',
        details: [`探测耗时 ${ready.latencyMs} ms`, '异常时接口统一返回 503，不再向用户暴露底层连接错误'],
      };
    } catch {
      readiness = {
        applied: true,
        healthy: false,
        summary: '数据库连接异常',
        details: ['自动恢复机制将继续巡检；请查看自愈状态与服务器日志'],
      };
    }

    const backupAvailable = await this.commandAvailable('mysqldump');
    const backup: DatabaseOpsItemStatus = {
      applied: backupAvailable,
      healthy: backupAvailable,
      summary: backupAvailable ? '完整备份工具可用' : '未检测到 mysqldump',
      details: ['备份包含表结构、表数据、触发器、事件与存储过程，并压缩为 .sql.gz'],
    };

    if (!supported) {
      return {
        supported,
        platform: process.platform,
        databaseName: this.databaseName,
        updatePolicy: this.unsupportedItem(),
        restartGuard: this.unsupportedItem(),
        watchdog: this.unsupportedItem(),
        readiness,
        localBind: { ...this.unsupportedItem(), remoteConnections: 0 },
        backup,
      };
    }

    const [updateApplied, guardApplied, credentialApplied, scriptApplied, serviceApplied, timerApplied, bindApplied] =
      await Promise.all([
        this.managedFileApplied(APT_POLICY_PATH),
        this.managedFileApplied(MYSQL_SYSTEMD_PATH),
        this.managedFileApplied(WATCHDOG_CREDENTIAL_PATH),
        this.managedFileApplied(WATCHDOG_SCRIPT_PATH),
        this.managedFileApplied(WATCHDOG_SERVICE_PATH),
        this.managedFileApplied(WATCHDOG_TIMER_PATH),
        this.managedFileApplied(MYSQL_LOCAL_BIND_PATH),
      ]);

    let timerEnabled = false;
    let timerActive = false;
    if (timerApplied) {
      timerEnabled = (await this.run('systemctl', ['is-enabled', 'hb-oms-mysql-watchdog.timer']).catch(() => '')) === 'enabled';
      timerActive = (await this.run('systemctl', ['is-active', 'hb-oms-mysql-watchdog.timer']).catch(() => '')) === 'active';
    }
    const watchdogState = (await this.readText(WATCHDOG_STATE_PATH)).trim();
    const remoteConnections = await this.remoteConnectionCount().catch(() => -1);

    let bindAddress = '未知';
    try {
      const rows = await this.dataSource.query('SELECT @@GLOBAL.bind_address AS bindAddress');
      bindAddress = String(rows?.[0]?.bindAddress ?? '未知');
    } catch {
      // 老版本 MySQL 无该变量时仍以配置文件状态为准。
    }
    const watchdogApplied = credentialApplied || scriptApplied || serviceApplied || timerApplied;
    const watchdogHealthy = credentialApplied && scriptApplied && serviceApplied
      && timerApplied && timerEnabled && timerActive;
    const localBindHealthy = bindApplied && ['127.0.0.1', 'localhost', '::1'].includes(bindAddress);

    return {
      supported,
      platform: process.platform,
      databaseName: this.databaseName,
      updatePolicy: {
        applied: updateApplied,
        healthy: updateApplied,
        summary: updateApplied ? 'MySQL 已退出无人值守更新' : 'MySQL 仍可能被自动更新',
        details: ['系统其它安全更新不受影响；MySQL 改为维护窗口内人工升级'],
      },
      restartGuard: {
        applied: guardApplied,
        healthy: guardApplied,
        summary: guardApplied ? '启停超时与失败重启保护已配置' : '尚未配置启停超时保护',
        details: ['启动/停止最长 300 秒，失败后按受控频率重试，避免无限等待'],
      },
      watchdog: {
        applied: watchdogApplied,
        healthy: watchdogHealthy,
        summary: watchdogHealthy
          ? '每分钟自愈巡检运行中'
          : watchdogApplied ? '自愈巡检已配置但未完整运行' : '自愈巡检未启用',
        details: [
          '连续两次连接失败后自动重启 MySQL；apt/dpkg 工作期间让位给系统更新',
          watchdogState ? `最近状态：${watchdogState}` : '尚无巡检状态记录',
        ],
      },
      readiness,
      localBind: {
        applied: bindApplied,
        healthy: localBindHealthy,
        summary: bindApplied
          ? `OMS 生产服务器内部访问限制已配置；当前监听地址：${bindAddress}`
          : `OMS 生产服务器内部访问限制未启用；当前监听地址：${bindAddress}`,
        details: [
          remoteConnections >= 0
            ? `当前非生产服务器本机的数据库连接：${remoteConnections} 个`
            : '当前账号无法核验全部数据库连接，暂不允许执行本机监听限制',
          '该操作只修改主机监听；云安全组仍建议保持 3306/33060 不对公网开放',
        ],
        remoteConnections,
      },
      backup,
    };
  }

  async apply(
    action: DatabaseOpsAction,
    enabled = true,
    confirm = '',
  ): Promise<{ message: string; restartScheduled?: boolean }> {
    if (!this.canManageSystem()) {
      throw new BadRequestException('该操作需要 Linux/systemd 且服务进程具备系统管理权限');
    }
    switch (action) {
      case 'update-policy': {
        if (enabled) {
          await this.applyUpdatePolicy();
          return { message: '已将 MySQL 排除出无人值守更新；其它系统安全更新不受影响' };
        }
        const removed = await this.disableUpdatePolicy();
        return { message: removed ? '已停用 MySQL 受控更新策略，恢复由系统更新策略接管' : '受控更新策略原本未启用' };
      }
      case 'restart-guard': {
        if (enabled) {
          await this.applyRestartGuard();
          return { message: '已配置 MySQL 300 秒启停超时及失败重启保护' };
        }
        const removed = await this.disableRestartGuard();
        return { message: removed ? '已停用 OMS 配置的启停与失败重启保护' : '启停与重启保护原本未启用' };
      }
      case 'watchdog': {
        if (enabled) {
          await this.applyWatchdog();
          return { message: '已启用每分钟数据库自愈巡检' };
        }
        const removed = await this.disableWatchdog();
        return { message: removed ? '已停用数据库自愈巡检并清理 OMS 巡检配置' : '数据库自愈巡检原本未启用' };
      }
      case 'local-bind': {
        if (enabled) {
          await this.applyLocalBind(confirm);
          return { message: '已限制 MySQL 仅供生产服务器内部应用访问，数据库服务将在约 5 秒后重启', restartScheduled: true };
        }
        const removed = await this.disableLocalBind(confirm);
        return {
          message: removed
            ? '已取消 OMS 配置的生产服务器内部访问限制，数据库服务将在约 5 秒后重启'
            : 'OMS 生产服务器内部访问限制原本未启用',
          ...(removed ? { restartScheduled: true } : {}),
        };
      }
      default:
        throw new BadRequestException('不支持的数据库运维动作');
    }
  }

  private async applyUpdatePolicy(): Promise<void> {
    const content = `${OPS_MARKER}\n// MySQL 由维护窗口人工升级，避免业务时段自动重启。\nUnattended-Upgrade::Package-Blacklist {\n  "^mysql-.*";\n  "^libmysqlclient.*";\n};\n`;
    await this.writeManagedFile(APT_POLICY_PATH, content, 0o644);
  }

  private async disableUpdatePolicy(): Promise<boolean> {
    const paths = await this.managedExistingPaths([APT_POLICY_PATH], '更新策略文件');
    if (!paths.length) return false;
    await rm(APT_POLICY_PATH, { force: true });
    return true;
  }

  private async applyRestartGuard(): Promise<void> {
    const content = `${OPS_MARKER}\n[Unit]\nStartLimitIntervalSec=300\nStartLimitBurst=3\n\n[Service]\nTimeoutStartSec=300\nTimeoutStopSec=300\nRestart=on-failure\nRestartSec=10\n`;
    await this.writeManagedFile(MYSQL_SYSTEMD_PATH, content, 0o644);
    await this.run('systemctl', ['daemon-reload']);
  }

  private async disableRestartGuard(): Promise<boolean> {
    const paths = await this.managedExistingPaths([MYSQL_SYSTEMD_PATH], 'systemd 配置');
    if (!paths.length) return false;
    await rm(MYSQL_SYSTEMD_PATH, { force: true });
    await this.run('systemctl', ['daemon-reload']);
    await this.run('systemctl', ['reset-failed', 'mysql.service']).catch(() => '');
    return true;
  }

  private watchdogScript(): string {
    return `#!/usr/bin/env bash
${OPS_MARKER}
set -u
STATE_DIR="/var/lib/hb-oms-ops"
COUNT_FILE="$STATE_DIR/mysql-watchdog-failures"
STATE_FILE="$STATE_DIR/mysql-watchdog-state"
CREDENTIALS="${WATCHDOG_CREDENTIAL_PATH}"
mkdir -p "$STATE_DIR"
exec 9>/run/hb-oms-mysql-watchdog.lock
flock -n 9 || exit 0
now="$(date --iso-8601=seconds)"

# 安装器正在持有数据库包时不争抢服务；第 2 项的超时保护负责终止无限等待。
if systemctl is-active --quiet apt-daily-upgrade.service || pgrep -x dpkg >/dev/null 2>&1; then
  printf '%s' "$now skipped: package maintenance active" > "$STATE_FILE"
  exit 0
fi

if timeout 8 mysqladmin --defaults-extra-file="$CREDENTIALS" ping --silent >/dev/null 2>&1 \
  && timeout 8 mysql --defaults-extra-file="$CREDENTIALS" --batch --skip-column-names -e 'SELECT 1' >/dev/null 2>&1; then
  rm -f "$COUNT_FILE"
  printf '%s' "$now healthy" > "$STATE_FILE"
  exit 0
fi

count=0
if [[ -f "$COUNT_FILE" ]]; then read -r count < "$COUNT_FILE" || count=0; fi
count=$((count + 1))
printf '%s' "$count" > "$COUNT_FILE"
printf '%s' "$now failed: consecutive=$count" > "$STATE_FILE"
logger -t hb-oms-mysql-watchdog "MySQL health check failed (consecutive=$count)"

if (( count >= 2 )); then
  if systemctl restart mysql; then
    rm -f "$COUNT_FILE"
    printf '%s' "$now recovered: mysql restarted" > "$STATE_FILE"
    logger -t hb-oms-mysql-watchdog "MySQL recovered by controlled restart"
  else
    printf '%s' "$now recovery failed: manual intervention required" > "$STATE_FILE"
    logger -p daemon.err -t hb-oms-mysql-watchdog "MySQL restart failed; manual intervention required"
    exit 1
  fi
fi
`;
  }

  private async applyWatchdog(): Promise<void> {
    if (!(await this.commandAvailable('mysql')) || !(await this.commandAvailable('mysqladmin'))) {
      throw new BadRequestException('服务器缺少 mysql/mysqladmin 客户端，无法启用自愈巡检');
    }
    await this.writeManagedFile(WATCHDOG_CREDENTIAL_PATH, `${OPS_MARKER}\n${this.mysqlCredentialContent()}`, 0o600);
    await this.writeManagedFile(WATCHDOG_SCRIPT_PATH, this.watchdogScript(), 0o750);
    await this.writeManagedFile(
      WATCHDOG_SERVICE_PATH,
      `${OPS_MARKER}\n[Unit]\nDescription=HB OMS MySQL health watchdog\nAfter=network.target mysql.service\n\n[Service]\nType=oneshot\nExecStart=${WATCHDOG_SCRIPT_PATH}\nUser=root\nGroup=root\nNoNewPrivileges=true\nPrivateTmp=true\n\n`,
      0o644,
    );
    await this.writeManagedFile(
      WATCHDOG_TIMER_PATH,
      `${OPS_MARKER}\n[Unit]\nDescription=Run HB OMS MySQL watchdog every minute\n\n[Timer]\nOnBootSec=90s\nOnUnitActiveSec=60s\nAccuracySec=10s\nPersistent=true\nUnit=hb-oms-mysql-watchdog.service\n\n[Install]\nWantedBy=timers.target\n`,
      0o644,
    );
    await mkdir('/var/lib/hb-oms-ops', { recursive: true });
    await this.run('systemctl', ['daemon-reload']);
    await this.run('systemctl', ['enable', '--now', 'hb-oms-mysql-watchdog.timer']);
  }

  private async disableWatchdog(): Promise<boolean> {
    const managedPaths = [
      WATCHDOG_CREDENTIAL_PATH,
      WATCHDOG_SCRIPT_PATH,
      WATCHDOG_SERVICE_PATH,
      WATCHDOG_TIMER_PATH,
    ];
    const existing = await this.managedExistingPaths(managedPaths, '自愈巡检文件');
    if (!existing.length) return false;

    await this.run('systemctl', ['disable', '--now', 'hb-oms-mysql-watchdog.timer'], 30_000).catch(() => '');
    await this.run('systemctl', ['stop', 'hb-oms-mysql-watchdog.service'], 30_000).catch(() => '');
    await Promise.all(existing.map((path) => rm(path, { force: true })));
    await Promise.all([
      rm(WATCHDOG_STATE_PATH, { force: true }),
      rm(WATCHDOG_FAILURES_PATH, { force: true }),
    ]);
    await this.run('systemctl', ['daemon-reload']);
    await this.run('systemctl', ['reset-failed', 'hb-oms-mysql-watchdog.service']).catch(() => '');
    await this.run('systemctl', ['reset-failed', 'hb-oms-mysql-watchdog.timer']).catch(() => '');
    return true;
  }

  private async applyLocalBind(confirm: string): Promise<void> {
    if (confirm !== '限制本机') {
      throw new BadRequestException('请输入正确的确认口令「限制本机」');
    }
    const host = (this.config.get<string>('DB_HOST') || '').trim().toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw new BadRequestException(`当前应用通过 ${host || '未知地址'} 连接数据库，限制为本机将导致系统离线，已拒绝执行`);
    }
    const remoteConnections = await this.remoteConnectionCount();
    if (remoteConnections > 0) {
      throw new BadRequestException(`检测到 ${remoteConnections} 个非本机数据库连接，请先确认并迁移这些客户端后再执行`);
    }

    const existing = await this.managedExistingPaths([MYSQL_LOCAL_BIND_PATH], 'MySQL 本机监听配置');
    const previous = existing.length ? await this.readText(MYSQL_LOCAL_BIND_PATH) : '';
    const content = `${OPS_MARKER}\n[mysqld]\nbind-address=127.0.0.1\nmysqlx-bind-address=127.0.0.1\n`;
    await this.writeManagedFile(MYSQL_LOCAL_BIND_PATH, content, 0o644);
    try {
      await this.run('mysqld', ['--validate-config'], 30_000);
    } catch (error: any) {
      if (previous) await this.writeManagedFile(MYSQL_LOCAL_BIND_PATH, previous, 0o644);
      else await rm(MYSQL_LOCAL_BIND_PATH, { force: true });
      throw new BadRequestException(`MySQL 配置校验未通过，已恢复原配置：${String(error?.stderr || error?.message || '未知错误').slice(0, 300)}`);
    }

    // 当前请求还要写操作日志，不能在请求内同步重启数据库。交给 systemd 数秒后执行，
    // 让响应与审计先完整落库；重启保护与 watchdog 会接管后续恢复。
    await this.scheduleMysqlRestart();
  }

  private async disableLocalBind(confirm: string): Promise<boolean> {
    if (confirm !== '取消限制') {
      throw new BadRequestException('请输入正确的确认口令「取消限制」');
    }
    const existing = await this.managedExistingPaths([MYSQL_LOCAL_BIND_PATH], 'MySQL 本机监听配置');
    if (!existing.length) return false;

    const previous = await this.readText(MYSQL_LOCAL_BIND_PATH);
    await rm(MYSQL_LOCAL_BIND_PATH, { force: true });
    try {
      await this.run('mysqld', ['--validate-config'], 30_000);
    } catch (error: any) {
      await this.writeManagedFile(MYSQL_LOCAL_BIND_PATH, previous, 0o644);
      throw new BadRequestException(`取消限制后的 MySQL 配置校验未通过，已恢复原配置：${String(error?.stderr || error?.message || '未知错误').slice(0, 300)}`);
    }
    await this.scheduleMysqlRestart();
    return true;
  }

  private async scheduleMysqlRestart(): Promise<void> {
    const unit = `hb-oms-mysql-restart-${Date.now()}`;
    await this.run('systemd-run', [
      `--unit=${unit}`,
      '--on-active=5s',
      '--collect',
      'systemctl',
      'restart',
      'mysql',
    ]);
  }

  async prepareFullBackup(): Promise<PreparedBackup> {
    if (!(await this.commandAvailable('mysqldump'))) {
      throw new BadRequestException('服务器未安装 mysqldump，无法执行完整备份');
    }
    await this.readiness();
    const workDir = await mkdtemp(join(tmpdir(), 'hb-oms-backup-'));
    await chmod(workDir, 0o700);
    const credentialPath = join(workDir, 'client.cnf');
    const stamp = businessDateTime(new Date()).replace(/[-: ]/g, '');
    const filename = `${this.databaseName}_full_${stamp}.sql.gz`;
    const partPath = join(workDir, `${filename}.part`);
    const filePath = join(workDir, filename);
    const cleanup = () => rm(workDir, { recursive: true, force: true });

    try {
      await writeFile(credentialPath, this.mysqlCredentialContent(), { encoding: 'utf8', mode: 0o600 });
      await chmod(credentialPath, 0o600);
      const args = [
        `--defaults-extra-file=${credentialPath}`,
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        '--events',
        '--hex-blob',
        '--no-tablespaces',
        '--set-gtid-purged=OFF',
        '--default-character-set=utf8mb4',
        '--add-drop-database',
        '--databases',
        this.databaseName,
      ];
      const child = spawn('mysqldump', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-16_000);
      });
      const exitPromise = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `mysqldump 退出码 ${code}`));
        });
      });
      const output = createWriteStream(partPath, { mode: 0o600 });
      try {
        await Promise.all([
          pipeline(child.stdout!, createGzip({ level: 6 }), output),
          exitPromise,
        ]);
      } catch (error) {
        child.kill('SIGTERM');
        throw error;
      }
      await rename(partPath, filePath);
      await rm(credentialPath, { force: true });
      const info = await stat(filePath);
      if (info.size <= 0) throw new Error('备份文件为空');
      return { filename: basename(filename), filePath, size: info.size, cleanup };
    } catch (error: any) {
      await cleanup();
      throw new InternalServerErrorException(`完整备份失败：${String(error?.message || error).slice(0, 500)}`);
    }
  }

  async sendBackup(response: Response): Promise<void> {
    if (this.backupRunning) {
      throw new ConflictException('已有一项完整备份正在生成或下载，请稍后再试');
    }
    this.backupRunning = true;
    let backup: PreparedBackup;
    try {
      backup = await this.prepareFullBackup();
    } catch (error) {
      this.backupRunning = false;
      throw error;
    }
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      this.backupRunning = false;
      await backup.cleanup().catch(() => undefined);
    };
    response.setHeader('Content-Type', 'application/gzip');
    response.setHeader('Content-Length', String(backup.size));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.filename}"; filename*=UTF-8''${encodeURIComponent(backup.filename)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.once('finish', () => void cleanup());
    response.once('close', () => void cleanup());
    const stream = createReadStream(backup.filePath);
    stream.once('error', async () => {
      await cleanup();
      if (!response.headersSent) response.status(500).end();
      else response.destroy();
    });
    stream.pipe(response);
  }
}
