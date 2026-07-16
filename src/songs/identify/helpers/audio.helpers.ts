import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { formatError } from '../../helpers/error.helpers';

const logger = new Logger('AudioHelpers');

interface FpcalcOutput {
  duration: number;
  fingerprint: string;
}

export async function generateFingerprint(
  file: Express.Multer.File,
): Promise<{ duration: number; fingerprint: string }> {
  const ext = path.extname(file.originalname || '.mp3') || '.mp3';
  const tmpInput = path.join(os.tmpdir(), `fpcalc_${randomUUID()}${ext}`);

  try {
    await writeFile(tmpInput, file.buffer);

    const stdout = await new Promise<string>((resolve, reject) => {
      const proc = spawn('fpcalc', ['-json', tmpInput]);
      let out = '';
      let err = '';
      proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
      proc.on('error', (e) => reject(e));
      proc.on('close', (code) =>
        code === 0
          ? resolve(out)
          : reject(new Error(err || `fpcalc exited with code ${code}`)),
      );
    });

    const parsed = JSON.parse(stdout) as FpcalcOutput;
    return { duration: parsed.duration, fingerprint: parsed.fingerprint };
  } finally {
    try {
      await unlink(tmpInput);
    } catch {
      // cleanup failure ignored
    }
  }
}

/** Below this many seconds of audio, identification APIs become unreliable. */
const MIN_SAMPLE_SECONDS = 10;

/**
 * Loads a disk-storage upload into memory. Identification providers send the
 * audio as part of their request payload, so they need a buffer — only files
 * small enough to skip trimming go through this.
 */
export async function loadAudio(
  file: Express.Multer.File,
): Promise<Express.Multer.File> {
  const buffer = await readFile(file.path);
  return { ...file, buffer, size: buffer.length };
}

/**
 * Cuts a sample of `seconds` starting at `startTime`. If the audio turns out
 * to be too short for that offset (empty or unusable sample), it re-trims
 * from the start. Falls back to the bundled `ffmpeg-static` only when the
 * system `ffmpeg` binary is missing.
 */
export async function trimAudio(
  file: Express.Multer.File,
  seconds: number,
  startTime: number = 0,
): Promise<Express.Multer.File> {
  logger.log(
    `trimAudio(seconds=${seconds}, startTime=${startTime}, size=${file?.size})`,
  );

  const { trimmed, inputDuration } = await runFfmpegWithFallback(
    file,
    seconds,
    startTime,
  );

  // The offset assumes the audio is long enough; when it is not, the cut
  // comes out empty (duration ≤ startTime) or too short to identify.
  // If ffmpeg did not report a duration, an empty output is the signal.
  const tooShort =
    inputDuration !== null
      ? inputDuration - startTime < MIN_SAMPLE_SECONDS
      : trimmed.size === 0;

  if (startTime > 0 && tooShort) {
    logger.log(
      `Sample too short (duration=${inputDuration ?? 'unknown'}s, startTime=${startTime}) — re-trimming from 0`,
    );
    return (await runFfmpegWithFallback(file, seconds, 0)).trimmed;
  }

  return trimmed;
}

async function runFfmpegWithFallback(
  file: Express.Multer.File,
  seconds: number,
  startTime: number,
): Promise<TrimResult> {
  try {
    return await runFfmpeg(file, seconds, startTime, null);
  } catch (err) {
    // Only a missing binary justifies the fallback; real conversion errors
    // (corrupt audio, unsupported codec) would fail again anyway.
    if (!isFfmpegMissingError(err)) throw err;

    logger.warn(
      `System ffmpeg unavailable, falling back to ffmpeg-static: ${formatError(err)}`,
    );
    const ffmpegStatic = (await import('ffmpeg-static')).default;
    if (!ffmpegStatic) throw new Error('ffmpeg binary not available');
    return runFfmpeg(
      file,
      seconds,
      startTime,
      ffmpegStatic as unknown as string,
    );
  }
}

function isFfmpegMissingError(err: unknown): boolean {
  if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('ENOENT') || message.includes('Cannot find ffmpeg');
}

interface TrimResult {
  trimmed: Express.Multer.File;
  inputDuration: number | null;
}

/** fluent-ffmpeg reports codecData duration as "HH:MM:SS.ms" (or "N/A"). */
function parseFfmpegDuration(raw?: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(raw ?? '');
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function runFfmpeg(
  file: Express.Multer.File,
  seconds: number,
  startTime: number,
  ffmpegPath: string | null,
): Promise<TrimResult> {
  const tmpOutput = path.join(os.tmpdir(), `output_${randomUUID()}.mp3`);

  try {
    let inputDuration: number | null = null;

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(file.path);
      if (ffmpegPath) command.setFfmpegPath(ffmpegPath);
      command
        .setStartTime(startTime)
        .setDuration(seconds)
        .output(tmpOutput)
        .on('codecData', (data: { duration?: string }) => {
          inputDuration = parseFfmpegDuration(data?.duration);
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const trimmedBuffer = await readFile(tmpOutput);

    return {
      trimmed: { ...file, buffer: trimmedBuffer, size: trimmedBuffer.length },
      inputDuration,
    };
  } finally {
    try {
      await unlink(tmpOutput);
    } catch {
      // cleanup failure ignored
    }
  }
}
