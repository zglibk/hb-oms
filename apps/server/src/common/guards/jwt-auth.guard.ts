import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenBlacklistService } from '../../modules/auth/token-blacklist.service';
import { UserAuthCacheService } from '../../modules/auth/user-auth-cache.service';

/**
 * JWT 鉴权守卫：校验 token 有效性 + 黑名单，注入 request.user。
 *
 * token 仅承载身份（sub/jti/username）；角色/权限/数据范围通过
 * UserAuthCacheService 实时读库（60s TTL + 变更主动失效），
 * 因此：分配权限、调整角色、停用账号均即刻生效，无需重新登录。
 * 旧版携带 permissions 载荷的存量 token 依然可用（多余字段被忽略），
 * 升级部署无需强制全员重登。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly blacklist: TokenBlacklistService,
    private readonly authCache: UserAuthCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('未登录或登录已过期');

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      // token 黑名单校验（登出/强制下线）
      if (payload.jti && (await this.blacklist.has(payload.jti))) {
        throw new UnauthorizedException('登录已失效，请重新登录');
      }

      // 实时鉴权上下文（权限/角色/数据范围以数据库为准，而非签发时快照）
      const ctx = await this.authCache.getContext(payload.sub);
      if (!ctx) throw new UnauthorizedException('账号不存在');
      if (ctx.status !== 1) {
        throw new UnauthorizedException('账号已停用，请联系管理员');
      }
      // 会话撤销水位线（安全审查 P1）：改密/重置密码/停用/强制下线后，
      // 签发时间早于水位线的 token 一律失效——一次性撤销该用户全部会话。
      const watermarkMs = ctx.tokenInvalidBefore?.getTime();
      const issuedMs = Number.isFinite(payload.sessionIatMs)
        ? Number(payload.sessionIatMs)
        : payload.iat
          ? payload.iat * 1000
          : null;
      if (
        watermarkMs != null &&
        (issuedMs == null || issuedMs < watermarkMs)
      ) {
        throw new UnauthorizedException('登录已失效，请重新登录');
      }

      (request as any).user = {
        id: ctx.id,
        username: ctx.username,
        realName: ctx.realName,
        deptId: ctx.deptId,
        roleIds: ctx.roleIds,
        roleCodes: ctx.roleCodes,
        permissions: ctx.permissions,
        dataScope: ctx.dataScope,
        customDeptIds: ctx.customDeptIds,
      };
      (request as any).tokenJti = payload.jti;
      return true;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return undefined;
  }
}
