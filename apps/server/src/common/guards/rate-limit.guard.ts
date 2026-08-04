import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

/**
 * 轻量内存限流（滑动窗口，按 客户端IP + 路由 计数）
 *
 * 设计背景（文档 20.6 技术债口径一致）：
 * - 首期单进程部署，进程内存计数即可正确限流，无需 Redis；
 * - 切 PM2 cluster 多进程前需与 JWT 黑名单一起切换为 Redis 存储（限流计数共享）；
 * - 未标注 @RateLimit 的接口不受影响。
 *
 * 用法：
 *   @UseGuards(RateLimitGuard)
 *   @RateLimit(10, 60)   // 每 60 秒最多 10 次
 */
export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** 窗口内允许的最大请求次数 */
  limit: number;
  /** 窗口时长（秒） */
  ttl: number;
}

export const RateLimit = (limit: number, ttl: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, ttl } as RateLimitOptions);

/** 计数桶：时间戳队列（滑动窗口） */
const buckets = new Map<string, number[]>();
/** 惰性清理阈值：桶数量超过该值时触发一次全量清扫 */
const CLEAN_THRESHOLD = 5000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!opts) return true; // 未配置限流的接口直接放行

    const req = context.switchToHttp().getRequest<Request>();
    // 取真实客户端 IP：优先 Nginx 传入的 X-Real-IP / X-Forwarded-For 首段
    const ip =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const key = `${ip}:${context.getClass().name}.${context.getHandler().name}`;

    const now = Date.now();
    const windowMs = opts.ttl * 1000;

    // 滑动窗口：只保留窗口内的时间戳
    const stamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (stamps.length >= opts.limit) {
      throw new HttpException(
        '操作过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    stamps.push(now);
    buckets.set(key, stamps);

    // 惰性清理：防止长期运行内存膨胀
    if (buckets.size > CLEAN_THRESHOLD) {
      for (const [k, v] of buckets) {
        const alive = v.filter((t) => now - t < windowMs);
        if (alive.length === 0) buckets.delete(k);
        else buckets.set(k, alive);
      }
    }
    return true;
  }
}
