import { Module } from '@nestjs/common';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { MetadataModule } from './metadata/metadata.module';
import { IdentifyModule } from './identify/identify.module';

@Module({
  imports: [MetadataModule, IdentifyModule],
  controllers: [SongsController],
  providers: [SongsService],
})
export class SongsModule {}
