import { Injectable } from '@nestjs/common';

/**
 * JWT 黑名单服务（文档 19.3.1）。
 * 当面用进程内存实现（Map + 过期时间）；后期 CACHE_DRIVER=redis 时
 * 可替换为 Redis SET + TTL，对外接口不变。
 *
 * 注意：内存实现仅单进程有效。本地开发单进程足够；
 * 生产 PM2 cluster 多进程需切换 Redis 实现。
 */
@Injectable()
export class TokenBlacklistService {
  /** jti -> 过期时间戳(ms) */
  private readonly store = new Map<string, number>();

  /** 加入黑名单，ttlSeconds 后自动失效（与 token 剩余有效期一致） */
  async add(jti: string, ttlSeconds: number): Promise<void> {
    this.store.set(jti, Date.now() + ttlSeconds * 1000);
    this.gcIfNeeded();
  }

  /**
   * 原子占用一个 jti。返回 false 表示该 jti 已被占用/拉黑。
   * 单进程 Node 事件循环中，检查和写入之间没有 await，因此并发刷新只有一个请求
   * 能成功；切换 Redis 后应使用 SET key value NX EX ttl 实现相同语义。
   */
  async addIfAbsent(jti: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const current = this.store.get(jti);
    if (current && current >= now) return false;
    this.store.set(jti, now + ttlSeconds * 1000);
    this.gcIfNeeded();
    return true;
  }

  async has(jti: string): Promise<boolean> {
    const exp = this.store.get(jti);
    if (!exp) return false;
    if (exp < Date.now()) {
      this.store.delete(jti);
      return false;
    }
    return true;
  }

  private gcIfNeeded(): void {
    // 简单惰性清理：表项较多时清掉已过期项
    if (this.store.size < 500) return;
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v < now) this.store.delete(k);
    }
  }
}
