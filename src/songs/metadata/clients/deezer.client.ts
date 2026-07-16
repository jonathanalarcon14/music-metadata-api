import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Song } from '../../types/song.type';
import { emptySong } from '../../helpers/song.helpers';
import { firstValueFrom } from 'rxjs';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { ProviderException } from '../../exceptions';
import { IMetadataClient } from '../interfaces/metadata-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'Deezer';
const DEEZER_URL = 'https://api.deezer.com';

interface DeezerResponse {
  data?: Array<{
    title?: string;
    artist?: {
      name?: string;
    };
    album?: {
      title?: string;
      cover?: string;
      cover_medium?: string;
      cover_big?: string;
      cover_xl?: string;
    };
  }>;
}

/** Public Deezer search API. No credentials required. */
@Injectable()
export class DeezerClient implements IMetadataClient {
  private readonly logger = new Logger(DeezerClient.name);

  constructor(private readonly http: HttpService) {}

  async fetch(name: string, artist: string): Promise<Song | null> {
    this.logger.log(`deezerFetch(name="${name}", artist="${artist}")`);
    try {
      const res = await firstValueFrom(
        this.http.get<DeezerResponse>(`${DEEZER_URL}/search`, {
          params: { q: `${artist} ${name}` },
        }),
      );

      const raw = JSON.stringify(res?.data);
      this.logger.debug(`${PROVIDER} raw response: ${raw.slice(0, 300)}`);

      const track = res?.data?.data?.[0];
      if (!track) {
        this.logger.debug(`${PROVIDER} returned no results`);
        return null;
      }

      const song = emptySong();

      song.name = track.title ?? null;
      song.artist = track.artist?.name ?? null;
      song.album = track.album?.title ?? null;

      const cover =
        track.album?.cover_xl ||
        track.album?.cover_big ||
        track.album?.cover_medium ||
        track.album?.cover;

      if (cover) song.artwork.push(cover);

      return song;
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
