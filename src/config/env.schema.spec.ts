import { envSchema } from './env.schema';

describe('envSchema', () => {
  it('applies defaults when the environment is empty', () => {
    const config = envSchema.parse({});

    expect(config.PORT).toBe(3000);
    expect(config.MAX_ARTWORKS).toBe(2);
    expect(config.TRIM_THRESHOLD_MB).toBe(1);
    expect(config.TRUST_PROXY).toBe(0);
    expect(config.THROTTLE_METADATA_TTL).toBe(1000);
    expect(config.THROTTLE_METADATA_LIMIT).toBe(100);
    expect(config.THROTTLE_IDENTIFY_TTL).toBe(5000);
    expect(config.THROTTLE_IDENTIFY_LIMIT).toBe(3);
    expect(config.REDIS_HOST).toBe('localhost');
    expect(config.REDIS_PORT).toBe(6379);
    expect(config.REDIS_TTL).toBe(3600);
    expect(config.ACRCLOUD_URL).toBe(
      'https://identify-eu-west-1.acrcloud.com/v1/identify',
    );
  });

  it('coerces numeric strings (as they arrive from process.env) to numbers', () => {
    const config = envSchema.parse({ PORT: '8080', REDIS_PORT: '6380' });

    expect(config.PORT).toBe(8080);
    expect(config.REDIS_PORT).toBe(6380);
  });

  it('leaves optional credentials undefined when not provided', () => {
    const config = envSchema.parse({});

    expect(config.LASTFM_API_KEY).toBeUndefined();
    expect(config.ACOUSTID_API_KEY).toBeUndefined();
    expect(config.AUDD_API_KEY).toBeUndefined();
    expect(config.MUSICBRAINZ_EMAIL).toBeUndefined();
  });

  it('rejects a malformed MUSICBRAINZ_EMAIL', () => {
    expect(() =>
      envSchema.parse({ MUSICBRAINZ_EMAIL: 'not-an-email' }),
    ).toThrow();
  });

  it('accepts a valid MUSICBRAINZ_EMAIL', () => {
    const config = envSchema.parse({ MUSICBRAINZ_EMAIL: 'dev@example.com' });
    expect(config.MUSICBRAINZ_EMAIL).toBe('dev@example.com');
  });

  it('rejects a non-URL ACRCLOUD_URL override', () => {
    expect(() => envSchema.parse({ ACRCLOUD_URL: 'nope' })).toThrow();
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => envSchema.parse({ PORT: 'abc' })).toThrow();
  });

  it('rejects a negative or fractional TRUST_PROXY hop count', () => {
    expect(() => envSchema.parse({ TRUST_PROXY: '-1' })).toThrow();
    expect(() => envSchema.parse({ TRUST_PROXY: '2.5' })).toThrow();
  });

  describe('LOG_LEVEL', () => {
    it('is undefined when unset (resolved to a NODE_ENV default downstream)', () => {
      expect(envSchema.parse({}).LOG_LEVEL).toBeUndefined();
    });

    it('accepts every supported pino level, including silent', () => {
      for (const level of [
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
        'silent',
      ]) {
        expect(envSchema.parse({ LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
      }
    });

    it('rejects an unknown level', () => {
      expect(() => envSchema.parse({ LOG_LEVEL: 'verbose' })).toThrow();
    });
  });
});
