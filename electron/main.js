import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describeFiles,
  detectFfmpegTools,
  getImageDialogFilters,
  getVideoDialogFilters,
  probeVideo,
  stopActiveTranscode,
  transcodeJob,
  validateToolPair,
} from './ffmpeg-service.js';
import { resolvePeerBinary } from './ffmpeg-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 920,
    minHeight: 700,
    backgroundColor: '#f4f4f1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerIpcHandlers() {
  ipcMain.handle('squish:detect-ffmpeg', async () => detectFfmpegTools());

  ipcMain.handle('squish:choose-ffmpeg', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose ffmpeg',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'FFmpeg', extensions: ['exe'] }]
        : [{ name: 'All files', extensions: ['*'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const ffmpegPath = result.filePaths[0];
    const ffprobePath = resolvePeerBinary(ffmpegPath, 'ffprobe');

    try {
      return await validateToolPair(ffmpegPath, ffprobePath);
    } catch (error) {
      if (ffprobePath !== 'ffprobe') {
        return validateToolPair(ffmpegPath, 'ffprobe');
      }

      throw error;
    }
  });

  ipcMain.handle('squish:choose-output-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose output folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const directoryPath = result.filePaths[0];

    return {
      path: directoryPath,
      name: path.basename(directoryPath),
    };
  });

  ipcMain.handle('squish:choose-videos', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose videos',
      properties: ['openFile', 'multiSelections'],
      filters: getVideoDialogFilters(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    return describeFiles(result.filePaths);
  });

  ipcMain.handle('squish:choose-images', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose images',
      properties: ['openFile', 'multiSelections'],
      filters: getImageDialogFilters(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    return describeFiles(result.filePaths);
  });

  ipcMain.handle('squish:describe-files', async (_event, filePaths) => describeFiles(filePaths));

  ipcMain.handle('squish:probe-video', async (_event, payload) => probeVideo(payload));

  ipcMain.handle('squish:transcode-job', async (_event, payload) => {
    return transcodeJob(payload, (message) => {
      mainWindow?.webContents.send('squish:job-event', message);
    });
  });

  ipcMain.handle('squish:stop-job', async () => {
    stopActiveTranscode();
    return true;
  });

  ipcMain.handle('squish:open-path', async (_event, targetPath) => {
    return shell.openPath(targetPath);
  });
}
