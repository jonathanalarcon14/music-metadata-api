import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
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

const PROVIDER = 'ACRCloud';

interface AcrCloudResponse {
  status?: {
    code?: number;
  };
  metadata?: {
    music?: Array<{
      title?: string;
      artists?: Array<{
        name?: string;
      }>;
    }>;
  };
}

/** Audio identification via ACRCloud. Requires API key + secret + URL. */
@Injectable()
export class AcrCloudClient implements IIdentifyClient {
  private readonly logger = new Logger(AcrCloudClient.name);
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly secret: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.url = this.config.get('ACRCLOUD_URL', { infer: true });
    this.apiKey = this.config.get('ACRCLOUD_API_KEY', { infer: true });
    this.secret = this.config.get('ACRCLOUD_SECRET', { infer: true });
  }

  /**
   * Request is signed with HMAC-SHA1 over host, key, timestamp and payload
   * metadata; audio is sent as multipart form-data.
   */
  async fetch(
    file: Express.Multer.File,
  ): Promise<{ name: string; artist: string } | null> {
    this.logger.log(
      `acrCloudFetch(file="${file?.originalname}", size=${file?.size})`,
    );
    if (!this.apiKey || !this.secret) {
      this.logger.warn(
        `${PROVIDER} skipped: ACRCLOUD_API_KEY or ACRCLOUD_SECRET not set`,
      );
      return null;
    }
    try {
      const httpMethod = 'POST';
      // Path is derived from the configured URL so the HMAC signature stays
      // in sync if the endpoint changes (e.g. regional hosts).
      const httpUri = new URL(this.url).pathname;
      const dataType = 'audio';
      const signatureVersion = '1';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const stringToSign = [
        httpMethod,
        httpUri,
        this.apiKey,
        dataType,
        signatureVersion,
        timestamp,
      ].join('\n');
      const signature = crypto
        .createHmac('sha1', this.secret)
        .update(stringToSign)
        .digest('base64');

      const formData = new FormData();

      // `Buffer` in Node may be a view over a pooled ArrayBuffer, so slicing
      // by byteOffset/byteLength ensures we only send the actual audio bytes.
      const arrayBuffer = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength,
      ) as ArrayBuffer;

      formData.append(
        'sample',
        new Blob([arrayBuffer], { type: file.mimetype }),
        file.originalname,
      );
      formData.append('sample_bytes', file.size.toString());
      formData.append('access_key', this.apiKey);
      formData.append('data_type', dataType);
      formData.append('signature_version', signatureVersion);
      formData.append('signature', signature);
      formData.append('timestamp', timestamp);

      const res = await firstValueFrom(
        this.http.post<AcrCloudResponse>(this.url, formData),
      );

      this.logger.debug(
        `${PROVIDER} raw response: ${JSON.stringify(res?.data).slice(0, 300)}`,
      );

      const status = res?.data?.status;
      if (status?.code === 3003 || status?.code === 3001)
        throw new ProviderUnauthorizedException(PROVIDER);
      if (status?.code === 3015) throw new ProviderRateLimitException(PROVIDER);

      const music = res?.data?.metadata?.music?.[0];
      if (!music || !music.title || !music.artists?.[0]?.name) {
        this.logger.debug(`${PROVIDER} returned incomplete result`);
        return null;
      }

      return { name: music.title, artist: music.artists[0].name };
    } catch (err) {
      this.logger.warn(`${PROVIDER} error: ${formatError(err)}`);
      if (err instanceof ProviderException) throw err;
      return handleHttpException(err, PROVIDER);
    }
  }
}
