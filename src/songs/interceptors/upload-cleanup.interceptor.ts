import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { unlink } from 'fs/promises';
import { Request } from 'express';

/**
 * Deletes the disk-storage upload once the request settles. Must cover every
 * exit path — including validation rejections (400), which happen after
 * multer has already written the file to disk.
 */
@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      finalize(() => {
        const uploadPath = request.file?.path;
        if (uploadPath) void unlink(uploadPath).catch(() => undefined);
      }),
    );
  }
}
