import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessInfo } from './entities/process-info.entity';
import { ProcessInfoHistory } from './entities/process-info-history.entity';
import { ProcessInfoController } from './process-info.controller';
import { ProcessInfoService } from './process-info.service';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  // SystemConfigModule：规格「10寸→mm」的换算系数取自系统配置（同 order-ledger 的用法）
  imports: [TypeOrmModule.forFeature([ProcessInfo, ProcessInfoHistory]), SystemConfigModule],
  controllers: [ProcessInfoController],
  providers: [ProcessInfoService],
  exports: [ProcessInfoService],
})
export class ProcessInfoModule {}
