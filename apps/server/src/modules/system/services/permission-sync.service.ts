import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { PERMISSIONS } from '../permission-manifest';
import { UserAuthCacheService } from '../../auth/user-auth-cache.service';

/**
 * 权限清单同步服务（缺陷 B 根治的核心组件）
 *
 * 背景：权限码同时存在于三处——后端 @RequirePermissions('xxx')、前端
 * v-permission、数据库 t_permission。旧流程里数据库这份靠 db:init 种子
 * 或手写增量迁移 SQL 维护，代码新增权限点后若忘跑脚本，则该权限点
 * 不存在于库中 → 无人可拥有（含 admin）→ 全员 403。
 *
 * 现方案：src/modules/system/permission-manifest.ts 作为唯一事实源，
 * 应用每次启动时自动执行：
 *   1. upsert 清单到 t_permission（按 perm_code 幂等；两遍建树回填 parent_id）；
 *   2. 将数据库中"全部"权限（含 UI 手工创建的）补授给 admin 角色，
 *      保证 admin 前端按钮显隐完整（后端另有守卫旁路双保险）；
 *   3. 失效鉴权缓存，令变更即刻生效。
 *
 * 自此：代码新增按钮/菜单权限 = 在 manifest 登记一行 + 重启，
 * 不再需要 migration-*-perm.sql。
 */
@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    private readonly authCache: UserAuthCacheService,
  ) {}

  async onApplicationBootstrap() {
    try {
      const created = await this.syncManifest();
      const granted = await this.grantAllToAdmin();
      this.authCache.invalidateAll();
      this.logger.log(
        `权限同步完成：清单 ${PERMISSIONS.length} 项（新增 ${created}），admin 补授 ${granted} 项`,
      );
    } catch (e) {
      // 不阻断启动（数据库瞬时不可用等场景），但必须醒目告警：
      // 同步失败意味着新权限点可能未落库，相关接口会 403。
      this.logger.error('权限清单同步失败，新权限点可能不可用', e as Error);
    }
  }

  /** 第一遍 upsert 权限行，第二遍按 parent_code 回填 parent_id */
  private async syncManifest(): Promise<number> {
    let created = 0;
    const codeToId = new Map<string, number>();

    for (const p of PERMISSIONS) {
      const exist = await this.permRepo.findOne({
        where: { permCode: p.perm_code },
      });
      if (!exist) {
        const saved = await this.permRepo.save(
          this.permRepo.create({
            permCode: p.perm_code,
            permName: p.perm_name,
            permType: p.perm_type,
            parentId: 0, // 第二遍回填
            menuPath: p.menu_path ?? null,
            component: p.component ?? null,
            apiPattern: null,
            icon: p.icon ?? null,
            sort: p.sort,
            status: 1,
          }),
        );
        codeToId.set(p.perm_code, saved.id);
        created += 1;
      } else {
        // 清单为结构事实源：名称/类型/路由/组件/图标/排序以清单为准；
        // status 保留库中取值（允许管理员在 UI 中临时停用某权限）。
        await this.permRepo.update(exist.id, {
          permName: p.perm_name,
          permType: p.perm_type,
          menuPath: p.menu_path ?? null,
          component: p.component ?? null,
          icon: p.icon ?? null,
          sort: p.sort,
        });
        codeToId.set(p.perm_code, exist.id);
      }
    }

    for (const p of PERMISSIONS) {
      const id = codeToId.get(p.perm_code)!;
      const parentId = p.parent_code ? (codeToId.get(p.parent_code) ?? 0) : 0;
      await this.permRepo.update(id, { parentId });
    }
    return created;
  }

  /** admin 补授全库权限（幂等 INSERT ... NOT EXISTS，含 UI 手工创建的权限行） */
  private async grantAllToAdmin(): Promise<number> {
    const admin = await this.roleRepo.findOne({
      where: { roleCode: 'admin' },
    });
    if (!admin) {
      this.logger.warn('未找到内置 admin 角色，跳过补授');
      return 0;
    }
    const result = await this.rolePermRepo.query(
      `INSERT INTO t_role_permission (role_id, permission_id)
       SELECT ?, p.id FROM t_permission p
       WHERE NOT EXISTS (
         SELECT 1 FROM t_role_permission rp
         WHERE rp.role_id = ? AND rp.permission_id = p.id
       )`,
      [admin.id, admin.id],
    );
    return Number(result?.affectedRows ?? 0);
  }
}
