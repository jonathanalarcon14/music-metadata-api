import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { IdentifyService } from './identify.service';
import { MetadataService } from '../metadata/metadata.service';
import { IDENTIFY_CLIENTS_TOKEN } from './interfaces/identify-client.interface';
import { Song } from '../types/song.type';
import * as audioHelpers from './helpers/audio.helpers';

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  name: null,
  artist: null,
  album: null,
  artwork: [],
  lyrics: null,
  ...overrides,
});

const makeFile = (size = 500): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'song.mp3',
  encoding: '7bit',
  mimetype: 'audio/mpeg',
  buffer: Buffer.from(''),
  size,
  stream: null as never,
  destination: '',
  filename: '',
  path: '',
});

const mockClient = () => ({ fetch: jest.fn().mockResolvedValue(null) });

describe('IdentifyService', () => {
  let service: IdentifyService;
  let metadataService: { getMetadataSong: jest.Mock };
  let identifyProviders: { fetch: jest.Mock }[];
  let trimSpy: jest.SpyInstance;

  const TRIM_THRESHOLD_MB = 5;

  beforeEach(async () => {
    identifyProviders = [mockClient(), mockClient(), mockClient()];
    metadataService = { getMetadataSong: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentifyService,
        { provide: ConfigService, useValue: { get: () => TRIM_THRESHOLD_MB } },
        { provide: MetadataService, useValue: metadataService },
        { provide: IDENTIFY_CLIENTS_TOKEN, useValue: identifyProviders },
      ],
    }).compile();

    service = module.get<IdentifyService>(IdentifyService);

    trimSpy = jest
      .spyOn(audioHelpers, 'trimAudio')
      .mockImplementation((file) => Promise.resolve(file));
    jest
      .spyOn(audioHelpers, 'loadAudio')
      .mockImplementation((file) => Promise.resolve(file));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('identifyAndEnrich', () => {
    it('returns enriched metadata when a provider identifies the audio', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'Song',
        artist: 'Artist',
      });
      metadataService.getMetadataSong.mockResolvedValue(
        makeSong({
          name: 'Song',
          artist: 'Artist',
          album: 'Album',
          artwork: ['a.jpg'],
          lyrics: 'la la',
        }),
      );

      const result = await service.identifyAndEnrich(makeFile());

      expect(result.album).toBe('Album');
      expect(result.lyrics).toBe('la la');
      expect(metadataService.getMetadataSong).toHaveBeenCalledWith(
        'Song',
        'Artist',
      );
    });

    it('stops at the first provider that identifies the audio', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'A',
        artist: 'B',
      });
      identifyProviders[1].fetch.mockResolvedValue({
        name: 'X',
        artist: 'Y',
      });
      metadataService.getMetadataSong.mockResolvedValue(makeSong());

      await service.identifyAndEnrich(makeFile());

      expect(metadataService.getMetadataSong).toHaveBeenCalledWith('A', 'B');
      expect(identifyProviders[1].fetch).not.toHaveBeenCalled();
      expect(identifyProviders[2].fetch).not.toHaveBeenCalled();
    });

    it('continues to the next provider if one returns null', async () => {
      identifyProviders[1].fetch.mockResolvedValue({
        name: 'Song',
        artist: 'Artist',
      });
      metadataService.getMetadataSong.mockResolvedValue(makeSong());

      const result = await service.identifyAndEnrich(makeFile());

      expect(result.name).toBe('Song');
      expect(result.artist).toBe('Artist');
    });

    it('swallows provider errors and continues with the next one', async () => {
      identifyProviders[0].fetch.mockRejectedValue(new Error('boom'));
      identifyProviders[1].fetch.mockResolvedValue({
        name: 'Song',
        artist: 'Artist',
      });
      metadataService.getMetadataSong.mockResolvedValue(makeSong());

      const result = await service.identifyAndEnrich(makeFile());

      expect(result.name).toBe('Song');
    });

    it('throws NotFoundException when no provider identifies the audio', async () => {
      await expect(service.identifyAndEnrich(makeFile())).rejects.toThrow(
        NotFoundException,
      );
      expect(metadataService.getMetadataSong).not.toHaveBeenCalled();
    });

    it('falls back to identification name/artist when metadata throws NotFound', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'Identified',
        artist: 'IdArtist',
      });
      metadataService.getMetadataSong.mockRejectedValue(
        new NotFoundException(),
      );

      const result = await service.identifyAndEnrich(makeFile());

      expect(result.name).toBe('Identified');
      expect(result.artist).toBe('IdArtist');
      expect(result.album).toBeNull();
      expect(result.lyrics).toBeNull();
    });

    it('propagates non-NotFound errors from metadata', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'Song',
        artist: 'Artist',
      });
      metadataService.getMetadataSong.mockRejectedValue(
        new Error('database down'),
      );

      await expect(service.identifyAndEnrich(makeFile())).rejects.toThrow(
        'database down',
      );
    });

    it('keeps metadata-provided name/artist when present', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'Identified',
        artist: 'IdArtist',
      });
      metadataService.getMetadataSong.mockResolvedValue(
        makeSong({ name: 'Metadata Name', artist: 'Metadata Artist' }),
      );

      const result = await service.identifyAndEnrich(makeFile());

      expect(result.name).toBe('Metadata Name');
      expect(result.artist).toBe('Metadata Artist');
    });

    it('trims audio when file size exceeds the threshold', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'S',
        artist: 'A',
      });
      metadataService.getMetadataSong.mockResolvedValue(makeSong());

      const bigFile = makeFile((TRIM_THRESHOLD_MB + 1) * 1024 * 1024);
      await service.identifyAndEnrich(bigFile);

      expect(trimSpy).toHaveBeenCalledWith(bigFile, 20, 30);
    });

    it('does not trim audio when file size is below the threshold', async () => {
      identifyProviders[0].fetch.mockResolvedValue({
        name: 'S',
        artist: 'A',
      });
      metadataService.getMetadataSong.mockResolvedValue(makeSong());

      await service.identifyAndEnrich(makeFile(1024));

      expect(trimSpy).not.toHaveBeenCalled();
    });
  });
});
