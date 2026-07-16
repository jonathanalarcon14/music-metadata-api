import { Song } from '../types/song.type';

export function emptySong(): Song {
  return { name: null, artist: null, album: null, artwork: [], lyrics: null };
}

export function isSongComplete(song: Song): boolean {
  return (
    song.name !== null &&
    song.artist !== null &&
    song.album !== null &&
    song.lyrics !== null &&
    song.artwork.length > 0
  );
}

export function isSongEmpty(song: Song): boolean {
  return Object.values(song).every((value) =>
    Array.isArray(value) ? value.length === 0 : value === null,
  );
}
