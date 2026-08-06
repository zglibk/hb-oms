import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssemblyBatch } from './entities/assembly-batch.entity';
import { AssemblyController } from './assembly.controller';
import { AssemblyService } from './assembly.service';

/**
 * 装配（M3.5）：外发回货与成品入库之间的唯一工序环节，仅作轻量跟踪。
 * 对外导出 AssemblyService 供 M4 成品入库复用可入库量闸门
 * （闸门算式的唯一实现在 assembly-quota.util.ts）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([AssemblyBatch])],
  controllers: [AssemblyController],
  providers: [AssemblyService],
  exports: [AssemblyService],
})
export class AssemblyModule {}
