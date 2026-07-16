import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { CacheService } from './cache.service';
import { METADATA_CLIENTS_TOKEN } from './interfaces/metadata-client.interface';
import { Song } from '../types/song.type';

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  name: null,
  artist: null,
  album: null,
  artwork: [],
  lyrics: null,
  ...overrides,
});

const mockClient = () => ({ fetch: jest.fn().mockResolvedValue(null) });
const mockCache = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
});

describe('MetadataService', () => {
  let service: MetadataService;
  let providers: { fetch: jest.Mock }[];
  let cache: { get: jest.Mock; set: jest.Mock };

  const MAX_ARTWORKS = 3;

  beforeEach(async () => {
    providers = [
      mockClient(),
      mockClient(),
      mockClient(),
      mockClient(),
      mockClient(),
    ];
    cache = mockCache();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetadataService,
        { provide: ConfigService, useValue: { get: () => MAX_ARTWORKS } },
        { provide: METADATA_CLIENTS_TOKEN, useValue: providers },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<MetadataService>(MetadataService);
  });

  const totalCalls = () =>
    providers.reduce((sum, p) => sum + p.fetch.mock.calls.length, 0);

  describe('getMetadataSong', () => {
    it('returns merged metadata from a single provider', async () => {
      providers[0].fetch.mockResolvedValue(
        makeSong({
          name: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          artwork: ['a.jpg'],
          lyrics: 'is this the real life',
        }),
      );

      const result = await service.getMetadataSong(
        'Bohemian Rhapsody',
        'Queen',
      );

      expect(result.name).toBe('Bohemian Rhapsody');
      expect(result.artist).toBe('Queen');
      expect(result.album).toBe('A Night at the Opera');
      expect(result.lyrics).toBe('is this the real life');
      expect(result.artwork).toEqual(['a.jpg']);
    });

    it('merges fields without overwriting already-populated values', async () => {
      providers[0].fetch.mockResolvedValue(
        makeSong({ name: 'Song A', artist: 'Artist A' }),
      );
      providers[1].fetch.mockResolvedValue(
        makeSong({ name: 'Song B', artist: 'Artist B', album: 'Album B' }),
      );

      const result = await service.getMetadataSong('q', 'a');

      expect(result.name).toBe('Song A');
      expect(result.artist).toBe('Artist A');
      expect(result.album).toBe('Album B');
    });

    it('deduplicates artwork URLs across providers', async () => {
      providers[0].fetch.mockResolvedValue(
        makeSong({ artwork: ['a.jpg', 'b.jpg'] }),
      );
      providers[1].fetch.mockResolvedValue(
        makeSong({ artwork: ['b.jpg', 'c.jpg'] }),
      );

      const result = await service.getMetadataSong('q', 'a');

      expect(result.artwork).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });

    it('caps artwork at MAX_ARTWORKS', async () => {
      providers[0].fetch.mockResolvedValue(
        makeSong({ artwork: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'] }),
      );
      providers[1].fetch.mockResolvedValue(makeSong({ artwork: ['e.jpg'] }));

      const result = await service.getMetadataSong('q', 'a');

      expect(result.artwork).toHaveLength(MAX_ARTWORKS);
      expect(result.artwork).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });

    it('skips providers that return null and continues the chain', async () => {
      providers[2].fetch.mockResolvedValue(
        makeSong({ name: 'Found', artist: 'X' }),
      );

      const result = await service.getMetadataSong('q', 'a');

      expect(result.name).toBe('Found');
      expect(result.artist).toBe('X');
    });

    it('swallows provider errors and continues with the next one', async () => {
      providers[0].fetch.mockRejectedValue(new Error('provider down'));
      providers[1].fetch.mockResolvedValue(
        makeSong({ name: 'Song', artist: 'Artist' }),
      );

      const result = await service.getMetadataSong('q', 'a');

      expect(result.name).toBe('Song');
      expect(result.artist).toBe('Artist');
    });

    it('stops querying once the song is fully complete', async () => {
      providers[0].fetch.mockResolvedValue(
        makeSong({
          name: 'n',
          artist: 'a',
          album: 'al',
          lyrics: 'l',
          artwork: ['1', '2', '3'],
        }),
      );

      await service.getMetadataSong('q', 'a');

      expect(totalCalls()).toBe(1);
    });

    it('continues if metadata is complete but artwork cap not yet reached', async () => {
      providers[0].fetch.mockResolvedValue(
        makeSong({
          name: 'n',
          artist: 'a',
          album: 'al',
          lyrics: 'l',
          artwork: ['1'],
        }),
      );
      providers[1].fetch.mockResolvedValue(makeSong({ artwork: ['2', '3'] }));

      const result = await service.getMetadataSong('q', 'a');

      expect(result.artwork).toEqual(['1', '2', '3']);
      expect(totalCalls()).toBeGreaterThanOrEqual(2);
    });

    it('throws NotFoundException when all providers return empty data', async () => {
      await expect(service.getMetadataSong('q', 'a')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when all providers fail', async () => {
      const err = new Error('boom');
      providers.forEach((p) => p.fetch.mockRejectedValue(err));

      await expect(service.getMetadataSong('q', 'a')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not throw if at least one field is populated', async () => {
      providers[0].fetch.mockResolvedValue(makeSong({ artwork: ['only.jpg'] }));

      const result = await service.getMetadataSong('q', 'a');

      expect(result.artwork).toEqual(['only.jpg']);
      expect(result.name).toBeNull();
    });
  });

  describe('in-flight dedupe (cache stampede)', () => {
    it('shares a single provider run across identical concurrent requests', async () => {
      let release!: (song: Song) => void;
      providers[0].fetch.mockImplementation(
        () => new Promise<Song>((resolve) => (release = resolve)),
      );

      const first = service.getMetadataSong('Song', 'Artist');
      const second = service.getMetadataSong('Song', 'Artist');

      // Let the first request reach the gated provider, then release it.
      await new Promise((r) => setImmediate(r));
      release(makeSong({ name: 'Song', artist: 'Artist' }));

      const [a, b] = await Promise.all([first, second]);

      expect(a).toEqual(b);
      expect(providers[0].fetch).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it('does not share runs between different songs', async () => {
      providers[0].fetch.mockResolvedValue(makeSong({ name: 'X' }));

      await Promise.all([
        service.getMetadataSong('One', 'Artist'),
        service.getMetadataSong('Two', 'Artist'),
      ]);

      expect(providers[0].fetch).toHaveBeenCalledTimes(2);
    });

    it('runs a fresh lookup once the in-flight request settles', async () => {
      providers[0].fetch.mockResolvedValue(makeSong({ name: 'Song' }));

      await service.getMetadataSong('Song', 'Artist');
      // Cache mock always misses, so a second run proves the map was cleaned.
      await service.getMetadataSong('Song', 'Artist');

      expect(providers[0].fetch).toHaveBeenCalledTimes(2);
    });

    it('shares the rejection when the deduped run finds nothing', async () => {
      const first = service.getMetadataSong('q', 'a');
      const second = service.getMetadataSong('q', 'a');

      await expect(first).rejects.toThrow(NotFoundException);
      await expect(second).rejects.toThrow(NotFoundException);
      expect(totalCalls()).toBe(providers.length);
    });
  });
});
