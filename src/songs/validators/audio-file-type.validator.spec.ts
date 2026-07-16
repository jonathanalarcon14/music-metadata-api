import { AudioFileTypeValidator } from './audio-file-type.validator';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';

const mp3Path = join(__dirname, '../../../test/fixtures/test.mp3');
const textPath = join(os.tmpdir(), 'audio-validator-spec.txt');

const makeFile = (path: string): Express.Multer.File =>
  ({
    originalname: 'upload',
    mimetype: 'application/octet-stream',
    size: 100,
    path,
  }) as Express.Multer.File;

describe('AudioFileTypeValidator', () => {
  const validator = new AudioFileTypeValidator();

  beforeAll(async () => {
    await writeFile(textPath, 'definitely not audio content');
  });

  afterAll(async () => {
    await unlink(textPath);
  });

  it('accepts a real audio file regardless of declared mimetype', async () => {
    await expect(validator.isValid(makeFile(mp3Path))).resolves.toBe(true);
  });

  it('rejects a non-audio file even with an audio mimetype', async () => {
    const disguised = {
      ...makeFile(textPath),
      mimetype: 'audio/mpeg',
    };

    await expect(validator.isValid(disguised)).resolves.toBe(false);
  });

  it('rejects when the file or its path is missing', async () => {
    await expect(validator.isValid(undefined)).resolves.toBe(false);
    await expect(validator.isValid(makeFile(''))).resolves.toBe(false);
  });
});
