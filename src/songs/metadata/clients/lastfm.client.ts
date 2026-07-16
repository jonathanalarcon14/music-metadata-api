import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Song } from '../../types/song.type';
import { emptySong } from '../../helpers/song.helpers';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.schema';
import {
  ProviderUnauthorizedException,
  ProviderRateLimitException,
  ProviderServerException,
  ProviderException,
} from '../../exceptions';
import { IMetadataClient } from '../interfaces/metadata-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'LastFM';
const LASTFM_URL = 'https://ws.audioscrobbler.com/2.0';

interface LastFmResponse {
  error?: number;
  track?: {
    name?: string;
    artist?: {
      name?: string;
    };
    album?: {
      title?: string;
      image?: Array<{
        '#text'?: string;
        size?: string;
      }>;
    };
  };
}

/** Last.fm track.getInfo API. Requires LASTFM_API_KEY. */
@Injectable()
export class LastFmClient implements IMetadataClient {
  private readonly logger = new Logger(LastFmClient.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.apiKey = this.config.get('LASTFM_API_KEY', { infer: true });
  }

  async fetch(name: string, artist: string): Promise<Song | null> {
    this.logger.log(`lastFmFetch(name="${name}", artist="${artist}")`);
    if (!this.apiKey) {
      this.logger.warn(`${PROVIDER} skipped: LASTFM_API_KEY not set`);
      return null;
    }

    try {
      const res = await firstValueFrom(
        this.http.get<LastFmResponse>(`${LASTFM_URL}/`, {
          params: {
            method: 'track.getInfo',
            api_key: this.apiKey,
            artist,
            track: name,
            format: 'json',
          },
        }),
      );

      const raw = JSON.stringify(res?.data);
      this.logger.debug(`${PROVIDER} raw response: ${raw.slice(0, 300)}`);

      const data = res?.data;

      if (data?.error === 4 || data?.error === 26)
        throw new ProviderUnauthorizedException(PROVIDER);
      if (data?.error === 29) throw new ProviderRateLimitException(PROVIDER);
      if (data?.error === 16) throw new ProviderServerException(PROVIDER);

      const track = data?.track;
      if (!track) {
        this.logger.debug(`${PROVIDER} returned no results`);
        return null;
      }

      const song = emptySong();

      song.name = track.name ?? null;
      song.artist = track.artist?.name ?? null;
      song.album = track.album?.title ?? null;

      const image = track.album?.image?.[3]?.['#text'];
      if (image) song.artwork.push(image);

      return song;
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
