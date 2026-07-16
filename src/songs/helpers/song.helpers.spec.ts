import { emptySong, isSongComplete, isSongEmpty } from './song.helpers';
import { Song } from '../types/song.type';

const makeSong = (overrides: Partial<Song> = {}): Song => ({
  ...emptySong(),
  ...overrides,
});

describe('song.helpers', () => {
  describe('emptySong', () => {
    it('returns a fully null/empty song', () => {
      expect(emptySong()).toEqual({
        name: null,
        artist: null,
        album: null,
        artwork: [],
        lyrics: null,
      });
    });

    it('returns a fresh object each call (no shared array reference)', () => {
      const a = emptySong();
      const b = emptySong();
      a.artwork.push('x');
      expect(b.artwork).toEqual([]);
    });
  });

  describe('isSongComplete', () => {
    it('is true only when every field is populated and artwork is non-empty', () => {
      expect(
        isSongComplete(
          makeSong({
            name: 'n',
            artist: 'a',
            album: 'al',
            lyrics: 'l',
            artwork: ['x'],
          }),
        ),
      ).toBe(true);
    });

    it('is false when any scalar field is null', () => {
      const base = {
        name: 'n',
        artist: 'a',
        album: 'al',
        lyrics: 'l',
        artwork: ['x'],
      };
      for (const field of ['name', 'artist', 'album', 'lyrics'] as const) {
        expect(isSongComplete(makeSong({ ...base, [field]: null }))).toBe(
          false,
        );
      }
    });

    it('is false when artwork is empty', () => {
      expect(
        isSongComplete(
          makeSong({
            name: 'n',
            artist: 'a',
            album: 'al',
            lyrics: 'l',
            artwork: [],
          }),
        ),
      ).toBe(false);
    });
  });

  describe('isSongEmpty', () => {
    it('is true for a freshly created empty song', () => {
      expect(isSongEmpty(emptySong())).toBe(true);
    });

    it('is false when a scalar field is set', () => {
      expect(isSongEmpty(makeSong({ name: 'n' }))).toBe(false);
    });

    it('is false when only artwork is populated', () => {
      expect(isSongEmpty(makeSong({ artwork: ['x'] }))).toBe(false);
    });
  });
});
