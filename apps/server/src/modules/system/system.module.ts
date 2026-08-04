import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemController } from './system.controller';
import { UserService } from './services/user.service';
import { RoleService } from './services/role.service';
import { MenuService } from './services/menu.service';
import { PermissionSyncService } from './services/permission-sync.service';
import { DictService } from './services/dict.service';
import { DeptService } from './services/dept.service';
import { LogService } from './services/log.service';
import { MaterialService } from './services/material.service';
import { OperationLogInterceptor } from '../../common/interceptors/operation-log.interceptor';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { RoleDept } from './entities/role-dept.entity';
import { Permission } from './entities/permission.entity';
import { Department } from './entities/department.entity';
import { Dict } from './entities/dict.entity';
import { OperationLog } from './entities/operation-log.entity';
import { Material } from './entities/material.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserRole,
      Role,
      RolePermission,
      RoleDept,
      Permission,
      Department,
      Dict,
      OperationLog,
      Material,
      // 供 DictService / MaterialService 做删除前引用完整性校验
    ]),
  ],
  controllers: [SystemController],
  providers: [
    UserService,
    RoleService,
    MenuService,
    // 启动期权限清单同步（manifest → t_permission + admin 补授），缺陷 B 根治
    PermissionSyncService,
    DictService,
    DeptService,
    LogService,
    MaterialService,
    // 全局操作日志拦截器（标注 @OperationLog 的接口自动记录）
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
  ],
  exports: [UserService, RoleService, MenuService, DictService, MaterialService],
})
export class SystemModule {}
