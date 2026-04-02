import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

const CONFIG_FILE_NAME = 'squish-config.json';

const DEFAULT_CONFIG = Object.freeze({
  ffmpeg: {
    ffmpegPath: '',
    ffprobePath: '',
    installDirectory: '',
  },
});

function getConfigFilePath() {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

function normalizeConfig(payload) {
  return {
    ffmpeg: {
      ffmpegPath: payload?.ffmpeg?.ffmpegPath ?? '',
      ffprobePath: payload?.ffmpeg?.ffprobePath ?? '',
      installDirectory: payload?.ffmpeg?.installDirectory ?? '',
    },
  };
}

export async function readAppConfig() {
  try {
    const filePath = getConfigFilePath();
    const content = await fs.readFile(filePath, 'utf8');
    return normalizeConfig(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeConfig(DEFAULT_CONFIG);
    }

    throw error;
  }
}

export async function writeAppConfig(config) {
  const filePath = getConfigFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalizeConfig(config), null, 2), 'utf8');
}

export async function getSavedFfmpegConfig() {
  const config = await readAppConfig();
  return config.ffmpeg;
}

export async function saveFfmpegConfig(ffmpegConfig) {
  const config = await readAppConfig();
  config.ffmpeg = {
    ffmpegPath: ffmpegConfig?.ffmpegPath ?? '',
    ffprobePath: ffmpegConfig?.ffprobePath ?? '',
    installDirectory: ffmpegConfig?.installDirectory ?? '',
  };
  await writeAppConfig(config);
  return config.ffmpeg;
}

export async function clearSavedFfmpegConfig() {
  const config = await readAppConfig();
  config.ffmpeg = {
    ...DEFAULT_CONFIG.ffmpeg,
  };
  await writeAppConfig(config);
  return config.ffmpeg;
}
