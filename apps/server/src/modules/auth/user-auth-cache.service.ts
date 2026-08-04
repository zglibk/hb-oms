import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../system/entities/user.entity';
import { AuthService } from './auth.service';

/**
 * 用户鉴权上下文（请求级 request.user 的数据来源）
 * 与旧 JWT 载荷字段一一对应，保证下游（PermissionGuard / DataScopeService / 业务模块）零改动。
 */
export interface UserAuthContext {
  id: number;
  username: string;
  realName: string;
  deptId: number | null;
  status: number;
  /** 会话撤销水位线：签发时间早于此刻的 token 一律失效（安全审查 P1） */
  tokenInvalidBefore: Date | null;
  roleIds: number[];
  roleCodes: string[];
  permissions: string[];
  dataScope: number;
  customDeptIds: number[];
}

interface CacheEntry {
  data: UserAuthContext;
  expiresAt: number;
}

/**
 * 用户鉴权上下文缓存（缺陷 A 根治的核心组件）
 *
 * 背景：旧实现把 permissions/roleCodes/dataScope 冻结在 JWT payload 中，
 * 守卫只看 token 不看库 —— 分配权限后已登录用户最长 2 小时不生效（403 不触发
 * token 刷新，实际上是"永远不生效直到重新登录"）。
 *
 * 现方案：JWT 只承载身份（sub/jti/username），每个请求经 JwtAuthGuard
 * 从本服务获取实时鉴权上下文：
 *   - 短 TTL 内存缓存（默认 60s，AUTH_CACHE_TTL_MS 可配），避免每请求 5 次查询；
 *   - 角色/权限/用户角色变更时由业务服务主动调用 invalidate* 精确失效，
 *     变更即刻生效（不用等 TTL）；
 *   - 顺带带来两个收益：停用账号 / 调整数据范围也即时生效。
 *
 * 部署形态说明：当前为单实例 PM2 部署，内存缓存即可；若将来多实例，
 * 与 TokenBlacklistService 一并切换 Redis（TTL 语义不变）。
 */
@Injectable()
export class UserAuthCacheService {
  private readonly logger = new Logger(UserAuthCacheService.name);
  private readonly cache = new Map<number, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.ttlMs = Number(config.get('AUTH_CACHE_TTL_MS')) || 60_000;
  }

  /** 获取用户实时鉴权上下文（带 TTL 缓存）；用户不存在返回 null */
  async getContext(userId: number): Promise<UserAuthContext | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.data;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      this.cache.delete(userId);
      return null;
    }
    const auth = await this.authService.loadUserAuth(userId);
    const data: UserAuthContext = {
      id: user.id,
      username: user.username,
      realName: user.realName,
      deptId: user.deptId ?? null,
      status: user.status,
      tokenInvalidBefore: user.tokenInvalidBefore ?? null,
      roleIds: auth.roleIds,
      roleCodes: auth.roleCodes,
      permissions: auth.permissions,
      dataScope: auth.dataScope,
      customDeptIds: auth.customDeptIds,
    };
    this.cache.set(userId, { data, expiresAt: Date.now() + this.ttlMs });
    return data;
  }

  /** 单用户失效：用户资料/角色绑定变更时调用 */
  invalidateUser(userId: number) {
    this.cache.delete(userId);
  }

  /** 全量失效：角色-权限矩阵 / 权限树结构变更时调用（影响面按角色扩散，整体清空最稳妥） */
  invalidateAll() {
    if (this.cache.size) {
      this.logger.debug(`鉴权缓存全量失效（${this.cache.size} 条）`);
    }
    this.cache.clear();
  }
}
