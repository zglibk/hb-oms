import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataScopeService } from './services/data-scope.service';
import { NumberGeneratorService } from './services/number-generator.service';
import { OperationLogWriterService } from './services/operation-log-writer.service';
import { Department } from '../modules/system/entities/department.entity';
import { OperationLog } from '../modules/system/entities/operation-log.entity';

/** 全局通用能力：数据权限、采番、操作日志写入。被各业务模块共享。 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Department, OperationLog])],
  providers: [DataScopeService, NumberGeneratorService, OperationLogWriterService],
  exports: [DataScopeService, NumberGeneratorService, OperationLogWriterService],
})
export class CommonModule {}
