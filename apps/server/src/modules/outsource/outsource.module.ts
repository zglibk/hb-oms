import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutsourcePart } from './entities/outsource-part.entity';
import { OutsourceController } from './outsource.controller';
import { OutsourceService } from './outsource.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutsourcePart])],
  controllers: [OutsourceController],
  providers: [OutsourceService],
  exports: [OutsourceService],
})
export class OutsourceModule {}
