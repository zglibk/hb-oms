import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
} from '../dto/permission.dto';
import { UserAuthCacheService } from '../../auth/user-auth-cache.service';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import {
  auditOnCreate,
  auditOnUpdate,
} from '../../../common/utils/audit.util';

export interface PermTreeNode extends Permission {
  children: PermTreeNode[];
}

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    private readonly authCache: UserAuthCacheService,
  ) {}

  /** 全部权限树（菜单+按钮+接口），供角色分配权限和菜单管理用 */
  async tree() {
    const all = await this.permRepo.find({
      order: { sort: 'ASC', id: 'ASC' },
    });
    return this.buildTree(all, 0);
  }

  private buildTree(all: Permission[], parentId: number): PermTreeNode[] {
    return all
      .filter((p) => p.parentId === parentId)
      .map((p) => ({
        ...p,
        children: this.buildTree(all, p.id),
      }));
  }

  async findAll() {
    return this.permRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  async create(dto: CreatePermissionDto, user: CurrentUserPayload) {
    const exist = await this.permRepo.findOne({
      where: { permCode: dto.permCode },
    });
    if (exist) throw new BadRequestException('权限标识已存在');
    const permType = dto.permType;
    const perm = this.permRepo.create({
      permCode: dto.permCode,
      permName: dto.permName,
      permType,
      parentId: dto.parentId ?? 0,
      menuPath: dto.menuPath ?? null,
      component: dto.component ?? null,
      apiPattern: dto.apiPattern ?? null,
      icon: dto.icon ?? null,
      sort: dto.sort ?? 0,
      status: 1,
      // 与清单 accessTypeOf 同口径：菜单=查看、按钮=操作
      accessType: dto.accessType ?? (permType === 1 ? 1 : 0),
      ...auditOnCreate(user),
    });
    const saved = await this.permRepo.save(perm);
    this.authCache.invalidateAll();
    return { id: saved.id };
  }

  async update(id: number, dto: UpdatePermissionDto, user: CurrentUserPayload) {
    const perm = await this.permRepo.findOne({ where: { id } });
    if (!perm) throw new NotFoundException('权限不存在');
    await this.permRepo.update(id, {
      permName: dto.permName ?? perm.permName,
      permType: dto.permType ?? perm.permType,
      parentId: dto.parentId ?? perm.parentId,
      menuPath: dto.menuPath ?? perm.menuPath,
      component: dto.component ?? perm.component,
      apiPattern: dto.apiPattern ?? perm.apiPattern,
      icon: dto.icon ?? perm.icon,
      sort: dto.sort ?? perm.sort,
      status: dto.status ?? perm.status,
      accessType: dto.accessType ?? perm.accessType,
      ...auditOnUpdate(user),
    });
    this.authCache.invalidateAll(); // 停用/改父级等结构变化即刻生效
    return { id };
  }

  async remove(id: number) {
    const children = await this.permRepo.count({ where: { parentId: id } });
    if (children > 0) {
      throw new BadRequestException('请先删除子权限');
    }
    await this.rolePermRepo.delete({ permissionId: id });
    await this.permRepo.delete(id);
    this.authCache.invalidateAll();
    return { id };
  }
}
