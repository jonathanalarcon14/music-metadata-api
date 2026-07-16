import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MetadataService } from './metadata.service';
import { CacheService } from './cache.service';
import { METADATA_CLIENTS } from './clients';
import { METADATA_CLIENTS_TOKEN } from './interfaces/metadata-client.interface';
import { IMetadataClient } from './interfaces/metadata-client.interface';

@Module({
  imports: [
    HttpModule.register({
      timeout: 17000, // Prevents hanging request by timing out after 17 seconds
    }),
  ],
  providers: [
    MetadataService,
    CacheService,
    ...METADATA_CLIENTS,
    {
      // Order in this array defines provider priority.
      provide: METADATA_CLIENTS_TOKEN,
      useFactory: (...clients: IMetadataClient[]) => clients,
      inject: [...METADATA_CLIENTS],
    },
  ],
  exports: [MetadataService],
})
export class MetadataModule {}
