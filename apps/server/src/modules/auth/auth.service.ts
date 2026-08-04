import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../system/entities/user.entity';
import { UserRole } from '../system/entities/user-role.entity';
import { Role } from '../system/entities/role.entity';
import { RolePermission } from '../system/entities/role-permission.entity';
import { Permission } from '../system/entities/permission.entity';
import { RoleDept } from '../system/entities/role-dept.entity';
import { Department } from '../system/entities/department.entity';
import { TokenBlacklistService } from './token-blacklist.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { CaptchaService } from '../captcha/captcha.service';
import { OperationLogWriterService } from '../../common/services/operation-log-writer.service';
import { extractClientIp } from '../../common/utils/operation-log.util';
import { Request } from 'express';
import { ModuleRef } from '@nestjs/core';
import { USER_AUTH_CACHE } from './auth.tokens';

const MAX_FAIL = 5;
const LOCK_MINUTES = 30;

export interface MenuNode {
  id: number;
  name: string;
  path: string | null;
  component: string | null;
  icon: string | null;
  children: MenuNode[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(RoleDept)
    private readonly roleDeptRepo: Repository<RoleDept>,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly blacklist: TokenBlacklistService,
    private readonly captchaService: CaptchaService,
    private readonly logWriter: OperationLogWriterService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** 登录：校验密码 + 失败锁定，返回 token + 用户信息 + 菜单 + 权限 */
  async login(dto: LoginDto, req?: Request) {
    const ip = req ? extractClientIp(req) : '';
    const writeAuthLog = (
      action: string,
      result: number,
      userId?: number | null,
      userName?: string | null,
    ) => {
      this.logWriter.write({
        userId: userId ?? null,
        userName: userName ?? dto.username,
        module: '系统认证',
        action,
        description: action,
        method: 'POST',
        url: '/api/auth/login',
        ip,
        params: JSON.stringify({ body: { username: dto.username }, query: {} }),
        result,
        bizType: 'auth',
        bizId: userId ?? null,
      });
    };
    // 第一步：核销滑块验证一次性凭证（原子消费，防重放；缺失/过期/复用均拒绝）
    this.captchaService.consumeVerifyToken(dto.captchaToken);

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.username = :username', { username: dto.username })
      .getOne();

    if (!user) {
      writeAuthLog('登录失败', 0, null, dto.username);
      throw new UnauthorizedException('账号或密码错误');
    }
    if (user.status !== 1) {
      writeAuthLog('登录失败(账号停用)', 0, user.id, user.realName || user.username);
      throw new UnauthorizedException('账号已停用，请联系管理员');
    }

    // 锁定校验
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      writeAuthLog('登录失败(账号锁定)', 0, user.id, user.realName || user.username);
      throw new UnauthorizedException(`账号已锁定，请 ${mins} 分钟后重试`);
    }

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      // 累计失败，达上限锁定 30 分钟（文档 19.3.2）
      const fail = (user.loginFailCount || 0) + 1;
      const patch: Partial<User> = { loginFailCount: fail };
      if (fail >= MAX_FAIL) {
        patch.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        patch.loginFailCount = 0;
      }
      await this.userRepo.update(user.id, patch);
      if (fail >= MAX_FAIL) {
        writeAuthLog('登录失败(账号锁定)', 0, user.id, user.realName || user.username);
        throw new UnauthorizedException(
          `密码错误次数过多，账号锁定 ${LOCK_MINUTES} 分钟`,
        );
      }
      writeAuthLog('登录失败', 0, user.id, user.realName || user.username);
      throw new UnauthorizedException(
        `账号或密码错误（还可尝试 ${MAX_FAIL - fail} 次）`,
      );
    }

    // 登录成功，清零失败计数 + 记录登录时间
    await this.userRepo.update(user.id, {
      loginFailCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    writeAuthLog('登录成功', 1, user.id, user.realName || user.username);

    const auth = await this.loadUserAuth(user.id);
    const tokens = await this.signTokens(user);

    const dept = user.deptId
      ? await this.deptRepo.findOne({ where: { id: user.deptId } })
      : null;

    const now = new Date();
    return {
      ...tokens,
      userInfo: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        gender: user.gender,
        deptId: user.deptId,
        deptName: dept?.deptName ?? null,
        phone: user.phone,
        remark: user.remark,
        status: user.status,
        mustChangePwd: user.mustChangePwd === 1,
        avatar: user.avatar,
        lastLoginAt: now.toISOString(),
        createdAt: user.createdAt.toISOString(),
      },
      roles: auth.roleCodes,
      roleNames: auth.roleNames,
      permissions: auth.permissions,
      menus: auth.menus,
    };
  }

  /** 聚合用户的角色、权限标识集合、最大数据范围、自定义部门、菜单树 */
  async loadUserAuth(userId: number) {
    const userRoles = await this.userRoleRepo.find({ where: { userId } });
    const roleIds = userRoles.map((r) => r.roleId);

    let roles: Role[] = [];
    let permissions: Permission[] = [];
    let customDeptIds: number[] = [];

    if (roleIds.length) {
      roles = await this.roleRepo.find({
        where: { id: In(roleIds), status: 1 },
      });
      // 仅取「启用」角色的 id 用于后续权限/部门查询：
      // 停用角色(status=0)必须完全失去授权能力，否则其绑定的权限点与自定义
      // 部门范围仍会并入用户权限集合，"停用角色"形同虚设（安全审查 P1）。
      const activeRoleIds = roles.map((r) => r.id);

      if (activeRoleIds.length) {
        const rolePerms = await this.rolePermRepo.find({
          where: { roleId: In(activeRoleIds) },
        });
        const permIds = [...new Set(rolePerms.map((rp) => rp.permissionId))];
        if (permIds.length) {
          permissions = await this.permRepo.find({
            where: { id: In(permIds), status: 1 },
          });
        }
        // data_scope=5 自定义部门（同样只看启用角色）
        const hasCustom = roles.some((r) => r.dataScope === 5);
        if (hasCustom) {
          const rd = await this.roleDeptRepo.find({
            where: { roleId: In(activeRoleIds) },
          });
          customDeptIds = [...new Set(rd.map((x) => x.deptId))];
        }
      }
    }

    // 多角色取最大数据范围（值越小范围越大，1=全部最大）
    const dataScope = roles.length
      ? Math.min(...roles.map((r) => r.dataScope))
      : 4;

    const permCodes = [...new Set(permissions.map((p) => p.permCode))];
    const menus = this.buildMenuTree(permissions);

    return {
      // 返回启用角色的 id（停用角色不参与任何鉴权判定）
      roleIds: roles.map((r) => r.id),
      roleCodes: roles.map((r) => r.roleCode),
      roleNames: roles.map((r) => r.roleName),
      permissions: permCodes,
      dataScope,
      customDeptIds,
      menus,
    };
  }

  /** 由菜单类型(perm_type=1)权限构建前端菜单树 */
  private buildMenuTree(permissions: Permission[]): MenuNode[] {
    const menus = permissions
      .filter((p) => p.permType === 1)
      .sort((a, b) => a.sort - b.sort);
    const byId = new Map<number, MenuNode>();
    menus.forEach((m) =>
      byId.set(m.id, {
        id: m.id,
        name: m.permName,
        path: m.menuPath,
        component: m.component,
        icon: m.icon,
        children: [],
      }),
    );
    const roots: MenuNode[] = [];
    menus.forEach((m) => {
      const node = byId.get(m.id)!;
      const parent = byId.get(m.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    return roots;
  }

  /** 将 '7d' / '2h' / '900s' 形式的有效期解析为秒 */
  private parseExpiresToSeconds(v: string | undefined, fallback: number): number {
    if (!v) return fallback;
    const m = /^(\d+)\s*([smhd])?$/i.exec(v.trim());
    if (!m) return fallback;
    const n = Number(m[1]);
    const unit = (m[2] || 's').toLowerCase();
    const mult = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
    return n * mult;
  }

  /** refresh token 的有效期（秒）——黑名单 TTL 必须以它为准，而非 access 的 2h */
  private refreshTtlSeconds(): number {
    return this.parseExpiresToSeconds(
      this.config.get<string>('JWT_REFRESH_EXPIRES'),
      7 * 24 * 3600,
    );
  }

  /**
   * 签发 access + refresh token，携带 jti 供黑名单。
   * 载荷只放身份（sub/jti/username）——角色/权限/数据范围一律由
   * UserAuthCacheService 在每次请求时实时读库（缺陷 A 根治：
   * 权限不再冻结在 token 里，分配后即刻生效，无需重新登录）。
   */
  private async signTokens(user: User) {
    const jti = uuidv4();
    const sessionIatMs = Date.now();
    const payload = {
      sub: user.id,
      jti,
      username: user.username,
      sessionIatMs,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES') || '2h',
    });
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti, type: 'refresh', sessionIatMs },
      { expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES') || '7d' },
    );
    return { accessToken, refreshToken };
  }

  /**
   * 登出：将 jti 加入黑名单。
   *
   * 安全审查 P1：access 与 refresh 共用同一 jti，拉黑即可同时废掉两者；
   * 但旧实现 TTL 只给了 2 小时（access 的有效期），而 refresh 有效期长达 7 天——
   * 登出满 2 小时后黑名单条目自动过期，泄露的 refresh token 又能换取新 access token。
   * 现按 refresh 的完整有效期设置 TTL，确保登出后该会话在其生命周期内彻底作废。
   */
  async logout(jti: string | undefined) {
    if (jti) {
      await this.blacklist.add(jti, this.refreshTtlSeconds());
    }
    return { success: true };
  }

  /** 刷新 access token */
  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('刷新令牌无效');
    }
    if (!payload.jti || (await this.blacklist.has(payload.jti))) {
      // 该 jti 已被拉黑：可能是已登出，也可能是「旧 refresh token 被重放」
      // （轮换后旧 token 立即入黑名单，再次出现即视为重放，直接拒绝）
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('账号不可用');
    }
    // 会话撤销水位线：改密/重置/停用后签发时间早于水位线的 token 一律失效
    if (this.isRevokedByWatermark(user, payload.iat, payload.sessionIatMs)) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }

    // 原子消费旧 jti 后再签发新 token。若两个相同 refresh token 并发到达，
    // addIfAbsent 只允许一个成功，另一个按重放拒绝。
    const consumed = await this.blacklist.addIfAbsent(
      payload.jti,
      this.refreshTtlSeconds(),
    );
    if (!consumed) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }

    // refresh token 轮换（安全审查 P1）：
    //   旧实现允许同一 refresh token 在 7 天内反复刷新，一旦泄露即可长期续命。
    //   现改为「一次性使用」——每次刷新签发新 jti，并立即拉黑旧 jti，
    //   使旧 token（含与之共享 jti 的旧 access token）当场作废，且重放会被识别。
    return this.signTokens(user);
  }

  /**
   * 判断 token 是否被会话撤销水位线作废。
   * @param iat JWT 签发时间（秒级 Unix 时间戳）
   */
  isRevokedByWatermark(
    user: Pick<User, 'tokenInvalidBefore'>,
    iat: number | undefined,
    sessionIatMs?: number,
  ): boolean {
    if (!user.tokenInvalidBefore) return false;
    const watermarkMs = user.tokenInvalidBefore.getTime();
    if (Number.isFinite(sessionIatMs)) return Number(sessionIatMs) < watermarkMs;
    if (!iat) return true; // 无签发时间的 token 一律不信任
    // 兼容升级前签发、尚无毫秒字段的 token；秒级 iat 按该秒起点比较。
    return iat * 1000 < watermarkMs;
  }

  /** 撤销指定用户的全部会话（改密/重置密码/停用/强制下线时调用） */
  async revokeAllSessions(userId: number): Promise<void> {
    await this.userRepo.update(userId, { tokenInvalidBefore: new Date() });
    this.invalidateAuthCache(userId);
  }

  /** AuthService 被缓存服务依赖，运行时通过 ModuleRef 失效缓存以避免构造器循环。 */
  private invalidateAuthCache(userId: number): void {
    this.moduleRef
      .get<{ invalidateUser(id: number): void }>(USER_AUTH_CACHE, {
        strict: false,
      })
      .invalidateUser(userId);
  }

  /** 获取当前登录用户信息（含最新权限/菜单，权限变更后刷新生效） */
  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const auth = await this.loadUserAuth(userId);
    const dept = user.deptId
      ? await this.deptRepo.findOne({ where: { id: user.deptId } })
      : null;
    return {
      userInfo: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        gender: user.gender,
        deptId: user.deptId,
        deptName: dept?.deptName ?? null,
        phone: user.phone,
        remark: user.remark,
        status: user.status,
        mustChangePwd: user.mustChangePwd === 1,
        avatar: user.avatar,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      roles: auth.roleCodes,
      roleNames: auth.roleNames,
      permissions: auth.permissions,
      menus: auth.menus,
    };
  }

  /** 个人中心自助更新（仅 realName / gender / phone / remark / avatar） */
  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    await this.userRepo.update(userId, {
      realName: dto.realName,
      gender: dto.gender ?? user.gender,
      phone: dto.phone ?? user.phone,
      remark: dto.remark ?? user.remark,
      avatar: dto.avatar ?? user.avatar,
    });
    return this.getProfile(userId);
  }

  /** 修改密码 */
  async changePassword(user: CurrentUserPayload, dto: ChangePasswordDto) {
    const u = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id: user.id })
      .getOne();
    if (!u) throw new UnauthorizedException('用户不存在');

    const ok = await bcrypt.compare(dto.oldPassword, u.password);
    if (!ok) throw new BadRequestException('原密码错误');

    this.validatePasswordStrength(dto.newPassword);
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepo.update(u.id, {
      password: hash,
      mustChangePwd: 0,
      // 改密后撤销全部历史会话（含其他设备上尚未过期的 refresh token）
      tokenInvalidBefore: new Date(),
    });
    this.invalidateAuthCache(u.id);
    return { success: true };
  }

  /** 密码强度：≥8 位，含大小写/数字/特殊字符中至少三种（文档 19.3.2） */
  private validatePasswordStrength(pwd: string) {
    if (pwd.length < 8) throw new BadRequestException('密码至少 8 位');
    let kinds = 0;
    if (/[a-z]/.test(pwd)) kinds++;
    if (/[A-Z]/.test(pwd)) kinds++;
    if (/[0-9]/.test(pwd)) kinds++;
    if (/[^a-zA-Z0-9]/.test(pwd)) kinds++;
    if (kinds < 3) {
      throw new BadRequestException(
        '密码需包含大写、小写、数字、特殊字符中的至少三种',
      );
    }
  }
}
