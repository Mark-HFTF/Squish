import path from 'node:path';

export function getDefaultFfmpegPath(platform = process.platform) {
  if (platform === 'win32') {
    return 'C:\\FFMPEG\\bin\\ffmpeg.exe';
  }

  return '';
}

export function resolvePeerBinary(ffmpegPath, peerBaseName, platform = process.platform) {
  if (!ffmpegPath) {
    return '';
  }

  const extension = platform === 'win32' ? '.exe' : '';
  const peerFileName = `${peerBaseName}${extension}`;

  if (!ffmpegPath.includes(path.sep) && !ffmpegPath.includes('/')) {
    return peerBaseName;
  }

  const directory = path.dirname(ffmpegPath);
  return path.join(directory, peerFileName);
}

export function parseProgressLine(line) {
  if (!line) {
    return null;
  }

  const trimmed = line.trim();

  if (trimmed.startsWith('out_time_us=')) {
    const value = Number(trimmed.slice('out_time_us='.length));
    return Number.isFinite(value) && value >= 0
      ? { seconds: value / 1_000_000 }
      : null;
  }

  if (trimmed.startsWith('out_time_ms=')) {
    const value = Number(trimmed.slice('out_time_ms='.length));
    return Number.isFinite(value) && value >= 0
      ? { seconds: value / 1_000_000 }
      : null;
  }

  if (trimmed.startsWith('out_time=')) {
    const value = parseTimecodeToSeconds(trimmed.slice('out_time='.length));
    return value === null ? null : { seconds: value };
  }

  if (trimmed === 'progress=end') {
    return { done: true };
  }

  return null;
}

export function parseEncoderNames(output) {
  const encoders = new Set();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*[A-Z\.]{6}\s+([^\s]+)/);

    if (match) {
      encoders.add(match[1]);
    }
  }

  return encoders;
}

export function parseTimecodeToSeconds(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return (hours * 3600) + (minutes * 60) + seconds;
}

export function parseFrameRate(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const [numeratorRaw, denominatorRaw] = value.split('/');
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : null;
}

export function pixelFormatHasAlpha(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith('yuva')
    || normalized.startsWith('gbrap')
    || normalized.startsWith('rgba')
    || normalized.startsWith('bgra')
    || normalized.startsWith('argb')
    || normalized.startsWith('abgr')
    || normalized.startsWith('ya')
  );
}
