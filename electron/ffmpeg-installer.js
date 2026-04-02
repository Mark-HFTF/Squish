import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { resolvePeerBinary } from './ffmpeg-utils.js';
import { spawnForOutput } from './process-utils.js';
import { validateToolPair } from './ffmpeg-service.js';

const MAX_REDIRECTS = 5;

export const FFMPEG_WINDOWS_BUILD_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.zip';

export async function installWindowsFfmpeg({ installDirectory, emitProgress = () => {} }) {
  if (process.platform !== 'win32') {
    throw new Error('Automatic FFmpeg installation is only available on Windows.');
  }

  if (!installDirectory) {
    throw new Error('Choose a folder to install FFmpeg.');
  }

  await fs.mkdir(installDirectory, { recursive: true });

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'squish-ffmpeg-'));
  const zipPath = path.join(tempRoot, 'ffmpeg-release-full.zip');
  const existingEntries = await listRootEntries(installDirectory);

  try {
    emitProgress({
      stage: 'downloading',
      message: 'Downloading FFmpeg...',
      bytesReceived: 0,
      totalBytes: 0,
      progressRatio: 0,
    });

    await downloadFile(FFMPEG_WINDOWS_BUILD_URL, zipPath, (progress) => {
      emitProgress({
        stage: 'downloading',
        message: 'Downloading FFmpeg...',
        ...progress,
      });
    });

    emitProgress({
      stage: 'extracting',
      message: `Extracting FFmpeg into ${installDirectory}...`,
      bytesReceived: 0,
      totalBytes: 0,
      progressRatio: null,
    });

    await extractZipOnWindows(zipPath, installDirectory);

    emitProgress({
      stage: 'verifying',
      message: 'Verifying the FFmpeg install...',
      bytesReceived: 0,
      totalBytes: 0,
      progressRatio: null,
    });

    const searchRoots = await resolveSearchRoots(installDirectory, existingEntries);
    const installed = await locateInstalledToolPair(searchRoots);
    const validated = await validateToolPair(installed.ffmpegPath, installed.ffprobePath);
    const version = await readFfmpegVersion(validated.ffmpegPath);

    emitProgress({
      stage: 'complete',
      message: `Installed ${version}`,
      bytesReceived: 0,
      totalBytes: 0,
      progressRatio: 1,
    });

    return {
      ...validated,
      installDirectory,
      version,
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function downloadFile(url, destinationPath, onProgress, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('FFmpeg download redirected too many times.');
  }

  await fs.rm(destinationPath, { force: true });

  await new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0;

      if (
        statusCode >= 300
        && statusCode < 400
        && response.headers.location
      ) {
        response.resume();
        resolve(downloadFile(new URL(response.headers.location, url), destinationPath, onProgress, redirectCount + 1));
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`FFmpeg download failed with status ${statusCode}.`));
        return;
      }

      const totalBytes = Number(response.headers['content-length'] ?? 0);
      let bytesReceived = 0;
      const fileStream = createWriteStream(destinationPath);

      const cleanup = async (error) => {
        response.destroy();
        fileStream.destroy();
        await fs.rm(destinationPath, { force: true });
        reject(error);
      };

      response.on('data', (chunk) => {
        bytesReceived += chunk.length;
        onProgress({
          bytesReceived,
          totalBytes,
          progressRatio: totalBytes > 0 ? Math.min(bytesReceived / totalBytes, 1) : null,
        });
      });

      response.on('error', (error) => {
        void cleanup(error);
      });

      fileStream.on('error', (error) => {
        void cleanup(error);
      });

      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });

      response.pipe(fileStream);
    });

    request.on('error', async (error) => {
      await fs.rm(destinationPath, { force: true });
      reject(error);
    });
  });
}

async function extractZipOnWindows(zipPath, destinationPath) {
  const command = [
    'Expand-Archive',
    '-LiteralPath',
    quotePowerShellLiteral(zipPath),
    '-DestinationPath',
    quotePowerShellLiteral(destinationPath),
    '-Force',
  ].join(' ');

  await spawnForOutput('powershell.exe', ['-NoProfile', '-Command', command]);
}

async function locateInstalledToolPair(searchRoots) {
  const rankedCandidates = [];

  for (const rootPath of searchRoots) {
    const candidates = await collectFfmpegCandidates(rootPath);

    for (const ffmpegPath of candidates) {
      try {
        const stats = await fs.stat(ffmpegPath);
        rankedCandidates.push({
          ffmpegPath,
          ffprobePath: resolvePeerBinary(ffmpegPath, 'ffprobe'),
          mtimeMs: stats.mtimeMs,
        });
      } catch {
        // Ignore candidates that disappear while scanning.
      }
    }
  }

  rankedCandidates.sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const candidate of rankedCandidates) {
    try {
      await spawnForOutput(candidate.ffmpegPath, ['-version']);
      await spawnForOutput(candidate.ffprobePath, ['-version']);
      return candidate;
    } catch {
      // Keep scanning until a valid pair is found.
    }
  }

  throw new Error('FFmpeg was extracted, but Squish could not find a working ffmpeg.exe and ffprobe.exe in the install folder.');
}

async function resolveSearchRoots(installDirectory, existingEntries) {
  const currentEntries = await listRootEntries(installDirectory);
  const newRoots = [...currentEntries]
    .filter((entry) => !existingEntries.has(entry))
    .map((entry) => path.join(installDirectory, entry));

  if (newRoots.length > 0) {
    return newRoots;
  }

  const ffmpegNamedRoots = [...currentEntries]
    .filter((entry) => entry.toLowerCase().startsWith('ffmpeg'))
    .map((entry) => path.join(installDirectory, entry));

  if (ffmpegNamedRoots.length > 0) {
    return ffmpegNamedRoots;
  }

  return [installDirectory];
}

async function listRootEntries(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return new Set(entries.map((entry) => entry.name));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return new Set();
    }

    throw error;
  }
}

async function collectFfmpegCandidates(rootPath) {
  const candidates = [];

  await walk(rootPath, async (entryPath, entry) => {
    if (!entry.isFile()) {
      return;
    }

    if (entry.name.toLowerCase() !== 'ffmpeg.exe') {
      return;
    }

    if (path.basename(path.dirname(entryPath)).toLowerCase() !== 'bin') {
      return;
    }

    candidates.push(entryPath);
  });

  return candidates;
}

async function walk(directoryPath, visit) {
  let entries = [];

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await walk(entryPath, visit);
      continue;
    }

    await visit(entryPath, entry);
  }
}

async function readFfmpegVersion(ffmpegPath) {
  const { stdout, stderr } = await spawnForOutput(ffmpegPath, ['-version']);
  const firstLine = `${stdout}\n${stderr}`.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.trim() ?? 'FFmpeg';
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
