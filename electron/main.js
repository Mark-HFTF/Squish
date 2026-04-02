import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearSavedFfmpegConfig,
  getSavedFfmpegConfig,
  saveFfmpegConfig,
} from './app-config.js';
import { installWindowsFfmpeg } from './ffmpeg-installer.js';
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
let ffmpegInstallInFlight = null;

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

function showAboutDialog() {
  const version = app.getVersion();

  return dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Squish',
    message: 'Squish',
    detail: `made by Hi from the Future\nVersion ${version}`,
    buttons: ['OK'],
  });
}

function createAppMenu() {
  const versionLabel = `Version ${app.getVersion()}`;
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
        label: app.name,
        submenu: [
          { role: 'about', label: 'About Squish' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }]
      : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
            { type: 'separator' },
            {
              label: 'Speech',
              submenu: [
                { role: 'startSpeaking' },
                { role: 'stopSpeaking' },
              ],
            },
          ]
          : [
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' },
          ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' },
          ]
          : [
            { role: 'close' },
          ]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: versionLabel,
          enabled: false,
        },
        {
          label: 'About Squish',
          click: () => {
            void showAboutDialog();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createAppMenu();
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
  ipcMain.handle('squish:detect-ffmpeg', async () => {
    const savedFfmpeg = await getSavedFfmpegConfig();
    const detected = await detectFfmpegTools(savedFfmpeg);

    if (detected.staleSavedPath) {
      await clearSavedFfmpegConfig();
    }

    return {
      ...detected,
      installSupported: process.platform === 'win32',
    };
  });

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
      const validated = await validateToolPair(ffmpegPath, ffprobePath);
      await saveFfmpegConfig(validated);
      return {
        ...validated,
        source: 'manual',
      };
    } catch (error) {
      if (ffprobePath !== 'ffprobe') {
        const validated = await validateToolPair(ffmpegPath, 'ffprobe');
        await saveFfmpegConfig(validated);
        return {
          ...validated,
          source: 'manual',
        };
      }

      throw error;
    }
  });

  ipcMain.handle('squish:install-ffmpeg', async () => {
    if (process.platform !== 'win32') {
      throw new Error('Automatic FFmpeg installation is only available on Windows.');
    }

    if (ffmpegInstallInFlight) {
      throw new Error('FFmpeg installation is already running.');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose where to install FFmpeg',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const installDirectory = result.filePaths[0];
    ffmpegInstallInFlight = installWindowsFfmpeg({
      installDirectory,
      emitProgress: (payload) => {
        mainWindow?.webContents.send('squish:ffmpeg-install-event', payload);
      },
    });

    try {
      const installed = await ffmpegInstallInFlight;
      await saveFfmpegConfig(installed);
      return {
        ...installed,
        source: 'installed',
      };
    } finally {
      ffmpegInstallInFlight = null;
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
