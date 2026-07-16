import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.schema';
import { generateFingerprint } from '../helpers/audio.helpers';
import { handleHttpException } from '../../helpers/handle.http.exception';
import { ProviderException } from '../../exceptions';
import { IIdentifyClient } from '../interfaces/identify-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'AcoustID';
const ACOUSTID_URL = 'https://api.acoustid.org/v2/lookup';

interface AcoustIdResponse {
  results?: Array<{
    recordings?: Array<{
      title?: string;
      artists?: Array<{
        name?: string;
      }>;
    }>;
  }>;
}

/**
 * Audio fingerprinting via Chromaprint/AcoustID. Requires the `fpcalc`
 * binary on the system and ACOUSTID_API_KEY.
 */
@Injectable()
export class AcoustIdClient implements IIdentifyClient {
  private readonly logger = new Logger(AcoustIdClient.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.apiKey = this.config.get('ACOUSTID_API_KEY', { infer: true });
  }

  async fetch(
    file: Express.Multer.File,
  ): Promise<{ name: string; artist: string } | null> {
    this.logger.log(
      `acoustIdFetch(file="${file?.originalname}", size=${file?.size})`,
    );
    if (!this.apiKey) {
      this.logger.warn(`${PROVIDER} skipped: ACOUSTID_API_KEY not set`);
      return null;
    }
    try {
      const { duration, fingerprint } = await generateFingerprint(file);

      const params = new URLSearchParams({
        client: this.apiKey,
        duration: Math.round(duration).toString(),
        fingerprint,
        meta: 'recordings',
      });
      const res = await firstValueFrom(
        this.http.post<AcoustIdResponse>(ACOUSTID_URL, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      this.logger.debug(
        `${PROVIDER} raw response: ${JSON.stringify(res?.data).slice(0, 300)}`,
      );

      const rec = res?.data?.results?.[0]?.recordings?.[0];
      if (!rec || !rec.title || !rec.artists?.[0]?.name) {
        this.logger.debug(`${PROVIDER} returned incomplete result`);
        return null;
      }

      return { name: rec.title, artist: rec.artists[0].name };
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
