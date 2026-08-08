import {
  BadRequestException,
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

  async update(
    id: number,
    dto: UpdateUserDto,
    operator: CurrentUserPayload,
  ) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.userRepo.update(id, {
      ...auditOnUpdate(operator),
      realName: dto.realName ?? user.realName,
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
    const hash = await bcrypt.hash(dto.password, 12);
    await this.userRepo.update(id, {
      ...auditOnUpdate(operator),
      password: hash,
      mustChangePwd: 1,
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
    if (user.username === 'admin' && status === 0) {
      throw new BadRequestException('不可停用系统管理员');
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

  /** 批量删除用户（连带清理其角色绑定）。不可删除 admin 与当前登录账号 */
  async removeMany(ids: number[], currentUserId?: number) {
    const validIds = (ids || [])
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);
    if (validIds.length === 0) {
      throw new BadRequestException('请选择要删除的用户');
    }
    if (currentUserId && validIds.includes(currentUserId)) {
      throw new BadRequestException('不可删除当前登录账号');
    }

    const users = await this.userRepo.find({ where: { id: In(validIds) } });
    if (users.some((u) => u.username === 'admin')) {
      throw new BadRequestException('不可删除系统管理员');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRole, { userId: In(validIds) });
      const res = await manager.delete(User, { id: In(validIds) });
      validIds.forEach((uid) => this.authCache.invalidateUser(uid));
      return { deleted: res.affected ?? 0 };
    });
  }

  async findList(query: QueryUserDto) {
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
    if (query.status != null)
      qb.andWhere('u.status = :s', { s: Number(query.status) });
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

    const list = users.map((u) => {
      const myRoleIds = userRoles
        .filter((ur) => ur.userId === u.id)
        .map((ur) => ur.roleId);
      const myRoles = roles.filter((r) => myRoleIds.includes(r.id));
      const dept = depts.find((d) => d.id === u.deptId);
      return {
        id: u.id,
        username: u.username,
        realName: u.realName,
        gender: u.gender,
        deptId: u.deptId,
        deptName: dept?.deptName ?? null,
        phone: u.phone,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        roleIds: myRoleIds,
        roleNames: myRoles.map((r) => r.roleName),
        // 审计四件套：列表页悬浮图标展示，手工挑字段的地方最容易漏
        creatorName: u.creatorName,
        createdAt: u.createdAt,
        updaterName: u.updaterName,
        updatedAt: u.updatedAt,
      };
    });
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const userRoles = await this.userRoleRepo.find({ where: { userId: id } });
    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      gender: user.gender,
      deptId: user.deptId,
      phone: user.phone,
      status: user.status,
      remark: user.remark,
      roleIds: userRoles.map((r) => r.roleId),
      creatorName: user.creatorName,
      createdAt: user.createdAt,
      updaterName: user.updaterName,
      updatedAt: user.updatedAt,
    };
  }
}
