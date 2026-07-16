import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Song } from '../../types/song.type';
import { emptySong } from '../../helpers/song.helpers';
import { firstValueFrom } from 'rxjs';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { ProviderException } from '../../exceptions';
import { IMetadataClient } from '../interfaces/metadata-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'LyricsOvh';
const LYRICSOVH_URL = 'https://api.lyrics.ovh/v1';

interface LyricsOvhResponse {
  lyrics?: string;
}

/** Open lyrics API (lyrics.ovh). No credentials required. */
@Injectable()
export class LyricsOvhClient implements IMetadataClient {
  private readonly logger = new Logger(LyricsOvhClient.name);

  constructor(private readonly http: HttpService) {}

  async fetch(name: string, artist: string): Promise<Song | null> {
    this.logger.log(`lyricsOvhFetch(name="${name}", artist="${artist}")`);
    try {
      const res = await firstValueFrom(
        this.http.get<LyricsOvhResponse>(
          `${LYRICSOVH_URL}/${encodeURIComponent(artist)}/${encodeURIComponent(name)}`,
        ),
      );

      const raw = JSON.stringify(res?.data);
      this.logger.debug(`${PROVIDER} raw response: ${raw.slice(0, 300)}`);

      const lyrics = res?.data?.lyrics;
      if (!lyrics) {
        this.logger.debug(`${PROVIDER} returned no lyrics`);
        return null;
      }

      const song = emptySong();
      song.lyrics = lyrics;

      return song;
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
