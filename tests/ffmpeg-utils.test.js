import { describe, expect, it } from 'vitest';
import {
  getDefaultFfmpegPath,
  parseEncoderNames,
  parseFrameRate,
  parseProgressLine,
  parseTimecodeToSeconds,
  resolvePeerBinary,
} from '../electron/ffmpeg-utils.js';

describe('resolvePeerBinary', () => {
  it('returns the default Windows FFmpeg path', () => {
    expect(getDefaultFfmpegPath('win32')).toBe('C:\\FFMPEG\\bin\\ffmpeg.exe');
  });

  it('maps a Windows ffmpeg executable to ffprobe in the same folder', () => {
    expect(resolvePeerBinary('C:\\tools\\ffmpeg\\bin\\ffmpeg.exe', 'ffprobe', 'win32')).toBe(
      'C:\\tools\\ffmpeg\\bin\\ffprobe.exe',
    );
  });

  it('maps a PATH command to a peer command name', () => {
    expect(resolvePeerBinary('ffmpeg', 'ffprobe', 'win32')).toBe('ffprobe');
  });
});

describe('parseTimecodeToSeconds', () => {
  it('converts ffmpeg timestamps into seconds', () => {
    expect(parseTimecodeToSeconds('00:01:12.500')).toBeCloseTo(72.5);
  });
});

describe('parseFrameRate', () => {
  it('parses rational frame rates', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
  });

  it('returns null for invalid frame rates', () => {
    expect(parseFrameRate('0/0')).toBeNull();
  });
});

describe('parseProgressLine', () => {
  it('reads out_time_us progress events', () => {
    expect(parseProgressLine('out_time_us=3500000')).toEqual({ seconds: 3.5 });
  });

  it('recognizes finished progress events', () => {
    expect(parseProgressLine('progress=end')).toEqual({ done: true });
  });
});

describe('parseEncoderNames', () => {
  it('extracts encoder names from ffmpeg -encoders output', () => {
    const output = `
 V....D libopenh264          OpenH264 H.264 / AVC
 A..... aac                  AAC (Advanced Audio Coding)
 V....D libvpx               libvpx VP8
`;

    const encoders = parseEncoderNames(output);

    expect(encoders.has('libopenh264')).toBe(true);
    expect(encoders.has('aac')).toBe(true);
    expect(encoders.has('libvpx')).toBe(true);
  });
});
