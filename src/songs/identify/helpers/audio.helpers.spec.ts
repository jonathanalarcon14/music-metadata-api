import { Logger } from '@nestjs/common';
import { loadAudio, trimAudio } from './audio.helpers';
import ffmpeg from 'fluent-ffmpeg';
import { readFile } from 'fs/promises';

// This suite does not go through Test.createTestingModule (which installs a
// silent testing logger), so the module-level Logger would print to console.
Logger.overrideLogger(false);

jest.mock('fluent-ffmpeg', () => jest.fn());
// The real ffmpeg-static is CJS (`module.exports = <path>`), so a dynamic
// import() resolves it as `{ default: <path> }` — the mock mirrors that.
jest.mock('ffmpeg-static', () => '/fake/static/ffmpeg');
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

type Scenario = (cmd: FakeCommand) => void;

class FakeCommand {
  handlers: Record<string, (...args: unknown[]) => void> = {};
  startTime: number | null = null;
  ffmpegPath: string | null = null;

  constructor(private readonly scenario: Scenario) {}

  setFfmpegPath(p: string) {
    this.ffmpegPath = p;
    return this;
  }
  setStartTime(t: number) {
    this.startTime = t;
    return this;
  }
  setDuration() {
    return this;
  }
  output() {
    return this;
  }
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers[event] = handler;
    return this;
  }
  run() {
    this.scenario(this);
  }
}

const succeedWithDuration =
  (duration: string | null): Scenario =>
  (cmd) => {
    if (duration !== null) cmd.handlers.codecData?.({ duration });
    cmd.handlers.end?.();
  };

const failWith =
  (err: Error): Scenario =>
  (cmd) => {
    cmd.handlers.error?.(err);
  };

const makeFile = (): Express.Multer.File =>
  ({
    originalname: 'song.mp3',
    path: '/tmp/upload_test.mp3',
    size: 8,
  }) as Express.Multer.File;

describe('trimAudio', () => {
  const ffmpegMock = ffmpeg as unknown as jest.Mock;
  const readFileMock = readFile as jest.Mock;
  let commands: FakeCommand[];
  let scenarios: Scenario[];

  beforeEach(() => {
    jest.clearAllMocks();
    commands = [];
    scenarios = [];
    ffmpegMock.mockImplementation(() => {
      const scenario = scenarios[commands.length];
      if (!scenario) throw new Error('No scenario queued for this ffmpeg run');
      const cmd = new FakeCommand(scenario);
      commands.push(cmd);
      return cmd;
    });
    readFileMock.mockResolvedValue(Buffer.from('trimmed'));
  });

  it('keeps the offset cut when the audio is long enough', async () => {
    scenarios = [succeedWithDuration('00:03:20.00')]; // 200s

    const result = await trimAudio(makeFile(), 20, 30);

    expect(commands).toHaveLength(1);
    expect(commands[0].startTime).toBe(30);
    expect(ffmpegMock).toHaveBeenCalledWith('/tmp/upload_test.mp3');
    expect(result.buffer.toString()).toBe('trimmed');
  });

  it('re-trims from 0 when the audio is shorter than the offset', async () => {
    scenarios = [
      succeedWithDuration('00:00:25.00'),
      succeedWithDuration('00:00:25.00'),
    ];

    await trimAudio(makeFile(), 20, 30);

    expect(commands).toHaveLength(2);
    expect(commands[0].startTime).toBe(30);
    expect(commands[1].startTime).toBe(0);
  });

  it('re-trims from 0 when the remaining sample is too short to identify', async () => {
    // 31s long: cutting at 0:30 leaves a 1-second sample.
    scenarios = [
      succeedWithDuration('00:00:31.00'),
      succeedWithDuration('00:00:31.00'),
    ];

    await trimAudio(makeFile(), 20, 30);

    expect(commands).toHaveLength(2);
    expect(commands[1].startTime).toBe(0);
  });

  it('keeps the cut when the remaining sample is long enough', async () => {
    // 45s long: cutting at 0:30 leaves 15 usable seconds.
    scenarios = [succeedWithDuration('00:00:45.00')];

    await trimAudio(makeFile(), 20, 30);

    expect(commands).toHaveLength(1);
  });

  it('re-trims from 0 when duration is unknown and the output is empty', async () => {
    scenarios = [succeedWithDuration(null), succeedWithDuration(null)];
    readFileMock
      .mockResolvedValueOnce(Buffer.alloc(0))
      .mockResolvedValueOnce(Buffer.from('trimmed'));

    const result = await trimAudio(makeFile(), 20, 30);

    expect(commands).toHaveLength(2);
    expect(commands[1].startTime).toBe(0);
    expect(result.size).toBeGreaterThan(0);
  });

  it('does not re-trim when already cutting from 0', async () => {
    scenarios = [succeedWithDuration('00:00:05.00')];

    await trimAudio(makeFile(), 20, 0);

    expect(commands).toHaveLength(1);
  });

  it('propagates conversion errors without falling back to ffmpeg-static', async () => {
    scenarios = [
      failWith(new Error('Invalid data found when processing input')),
    ];

    await expect(trimAudio(makeFile(), 20, 30)).rejects.toThrow('Invalid data');
    expect(commands).toHaveLength(1);
    expect(commands[0].ffmpegPath).toBeNull();
  });

  it('falls back to ffmpeg-static when the ffmpeg binary is missing', async () => {
    const enoent = Object.assign(new Error('spawn ffmpeg ENOENT'), {
      code: 'ENOENT',
    });
    scenarios = [failWith(enoent), succeedWithDuration('00:03:20.00')];

    const result = await trimAudio(makeFile(), 20, 30);

    expect(commands).toHaveLength(2);
    expect(commands[1].ffmpegPath).toBe('/fake/static/ffmpeg');
    expect(result.buffer.toString()).toBe('trimmed');
  });
});

describe('loadAudio', () => {
  const readFileMock = readFile as jest.Mock;

  it('reads the disk-storage upload into a buffer', async () => {
    readFileMock.mockResolvedValue(Buffer.from('audio-bytes'));

    const result = await loadAudio(makeFile());

    expect(readFileMock).toHaveBeenCalledWith('/tmp/upload_test.mp3');
    expect(result.buffer.toString()).toBe('audio-bytes');
    expect(result.size).toBe(11);
  });
});
