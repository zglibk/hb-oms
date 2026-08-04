import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { RoleDept } from '../entities/role-dept.entity';
import { UserRole } from '../entities/user-role.entity';
import {
  AssignPermsDto,
  CreateRoleDto,
  UpdateRoleDto,
} from '../dto/role.dto';
import { UserAuthCacheService } from '../../auth/user-auth-cache.service';

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
    private readonly dataSource: DataSource,
    private readonly authCache: UserAuthCacheService,
  ) {}

  async findAll() {
    return this.roleRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  async create(dto: CreateRoleDto) {
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
      });
      const saved = await manager.save(role);
      if (dto.dataScope === 5 && dto.deptIds?.length) {
        await this.bindDepts(manager, saved.id, dto.deptIds);
      }
      return { id: saved.id };
    });
    return result;
  }

  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    const result = await this.dataSource.transaction(async (manager) => {
      await manager.update(Role, id, {
        roleName: dto.roleName ?? role.roleName,
        dataScope: dto.dataScope ?? role.dataScope,
        sort: dto.sort ?? role.sort,
        remark: dto.remark ?? role.remark,
        status: dto.status ?? role.status,
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

  async remove(id: number) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
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
  async getPermissions(id: number) {
    const rows = await this.rolePermRepo.find({ where: { roleId: id } });
    return rows.map((r) => r.permissionId);
  }

  /** 分配权限 */
  async assignPermissions(id: number, dto: AssignPermsDto) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId: id });
      if (dto.permissionIds?.length) {
        const rows = dto.permissionIds.map((permissionId) =>
          manager.create(RolePermission, { roleId: id, permissionId }),
        );
        await manager.save(RolePermission, rows);
      }
    });
    // 主动失效鉴权缓存：该角色下所有在线用户的下一次请求即按新权限校验，
    // 无需重新登录（后端守卫实时读库，前端菜单在刷新/重进页面后同步）。
    this.authCache.invalidateAll();
    return { id };
  }

  async getDepts(id: number) {
    const rows = await this.roleDeptRepo.find({ where: { roleId: id } });
    return rows.map((r) => r.deptId);
  }
}
