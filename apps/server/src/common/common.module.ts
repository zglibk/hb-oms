import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataScopeService } from './services/data-scope.service';
import { NumberGeneratorService } from './services/number-generator.service';
import { OperationLogWriterService } from './services/operation-log-writer.service';
import { PartGroupSnapshotService } from './services/part-group-snapshot.service';
import { ProductSnapshotService } from './services/product-snapshot.service';
import { PdfService } from './services/pdf.service';
import { RecordOwnershipService } from './services/record-ownership.service';
import { Department } from '../modules/system/entities/department.entity';
import { OperationLog } from '../modules/system/entities/operation-log.entity';
import { SystemConfigModule } from '../modules/system-config/system-config.module';

/**
 * 全局通用能力：数据权限、采番、操作日志写入、订单侧快照、打印页转 PDF。
 *
 * 两个快照服务按锚点分层，各管一层（禁止各业务模块自写 SQL 取订单侧字段）：
 *   - PartGroupSnapshotService（部件组级）→ 外发件回厂
 *   - ProductSnapshotService（产品行级）  → 装配 / 成品出入库 / 成品期初
 *
 * PdfService 是**唯一**的 PDF 出口（单例浏览器 + 串行 + 空闲关闭，内存纪律见其注释），
 * 各模块要出 PDF 一律注入它，禁止自己 launch 浏览器。
 *
 * RecordOwnershipService 是业务记录修改权（创建人 + 主管角色 + 数据范围）的**唯一**判定点，
 * 订单 / 外发 / 装配 / 成品出入库共用，禁止各模块另写一份。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Department, OperationLog]), SystemConfigModule],
  providers: [
    DataScopeService,
    NumberGeneratorService,
    OperationLogWriterService,
    PartGroupSnapshotService,
    ProductSnapshotService,
    PdfService,
    RecordOwnershipService,
  ],
  exports: [
    DataScopeService,
    NumberGeneratorService,
    OperationLogWriterService,
    PartGroupSnapshotService,
    ProductSnapshotService,
    PdfService,
    RecordOwnershipService,
  ],
})
export class CommonModule {}
