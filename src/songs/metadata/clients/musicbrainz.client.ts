import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Song } from '../../types/song.type';
import { emptySong } from '../../helpers/song.helpers';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.schema';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { ProviderException } from '../../exceptions';
import { IMetadataClient } from '../interfaces/metadata-client.interface';
import { escapeLucene } from '../../helpers/query.helpers';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'MusicBrainz';
const COVER_ART_PROVIDER = 'CoverArt';
const MUSICBRAINZ_URL = 'https://musicbrainz.org/ws/2';
const COVERARTARCHIVE_URL = 'https://coverartarchive.org';

interface MusicBrainzRecording {
  title?: string;
  'artist-credit'?: Array<{ name?: string }>;
  releases?: Array<{ id?: string; title?: string }>;
  id?: string;
}

interface MusicBrainzResponse {
  recordings?: MusicBrainzRecording[];
}

interface CoverArtResponse {
  images?: Array<{
    image?: string;
  }>;
}

/**
 * Open music metadata database (MusicBrainz). Requires MUSICBRAINZ_EMAIL
 * for the mandatory User-Agent header.
 */
@Injectable()
export class MusicBrainzClient implements IMetadataClient {
  private readonly logger = new Logger(MusicBrainzClient.name);
  private readonly email: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.email = this.config.get('MUSICBRAINZ_EMAIL', { infer: true });
  }

  async fetch(name: string, artist: string): Promise<Song | null> {
    this.logger.log(`musicBrainzFetch(name="${name}", artist="${artist}")`);
    if (!this.email) {
      this.logger.warn(`${PROVIDER} skipped: MUSICBRAINZ_EMAIL not set`);
      return null;
    }

    try {
      const query = `recording:${escapeLucene(name)} AND artist:${escapeLucene(artist)}`;
      const res = await firstValueFrom(
        this.http.get<MusicBrainzResponse>(`${MUSICBRAINZ_URL}/recording/`, {
          params: { query, fmt: 'json' },
          headers: {
            'User-Agent': `music-meta-api/1.0 (${this.email})`,
          },
        }),
      );

      const raw = JSON.stringify(res?.data);
      this.logger.debug(`${PROVIDER} raw response: ${raw.slice(0, 300)}`);

      const rec = res?.data?.recordings?.[0];
      if (!rec) {
        this.logger.debug(`${PROVIDER} returned no results`);
        return null;
      }

      const song = this.normalizeRecording(rec);

      const releaseId = rec.releases?.[0]?.id;
      if (releaseId) {
        try {
          const coverRes = await this.fetchCoverArt(releaseId);
          if (coverRes) song.artwork.push(coverRes);
        } catch {
          this.logger.warn(
            `${PROVIDER}: could not fetch cover art for release ${releaseId}`,
          );
        }
      }

      return song;
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }

  private normalizeRecording(rec: MusicBrainzRecording): Song {
    const song = emptySong();
    song.name = rec.title ?? null;
    song.artist = rec['artist-credit']?.[0]?.name ?? null;
    song.album = rec.releases?.[0]?.title ?? null;
    return song;
  }

  private async fetchCoverArt(releaseId: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<CoverArtResponse>(
          `${COVERARTARCHIVE_URL}/release/${releaseId}`,
        ),
      );
      return res?.data?.images?.[0]?.image ?? null;
    } catch (err) {
      this.logger.warn(`${COVER_ART_PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, COVER_ART_PROVIDER);
    }
  }
}
