import { Test, TestingModule } from '@nestjs/testing';
import { SongsService } from './songs.service';
import { MetadataService } from './metadata/metadata.service';
import { IdentifyService } from './identify/identify.service';
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
  ({
    originalname: 'song.mp3',
    size: 1234,
  }) as Express.Multer.File;

describe('SongsService', () => {
  let service: SongsService;
  let metadataService: {
    getMetadataSong: jest.Mock;
    getMetadataSongStream: jest.Mock;
  };
  let identifyService: { identifyAndEnrich: jest.Mock };

  beforeEach(async () => {
    metadataService = {
      getMetadataSong: jest.fn(),
      getMetadataSongStream: jest.fn(),
    };
    identifyService = { identifyAndEnrich: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SongsService,
        { provide: MetadataService, useValue: metadataService },
        { provide: IdentifyService, useValue: identifyService },
      ],
    }).compile();

    service = module.get<SongsService>(SongsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetadataSong', () => {
    it('delegates to MetadataService and returns its result', async () => {
      const song = makeSong({ name: 'Song', artist: 'Artist' });
      metadataService.getMetadataSong.mockResolvedValue(song);

      const result = await service.getMetadataSong('Song', 'Artist');

      expect(result).toBe(song);
      expect(metadataService.getMetadataSong).toHaveBeenCalledWith(
        'Song',
        'Artist',
      );
    });

    it('propagates errors from MetadataService', async () => {
      metadataService.getMetadataSong.mockRejectedValue(new Error('boom'));

      await expect(service.getMetadataSong('a', 'b')).rejects.toThrow('boom');
    });
  });

  describe('getMetadataSongStream', () => {
    it('delegates to MetadataService and returns the generator', () => {
      const generator = (async function* (): AsyncGenerator<Song> {
        await Promise.resolve();
        yield makeSong({ name: 'partial' });
      })();
      metadataService.getMetadataSongStream.mockReturnValue(generator);

      const result = service.getMetadataSongStream('Song', 'Artist');

      expect(result).toBe(generator);
      expect(metadataService.getMetadataSongStream).toHaveBeenCalledWith(
        'Song',
        'Artist',
      );
    });
  });

  describe('getMetadataSongAudio', () => {
    it('delegates to IdentifyService with enrich defaulting to true', async () => {
      const song = makeSong({ name: 'Identified' });
      identifyService.identifyAndEnrich.mockResolvedValue(song);
      const file = makeFile();

      const result = await service.getMetadataSongAudio(file);

      expect(result).toBe(song);
      expect(identifyService.identifyAndEnrich).toHaveBeenCalledWith(
        file,
        true,
      );
    });

    it('forwards an explicit enrich=false flag', async () => {
      identifyService.identifyAndEnrich.mockResolvedValue(makeSong());
      const file = makeFile();

      await service.getMetadataSongAudio(file, false);

      expect(identifyService.identifyAndEnrich).toHaveBeenCalledWith(
        file,
        false,
      );
    });

    it('propagates errors from IdentifyService', async () => {
      identifyService.identifyAndEnrich.mockRejectedValue(new Error('nope'));

      await expect(service.getMetadataSongAudio(makeFile())).rejects.toThrow(
        'nope',
      );
    });
  });
});
