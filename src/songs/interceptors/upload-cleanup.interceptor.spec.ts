import { ExecutionContext, CallHandler } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { unlink } from 'fs/promises';
import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const mockUnlink = unlink as jest.MockedFunction<typeof unlink>;

const makeContext = (file?: { path?: string }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ file }) }),
  }) as unknown as ExecutionContext;

const makeHandler = (source: CallHandler['handle']): CallHandler =>
  ({ handle: source }) as CallHandler;

describe('UploadCleanupInterceptor', () => {
  let interceptor: UploadCleanupInterceptor;

  beforeEach(() => {
    interceptor = new UploadCleanupInterceptor();
    mockUnlink.mockClear();
  });

  it('deletes the uploaded temp file after a successful response', async () => {
    const ctx = makeContext({ path: '/tmp/upload-123' });
    const next = makeHandler(() => of({ ok: true }));

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/upload-123');
  });

  it('deletes the temp file even when the handler errors (e.g. validation 400)', async () => {
    const ctx = makeContext({ path: '/tmp/upload-456' });
    const next = makeHandler(() => throwError(() => new Error('validation')));

    await expect(
      lastValueFrom(interceptor.intercept(ctx, next)),
    ).rejects.toThrow('validation');

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/upload-456');
  });

  it('does nothing when no file was uploaded', async () => {
    const ctx = makeContext(undefined);
    const next = makeHandler(() => of({ ok: true }));

    await lastValueFrom(interceptor.intercept(ctx, next));

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('does not reject if unlink itself fails (best-effort cleanup)', async () => {
    mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
    const ctx = makeContext({ path: '/tmp/upload-789' });
    const next = makeHandler(() => of({ ok: true }));

    await expect(
      lastValueFrom(interceptor.intercept(ctx, next)),
    ).resolves.toEqual({ ok: true });
  });
});
