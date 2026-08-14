import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionBom } from './entities/production-bom.entity';
import { ProductionBomItem } from './entities/production-bom-item.entity';
import { ProcessInfo } from '../process-info/entities/process-info.entity';
import { Material } from '../system/entities/material.entity';
import { ProductionBomController } from './production-bom.controller';
import { ProductionBomService } from './production-bom.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductionBom, ProductionBomItem, ProcessInfo, Material])],
  controllers: [ProductionBomController],
  providers: [ProductionBomService],
})
export class ProductionBomModule {}
