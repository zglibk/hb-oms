import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessInfo } from './entities/process-info.entity';
import { ProcessInfoController } from './process-info.controller';
import { ProcessInfoService } from './process-info.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessInfo])],
  controllers: [ProcessInfoController],
  providers: [ProcessInfoService],
  exports: [ProcessInfoService],
})
export class ProcessInfoModule {}
