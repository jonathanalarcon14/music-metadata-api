import { Injectable, Logger } from '@nestjs/common';
import { MetadataService } from './metadata/metadata.service';
import { IdentifyService } from './identify/identify.service';
import { Song } from './types/song.type';

/**
 * Facade that exposes song-related operations to the controller.
 * Controllers should only depend on this service, not on MetadataService
 * or IdentifyService directly.
 */
@Injectable()
export class SongsService {
  private readonly logger = new Logger(SongsService.name);

  constructor(
    private readonly metadataService: MetadataService,
    private readonly identifyService: IdentifyService,
  ) {}

  async getMetadataSong(name: string, artist: string): Promise<Song> {
    this.logger.log(`getMetadataSong(name="${name}", artist="${artist}")`);
    return this.metadataService.getMetadataSong(name, artist);
  }

  getMetadataSongStream(name: string, artist: string): AsyncGenerator<Song> {
    this.logger.log(
      `getMetadataSongStream(name="${name}", artist="${artist}")`,
    );
    return this.metadataService.getMetadataSongStream(name, artist);
  }

  async getMetadataSongAudio(
    file: Express.Multer.File,
    enrich = true,
  ): Promise<Song> {
    this.logger.log(
      `getMetadataSongAudio(file="${file?.originalname}", size=${file?.size}, enrich=${enrich})`,
    );
    return this.identifyService.identifyAndEnrich(file, enrich);
  }
}
