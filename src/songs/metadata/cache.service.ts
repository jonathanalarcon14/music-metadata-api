import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { EnvConfig } from '../../config/env.schema';
import { formatError } from '../helpers/error.helpers';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTtl: number;

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.defaultTtl = this.config.get('REDIS_TTL', { infer: true }) * 1000;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cache.get<T>(key);
      this.logger.debug(value ? `HIT ${key}` : `MISS ${key}`);
      return value ?? null;
    } catch (err) {
      this.logger.error(`GET failed for key "${key}": ${formatError(err)}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
      this.logger.debug(`SET ${key} (ttl=${ttl ?? this.defaultTtl}ms)`);
    } catch (err) {
      this.logger.error(`SET failed: ${formatError(err)}`);
    }
  }
}
