import { Song } from '../../types/song.type';

export const METADATA_CLIENTS_TOKEN = Symbol('METADATA_CLIENTS');

export interface IMetadataClient {
  fetch(name: string, artist: string): Promise<Song | null>;
}
