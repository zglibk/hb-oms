import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

/** 当前登录用户载荷（由 JwtAuthGuard 注入到 request.user） */
export interface CurrentUserPayload {
  id: number;
  username: string;
  realName: string;
  deptId: number | null;
  roleIds: number[];
  roleCodes: string[];
  permissions: string[]; // perm_code 集合
  dataScope: number; // 多角色取最大范围
  customDeptIds: number[]; // data_scope=5 时的自定义部门
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;
    return data ? user?.[data] : user;
  },
);
