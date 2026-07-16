import helmet from 'helmet';
import {
  ClassSerializerInterceptor,
  Logger as NestLogger,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { EnvConfig } from './config/env.schema';

async function bootstrap() {
  // bufferLogs holds early logs until pino takes over as the app logger,
  // so nothing bypasses the configured level/format during bootstrap.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // Honor X-Forwarded-For up to the configured proxy hop count so req.ip
  // (and thus the per-IP throttler) resolves the real client behind a proxy.
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: true,
    }),
    // Ensures thrown errors are logged with their stack via pino.
    new LoggerErrorInterceptor(),
  );
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableCors();
  app.enableShutdownHooks();
  app.use(helmet());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Music Meta API')
    .setDescription('API for fetching song metadata and identifying audio')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  NestLogger.error(err, 'Bootstrap');
  process.exit(1);
});
