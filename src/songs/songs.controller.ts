import {
  Controller,
  Get,
  Sse,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpCode,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { diskStorage } from 'multer';
import * as os from 'os';
import { formatError } from './helpers/error.helpers';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudioFileTypeValidator } from './validators/audio-file-type.validator';
import { UploadCleanupInterceptor } from './interceptors/upload-cleanup.interceptor';
import { SkipThrottle } from '@nestjs/throttler';
import { SongResponseDto } from './dto/song-response.dto';
import { SongRequestDto } from './dto/song-request.dto';
import { IdentifyRequestDto } from './dto/identify-request.dto';
import { SongsService } from './songs.service';
import { ApiOkResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

// 20 MB hard cap — trimming very large files is slow regardless of
// the resulting sample size; this keeps pre-processing fast.
const MAX_FILE_SIZE_MB = 20;

@Controller('songs')
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get()
  @SkipThrottle({ identify: true })
  @ApiOkResponse({ type: SongResponseDto })
  async getMetadataSong(
    @Query() query: SongRequestDto,
  ): Promise<SongResponseDto> {
    const songMetadata = await this.songsService.getMetadataSong(
      query.name,
      query.artist,
    );

    return plainToInstance(SongResponseDto, songMetadata);
  }

  @Sse('stream')
  @SkipThrottle({ identify: true })
  @ApiOkResponse({
    type: SongResponseDto,
    description:
      'Server-Sent Events stream. Each event contains a partial or complete Song object as providers respond.',
  })
  streamMetadataSong(@Query() query: SongRequestDto): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const stream = this.songsService.getMetadataSongStream(
        query.name,
        query.artist,
      );

      void (async () => {
        try {
          for await (const partial of stream) {
            subscriber.next({
              data: plainToInstance(SongResponseDto, partial),
            });
          }
          subscriber.complete();
        } catch (err) {
          subscriber.next({ data: { error: formatError(err) } });
          subscriber.complete();
        }
      })();

      // Teardown on client disconnect: ends the generator so no further
      // providers are queried for a stream nobody is listening to.
      return () => void stream.return(undefined);
    });
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Audio file to identify (max 20MB)',
        },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: SongResponseDto })
  @HttpCode(200)
  @Post('identify')
  @SkipThrottle({ metadata: true })
  @UseInterceptors(
    // Disk storage: the upload streams to a temp file instead of being
    // buffered whole in the heap; the cleanup interceptor deletes it.
    FileInterceptor('file', {
      storage: diskStorage({ destination: os.tmpdir() }),
      limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
    }),
    UploadCleanupInterceptor,
  )
  async getMetadataSongAudio(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_FILE_SIZE_MB * 1024 * 1024,
          }),
          new AudioFileTypeValidator(),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query() query: IdentifyRequestDto,
  ): Promise<SongResponseDto> {
    const songMetadata = await this.songsService.getMetadataSongAudio(
      file,
      query.enrich,
    );

    return plainToInstance(SongResponseDto, songMetadata);
  }
}
