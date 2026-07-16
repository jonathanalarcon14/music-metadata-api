import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.schema';
import { handleHttpException } from '../../helpers/handle.http.exception';
import {
  ProviderException,
  ProviderUnauthorizedException,
  ProviderRateLimitException,
} from '../../exceptions';
import { IIdentifyClient } from '../interfaces/identify-client.interface';
import { formatError } from '../../helpers/error.helpers';

const PROVIDER = 'AudD';
const AUDD_URL = 'https://api.audd.io/';

interface AuddResponse {
  error?: {
    error_code?: number;
  };
  result?: {
    title?: string;
    artist?: string;
  };
}

/** Audio identification via AudD. Requires AUDD_API_KEY. */
@Injectable()
export class AuddClient implements IIdentifyClient {
  private readonly logger = new Logger(AuddClient.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.apiKey = this.config.get('AUDD_API_KEY', { infer: true });
  }

  async fetch(
    file: Express.Multer.File,
  ): Promise<{ name: string; artist: string } | null> {
    this.logger.log(
      `auddFetch(file="${file?.originalname}", size=${file?.size})`,
    );
    if (!this.apiKey) {
      this.logger.warn(`${PROVIDER} skipped: AUDD_API_KEY not set`);
      return null;
    }
    try {
      const formData = new FormData();
      const arrayBuffer = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength,
      ) as ArrayBuffer;
      formData.append(
        'file',
        new Blob([arrayBuffer], { type: file.mimetype }),
        file.originalname,
      );
      formData.append('api_token', this.apiKey);

      const res = await firstValueFrom(
        this.http.post<AuddResponse>(AUDD_URL, formData),
      );

      this.logger.debug(
        `${PROVIDER} raw response: ${JSON.stringify(res?.data).slice(0, 300)}`,
      );

      const error = res?.data?.error;
      if (error?.error_code === 900 || error?.error_code === 901)
        throw new ProviderUnauthorizedException(PROVIDER);
      if (error?.error_code === 429)
        throw new ProviderRateLimitException(PROVIDER);

      const result = res?.data?.result;
      if (!result || !result.title || !result.artist) {
        this.logger.debug(`${PROVIDER} returned incomplete result`);
        return null;
      }

      return { name: result.title, artist: result.artist };
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
