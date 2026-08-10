import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataScopeService } from './services/data-scope.service';
import { NumberGeneratorService } from './services/number-generator.service';
import { OperationLogWriterService } from './services/operation-log-writer.service';
import { PartGroupSnapshotService } from './services/part-group-snapshot.service';
import { ProductSnapshotService } from './services/product-snapshot.service';
import { Department } from '../modules/system/entities/department.entity';
import { OperationLog } from '../modules/system/entities/operation-log.entity';

/**
 * 全局通用能力：数据权限、采番、操作日志写入、订单侧快照。
 *
 * 两个快照服务按锚点分层，各管一层（禁止各业务模块自写 SQL 取订单侧字段）：
 *   - PartGroupSnapshotService（部件组级）→ 外发件回厂
 *   - ProductSnapshotService（产品行级）  → 装配 / 成品出入库 / 成品期初
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Department, OperationLog])],
  providers: [
    DataScopeService,
    NumberGeneratorService,
    OperationLogWriterService,
    PartGroupSnapshotService,
    ProductSnapshotService,
  ],
  exports: [
    DataScopeService,
    NumberGeneratorService,
    OperationLogWriterService,
    PartGroupSnapshotService,
    ProductSnapshotService,
  ],
})
export class CommonModule {}
