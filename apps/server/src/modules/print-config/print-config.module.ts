import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrintDocumentSetting } from './entities/print-document-setting.entity';
import { PrintProfileVersion } from './entities/print-profile-version.entity';
import { PrintProfile } from './entities/print-profile.entity';
import { PrintConfigController } from './print-config.controller';
import { PrintConfigService } from './print-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrintProfile, PrintProfileVersion, PrintDocumentSetting])],
  controllers: [PrintConfigController],
  providers: [PrintConfigService],
  exports: [PrintConfigService],
})
export class PrintConfigModule {}

