export const IDENTIFY_CLIENTS_TOKEN = Symbol('IDENTIFY_CLIENTS');

export interface IIdentifyClient {
  fetch(
    file: Express.Multer.File,
  ): Promise<{ name: string; artist: string } | null>;
}
