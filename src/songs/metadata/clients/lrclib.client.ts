import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Song } from '../../types/song.type';
import { emptySong } from '../../helpers/song.helpers';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { firstValueFrom } from 'rxjs';
import { ProviderException } from '../../exceptions';
import { IMetadataClient } from '../interfaces/metadata-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'LRCLIB';
const LRCLIB_URL = 'https://lrclib.net';

interface LrclibResponse {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  plainLyrics?: string;
  syncedLyrics?: string;
}

/** Open lyrics database (LRCLIB). No credentials required. */
@Injectable()
export class LrclibClient implements IMetadataClient {
  private readonly logger = new Logger(LrclibClient.name);

  constructor(private readonly http: HttpService) {}

  async fetch(name: string, artist: string): Promise<Song | null> {
    this.logger.log(`lrclibFetch(name="${name}", artist="${artist}")`);
    try {
      const res = await firstValueFrom(
        this.http.get<LrclibResponse>(`${LRCLIB_URL}/api/get`, {
          params: { track_name: name, artist_name: artist },
        }),
      );

      const raw = JSON.stringify(res?.data);
      this.logger.debug(`${PROVIDER} raw response: ${raw.slice(0, 300)}`);

      const data = res?.data;
      if (!data) {
        this.logger.debug(`${PROVIDER} returned no results`);
        return null;
      }

      const song = emptySong();

      song.name = data.trackName ?? null;
      song.artist = data.artistName ?? null;
      song.album = data.albumName ?? null;
      song.lyrics = data.plainLyrics ?? data.syncedLyrics ?? null;

      return song;
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
