import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { join, resolve } from 'path';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { FileModule } from './modules/file/file.module';
import { SystemModule } from './modules/system/system.module';
import { CustomerModule } from './modules/customer/customer.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { PositionModule } from './modules/position/position.module';
import { ProcessInfoModule } from './modules/process-info/process-info.module';
import { OrderModule } from './modules/order/order.module';
import { OutsourceModule } from './modules/outsource/outsource.module';
import { AssemblyModule } from './modules/assembly/assembly.module';
import { FinishedStockModule } from './modules/finished-stock/finished-stock.module';
import { PartStockModule } from './modules/part-stock/part-stock.module';
import { DullStockModule } from './modules/dull-stock/dull-stock.module';
import { OpeningModule } from './modules/opening/opening.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { ChangelogModule } from './modules/changelog/changelog.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { EmployeeModule } from './modules/employee/employee.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 使用绝对路径加载 .env，避免 PM2 启动时 cwd 不一致导致配置加载失败
      envFilePath: resolve(process.cwd(), '.env'),
    }),

    // TypeORM（synchronize=false，表结构变更一律走手写 SQL 迁移）
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get('DB_PORT')) || 3306,
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        charset: 'utf8mb4',
        timezone: '+08:00',
        synchronize: false,
        autoLoadEntities: true,
        extra: {
          connectionLimit: Number(config.get('DB_POOL_MAX')) || 10,
        },
      }),
    }),

    // 开发环境静态托管 uploads（生产由 Nginx 接管）
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false },
    }),

    ScheduleModule.forRoot(),

    CommonModule,
    AuthModule,
    FileModule,
    SystemModule,
    CustomerModule,
    SupplierModule,
    PositionModule,
    ProcessInfoModule,
    OrderModule,
    OutsourceModule,
    AssemblyModule,
    FinishedStockModule,
    PartStockModule,
    DullStockModule,
    OpeningModule,
    DashboardModule,
    EquipmentModule,
    ChangelogModule,
    SystemConfigModule,
    EmployeeModule,
  ],
})
export class AppModule {}
