import { z } from 'zod';

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export const envSchema = z.object({
  // Left optional so the logger can pick a NODE_ENV-based default when unset
  // (info in production, debug otherwise). Set to 'silent' to disable logs.
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

  PORT: z.coerce.number().default(3000),
  MAX_ARTWORKS: z.coerce.number().default(2),
  TRIM_THRESHOLD_MB: z.coerce.number().default(1),

  // Number of reverse-proxy hops to trust for the client IP (Express
  // `trust proxy`). 0 = trust nothing, so req.ip is the socket IP and a
  // spoofed X-Forwarded-For is ignored. Set to the proxy count (e.g. 1
  // behind a single Nginx/ingress) so per-IP rate limiting sees the real
  // client instead of the proxy.
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),

  THROTTLE_METADATA_TTL: z.coerce.number().default(1000),
  THROTTLE_METADATA_LIMIT: z.coerce.number().default(100),

  THROTTLE_IDENTIFY_TTL: z.coerce.number().default(5000),
  THROTTLE_IDENTIFY_LIMIT: z.coerce.number().default(3),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_TTL: z.coerce.number().default(3600),

  LASTFM_API_KEY: z.string().optional(),
  LASTFM_SECRET: z.string().optional(),

  MUSICBRAINZ_EMAIL: z.string().email().optional(),

  ACOUSTID_API_KEY: z.string().optional(),

  AUDD_API_KEY: z.string().optional(),

  // Region-specific. The default points at EU-West; users on other regions
  // must override it (see .env.example).
  ACRCLOUD_URL: z
    .string()
    .url()
    .default('https://identify-eu-west-1.acrcloud.com/v1/identify'),
  ACRCLOUD_API_KEY: z.string().optional(),
  ACRCLOUD_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
