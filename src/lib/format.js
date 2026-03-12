const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'mkv',
  'avi',
  'webm',
  'wmv',
  'mpeg',
  'mpg',
  '3gp',
  'ogg',
  'ogv',
]);

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'avif',
  'heic',
  'heif',
]);

export function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

export function getFileExtension(filename) {
  const segments = filename.toLowerCase().split('.');
  return segments.length > 1 ? segments.at(-1) : '';
}

export function getDirectoryPath(filePath) {
  if (!filePath) {
    return '';
  }

  const normalized = filePath.replaceAll('/', '\\');
  const segments = normalized.split('\\');
  segments.pop();
  return segments.join('\\');
}

export function sanitizeBaseName(name) {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return normalized || 'video';
}

export function createUniqueBaseName(name, usedNames) {
  const base = sanitizeBaseName(name);

  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let attempt = 2;

  while (usedNames.has(`${base}-${attempt}`)) {
    attempt += 1;
  }

  const uniqueName = `${base}-${attempt}`;
  usedNames.add(uniqueName);
  return uniqueName;
}

export function isLikelyVideoFile(file) {
  if (file.type?.startsWith('video/')) {
    return true;
  }

  return VIDEO_EXTENSIONS.has(getFileExtension(file.name));
}

export function isLikelyVideoPath(filePath) {
  return VIDEO_EXTENSIONS.has(getFileExtension(filePath));
}

export function isLikelyImageFile(file) {
  if (file.type?.startsWith('image/')) {
    return true;
  }

  return IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

export function isLikelyImagePath(filePath) {
  return IMAGE_EXTENSIONS.has(getFileExtension(filePath));
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatPercent(ratio) {
  return `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`;
}

export function getArchiveName(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');

  return `squish-${stamp}-${time}.zip`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown error';
}
