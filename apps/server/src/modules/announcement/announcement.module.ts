import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../system/entities/user.entity';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';
import { AnnouncementStreamService } from './announcement-stream.service';
import { Announcement } from './entities/announcement.entity';
import { AnnouncementRecipient } from './entities/announcement-recipient.entity';
import { AnnouncementReply } from './entities/announcement-reply.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Announcement, AnnouncementRecipient, AnnouncementReply, User])],
  controllers: [AnnouncementController],
  providers: [AnnouncementService, AnnouncementStreamService],
})
export class AnnouncementModule {}
