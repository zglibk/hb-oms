import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Changelog } from './entities/changelog.entity';
import { User } from '../system/entities/user.entity';
import { ChangelogService } from './changelog.service';
import { ChangelogController } from './changelog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Changelog, User])],
  controllers: [ChangelogController],
  providers: [ChangelogService],
})
export class ChangelogModule {}
