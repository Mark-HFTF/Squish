const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('squishDesktop', {
  detectFfmpeg() {
    return ipcRenderer.invoke('squish:detect-ffmpeg');
  },
  chooseFfmpeg() {
    return ipcRenderer.invoke('squish:choose-ffmpeg');
  },
  installFfmpeg() {
    return ipcRenderer.invoke('squish:install-ffmpeg');
  },
  chooseOutputDirectory() {
    return ipcRenderer.invoke('squish:choose-output-directory');
  },
  chooseVideos() {
    return ipcRenderer.invoke('squish:choose-videos');
  },
  chooseImages() {
    return ipcRenderer.invoke('squish:choose-images');
  },
  describeFiles(filePaths) {
    return ipcRenderer.invoke('squish:describe-files', filePaths);
  },
  probeVideo(payload) {
    return ipcRenderer.invoke('squish:probe-video', payload);
  },
  transcodeJob(payload) {
    return ipcRenderer.invoke('squish:transcode-job', payload);
  },
  stopJob() {
    return ipcRenderer.invoke('squish:stop-job');
  },
  openPath(targetPath) {
    return ipcRenderer.invoke('squish:open-path', targetPath);
  },
  getPathForFile(file) {
    if (!file) {
      return '';
    }

    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      return webUtils.getPathForFile(file);
    }

    return file.path || '';
  },
  onJobEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('squish:job-event', listener);

    return () => {
      ipcRenderer.removeListener('squish:job-event', listener);
    };
  },
  onFfmpegInstallEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('squish:ffmpeg-install-event', listener);

    return () => {
      ipcRenderer.removeListener('squish:ffmpeg-install-event', listener);
    };
  },
});
