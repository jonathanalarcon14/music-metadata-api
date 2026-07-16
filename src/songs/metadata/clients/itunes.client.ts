import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Song } from '../../types/song.type';
import { emptySong } from '../../helpers/song.helpers';
import { firstValueFrom } from 'rxjs';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { ProviderException } from '../../exceptions';
import { IMetadataClient } from '../interfaces/metadata-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'iTunes';
const ITUNES_URL = 'https://itunes.apple.com/search';

interface ItunesResponse {
  results?: Array<{
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    artworkUrl100?: string;
  }>;
}

/** Apple iTunes Search API. No credentials required. */
@Injectable()
export class ItunesClient implements IMetadataClient {
  private readonly logger = new Logger(ItunesClient.name);

  constructor(private readonly http: HttpService) {}

  async fetch(name: string, artist: string): Promise<Song | null> {
    this.logger.log(`itunesFetch(name="${name}", artist="${artist}")`);
    try {
      const res = await firstValueFrom(
        this.http.get<ItunesResponse>(ITUNES_URL, {
          params: {
            term: `${artist} ${name}`,
            media: 'music',
            limit: 1,
          },
        }),
      );

      const raw = JSON.stringify(res?.data);
      this.logger.debug(`${PROVIDER} raw response: ${raw.slice(0, 300)}`);

      const track = res?.data?.results?.[0];
      if (!track) {
        this.logger.debug(`${PROVIDER} returned no results`);
        return null;
      }

      const song = emptySong();

      song.name = track.trackName ?? null;
      song.artist = track.artistName ?? null;
      song.album = track.collectionName ?? null;

      const artwork = track.artworkUrl100?.replace('100x100bb', '600x600bb');
      if (artwork) song.artwork.push(artwork);

      return song;
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
