import { DeezerClient } from './deezer.client';
import { LrclibClient } from './lrclib.client';
import { LastFmClient } from './lastfm.client';
import { LyricsOvhClient } from './lyrics-ovh.client';
import { MusicBrainzClient } from './musicbrainz.client';
import { ItunesClient } from './itunes.client';

// Order defines query priority: providers are tried sequentially and the
// first non-null value for each field is kept. Put the most reliable /
// highest-quality sources first.
export const METADATA_CLIENTS = [
  ItunesClient,
  DeezerClient,
  LrclibClient,
  LastFmClient,
  LyricsOvhClient,
  MusicBrainzClient,
];
