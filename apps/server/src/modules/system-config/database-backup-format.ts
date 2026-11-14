import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { DATABASE_RESTORE_MAX_SQL_SIZE } from './database-restore.constants';

const MAGIC = Buffer.from('HBOMS_BACKUP_V1\n', 'ascii');
const HEADER_LENGTH_BYTES = 9;
const MAX_MANIFEST_SIZE = 64 * 1024;
const SIGN_CONTEXT = 'hb-oms-database-backup-v1\0';

export interface BackupManifestUnsigned {
  formatVersion: 1;
  system: 'hb-oms';
  databaseName: string;
  timezone: 'Asia/Shanghai';
  backupStartedAt: string;
  backupCompletedAt: string;
  dumpSha256: string;
  dumpSize: number;
}

export interface BackupManifest extends BackupManifestUnsigned {
  signatureAlgorithm: 'HMAC-SHA256';
  signature: string;
}

export interface SqlDumpInspection {
  completedAt: string;
  uncompressedSize: number;
}

function canonicalManifest(manifest: BackupManifestUnsigned): string {
  return JSON.stringify({
    formatVersion: manifest.formatVersion,
    system: manifest.system,
    databaseName: manifest.databaseName,
    timezone: manifest.timezone,
    backupStartedAt: manifest.backupStartedAt,
    backupCompletedAt: manifest.backupCompletedAt,
    dumpSha256: manifest.dumpSha256,
    dumpSize: manifest.dumpSize,
  });
}

export function signBackupManifest(
  manifest: BackupManifestUnsigned,
  signingKey: string,
): BackupManifest {
  const signature = createHmac('sha256', signingKey)
    .update(SIGN_CONTEXT)
    .update(canonicalManifest(manifest))
    .digest('hex');
  return {
    ...manifest,
    signatureAlgorithm: 'HMAC-SHA256',
    signature,
  };
}

function assertManifestShape(value: unknown): asserts value is BackupManifest {
  const item = value as Partial<BackupManifest> | null;
  const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (
    !item || item.formatVersion !== 1 || item.system !== 'hb-oms' ||
    item.timezone !== 'Asia/Shanghai' || item.signatureAlgorithm !== 'HMAC-SHA256' ||
    typeof item.databaseName !== 'string' || !/^[A-Za-z0-9_$-]+$/.test(item.databaseName) ||
    typeof item.backupStartedAt !== 'string' || !datePattern.test(item.backupStartedAt) ||
    typeof item.backupCompletedAt !== 'string' || !datePattern.test(item.backupCompletedAt) ||
    typeof item.dumpSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.dumpSha256) ||
    typeof item.dumpSize !== 'number' || !Number.isSafeInteger(item.dumpSize) || item.dumpSize <= 0 ||
    typeof item.signature !== 'string' || !/^[a-f0-9]{64}$/.test(item.signature)
  ) {
    throw new BadRequestException('备份包元数据格式无效，无法确认其来源和备份时间点');
  }
}

function verifySignature(manifest: BackupManifest, signingKey: string): void {
  const { signature: _signature, signatureAlgorithm: _algorithm, ...unsigned } = manifest;
  const expected = signBackupManifest(unsigned, signingKey).signature;
  const actualBuffer = Buffer.from(manifest.signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new BadRequestException('备份包签名校验失败，文件可能被修改或并非由当前 OMS 环境生成');
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function writeSignedBackupPackage(
  dumpGzipPath: string,
  outputPath: string,
  base: Omit<BackupManifestUnsigned, 'dumpSha256' | 'dumpSize'>,
  signingKey: string,
): Promise<BackupManifest> {
  const dumpInfo = await stat(dumpGzipPath);
  const manifest = signBackupManifest({
    ...base,
    dumpSha256: await sha256File(dumpGzipPath),
    dumpSize: dumpInfo.size,
  }, signingKey);
  const manifestBuffer = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (manifestBuffer.length > MAX_MANIFEST_SIZE) {
    throw new InternalServerErrorException('备份包元数据异常过大');
  }
  const lengthLine = Buffer.from(`${manifestBuffer.length.toString(16).padStart(8, '0')}\n`, 'ascii');
  const output = createWriteStream(outputPath, { mode: 0o600 });
  output.write(MAGIC);
  output.write(lengthLine);
  output.write(manifestBuffer);
  await pipeline(createReadStream(dumpGzipPath), output);
  return manifest;
}

export async function isSignedBackupPackage(filePath: string): Promise<boolean> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === MAGIC.length && timingSafeEqual(buffer, MAGIC);
  } finally {
    await handle.close();
  }
}

export async function extractAndVerifySignedBackup(
  packagePath: string,
  dumpGzipPath: string,
  signingKey: string,
  expectedDatabaseName: string,
): Promise<BackupManifest> {
  const handle = await open(packagePath, 'r');
  let manifest: BackupManifest;
  let payloadOffset: number;
  try {
    const prefix = Buffer.alloc(MAGIC.length + HEADER_LENGTH_BYTES);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (bytesRead !== prefix.length || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new BadRequestException('不是有效的 OMS 完整备份包');
    }
    const lengthText = prefix.subarray(MAGIC.length).toString('ascii');
    if (!/^[a-f0-9]{8}\n$/i.test(lengthText)) {
      throw new BadRequestException('备份包元数据长度标记无效');
    }
    const manifestSize = Number.parseInt(lengthText.slice(0, 8), 16);
    if (!manifestSize || manifestSize > MAX_MANIFEST_SIZE) {
      throw new BadRequestException('备份包元数据大小无效');
    }
    const manifestBuffer = Buffer.alloc(manifestSize);
    const readResult = await handle.read(manifestBuffer, 0, manifestSize, prefix.length);
    if (readResult.bytesRead !== manifestSize) {
      throw new BadRequestException('备份包元数据不完整');
    }
    try {
      manifest = JSON.parse(manifestBuffer.toString('utf8'));
    } catch {
      throw new BadRequestException('备份包元数据不是有效 JSON');
    }
    assertManifestShape(manifest);
    verifySignature(manifest, signingKey);
    if (manifest.databaseName !== expectedDatabaseName) {
      throw new BadRequestException(
        `备份目标库为 ${manifest.databaseName}，与当前 OMS 数据库 ${expectedDatabaseName} 不一致`,
      );
    }
    payloadOffset = prefix.length + manifestSize;
  } finally {
    await handle.close();
  }

  const packageInfo = await stat(packagePath);
  if (packageInfo.size - payloadOffset !== manifest.dumpSize) {
    throw new BadRequestException('备份包数据长度与签名元数据不一致，文件可能不完整');
  }
  await pipeline(
    createReadStream(packagePath, { start: payloadOffset }),
    createWriteStream(dumpGzipPath, { mode: 0o600 }),
  );
  const actualHash = await sha256File(dumpGzipPath);
  if (actualHash !== manifest.dumpSha256) {
    throw new BadRequestException('备份包数据摘要校验失败，文件可能已损坏或被修改');
  }
  return manifest;
}

function parseShanghaiTime(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}+08:00`);
}

export function assertCompletionTimesConsistent(
  expectedAt: string,
  dumpCompletedAt: string,
  maxGapMs: number,
): void {
  const expected = parseShanghaiTime(expectedAt);
  const completed = parseShanghaiTime(dumpCompletedAt);
  const gap = expected - completed;
  if (!Number.isFinite(expected) || !Number.isFinite(completed) || gap < 0 || gap > maxGapMs) {
    throw new BadRequestException('备份时间点与 SQL 转储完成时间不一致，已拒绝还原');
  }
}

export async function inspectGzipSqlDump(
  dumpGzipPath: string,
  expectedDatabaseName: string,
): Promise<SqlDumpInspection> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let head = '';
  let tail = '';
  let uncompressedSize = 0;
  let databaseSeen = false;
  const forbidden = /^(?:CREATE\s+USER|ALTER\s+USER|DROP\s+USER|GRANT\s+|REVOKE\s+|SET\s+GLOBAL\s+|INSTALL\s+PLUGIN|UNINSTALL\s+PLUGIN|SHUTDOWN\b|SOURCE\s+|LOAD\s+DATA\s+(?:LOCAL\s+)?INFILE|\\!)/i;
  const simpleDatabaseStatement = /^(?:DROP\s+DATABASE(?:\s+IF\s+EXISTS)?|USE)\s+`?([^`\s;]+)`?/i;

  const validateLine = (line: string) => {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) return;
    if (trimmed.startsWith('/*!')) {
      trimmed = trimmed.replace(/^\/\*!\d*\s*/, '').replace(/\*\/\s*;?$/, '').trim();
    } else if (trimmed.startsWith('/*')) {
      return;
    }
    if (forbidden.test(trimmed)) {
      throw new BadRequestException('备份 SQL 含不允许在自动还原中执行的全局权限或服务器控制语句');
    }
    if (/\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(trimmed)) {
      throw new BadRequestException('备份 SQL 含不允许在自动还原中执行的服务器文件写入语句');
    }
    const databaseMatch = simpleDatabaseStatement.exec(trimmed);
    if (databaseMatch?.[1] && databaseMatch[1] !== expectedDatabaseName) {
      throw new BadRequestException(`备份 SQL 试图操作其它数据库 ${databaseMatch[1]}，已拒绝还原`);
    }
    if (databaseMatch?.[1] === expectedDatabaseName) databaseSeen = true;
    if (/^CREATE\s+DATABASE\b/i.test(trimmed)) {
      const quotedName = /`([^`]+)`/.exec(trimmed)?.[1];
      const plainName = /^CREATE\s+DATABASE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s;]+)/i.exec(trimmed)?.[1];
      const createdDatabase = quotedName || plainName;
      if (!createdDatabase || createdDatabase !== expectedDatabaseName) {
        throw new BadRequestException(`备份 SQL 试图创建其它数据库 ${createdDatabase || '未知'}，已拒绝还原`);
      }
      databaseSeen = true;
    }
    if (/^(?:CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|LOCK|TRUNCATE|REPLACE)\b/i.test(trimmed)) {
      const qualified = /`([^`]+)`\.`[^`]+`/.exec(trimmed)?.[1];
      if (qualified && qualified !== expectedDatabaseName) {
        throw new BadRequestException(`备份 SQL 试图跨库操作 ${qualified}，已拒绝还原`);
      }
    }
  };

  const validator = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        uncompressedSize += chunk.length;
        if (uncompressedSize > DATABASE_RESTORE_MAX_SQL_SIZE) {
          throw new BadRequestException('备份解压后的 SQL 超过 64 GiB 安全上限');
        }
        const text = decoder.write(chunk);
        if (head.length < 256 * 1024) head += text.slice(0, 256 * 1024 - head.length);
        tail = (tail + text).slice(-128 * 1024);
        pending += text;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) validateLine(line);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        pending += decoder.end();
        if (pending) validateLine(pending);
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });

  try {
    await pipeline(createReadStream(dumpGzipPath), createGunzip(), validator);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`备份文件无法完整解压：${String((error as any)?.message || error).slice(0, 300)}`);
  }
  if (!/MySQL dump/i.test(head)) {
    throw new BadRequestException('备份内容不是 mysqldump 生成的完整 SQL 转储');
  }
  if (!databaseSeen) {
    throw new BadRequestException(`备份 SQL 未明确包含目标数据库 ${expectedDatabaseName}`);
  }
  const footerMatches = [...tail.matchAll(/-- Dump completed on (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g)];
  const completedAt = footerMatches.at(-1)?.[1];
  if (!completedAt) {
    throw new BadRequestException('备份 SQL 缺少 mysqldump 完成时间，无法确认备份时间点与完整性');
  }
  return { completedAt, uncompressedSize };
}
