import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';
import { DatabaseOpsService } from './database-ops.service';
import { DatabaseHealthController } from './database-health.controller';
import { DatabaseRestoreService } from './database-restore.service';
import { DatabaseUpgradeService } from './database-upgrade.service';

/**
 * 系统配置模块（移植自 hb-mes，按业务决策**不含审批管理**——OMS 无审核流，
 * 设计文档决策 #2；后续若有开关类配置需求另行设计，不恢复 approval）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig])],
  controllers: [SystemConfigController, DatabaseHealthController],
  providers: [SystemConfigService, DatabaseOpsService, DatabaseRestoreService, DatabaseUpgradeService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
