import { Injectable } from '@nestjs/common';

/**
 * 验证码状态存储（首期：进程内存实现）
 *
 * 与 TokenBlacklistService 同一设计模式（文档 1.8.7）：
 * - 单进程下 Node 事件循环单线程，consume 的「读取即删除」天然原子，
 *   等价于设计文档中的 Redis GETDEL，杜绝重放；
 * - 条目自带过期时间，读取时惰性判断 + 定期清扫；
 * - 接口保持与 Redis 版本一致（set/consume），切 PM2 cluster 时
 *   替换为 Redis 实现（SET EX / GETDEL），调用方零改动
 *   —— 已列入文档 20.6 技术债清单，与 JWT 黑名单同批切换。
 */
interface Entry {
  value: string;
  expireAt: number;
}

@Injectable()
export class CaptchaStoreService {
  private readonly store = new Map<string, Entry>();
  /** 惰性清扫阈值 */
  private readonly CLEAN_THRESHOLD = 10000;

  /** 写入键值并设置过期秒数 */
  set(key: string, value: string, ttlSeconds: number): void {
    this.store.set(key, { value, expireAt: Date.now() + ttlSeconds * 1000 });
    if (this.store.size > this.CLEAN_THRESHOLD) this.sweep();
  }

  /**
   * 原子消费：读取并立即删除（无论后续校验成败，条目只可用一次）
   * @returns 过期或不存在返回 null
   */
  consume(key: string): string | null {
    const entry = this.store.get(key);
    this.store.delete(key); // 读取即删除 —— 防重放核心
    if (!entry) return null;
    if (entry.expireAt < Date.now()) return null;
    return entry.value;
  }

  /** 清扫全部过期条目 */
  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expireAt < now) this.store.delete(k);
    }
  }
}
