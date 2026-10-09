import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { RoleDept } from '../entities/role-dept.entity';
import { UserRole } from '../entities/user-role.entity';
import { Permission } from '../entities/permission.entity';
import {
  AssignPermsDto,
  CreateRoleDto,
  UpdateRoleDto,
} from '../dto/role.dto';
import { UserAuthCacheService } from '../../auth/user-auth-cache.service';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import {
  auditOnCreate,
  auditOnUpdate,
} from '../../../common/utils/audit.util';
import { ADMIN_ONLY_PERMISSION_CODES } from '../permission-manifest';
import {
  SUPER_ADMIN_ROLE_CODE,
  SUPER_ADMIN_USERNAME,
  isPrivilegedAdminRoleCode,
} from '@hb-oms/shared';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    @InjectRepository(RoleDept)
    private readonly roleDeptRepo: Repository<RoleDept>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    private readonly dataSource: DataSource,
    private readonly authCache: UserAuthCacheService,
  ) {}

  async findAll(user: CurrentUserPayload) {
    const roles = await this.roleRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
    return user.username === SUPER_ADMIN_USERNAME
      ? roles
      : roles.filter((r) => !isPrivilegedAdminRoleCode(r.roleCode));
  }

  private async assertPrivilegedRoleManageable(id: number, user: CurrentUserPayload) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    if (
      isPrivilegedAdminRoleCode(role.roleCode) &&
      user.username !== SUPER_ADMIN_USERNAME
    ) {
      throw new NotFoundException('角色不存在');
    }
    return role;
  }

  async create(dto: CreateRoleDto, user: CurrentUserPayload) {
    const exist = await this.roleRepo.findOne({
      where: { roleCode: dto.roleCode },
    });
    if (exist) throw new BadRequestException('角色编码已存在');
    const result = await this.dataSource.transaction(async (manager) => {
      const role = manager.create(Role, {
        roleCode: dto.roleCode,
        roleName: dto.roleName,
        dataScope: dto.dataScope,
        sort: dto.sort ?? 0,
        remark: dto.remark,
        isBuiltin: 0,
        status: 1,
        ...auditOnCreate(user),
      });
      const saved = await manager.save(role);
      if (dto.dataScope === 5 && dto.deptIds?.length) {
        await this.bindDepts(manager, saved.id, dto.deptIds);
      }
      return { id: saved.id };
    });
    return result;
  }

  async update(id: number, dto: UpdateRoleDto, user: CurrentUserPayload) {
    const role = await this.assertPrivilegedRoleManageable(id, user);
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.update(Role, id, {
        roleName: dto.roleName ?? role.roleName,
        dataScope: dto.dataScope ?? role.dataScope,
        sort: dto.sort ?? role.sort,
        remark: dto.remark ?? role.remark,
        status: dto.status ?? role.status,
        ...auditOnUpdate(user),
      });
      const scope = dto.dataScope ?? role.dataScope;
      if (scope === 5 && dto.deptIds) {
        await this.bindDepts(manager, id, dto.deptIds);
      } else if (scope !== 5) {
        await manager.delete(RoleDept, { roleId: id });
      }
      return { id };
    });
    // 事务提交后再失效，避免并发请求在提交前回填旧权限缓存。
    this.authCache.invalidateAll();
    return result;
  }

  private async bindDepts(manager: any, roleId: number, deptIds: number[]) {
    await manager.delete(RoleDept, { roleId });
    if (deptIds?.length) {
      const rows = deptIds.map((deptId) =>
        manager.create(RoleDept, { roleId, deptId }),
      );
      await manager.save(RoleDept, rows);
    }
  }

  async remove(id: number, user: CurrentUserPayload) {
    const role = await this.assertPrivilegedRoleManageable(id, user);
    if (role.isBuiltin === 1) {
      throw new BadRequestException('系统内置角色不可删除');
    }
    const used = await this.userRoleRepo.count({ where: { roleId: id } });
    if (used > 0) {
      throw new BadRequestException('该角色下仍有用户，不可删除');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId: id });
      await manager.delete(RoleDept, { roleId: id });
      await manager.delete(Role, id);
    });
    this.authCache.invalidateAll();
    return { id };
  }

  /** 获取角色已分配的权限ID */
  async getPermissions(id: number, user: CurrentUserPayload) {
    await this.assertPrivilegedRoleManageable(id, user);
    const rows = await this.rolePermRepo.find({ where: { roleId: id } });
    return rows.map((r) => r.permissionId);
  }

  /**
   * 授权集合规范化（服务端兜底，不只靠前端勾选——API 直调同样造不出半残授权）：
   *   规则一 **父链补齐**：缺父级会让 buildMenuTree 断链，出现"权限在、菜单不显示"；
   *   规则二 **同页读权限补齐**：授了菜单 M 下任一按钮，就补上 M 下所有
   *          perm_type=2 且 access_type=1 的读权限点，杜绝"页面能开、列表 403"。
   *
   * ⚠️ 规则二**必须限定 perm_type=2**。菜单节点自身也是 access_type=1，
   * 不限定的话「系统管理」下清一色兄弟菜单，只授「数据字典」会被连带补上
   * 用户管理/角色管理/菜单权限……属静默越权。兄弟菜单是各自独立的页面，
   * 必须逐个授权（hb-mes 曾真实踩过，见其 CLAUDE.md §2.1）。
   */
  private async normalizePermissionIds(ids: number[]): Promise<number[]> {
    const wanted = new Set(ids.filter((x) => Number.isInteger(x) && x > 0));
    if (!wanted.size) return [];
    const all = await this.permRepo.find();
    const permById = new Map(all.map((p) => [p.id, p]));
    // 菜单 → 其下按钮型的查看类权限点（不含兄弟菜单，见上方 ⚠️）
    const viewButtonsByParent = new Map<number, number[]>();
    for (const p of all) {
      if (p.accessType === 1 && p.permType === 2 && p.parentId !== 0) {
        const arr = viewButtonsByParent.get(p.parentId) ?? [];
        arr.push(p.id);
        viewButtonsByParent.set(p.parentId, arr);
      }
    }
    // 规则二：先按已勾选项的父级补齐同页读权限点
    for (const id of [...wanted]) {
      const p = permById.get(id);
      if (!p || p.parentId === 0) continue;
      for (const viewId of viewButtonsByParent.get(p.parentId) ?? []) {
        wanted.add(viewId);
      }
    }
    // 规则一：逐级向上补齐父链（permById 有限，循环必然收敛）
    for (const id of [...wanted]) {
      let cur = permById.get(id);
      while (cur && cur.parentId !== 0) {
        if (wanted.has(cur.parentId)) break; // 上游已补过，无需重复走
        wanted.add(cur.parentId);
        cur = permById.get(cur.parentId);
      }
    }
    return [...wanted];
  }

  /** 分配权限 */
  async assignPermissions(
    id: number,
    dto: AssignPermsDto,
    user: CurrentUserPayload,
  ) {
    const role = await this.assertPrivilegedRoleManageable(id, user);
    const permissionIds = await this.normalizePermissionIds(
      dto.permissionIds ?? [],
    );
    if (role.roleCode !== SUPER_ADMIN_ROLE_CODE && permissionIds.length) {
      const forbidden = await this.permRepo.find({
        where: { id: In(permissionIds), permCode: In([...ADMIN_ONLY_PERMISSION_CODES]) },
      });
      if (forbidden.length) throw new BadRequestException('超级管理员专属权限不可授予其他角色');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId: id });
      if (permissionIds.length) {
        const rows = permissionIds.map((permissionId) =>
          manager.create(RolePermission, { roleId: id, permissionId }),
        );
        await manager.save(RolePermission, rows);
      }
      // 授权即角色变更，计入角色审计（「谁最后调过这个角色的权限」）
      await manager.update(Role, id, auditOnUpdate(user));
    });
    // 主动失效鉴权缓存：该角色下所有在线用户的下一次请求即按新权限校验，
    // 无需重新登录（后端守卫实时读库，前端菜单在刷新/重进页面后同步）。
    this.authCache.invalidateAll();
    return { id, permissionIds };
  }

  async getDepts(id: number, user: CurrentUserPayload) {
    await this.assertPrivilegedRoleManageable(id, user);
    const rows = await this.roleDeptRepo.find({ where: { roleId: id } });
    return rows.map((r) => r.deptId);
  }
}
