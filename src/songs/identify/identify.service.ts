import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetadataService } from '../metadata/metadata.service';
import { Song } from '../types/song.type';
import { emptySong } from '../helpers/song.helpers';
import { formatError } from '../helpers/error.helpers';
import { loadAudio, trimAudio } from './helpers/audio.helpers';
import { EnvConfig } from '../../config/env.schema';
import {
  IIdentifyClient,
  IDENTIFY_CLIENTS_TOKEN,
} from './interfaces/identify-client.interface';

// Same rationale as the metadata provider chain: each HTTP call is capped by
// the HttpModule timeout, but providers run sequentially, so the worst case
// is the sum of every provider timeout. Identification is first-match-wins,
// so when the budget runs out the remaining providers are skipped and the
// request results in a 404.
export const IDENTIFY_CHAIN_BUDGET_MS = 30_000;

@Injectable()
export class IdentifyService {
  private readonly logger = new Logger(IdentifyService.name);
  private readonly trimThresholdBytes: number;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly metadataService: MetadataService,
    @Inject(IDENTIFY_CLIENTS_TOKEN)
    private readonly sources: IIdentifyClient[],
  ) {
    this.trimThresholdBytes =
      this.config.get('TRIM_THRESHOLD_MB', { infer: true }) * 1024 * 1024;
  }

  /**
   * Identifies the audio, then enriches it via MetadataService. Identification
   * `name`/`artist` are used as fallback when metadata providers miss them.
   * With `enrich = false`, returns right after identification so the client
   * can enrich progressively via the SSE stream endpoint.
   */
  async identifyAndEnrich(
    file: Express.Multer.File,
    enrich = true,
  ): Promise<Song> {
    this.logger.log(
      `identifyAndEnrich(file="${file?.originalname}", size=${file?.size}, enrich=${enrich})`,
    );
    // Start at 30s to skip intros; 20s is enough for identification APIs.
    // Providers need the sample in memory; either way only a small buffer
    // ends up in the heap — the full upload stays on disk.
    const sample =
      file.size > this.trimThresholdBytes
        ? await trimAudio(file, 20, 30)
        : await loadAudio(file);

    let name: string | null = null;
    let artist: string | null = null;

    const deadline = Date.now() + IDENTIFY_CHAIN_BUDGET_MS;

    // Individual provider errors are swallowed — the chain continues to the next.
    // If no provider identifies the audio, a 404 is thrown to the client.
    for (const source of this.sources) {
      if (Date.now() >= deadline) {
        this.logger.warn(
          'Identify chain budget exhausted — skipping remaining providers',
        );
        break;
      }

      try {
        const result = await source.fetch(sample);
        if (!result) continue;

        name = result.name;
        artist = result.artist;
        break;
      } catch (err) {
        this.logger.warn(`Provider failed: ${formatError(err)}`);
      }
    }

    if (!name || !artist) {
      throw new NotFoundException('No provider could identify the audio');
    }

    if (!enrich) {
      return { ...emptySong(), name, artist };
    }

    // Only NotFoundException is recovered: the audio was already identified,
    // so the user should at least get the name/artist back. Any other error
    // propagates so real failures aren't silently hidden.
    let song: Song;
    try {
      song = await this.metadataService.getMetadataSong(name, artist);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      song = emptySong();
    }

    song.name ??= name;
    song.artist ??= artist;

    return song;
  }
}
