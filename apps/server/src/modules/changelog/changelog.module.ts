import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Changelog } from './entities/changelog.entity';
import { ChangelogService } from './changelog.service';
import { ChangelogController } from './changelog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Changelog])],
  controllers: [ChangelogController],
  providers: [ChangelogService],
})
export class ChangelogModule {}
