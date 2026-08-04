import { SetMetadata } from '@nestjs/common';

/** 接口所需权限标识（perm_code），由 PermissionGuard 校验（AND：需全部拥有） */
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

/** 满足其一即可（OR），与 RequirePermissions 互斥使用 */
export const PERMISSIONS_ANY_KEY = 'requiredAnyPermissions';
export const RequireAnyPermissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, perms);
