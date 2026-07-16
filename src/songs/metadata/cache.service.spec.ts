import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

const REDIS_TTL_SECONDS = 60;

describe('CacheService', () => {
  let service: CacheService;
  let cache: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    cache = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: cache },
        {
          provide: ConfigService,
          useValue: { get: () => REDIS_TTL_SECONDS },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  describe('get', () => {
    it('returns the cached value on a hit', async () => {
      cache.get.mockResolvedValue({ name: 'Song' });

      await expect(service.get('key')).resolves.toEqual({ name: 'Song' });
      expect(cache.get).toHaveBeenCalledWith('key');
    });

    it('normalizes an undefined miss to null', async () => {
      cache.get.mockResolvedValue(undefined);

      await expect(service.get('key')).resolves.toBeNull();
    });

    it('swallows store errors and returns null (graceful degradation)', async () => {
      cache.get.mockRejectedValue(new Error('redis down'));

      await expect(service.get('key')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('forwards key, value and an explicit ttl to the store', async () => {
      cache.set.mockResolvedValue(undefined);

      await service.set('key', { a: 1 }, 5000);

      expect(cache.set).toHaveBeenCalledWith('key', { a: 1 }, 5000);
    });

    it('passes undefined ttl through when none is provided', async () => {
      cache.set.mockResolvedValue(undefined);

      await service.set('key', { a: 1 });

      expect(cache.set).toHaveBeenCalledWith('key', { a: 1 }, undefined);
    });

    it('swallows store errors so a cache failure never breaks the request', async () => {
      cache.set.mockRejectedValue(new Error('redis down'));

      await expect(service.set('key', 'v')).resolves.toBeUndefined();
    });
  });
});
