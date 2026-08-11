import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Position } from './entities/position.entity';
import { PositionController } from './position.controller';
import { PositionService } from './position.service';

/**
 * 岗位主数据（基础数据，2026-08-11 由字典 `hr_position` 升级而来）。
 *
 * 只对外提供 `GET /position/all` 一个下拉接口（人事档案建档用），
 * 故不导出 service——没有别的模块需要往岗位表里写数。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Position])],
  controllers: [PositionController],
  providers: [PositionService],
})
export class PositionModule {}
