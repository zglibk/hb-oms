import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuthService } from './auth.service';
import { UserAuthCacheService } from './user-auth-cache.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { User } from '../system/entities/user.entity';
import { UserRole } from '../system/entities/user-role.entity';
import { Role } from '../system/entities/role.entity';
import { RolePermission } from '../system/entities/role-permission.entity';
import { Permission } from '../system/entities/permission.entity';
import { RoleDept } from '../system/entities/role-dept.entity';
import { Department } from '../system/entities/department.entity';
import { CaptchaModule } from '../captcha/captcha.module';
import { USER_AUTH_CACHE } from './auth.tokens';

/**
 * 鉴权基础设施模块。
 * - JwtModule：签发/验证 token
 * - TokenBlacklistService：登出黑名单（内存驱动，可切 Redis）
 * - 全局注册 JwtAuthGuard（默认全部接口需登录，@Public 跳过）
 *   与 PermissionGuard（@RequirePermissions 校验功能权限）
 * 业务登录逻辑(AuthService/Controller)在系统管理模块阶段补充。
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserRole,
      Role,
      RolePermission,
      Permission,
      RoleDept,
      Department,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES') || '2h',
        },
      }),
    }),
    CaptchaModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenBlacklistService,
    // 用户鉴权上下文缓存：JwtAuthGuard 实时读库的数据源（权限变更即刻生效）
    UserAuthCacheService,
    { provide: USER_AUTH_CACHE, useExisting: UserAuthCacheService },
    // 守卫顺序：先鉴权（JwtAuthGuard）后权限（PermissionGuard）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [
    JwtModule,
    TokenBlacklistService,
    AuthService,
    UserAuthCacheService,
    USER_AUTH_CACHE,
  ],
})
export class AuthModule {}
