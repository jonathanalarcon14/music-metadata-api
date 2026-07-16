import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { Song } from '../types/song.type';
import {
  isSongComplete,
  isSongEmpty,
  emptySong,
} from '../helpers/song.helpers';
import { formatError } from '../helpers/error.helpers';
import { EnvConfig } from '../../config/env.schema';
import {
  IMetadataClient,
  METADATA_CLIENTS_TOKEN,
} from './interfaces/metadata-client.interface';

@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);
  private readonly maxArtworks: number;
  private readonly inFlight = new Map<string, Promise<Song>>();

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(METADATA_CLIENTS_TOKEN)
    private readonly sources: IMetadataClient[],
    private readonly cache: CacheService,
  ) {
    this.maxArtworks = this.config.get('MAX_ARTWORKS', { infer: true });
  }

  /**
   * Streams partial Song states as each provider contributes data.
   * This is the single source of truth for the merge logic; both the
   * SSE endpoint and the blocking REST endpoint consume this generator.
   */
  async *getMetadataSongStream(
    name: string,
    artist: string,
  ): AsyncGenerator<Song> {
    this.logger.log(
      `getMetadataSongStream(name="${name}", artist="${artist}")`,
    );

    const key = this.cacheKey(name, artist);
    const cached = await this.cache.get<Song>(key);
    if (cached) {
      yield cached;
      return;
    }

    const song = emptySong();
    let lastSnapshot = JSON.stringify(song);

    for (const source of this.sources) {
      try {
        const data = await source.fetch(name, artist);
        if (!data) continue;

        song.name ??= data.name;
        song.artist ??= data.artist;
        song.album ??= data.album;
        song.lyrics ??= data.lyrics;

        if (data.artwork?.length && song.artwork.length < this.maxArtworks) {
          const newArtworks = data.artwork.filter(
            (url) => !song.artwork.includes(url),
          );
          if (newArtworks.length > 0) {
            const remaining = this.maxArtworks - song.artwork.length;
            song.artwork.push(...newArtworks.slice(0, remaining));
          }
        }

        const snapshot = JSON.stringify(song);
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          yield { ...song, artwork: [...song.artwork] };
        }

        if (isSongComplete(song) && song.artwork.length >= this.maxArtworks) {
          this.logger.log('Song metadata complete — stopping provider loop');
          break;
        }
      } catch (err) {
        this.logger.warn(`Provider failed: ${formatError(err)}`);
      }
    }

    if (isSongEmpty(song)) {
      throw new NotFoundException('No metadata found for the given song');
    }

    await this.cache.set(key, song);
  }

  /**
   * Convenience wrapper for callers that just want the final result
   * in a single response (e.g. simple REST clients, or internal use
   * from the audio-identify flow).
   */
  async getMetadataSong(name: string, artist: string): Promise<Song> {
    const key = this.cacheKey(name, artist);

    // In-flight dedupe: identical concurrent requests await the run already
    // in progress instead of each re-querying every provider on a cache miss
    // (cache stampede — the window between cache.get and cache.set).
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const run = this.drainStream(name, artist).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, run);
    return run;
  }

  private cacheKey(name: string, artist: string): string {
    return `metadata:${name.toLowerCase()}:${artist.toLowerCase()}`;
  }

  private async drainStream(name: string, artist: string): Promise<Song> {
    let last: Song | undefined;
    for await (const partial of this.getMetadataSongStream(name, artist)) {
      last = partial;
    }

    // Invariant: the generator either throws (404) or yields at least once.
    if (!last) {
      this.logger.error(
        'getMetadataSongStream completed without yielding, invariant broken',
      );
      throw new Error('Metadata stream completed without yielding any result');
    }

    return last;
  }
}
