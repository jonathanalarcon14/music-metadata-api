import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { METADATA_CLIENTS_TOKEN } from '../src/songs/metadata/interfaces/metadata-client.interface';
import { IDENTIFY_CLIENTS_TOKEN } from '../src/songs/identify/interfaces/identify-client.interface';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as http from 'http';
import { AddressInfo } from 'net';
import { Song } from '../src/songs/types/song.type';

const audioBuffer = readFileSync(join(__dirname, 'fixtures', 'test.mp3'));

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  name: null,
  artist: null,
  album: null,
  artwork: [],
  lyrics: null,
  ...overrides,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('App (e2e)', () => {
  let app: INestApplication;

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockMetadataClient = {
    fetch: jest.fn(),
  };

  const mockMetadataClient2 = {
    fetch: jest.fn(),
  };

  const mockMetadataClient3 = {
    fetch: jest.fn(),
  };

  const mockIdentifyClient = {
    fetch: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CACHE_MANAGER)
      .useValue(mockCache)
      .overrideProvider(METADATA_CLIENTS_TOKEN)
      .useValue([mockMetadataClient, mockMetadataClient2, mockMetadataClient3])
      .overrideProvider(IDENTIFY_CLIENTS_TOKEN)
      .useValue([mockIdentifyClient])
      // Throttling is not under test; without this the identify tests
      // exceed THROTTLE_IDENTIFY_LIMIT and start failing with 429.
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector), {
        excludeExtraneousValues: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 with status and uptime', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('GET /songs', () => {
    it('should return 200 and song metadata when found', async () => {
      const songData = {
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        artwork: ['https://example.com/art.jpg'],
        lyrics: 'Lyrics here',
      };
      mockCache.get.mockResolvedValue(null);
      mockMetadataClient.fetch.mockResolvedValue(songData);

      const response = await request(app.getHttpServer())
        .get('/songs')
        .query({ name: 'Blinding Lights', artist: 'The Weeknd' })
        .expect(200);

      expect(response.body).toEqual(songData);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return 404 when song not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockMetadataClient.fetch.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/songs')
        .query({ name: 'Unknown', artist: 'Unknown' })
        .expect(404);
    });

    it('should return 400 when parameters are missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/songs')
        .query({ name: 'Only Name' })
        .expect(400);

      expect(response.body.message).toContain(
        'artist must be longer than or equal to 2 characters',
      );
    });

    it('should return cached data if available', async () => {
      const cachedData = {
        name: 'Cached Song',
        artist: 'Cached Artist',
        album: 'Cached Album',
        artwork: [],
        lyrics: null,
      };
      mockCache.get.mockResolvedValue(cachedData);

      const response = await request(app.getHttpServer())
        .get('/songs')
        .query({ name: 'Cached Song', artist: 'Cached Artist' })
        .expect(200);

      expect(response.body).toEqual(cachedData);
      expect(mockMetadataClient.fetch).not.toHaveBeenCalled();
    });
  });

  describe('POST /songs/identify', () => {
    it('should return 200 and identified song metadata', async () => {
      const songData = {
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        artwork: ['https://example.com/art.jpg'],
        lyrics: 'Lyrics here',
      };
      mockIdentifyClient.fetch.mockResolvedValue({
        name: 'Blinding Lights',
        artist: 'The Weeknd',
      });
      mockMetadataClient.fetch.mockResolvedValue(songData);
      mockCache.get.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/songs/identify')
        .attach('file', audioBuffer, {
          filename: 'test.mp3',
          contentType: 'audio/mpeg',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(songData);
    });

    it('should return 404 when identification fails', async () => {
      mockIdentifyClient.fetch.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/songs/identify')
        .attach('file', audioBuffer, {
          filename: 'test.mp3',
          contentType: 'audio/mpeg',
        })
        .expect(404);
    });

    it('should return 400 when file is missing', async () => {
      await request(app.getHttpServer()).post('/songs/identify').expect(400);
    });

    it('should skip metadata enrichment when enrich=false', async () => {
      mockIdentifyClient.fetch.mockResolvedValue({
        name: 'Blinding Lights',
        artist: 'The Weeknd',
      });

      const response = await request(app.getHttpServer())
        .post('/songs/identify')
        .query({ enrich: 'false' })
        .attach('file', audioBuffer, {
          filename: 'test.mp3',
          contentType: 'audio/mpeg',
        })
        .expect(200);

      expect(response.body).toEqual(
        makeSong({ name: 'Blinding Lights', artist: 'The Weeknd' }),
      );
      expect(mockMetadataClient.fetch).not.toHaveBeenCalled();
      expect(mockMetadataClient2.fetch).not.toHaveBeenCalled();
      expect(mockMetadataClient3.fetch).not.toHaveBeenCalled();
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should return 400 when enrich is not a boolean', async () => {
      await request(app.getHttpServer())
        .post('/songs/identify')
        .query({ enrich: 'banana' })
        .attach('file', audioBuffer, {
          filename: 'test.mp3',
          contentType: 'audio/mpeg',
        })
        .expect(400);
    });
  });

  describe('GET /songs/stream (SSE)', () => {
    let baseUrl: string;

    beforeAll(async () => {
      const server = app.getHttpServer() as http.Server;
      if (!server.address()) {
        await new Promise<void>((resolve) => server.listen(0, resolve));
      }
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
    });

    const streamUrl = () =>
      `${baseUrl}/songs/stream?name=Blinding%20Lights&artist=The%20Weeknd`;

    const parseSseEvents = (raw: string): Record<string, unknown>[] =>
      raw
        .split('\n\n')
        .filter((chunk) => chunk.includes('data: '))
        .map(
          (chunk) =>
            JSON.parse(chunk.split('data: ')[1]) as Record<string, unknown>,
        );

    it('should stream incremental events and close when providers finish', async () => {
      mockCache.get.mockResolvedValue(null);
      mockMetadataClient.fetch.mockResolvedValue(
        makeSong({ name: 'Blinding Lights', artist: 'The Weeknd' }),
      );
      mockMetadataClient2.fetch.mockResolvedValue(
        makeSong({
          album: 'After Hours',
          artwork: ['https://example.com/art.jpg'],
          lyrics: 'Lyrics here',
        }),
      );
      mockMetadataClient3.fetch.mockResolvedValue(null);

      const raw = await new Promise<string>((resolve, reject) => {
        http
          .get(streamUrl(), { agent: false }, (res) => {
            let body = '';
            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
            res.on('end', () => resolve(body));
            res.on('error', reject);
          })
          .on('error', reject);
      });

      const events = parseSseEvents(raw);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        album: null,
        artwork: [],
        lyrics: null,
      });
      expect(events[1]).toEqual({
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        artwork: ['https://example.com/art.jpg'],
        lyrics: 'Lyrics here',
      });
      expect(mockMetadataClient3.fetch).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledTimes(1);
    });

    it('should stop querying providers after the client disconnects', async () => {
      mockCache.get.mockResolvedValue(null);
      mockMetadataClient.fetch.mockResolvedValue(
        makeSong({ name: 'Blinding Lights', artist: 'The Weeknd' }),
      );

      // Provider 2 is gated: it signals when called and resolves only
      // when the test releases it, making the sequence deterministic.
      let markProvider2Called!: () => void;
      const provider2Called = new Promise<void>(
        (resolve) => (markProvider2Called = resolve),
      );
      let releaseProvider2!: (song: Song) => void;
      mockMetadataClient2.fetch.mockImplementation(() => {
        markProvider2Called();
        return new Promise<Song>((resolve) => (releaseProvider2 = resolve));
      });
      mockMetadataClient3.fetch.mockResolvedValue(null);

      // Connect and abort right after the first SSE event arrives.
      await new Promise<void>((resolve, reject) => {
        const req = http.get(streamUrl(), { agent: false }, (res) => {
          res.on('error', () => undefined);
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        });
        req.on('error', reject);
      });

      // Provider 2 was already in flight when the client disconnected.
      await provider2Called;
      // Give the server time to notice the closed socket (teardown runs).
      await sleep(150);
      releaseProvider2(makeSong({ album: 'After Hours' }));
      await sleep(150);

      expect(mockMetadataClient2.fetch).toHaveBeenCalledTimes(1);
      expect(mockMetadataClient3.fetch).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });
});
