import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { SongsModule } from './songs/songs.module';
import { envSchema, EnvConfig } from './config/env.schema';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const isProd = process.env.NODE_ENV === 'production';
        const isTest = process.env.NODE_ENV === 'test';
        const level =
          config.get('LOG_LEVEL', { infer: true }) ??
          (isTest ? 'silent' : isProd ? 'info' : 'debug');

        return {
          pinoHttp: {
            level,
            // Correlate every log of a request under one id. Honor an
            // upstream X-Request-Id (e.g. from a gateway) or mint one, and
            // echo it back so clients/proxies can trace the call.
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const header = req.headers['x-request-id'];
              const id =
                (Array.isArray(header) ? header[0] : header) ?? randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            // Pretty, single-line logs in dev; raw JSON in prod for aggregators.
            // No pretty transport under test to avoid a lingering worker thread.
            transport:
              isProd || isTest
                ? undefined
                : { target: 'pino-pretty', options: { singleLine: true } },
          },
        };
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const ttl = config.get('REDIS_TTL') * 1000;
        try {
          const store = await redisStore({
            socket: {
              host: config.get('REDIS_HOST'),
              port: config.get('REDIS_PORT'),
            },
          });
          await store.client.ping();
          return { store, ttl };
        } catch {
          Logger.warn(
            'Redis unavailable, falling back to in-memory cache',
            'CacheModule',
          );
          return { ttl };
        }
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => [
        {
          name: 'metadata',
          ttl: config.get('THROTTLE_METADATA_TTL', { infer: true }),
          limit: config.get('THROTTLE_METADATA_LIMIT', { infer: true }),
        },
        {
          name: 'identify',
          ttl: config.get('THROTTLE_IDENTIFY_TTL', { infer: true }),
          limit: config.get('THROTTLE_IDENTIFY_LIMIT', { infer: true }),
        },
      ],
    }),
    SongsModule,
  ],
  controllers: [HealthController],
  // useExisting (instead of useClass) makes the guard overridable in e2e
  // tests via overrideProvider(ThrottlerGuard), per the NestJS testing docs.
  providers: [
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
