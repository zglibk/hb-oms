import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';
import { Role } from '../entities/role.entity';
import { Department } from '../entities/department.entity';
import {
  AssignRolesDto,
  CreateUserDto,
  QueryUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from '../dto/user.dto';
import { UserAuthCacheService } from '../../auth/user-auth-cache.service';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import {
  auditOnCreate,
  auditOnUpdate,
} from '../../../common/utils/audit.util';
import {
  ADMIN_ROLE_CODE,
  SUPER_ADMIN_ROLE_CODE,
  SUPER_ADMIN_USERNAME,
  normalizeAccountRealName,
} from '@hb-oms/shared';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    private readonly dataSource: DataSource,
    private readonly authCache: UserAuthCacheService,
  ) {}

  async create(dto: CreateUserDto, operator: CurrentUserPayload) {
    const exist = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (exist) throw new BadRequestException('账号已存在');
    await this.assertAdminRoleIsolation(dto.username, dto.roleIds, operator);

    return this.dataSource.transaction(async (manager) => {
      const hash = await bcrypt.hash(dto.password, 12);
      const user = manager.create(User, {
        ...auditOnCreate(operator),
        username: dto.username,
        password: hash,
        realName: dto.realName,
        gender: dto.gender ?? 0,
        deptId: dto.deptId ?? null,
        phone: dto.phone,
        remark: dto.remark,
        status: 1,
        mustChangePwd: 1, // 首次登录强制改密（文档 19.3.2）
      });
      const saved = await manager.save(user);
      await this.bindRoles(manager, saved.id, dto.roleIds);
      return { id: saved.id };
    });
  }

  private async bindRoles(manager: any, userId: number, roleIds: number[]) {
    await manager.delete(UserRole, { userId });
    if (roleIds?.length) {
      const rows = roleIds.map((roleId) =>
        manager.create(UserRole, { userId, roleId }),
      );
      await manager.save(UserRole, rows);
    }
  }

  /**
   * 超级管理员角色只属于唯一内置 admin 账号；管理员 SYS_OPR 只允许超级管理员分配。
   * 必须在服务端校验，不能只靠前端隐藏选项，否则直调 API 仍可制造超管账号。
   */
  private async assertAdminRoleIsolation(
    username: string,
    roleIds: number[],
    operator: CurrentUserPayload,
  ) {
    const adminRole = await this.roleRepo.findOne({
      where: { roleCode: SUPER_ADMIN_ROLE_CODE },
    });
    if (!adminRole) {
      throw new BadRequestException('超级管理员角色不存在，请联系运维人员');
    }
    const hasAdminRole = (roleIds ?? []).includes(adminRole.id);
    if (username === SUPER_ADMIN_USERNAME && !hasAdminRole) {
      throw new BadRequestException('超级管理员账号必须保留超级管理员角色');
    }
    if (username !== SUPER_ADMIN_USERNAME && hasAdminRole) {
      throw new BadRequestException('超级管理员角色仅限内置 admin 账号使用');
    }
    const managerRole = await this.roleRepo.findOne({ where: { roleCode: ADMIN_ROLE_CODE } });
    if ((roleIds ?? []).includes(managerRole?.id ?? -1) && operator.username !== SUPER_ADMIN_USERNAME) {
      throw new BadRequestException('只有超级管理员可以分配管理员角色');
    }
  }

  /** 管理员与超级管理员账号只能由超级管理员在用户管理中维护。 */
  private async assertCanManagePrivilegedAccount(
    user: User,
    operator: CurrentUserPayload,
  ) {
    if (operator.username === SUPER_ADMIN_USERNAME) return;
    if (user.username === SUPER_ADMIN_USERNAME) {
      throw new ForbiddenException('超级管理员账号仅可由超级管理员维护');
    }
    const managerRole = await this.roleRepo.findOne({
      where: { roleCode: ADMIN_ROLE_CODE },
    });
    if (!managerRole) return;
    const bound = await this.userRoleRepo.count({
      where: { userId: user.id, roleId: managerRole.id },
    });
    if (bound > 0) {
      throw new ForbiddenException('管理员账号仅可由超级管理员维护');
    }
  }

  /** 解除登录锁定属于账号安全操作，只允许内置管理员与超级管理员。 */
  private assertCanUnlockAccount(operator: CurrentUserPayload) {
    if (
      operator.username === SUPER_ADMIN_USERNAME ||
      operator.roleCodes?.includes(ADMIN_ROLE_CODE)
    ) {
      return;
    }
    throw new ForbiddenException('仅管理员或超级管理员可解除账号锁定');
  }

  private isLoginLocked(user: Pick<User, 'lockedUntil'>, now = Date.now()) {
    return !!user.lockedUntil && user.lockedUntil.getTime() > now;
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    operator: CurrentUserPayload,
  ) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.assertCanManagePrivilegedAccount(user, operator);
    await this.userRepo.update(id, {
      ...auditOnUpdate(operator),
      realName: normalizeAccountRealName(
        user.username,
        dto.realName ?? user.realName,
      ),
      gender: dto.gender ?? user.gender,
      deptId: dto.deptId ?? user.deptId,
      phone: dto.phone ?? user.phone,
      remark: dto.remark ?? user.remark,
      avatar: dto.avatar ?? user.avatar,
      status: dto.status ?? user.status,
    });
    this.authCache.invalidateUser(id); // 部门/停用变更即刻生效
    return { id };
  }

  async assignRoles(
    id: number,
    dto: AssignRolesDto,
    operator: CurrentUserPayload,
  ) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.assertCanManagePrivilegedAccount(user, operator);
    await this.assertAdminRoleIsolation(user.username, dto.roleIds, operator);
    await this.dataSource.transaction(async (m) => {
      await this.bindRoles(m, id, dto.roleIds);
      // 角色绑定是对该账号的人工变更，计入其审计
      await m.update(User, id, auditOnUpdate(operator));
    });
    this.authCache.invalidateUser(id); // 角色绑定变更即刻生效
    return { id };
  }

  async resetPassword(
    id: number,
    dto: ResetPasswordDto,
    operator: CurrentUserPayload,
  ) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.assertCanManagePrivilegedAccount(user, operator);
    const hash = await bcrypt.hash(dto.password, 12);
    await this.userRepo.update(id, {
      ...auditOnUpdate(operator),
      password: hash,
      mustChangePwd: 1,
      // 管理员已经为账号设置新密码时，一并清除旧密码造成的失败计数与登录锁定。
      loginFailCount: 0,
      lockedUntil: null,
      // 重置密码后撤销该用户全部历史会话（安全审查 P1）
      tokenInvalidBefore: new Date(),
    });
    this.authCache.invalidateUser(id);
    return { id };
  }

  /** 启停账号 */
  async toggleStatus(
    id: number,
    status: number,
    operator: CurrentUserPayload,
  ) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.assertCanManagePrivilegedAccount(user, operator);
    if (user.username === SUPER_ADMIN_USERNAME && status === 0) {
      throw new BadRequestException('不可停用超级管理员');
    }
    await this.userRepo.update(id, {
      ...auditOnUpdate(operator),
      status,
      // 停用账号时一并撤销其全部会话，防止已泄露的 refresh token 在重新启用后复活
      ...(status === 0 ? { tokenInvalidBefore: new Date() } : {}),
    });
    this.authCache.invalidateUser(id); // 停用即刻生效（无需等 token 过期）
    return { id, status };
  }

  /**
   * 解除连续输错密码造成的临时登录锁定。
   * 权限守卫负责 user:update；这里再硬性限定管理员层级与可维护目标，防 API 直调越权。
   */
  async unlock(id: number, operator: CurrentUserPayload) {
    this.assertCanUnlockAccount(operator);
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.assertCanManagePrivilegedAccount(user, operator);
    if (!this.isLoginLocked(user)) {
      throw new BadRequestException('账号当前未处于登录锁定状态');
    }
    await this.userRepo.update(id, {
      ...auditOnUpdate(operator),
      loginFailCount: 0,
      lockedUntil: null,
    });
    return { id, unlocked: true };
  }

  /** 批量删除用户（连带清理其角色绑定）。不可删除 admin 与当前登录账号 */
  async removeMany(ids: number[], operator: CurrentUserPayload) {
    const validIds = (ids || [])
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);
    if (validIds.length === 0) {
      throw new BadRequestException('请选择要删除的用户');
    }
    if (validIds.includes(operator.id)) {
      throw new BadRequestException('不可删除当前登录账号');
    }

    const users = await this.userRepo.find({ where: { id: In(validIds) } });
    if (users.some((u) => u.username === SUPER_ADMIN_USERNAME)) {
      throw new BadRequestException('不可删除超级管理员');
    }
    if (operator.username !== SUPER_ADMIN_USERNAME) {
      const managerRole = await this.roleRepo.findOne({
        where: { roleCode: ADMIN_ROLE_CODE },
      });
      const managerCount = managerRole
        ? await this.userRoleRepo.count({
            where: { userId: In(validIds), roleId: managerRole.id },
          })
        : 0;
      if (managerCount > 0) {
        throw new ForbiddenException('管理员账号仅可由超级管理员删除');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRole, { userId: In(validIds) });
      const res = await manager.delete(User, { id: In(validIds) });
      validIds.forEach((uid) => this.authCache.invalidateUser(uid));
      return { deleted: res.affected ?? 0 };
    });
  }

  async findList(query: QueryUserDto, viewer: CurrentUserPayload) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const qb = this.userRepo.createQueryBuilder('u');
    if (query.keyword) {
      qb.andWhere('(u.username LIKE :kw OR u.real_name LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.deptId != null)
      qb.andWhere('u.dept_id = :d', { d: Number(query.deptId) });
    const now = new Date();
    if (query.accountState === 'locked') {
      qb.andWhere('u.status = 1').andWhere('u.locked_until > :now', { now });
    } else if (query.accountState === 'enabled') {
      qb
        .andWhere('u.status = 1')
        .andWhere('(u.locked_until IS NULL OR u.locked_until <= :now)', { now });
    } else if (query.accountState === 'disabled') {
      qb.andWhere('u.status = 0');
    } else if (query.status != null) {
      // 保留旧 status 查询参数兼容；新页面统一改用 accountState。
      qb.andWhere('u.status = :s', { s: Number(query.status) });
    }
    qb.orderBy('u.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [users, total] = await qb.getManyAndCount();

    // 附带角色与部门名
    const ids = users.map((u) => u.id);
    const userRoles = ids.length
      ? await this.userRoleRepo.find({ where: { userId: In(ids) } })
      : [];
    const roleIds = [...new Set(userRoles.map((r) => r.roleId))];
    const roles = roleIds.length
      ? await this.roleRepo.find({ where: { id: In(roleIds) } })
      : [];
    const depts = await this.deptRepo.find();

    const viewerCanUnlock = Boolean(
      viewer.username === SUPER_ADMIN_USERNAME ||
      viewer.roleCodes?.includes(ADMIN_ROLE_CODE),
    );
    const nowMs = Date.now();
    const list = users.map((u) => {
      const myRoleIds = userRoles
        .filter((ur) => ur.userId === u.id)
        .map((ur) => ur.roleId);
      const myRoles = roles.filter((r) => myRoleIds.includes(r.id));
      const adminLevel = u.username === SUPER_ADMIN_USERNAME
        ? 'super'
        : myRoles.some((r) => r.roleCode === ADMIN_ROLE_CODE)
          ? 'manager'
          : null;
      const dept = depts.find((d) => d.id === u.deptId);
      const canManage =
        viewer.username === SUPER_ADMIN_USERNAME || adminLevel == null;
      return {
        id: u.id,
        username: u.username,
        realName: normalizeAccountRealName(u.username, u.realName),
        gender: u.gender,
        deptId: u.deptId,
        deptName: dept?.deptName ?? null,
        phone: u.phone,
        status: u.status,
        isLocked: this.isLoginLocked(u, nowMs),
        lockedUntil: u.lockedUntil,
        lastLoginAt: u.lastLoginAt,
        roleIds: myRoles.map((r) => r.id),
        roleNames: myRoles.map((r) => r.roleName),
        adminLevel,
        canManage,
        canUnlock: viewerCanUnlock && canManage,
        // 审计四件套：列表页悬浮图标展示，手工挑字段的地方最容易漏
        creatorName: u.creatorName,
        createdAt: u.createdAt,
        updaterName: u.updaterName,
        updatedAt: u.updatedAt,
      };
    });
    return { list, total, page, pageSize };
  }

  async findOne(id: number, viewer: CurrentUserPayload) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const userRoles = await this.userRoleRepo.find({ where: { userId: id } });
    const roleIds = userRoles.map((r) => r.roleId);
    const roles = roleIds.length
      ? await this.roleRepo.find({ where: { id: In(roleIds) } })
      : [];
    const adminLevel = user.username === SUPER_ADMIN_USERNAME
      ? 'super'
      : roles.some((r) => r.roleCode === ADMIN_ROLE_CODE)
        ? 'manager'
        : null;
    const canManage = viewer.username === SUPER_ADMIN_USERNAME || adminLevel == null;
    const viewerCanUnlock = Boolean(
      viewer.username === SUPER_ADMIN_USERNAME ||
      viewer.roleCodes?.includes(ADMIN_ROLE_CODE),
    );
    return {
      id: user.id,
      username: user.username,
      realName: normalizeAccountRealName(user.username, user.realName),
      gender: user.gender,
      deptId: user.deptId,
      phone: user.phone,
      status: user.status,
      isLocked: this.isLoginLocked(user),
      lockedUntil: user.lockedUntil,
      remark: user.remark,
      roleIds,
      adminLevel,
      canManage,
      canUnlock: viewerCanUnlock && canManage,
      creatorName: user.creatorName,
      createdAt: user.createdAt,
      updaterName: user.updaterName,
      updatedAt: user.updatedAt,
    };
  }
}
