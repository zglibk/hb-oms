import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessInfo } from './entities/process-info.entity';
import { ProcessInfoHistory } from './entities/process-info-history.entity';
import { ProcessInfoController } from './process-info.controller';
import { ProcessInfoService } from './process-info.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessInfo, ProcessInfoHistory])],
  controllers: [ProcessInfoController],
  providers: [ProcessInfoService],
  exports: [ProcessInfoService],
})
export class ProcessInfoModule {}
