import { FileTypeValidator, FileValidator } from '@nestjs/common';
import { open } from 'fs/promises';

// file-type needs at most ~4100 bytes to detect any format's magic numbers.
const DETECTION_BYTES = 4100;

/**
 * Magic-number validation for disk-storage uploads. Nest's FileTypeValidator
 * only inspects `file.buffer` (memory storage), so this wrapper reads the
 * first bytes from `file.path` and delegates the actual detection to it.
 */
export class AudioFileTypeValidator extends FileValidator<
  Record<string, never>,
  Express.Multer.File
> {
  private readonly inner = new FileTypeValidator({ fileType: /audio\// });

  constructor() {
    super({});
  }

  async isValid(file?: Express.Multer.File): Promise<boolean> {
    if (!file?.path) return false;
    const prefix = await readPrefix(file.path);
    return this.inner.isValid({ ...file, buffer: prefix });
  }

  buildErrorMessage(file?: Express.Multer.File): string {
    return this.inner.buildErrorMessage(file);
  }
}

async function readPrefix(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(
      Buffer.alloc(DETECTION_BYTES),
      0,
      DETECTION_BYTES,
      0,
    );
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
