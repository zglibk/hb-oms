import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

interface IdempotencyOptions<T extends Record<string, unknown>> {
  scope: string;
  requestId: string;
  user: CurrentUserPayload;
  payload: unknown;
  work: (manager: EntityManager) => Promise<T>;
  isolation?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) result[key] = canonicalize(child);
        return result;
      }, {});
  }
  return value;
}

/**
 * 写接口幂等的统一入口。
 *
 * 请求占位行与业务数据在同一事务提交：业务失败时占位也会回滚；并发的同键请求会在唯一索引处等待，
 * 随后直接复用首个请求的结果，不会再次执行 work。
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly dataSource: DataSource) {}

  async execute<T extends Record<string, unknown>>(
    options: IdempotencyOptions<T>,
  ): Promise<T & { deduplicated: boolean }> {
    const requestId = options.requestId.trim();
    const requestHash = createHash('sha256')
      .update(JSON.stringify(canonicalize(options.payload)))
      .digest('hex');

    const run = async (manager: EntityManager) => {
      const inserted: any = await manager.query(
        `INSERT IGNORE INTO t_idempotency_request
           (scope, request_id, user_id, request_hash, result_json, created_at, completed_at)
         VALUES (?, ?, ?, ?, NULL, NOW(), NULL)`,
        [options.scope, requestId, options.user.id, requestHash],
      );

      if (Number(inserted?.affectedRows ?? 0) === 0) {
        const rows: any[] = await manager.query(
          `SELECT user_id, request_hash, result_json, completed_at
             FROM t_idempotency_request
            WHERE scope = ? AND request_id = ?
            FOR UPDATE`,
          [options.scope, requestId],
        );
        const existing = rows[0];
        if (
          !existing
          || Number(existing.user_id) !== options.user.id
          || existing.request_hash !== requestHash
        ) {
          throw new ConflictException('请求标识已被其他操作占用，请刷新页面后重试');
        }
        if (!existing.completed_at || !existing.result_json) {
          throw new ConflictException('相同请求正在处理中，请稍后重试');
        }
        return {
          ...(JSON.parse(existing.result_json) as T),
          deduplicated: true,
        };
      }

      const result = await options.work(manager);
      await manager.query(
        `UPDATE t_idempotency_request
            SET result_json = ?, completed_at = NOW()
          WHERE scope = ? AND request_id = ?`,
        [JSON.stringify(result), options.scope, requestId],
      );
      return { ...result, deduplicated: false };
    };

    return options.isolation
      ? this.dataSource.transaction(options.isolation, run)
      : this.dataSource.transaction(run);
  }
}
