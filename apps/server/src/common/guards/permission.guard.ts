import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_ANY_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * 功能权限守卫（文档 7.2 接口权限）——真正的权限边界。
 * RequirePermissions：需全部拥有（AND）
 * RequireAnyPermissions：拥有其一即可（OR）
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAny = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_ANY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if ((!requiredAll || requiredAll.length === 0) && (!requiredAny || requiredAny.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;
    if (!user) throw new ForbiddenException('无访问权限');

    // admin 超管旁路：系统管理员天然拥有全部功能权限，不受权限点落库进度影响。
    // 安全前提：admin 为内置角色（不可删除、role_code 不可修改），
    // 且启动期 PermissionSyncService 会把全库权限补授给 admin（用于前端按钮显隐）。
    if (user.roleCodes?.includes('admin')) return true;

    const owned = new Set(user.permissions || []);
    if (requiredAll?.length && !requiredAll.every((p) => owned.has(p))) {
      throw new ForbiddenException('无操作权限');
    }
    if (requiredAny?.length && !requiredAny.some((p) => owned.has(p))) {
      throw new ForbiddenException('无操作权限');
    }
    return true;
  }
}
