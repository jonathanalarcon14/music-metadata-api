import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IdentifyService } from './identify.service';
import { IDENTIFY_CLIENTS } from './clients';
import { IDENTIFY_CLIENTS_TOKEN } from './interfaces/identify-client.interface';
import { MetadataModule } from '../metadata/metadata.module';
import { IIdentifyClient } from './interfaces/identify-client.interface';

@Module({
  imports: [
    HttpModule.register({
      timeout: 20000, // Prevents hanging request by timing out after 20 seconds
    }),
    MetadataModule,
  ],
  providers: [
    IdentifyService,
    ...IDENTIFY_CLIENTS,
    {
      // Order in this array defines provider priority.
      provide: IDENTIFY_CLIENTS_TOKEN,
      useFactory: (...clients: IIdentifyClient[]) => clients,
      inject: [...IDENTIFY_CLIENTS],
    },
  ],
  exports: [IdentifyService],
})
export class IdentifyModule {}
