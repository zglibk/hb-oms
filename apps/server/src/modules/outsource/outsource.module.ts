import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutsourceDoc } from './entities/outsource-doc.entity';
import { OutsourceItem } from './entities/outsource-item.entity';
import { OutsourceReturn } from './entities/outsource-return.entity';
import { OutsourceController } from './outsource.controller';
import { OutsourceService } from './outsource.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutsourceDoc, OutsourceItem, OutsourceReturn])],
  controllers: [OutsourceController],
  providers: [OutsourceService],
  exports: [OutsourceService],
})
export class OutsourceModule {}
