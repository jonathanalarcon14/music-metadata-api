import { Test, TestingModule } from '@nestjs/testing';
import { MessageEvent } from '@nestjs/common';
import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { SongRequestDto } from './dto/song-request.dto';
import { SongResponseDto } from './dto/song-response.dto';
import { IdentifyRequestDto } from './dto/identify-request.dto';
import { Song } from './types/song.type';

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  name: null,
  artist: null,
  album: null,
  artwork: [],
  lyrics: null,
  ...overrides,
});

const makeFile = (): Express.Multer.File =>
  ({ originalname: 'song.mp3', size: 1234 }) as Express.Multer.File;

async function* asyncGenOf(items: Song[]): AsyncGenerator<Song> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

async function* asyncGenThrows(message: string): AsyncGenerator<Song> {
  await Promise.resolve();
  if (message) throw new Error(message);
  yield makeSong();
}

// Never settles: lets us assert that teardown calls `.return()` before
// the generator ever produces a value.
async function* asyncGenHangs(): AsyncGenerator<Song> {
  await new Promise(() => {});
  yield makeSong();
}

describe('SongsController', () => {
  let controller: SongsController;
  let songsService: {
    getMetadataSong: jest.Mock;
    getMetadataSongStream: jest.Mock;
    getMetadataSongAudio: jest.Mock;
  };

  beforeEach(async () => {
    songsService = {
      getMetadataSong: jest.fn(),
      getMetadataSongStream: jest.fn(),
      getMetadataSongAudio: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SongsController],
      providers: [{ provide: SongsService, useValue: songsService }],
    }).compile();

    controller = module.get<SongsController>(SongsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /songs', () => {
    it('maps the service result into a SongResponseDto', async () => {
      songsService.getMetadataSong.mockResolvedValue(
        makeSong({ name: 'Song', artist: 'Artist', artwork: ['a.jpg'] }),
      );

      const query: SongRequestDto = { name: 'Song', artist: 'Artist' };
      const result = await controller.getMetadataSong(query);

      expect(result).toBeInstanceOf(SongResponseDto);
      expect(result).toEqual({
        name: 'Song',
        artist: 'Artist',
        album: null,
        artwork: ['a.jpg'],
        lyrics: null,
      });
      expect(songsService.getMetadataSong).toHaveBeenCalledWith(
        'Song',
        'Artist',
      );
    });
  });

  describe('SSE /songs/stream', () => {
    it('emits one MessageEvent per partial Song yielded by the service', async () => {
      const partials = [
        makeSong({ name: 'Song' }),
        makeSong({ name: 'Song', artist: 'Artist' }),
      ];
      songsService.getMetadataSongStream.mockReturnValue(asyncGenOf(partials));

      const query: SongRequestDto = { name: 'Song', artist: 'Artist' };
      const events: MessageEvent[] = await lastValueFrom(
        controller.streamMetadataSong(query).pipe(toArray()),
      );

      expect(events).toHaveLength(2);
      expect(events[0].data).toMatchObject({ name: 'Song' });
      expect(events[1].data).toMatchObject({
        name: 'Song',
        artist: 'Artist',
      });
    });

    it('emits an error event instead of throwing when the stream fails', async () => {
      songsService.getMetadataSongStream.mockReturnValue(
        asyncGenThrows('provider exploded'),
      );

      const query: SongRequestDto = { name: 'x', artist: 'y' };
      const event = await firstValueFrom(controller.streamMetadataSong(query));

      expect(event.data).toEqual({ error: 'provider exploded' });
    });

    it('returns the generator on teardown so no further providers are queried', () => {
      const gen = asyncGenHangs();
      const retSpy = jest.spyOn(gen, 'return');
      songsService.getMetadataSongStream.mockReturnValue(gen);

      const query: SongRequestDto = { name: 'x', artist: 'y' };
      const subscription = controller
        .streamMetadataSong(query)
        .subscribe(() => {});
      subscription.unsubscribe();

      expect(retSpy).toHaveBeenCalled();
    });
  });

  describe('POST /songs/identify', () => {
    it('delegates the upload and enrich flag, returning a DTO', async () => {
      songsService.getMetadataSongAudio.mockResolvedValue(
        makeSong({ name: 'Identified', artist: 'Artist' }),
      );
      const file = makeFile();
      const query: IdentifyRequestDto = { enrich: false };

      const result = await controller.getMetadataSongAudio(file, query);

      expect(result).toMatchObject({ name: 'Identified', artist: 'Artist' });
      expect(songsService.getMetadataSongAudio).toHaveBeenCalledWith(
        file,
        false,
      );
    });
  });
});
