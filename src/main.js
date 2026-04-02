import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/700.css';
import './style.css';
import { PRESETS } from './config.js';
import {
  buildImageVariantPlan,
  buildPosterVariant,
  buildVideoJobPlan,
  getVariantLabel,
} from './lib/commands.js';
import {
  createUniqueBaseName,
  escapeHtml,
  formatBytes,
  formatPercent,
  getDirectoryPath,
  getErrorMessage,
  isLikelyImagePath,
  isLikelyVideoPath,
  sanitizeBaseName,
  stripExtension,
} from './lib/format.js';
import { calculateJobProgress } from './lib/progress.js';

const app = document.querySelector('#app');
const desktop = window.squishDesktop;

if (!desktop) {
  app.innerHTML = `
    <main class="app-shell">
      <section class="app-header">
        <div class="brand-block">
          <h1>Squish</h1>
          <p>made by Hi from the Future</p>
        </div>
        <p class="header-copy">
          This build is meant to run inside the Squish desktop app. Start it with Electron instead of opening it in a browser tab.
        </p>
      </section>
    </main>
  `;

  throw new Error('Squish desktop bridge was not found.');
}

app.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div class="brand-block">
        <h1>Squish</h1>
        <p>made by Hi from the Future</p>
      </div>
      <p class="header-copy">
        Native desktop compression for videos and images with your local FFmpeg install.
        Unfinished files are cleaned up on stop.
      </p>
    </header>

    <section class="toolbar">
      <div class="toolbar-actions">
        <button class="button button-accent" type="button" data-pick-ffmpeg>Locate FFmpeg</button>
        <button class="button hidden" type="button" data-install-ffmpeg>Install FFmpeg</button>
        <button class="button" type="button" data-pick-folder>Choose output folder</button>
        <button class="button" type="button" data-pick-files disabled>Choose videos</button>
        <button class="button" type="button" data-stop disabled>Stop</button>
        <button class="button" type="button" data-reset disabled>Reset</button>
      </div>
      <div class="toolbar-grid">
        <div class="toolbar-status">
          <span class="status-label">FFmpeg</span>
          <strong data-ffmpeg-name>Looking for FFmpeg...</strong>
        </div>
        <div class="toolbar-status">
          <span class="status-label">Output</span>
          <strong data-folder-name>Not selected</strong>
        </div>
      </div>
      <div class="install-status hidden" data-install-status>
        <div class="install-status-copy">
          <strong data-install-status-label>Downloading FFmpeg...</strong>
          <span data-install-status-meta>0%</span>
        </div>
        <div class="install-progress-bar">
          <div class="install-progress-fill" data-install-progress-fill></div>
        </div>
      </div>
      <label class="toggle-row" for="save-beside-source">
        <span>Save beside source</span>
        <input id="save-beside-source" type="checkbox" data-save-beside-source />
      </label>
      <div class="toggle-cluster">
        <label class="toggle-row" for="has-alpha">
          <span>Has alpha</span>
          <input id="has-alpha" type="checkbox" data-has-alpha />
        </label>
        <label class="toggle-row" for="poster-image">
          <span>Poster image</span>
          <input id="poster-image" type="checkbox" data-poster-image />
        </label>
      </div>
      <div class="output-options">
        <div class="output-option-group">
          <span class="output-option-label">Formats</span>
          <label class="check-pill" for="format-mp4">
            <input id="format-mp4" type="checkbox" data-output-format="mp4" checked />
            <span>MP4</span>
          </label>
          <label class="check-pill" for="format-webm">
            <input id="format-webm" type="checkbox" data-output-format="webm" checked />
            <span>WebM</span>
          </label>
        </div>
        <div class="output-option-group">
          <span class="output-option-label">Tiers</span>
          <label class="check-pill" for="tier-source">
            <input id="tier-source" type="checkbox" data-output-tier="source" checked />
            <span>Source</span>
          </label>
          <label class="check-pill" for="tier-720p">
            <input id="tier-720p" type="checkbox" data-output-tier="720p" checked />
            <span>720p</span>
          </label>
          <label class="check-pill" for="tier-480p">
            <input id="tier-480p" type="checkbox" data-output-tier="480p" checked />
            <span>480p</span>
          </label>
          <label class="check-pill" for="tier-240p">
            <input id="tier-240p" type="checkbox" data-output-tier="240p" checked />
            <span>240p</span>
          </label>
        </div>
      </div>
      <p class="output-option-note hidden" data-alpha-note>
        WebM alpha uses the WebM alpha codec path. Safari alpha usually requires a macOS FFmpeg build with hevc_videotoolbox.
      </p>
    </section>

    <section class="dropzone-row">
      <button class="dropzone" type="button" data-dropzone="video">
        <span class="dropzone-kicker">Drop videos here</span>
      </button>
      <button class="dropzone" type="button" data-dropzone="image">
        <span class="dropzone-kicker">Drop images here</span>
      </button>
      <button class="dropzone" type="button" data-dropzone="poster">
        <span class="dropzone-kicker">Drop videos for posters</span>
      </button>
    </section>

    <section class="queue">
      <div class="queue-header">
        <h2>Queue</h2>
      </div>
      <article class="batch-note">
        <strong data-batch-headline>Ready.</strong>
        <p data-batch-note>
          Point Squish at FFmpeg once, choose an output folder, then drop files.
        </p>
      </article>
      <div class="job-list" data-job-list></div>
    </section>
  </main>
`;

const elements = {
  videoDropzone: app.querySelector('[data-dropzone="video"]'),
  imageDropzone: app.querySelector('[data-dropzone="image"]'),
  posterDropzone: app.querySelector('[data-dropzone="poster"]'),
  ffmpegButton: app.querySelector('[data-pick-ffmpeg]'),
  installFfmpegButton: app.querySelector('[data-install-ffmpeg]'),
  folderButton: app.querySelector('[data-pick-folder]'),
  pickButton: app.querySelector('[data-pick-files]'),
  stopButton: app.querySelector('[data-stop]'),
  resetButton: app.querySelector('[data-reset]'),
  saveBesideSourceToggle: app.querySelector('[data-save-beside-source]'),
  hasAlphaToggle: app.querySelector('[data-has-alpha]'),
  posterImageToggle: app.querySelector('[data-poster-image]'),
  formatToggles: [...app.querySelectorAll('[data-output-format]')],
  tierToggles: [...app.querySelectorAll('[data-output-tier]')],
  alphaNote: app.querySelector('[data-alpha-note]'),
  ffmpegName: app.querySelector('[data-ffmpeg-name]'),
  folderName: app.querySelector('[data-folder-name]'),
  installStatus: app.querySelector('[data-install-status]'),
  installStatusLabel: app.querySelector('[data-install-status-label]'),
  installStatusMeta: app.querySelector('[data-install-status-meta]'),
  installProgressFill: app.querySelector('[data-install-progress-fill]'),
  batchHeadline: app.querySelector('[data-batch-headline]'),
  batchNote: app.querySelector('[data-batch-note]'),
  jobList: app.querySelector('[data-job-list]'),
};

const state = {
  jobs: [],
  isProcessing: false,
  stopRequested: false,
  renderQueued: false,
  nextJobId: 1,
  notice: '',
  saveBesideSource: false,
  alphaRequested: false,
  posterRequested: false,
  videoSelection: createDefaultVideoSelection(),
  ffmpeg: {
    ffmpegPath: '',
    ffprobePath: '',
    source: '',
    codecSupport: null,
  },
  ffmpegInstall: createIdleInstallState(),
  outputDirectory: {
    path: '',
    name: '',
  },
};

const unsubscribeFromJobEvents = desktop.onJobEvent((payload) => {
  handleJobEvent(payload);
});
const unsubscribeFromFfmpegInstallEvents = desktop.onFfmpegInstallEvent((payload) => {
  handleFfmpegInstallEvent(payload);
});

elements.ffmpegButton.addEventListener('click', () => {
  void handlePickFfmpeg();
});

elements.installFfmpegButton.addEventListener('click', () => {
  void handleInstallFfmpeg();
});

elements.folderButton.addEventListener('click', () => {
  void handlePickDirectory();
});

elements.pickButton.addEventListener('click', () => {
  void handlePickVideos();
});

elements.stopButton.addEventListener('click', () => {
  void handleStop();
});

elements.resetButton.addEventListener('click', () => {
  if (!state.isProcessing) {
    resetApp();
  }
});

elements.saveBesideSourceToggle.addEventListener('change', (event) => {
  state.saveBesideSource = event.currentTarget.checked;
  state.notice = '';
  scheduleRender();
});

elements.hasAlphaToggle.addEventListener('change', (event) => {
  state.alphaRequested = event.currentTarget.checked;
  state.notice = '';
  scheduleRender();
});

elements.posterImageToggle.addEventListener('change', (event) => {
  state.posterRequested = event.currentTarget.checked;
  state.notice = '';
  scheduleRender();
});

for (const toggle of elements.formatToggles) {
  toggle.addEventListener('change', (event) => {
    const formatId = event.currentTarget.dataset.outputFormat;
    state.videoSelection.formats[formatId] = event.currentTarget.checked;
    state.notice = '';
    scheduleRender();
  });
}

for (const toggle of elements.tierToggles) {
  toggle.addEventListener('change', (event) => {
    const tierId = event.currentTarget.dataset.outputTier;
    state.videoSelection.tiers[tierId] = event.currentTarget.checked;
    state.notice = '';
    scheduleRender();
  });
}

bindDropTarget(elements.videoDropzone, 'video');
bindDropTarget(elements.imageDropzone, 'image');
bindDropTarget(elements.posterDropzone, 'poster');

app.addEventListener('click', (event) => {
  const folderButton = event.target.closest('[data-open-folder]');

  if (folderButton) {
    void handleOpenFolder(folderButton.dataset.openFolder);
  }
});

window.addEventListener('beforeunload', () => {
  unsubscribeFromJobEvents?.();
  unsubscribeFromFfmpegInstallEvents?.();
});

void initializeApp();

function bindDropTarget(element, kind) {
  element.addEventListener('click', () => {
    if (kind === 'video') {
      void handlePickVideos();
    } else if (kind === 'image') {
      void handlePickImages();
    } else {
      void handlePickPosterVideos();
    }
  });

  for (const eventName of ['dragenter', 'dragover']) {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();

      if (canAcceptKind(kind)) {
        element.classList.add('is-active');
      }
    });
  }

  for (const eventName of ['dragleave', 'drop']) {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();
      element.classList.remove('is-active');
    });
  }

  element.addEventListener('drop', (event) => {
    void handleDroppedFiles(event.dataTransfer?.files, kind);
  });
}

async function initializeApp() {
  try {
    const detected = await desktop.detectFfmpeg();
    state.ffmpegInstall.supported = Boolean(detected?.installSupported);

    if (detected?.available) {
      applyFfmpegSelection(detected);
    } else {
      state.notice = detected?.staleSavedPath
        ? 'Saved FFmpeg path was unavailable. Install FFmpeg or click Locate FFmpeg.'
        : 'FFmpeg was not found on PATH. Install FFmpeg or click Locate FFmpeg.';
    }
  } catch (error) {
    state.notice = getErrorMessage(error);
  }

  scheduleRender();
}

async function handlePickFfmpeg() {
  try {
    const selected = await desktop.chooseFfmpeg();

    if (!selected) {
      return;
    }

    applyFfmpegSelection(selected);
  } catch (error) {
    state.notice = getErrorMessage(error);
  }

  scheduleRender();
}

async function handleInstallFfmpeg() {
  if (state.ffmpegInstall.isInstalling) {
    return;
  }

  state.ffmpegInstall = {
    ...state.ffmpegInstall,
    isInstalling: true,
    stage: 'choosing-folder',
    label: 'Choose where to install FFmpeg.',
    meta: '',
    progressRatio: 0,
    bytesReceived: 0,
    totalBytes: 0,
  };
  state.notice = '';
  scheduleRender();

  try {
    const installed = await desktop.installFfmpeg();

    if (!installed) {
      state.ffmpegInstall = {
        ...createIdleInstallState(),
        supported: state.ffmpegInstall.supported,
      };
      scheduleRender();
      return;
    }

    applyFfmpegSelection(installed);
    state.ffmpegInstall = {
      ...createIdleInstallState(),
      supported: state.ffmpegInstall.supported,
    };
    state.notice = installed.version
      ? `${installed.version} installed and verified.`
      : 'FFmpeg installed and verified.';
  } catch (error) {
    state.ffmpegInstall = {
      ...createIdleInstallState(),
      supported: state.ffmpegInstall.supported,
    };
    state.notice = getErrorMessage(error);
  }

  scheduleRender();
}

async function handlePickDirectory() {
  try {
    const directory = await desktop.chooseOutputDirectory();

    if (!directory) {
      return;
    }

    state.outputDirectory = directory;
    state.notice = '';
  } catch (error) {
    state.notice = getErrorMessage(error);
  }

  scheduleRender();
}

async function handlePickVideos() {
  if (!canAcceptVideoJobs()) {
    state.notice = getSetupMessage('video');
    scheduleRender();
    return;
  }

  const files = await desktop.chooseVideos();
  await handleFileDescriptors(files, 'video');
}

async function handlePickImages() {
  if (!canAcceptImageJobs()) {
    state.notice = getSetupMessage('image');
    scheduleRender();
    return;
  }

  const files = await desktop.chooseImages();
  await handleFileDescriptors(files, 'image');
}

async function handlePickPosterVideos() {
  if (!canAcceptPosterJobs()) {
    state.notice = getSetupMessage('poster');
    scheduleRender();
    return;
  }

  const files = await desktop.chooseVideos();
  await handleFileDescriptors(files, 'poster');
}

async function handleDroppedFiles(fileList, kind) {
  const files = Array.from(fileList ?? []);

  if (!files.length) {
    return;
  }

  if (!canAcceptKind(kind)) {
    state.notice = getSetupMessage(kind);
    scheduleRender();
    return;
  }

  const paths = files
    .map((file) => desktop.getPathForFile(file))
    .filter(Boolean);

  if (!paths.length) {
    state.notice = `Dropped ${kind} files did not expose local paths. Click the ${kind} drop button instead.`;
    scheduleRender();
    return;
  }

  try {
    const described = await desktop.describeFiles(paths);
    await handleFileDescriptors(described, kind);
  } catch (error) {
    state.notice = getErrorMessage(error);
    scheduleRender();
  }
}

async function handleFileDescriptors(files, kind) {
  if (!Array.isArray(files) || files.length === 0) {
    return;
  }

  if (!canAcceptKind(kind)) {
    state.notice = getSetupMessage(kind);
    scheduleRender();
    return;
  }

  const usedNames = new Set(state.jobs.map((job) => job.baseName));
  const additions = files.map((file) => createJob(file, kind, usedNames));

  state.jobs.push(...additions);
  state.notice = '';
  scheduleRender();
  await processQueue();
}

function createJob(file, kind, usedNames) {
  const fallbackName = kind === 'image'
    ? `image-${state.nextJobId}`
    : `video-${state.nextJobId}`;
  const baseName = createUniqueBaseName(
    sanitizeBaseName(stripExtension(file.name) || fallbackName),
    usedNames,
  );
  const acceptsPath = kind === 'image' ? isLikelyImagePath : isLikelyVideoPath;
  const selectedVideoPlan = kind === 'video' ? getSelectedVideoPlan() : null;
  const selectedImagePlan = kind === 'image' ? getSelectedImagePlan() : null;
  const job = {
    id: state.nextJobId,
    kind,
    inputPath: file.path,
    originalName: file.name,
    baseName,
    inputSize: file.size,
    status: 'queued',
    currentVariant: '',
    completedVariants: 0,
    outputTargetCount: kind === 'image'
      ? countImageOutputs(selectedImagePlan)
      : kind === 'poster'
        ? 1
        : countVideoOutputs(selectedVideoPlan) + (state.posterRequested ? 1 : 0),
    progress: 0,
    outputs: [],
    warnings: [],
    errors: [],
    metadata: null,
    videoSelection: selectedVideoPlan,
    imageSelection: selectedImagePlan,
    alphaRequested: kind === 'video' ? state.alphaRequested : false,
    posterRequested: kind === 'video' ? state.posterRequested : false,
  };

  state.nextJobId += 1;

  if (!acceptsPath(file.path)) {
    job.status = 'error';
    job.errors.push(kind === 'image'
      ? 'Unsupported file type. Add a local image file.'
      : 'Unsupported file type. Add a local video file.');
  }

  return job;
}

function canAcceptVideoJobs() {
  return Boolean(
    state.ffmpeg.ffmpegPath
    && state.ffmpeg.ffprobePath
    && state.ffmpeg.codecSupport?.supported !== false
    && hasSelectedVideoOutputs()
    && (state.saveBesideSource || state.outputDirectory.path),
  );
}

function canAcceptImageJobs() {
  return Boolean(
    state.ffmpeg.ffmpegPath
    && state.ffmpeg.ffprobePath
    && state.ffmpeg.codecSupport?.images?.webp?.supported
    && hasSelectedImageOutputs()
    && (state.saveBesideSource || state.outputDirectory.path),
  );
}

function canAcceptPosterJobs() {
  return Boolean(
    state.ffmpeg.ffmpegPath
    && state.ffmpeg.ffprobePath
    && state.ffmpeg.codecSupport?.images?.webp?.supported
    && (state.saveBesideSource || state.outputDirectory.path),
  );
}

function canAcceptKind(kind) {
  if (kind === 'image') {
    return canAcceptImageJobs();
  }

  if (kind === 'poster') {
    return canAcceptPosterJobs();
  }

  return canAcceptVideoJobs();
}

function getSetupMessage(kind) {
  if (!state.ffmpeg.ffmpegPath || !state.ffmpeg.ffprobePath) {
    return 'Choose FFmpeg first.';
  }

  if ((kind === 'image' || kind === 'poster') && !state.ffmpeg.codecSupport?.images?.webp?.supported) {
    return kind === 'poster'
      ? 'This FFmpeg build does not include a WebP encoder for poster exports.'
      : 'This FFmpeg build does not include a WebP encoder for image compression.';
  }

  if (kind === 'image' && !hasSelectedImageOutputs()) {
    return 'Select at least one tier. Image compression uses the same tier checkboxes as video.';
  }

  if (kind === 'video' && state.ffmpeg.codecSupport?.supported === false) {
    return state.ffmpeg.codecSupport.errors?.[0] ?? 'This FFmpeg build is missing required video encoders.';
  }

  if (kind === 'video' && !hasSelectedVideoOutputs()) {
    return 'Select at least one video format and one video tier.';
  }

  if (!state.saveBesideSource && !state.outputDirectory.path) {
    return 'Choose an output folder first or turn on Save beside source.';
  }

  return kind === 'poster'
    ? 'Squish is not ready to accept poster video files yet.'
    : `Squish is not ready to accept ${kind} files yet.`;
}

async function processQueue() {
  if (state.isProcessing) {
    return;
  }

  state.isProcessing = true;
  state.notice = '';
  scheduleRender();

  while (!state.stopRequested) {
    const nextJob = state.jobs.find((job) => job.status === 'queued');

    if (!nextJob) {
      break;
    }

    await processJob(nextJob);
  }

  if (state.stopRequested) {
    stopQueuedJobs();
    state.notice = 'Stopped. Finished outputs remain in their target folders.';
  }

  state.stopRequested = false;
  state.isProcessing = false;
  scheduleRender();
}

async function processJob(job) {
  try {
    job.status = 'probing';
    job.currentVariant = job.kind === 'image' ? 'Reading image metadata' : 'Reading video metadata';
    job.progress = job.completedVariants ? job.progress : 0;
    scheduleRender();

    job.metadata = await desktop.probeVideo({
      ffprobePath: state.ffmpeg.ffprobePath,
      inputPath: job.inputPath,
    });

    const plan = job.kind === 'image'
      ? {
        variants: buildImageVariantPlan(
          job.baseName,
          job.metadata,
          state.ffmpeg.codecSupport,
          job.imageSelection,
        ),
        warnings: [],
        errors: [],
      }
      : job.kind === 'poster'
        ? {
          variants: (() => {
            const posterVariant = buildPosterVariant(job.baseName, job.metadata, state.ffmpeg.codecSupport);
            return posterVariant ? [posterVariant] : [];
          })(),
          warnings: state.ffmpeg.codecSupport?.images?.webp?.supported
            ? []
            : ['Poster image could not be created because this FFmpeg build does not include a WebP encoder.'],
          errors: [],
        }
      : buildVideoJobPlan({
        baseName: job.baseName,
        metadata: job.metadata,
        codecSupport: state.ffmpeg.codecSupport,
        selection: job.videoSelection,
        alphaRequested: job.alphaRequested,
        posterRequested: job.posterRequested,
      });

    for (const warning of plan.warnings) {
      appendUniqueMessage(job.warnings, warning);
    }

    if (!plan.variants.length && plan.errors.length) {
      throw new Error(plan.errors[0]);
    }

    if (!plan.variants.length) {
      throw new Error(job.kind === 'poster'
        ? 'No poster output could be created for this video.'
        : 'No output variants were selected for this video.');
    }

    job.outputTargetCount = plan.variants.length;
    job.status = 'transcoding';
    job.currentVariant = job.kind === 'image' ? 'Preparing WebP' : 'Launching FFmpeg';
    scheduleRender();

    await desktop.transcodeJob({
      jobId: job.id,
      inputPath: job.inputPath,
      outputDirectory: state.outputDirectory.path,
      baseName: job.baseName,
      ffmpegPath: state.ffmpeg.ffmpegPath,
      variants: plan.variants,
      durationSeconds: job.kind === 'video' ? job.metadata.duration : 0,
      saveBesideSource: state.saveBesideSource,
    });

    if (plan.errors.length) {
      throw new Error(plan.errors[0]);
    }

    job.currentVariant = '';
    job.progress = 1;
    job.status = 'done';
  } catch (error) {
    const message = getErrorMessage(error);

    appendUniqueMessage(job.errors, message);

    if (message.toLowerCase().includes('stopped by user')) {
      appendUniqueMessage(job.errors, 'Stopped by user. Unfinished output for the active variant was removed.');
      job.status = 'stopped';
    } else {
      job.status = 'error';
    }

    job.currentVariant = '';
    scheduleRender();
  }
}

async function handleStop() {
  if (!state.isProcessing || state.stopRequested) {
    return;
  }

  state.stopRequested = true;
  state.notice = 'Stopping current transcode. The active FFmpeg process will be killed.';
  scheduleRender();
  await desktop.stopJob();
}

async function handleOpenFolder(targetPath) {
  if (!targetPath) {
    return;
  }

  const result = await desktop.openPath(targetPath);

  if (result) {
    state.notice = result;
    scheduleRender();
  }
}

function handleFfmpegInstallEvent(payload) {
  if (!payload) {
    return;
  }

  state.ffmpegInstall = {
    ...state.ffmpegInstall,
    isInstalling: payload.stage !== 'complete',
    stage: payload.stage ?? '',
    label: payload.message ?? getInstallStageLabel(payload.stage),
    meta: formatInstallMeta(payload),
    progressRatio: normalizeInstallProgress(payload.progressRatio),
    bytesReceived: payload.bytesReceived ?? 0,
    totalBytes: payload.totalBytes ?? 0,
  };

  scheduleRender();
}

function stopQueuedJobs() {
  for (const job of state.jobs) {
    if (job.status === 'queued') {
      job.status = 'stopped';
      appendUniqueMessage(job.errors, 'Stopped before this file began.');
    }
  }
}

function resetApp() {
  state.jobs = [];
  state.isProcessing = false;
  state.stopRequested = false;
  state.notice = '';
  scheduleRender();
}

function handleJobEvent(payload) {
  const job = state.jobs.find((item) => item.id === payload.jobId);

  if (!job) {
    return;
  }

  switch (payload.type) {
    case 'variant-start':
      job.currentVariant = `${payload.variant?.mediaKind === 'image' ? 'Creating' : 'Encoding'} ${payload.label}`;
      job.progress = calculateJobProgress(payload.variantIndex, 0, job.outputTargetCount);
      break;
    case 'progress':
      job.progress = calculateJobProgress(payload.variantIndex, payload.ratio, job.outputTargetCount);
      if (payload.label) {
        job.currentVariant = payload.label;
      }
      break;
    case 'warning':
      appendUniqueMessage(job.warnings, payload.message);
      break;
    case 'variant-complete':
      job.completedVariants = payload.variantIndex + 1;
      job.progress = calculateJobProgress(job.completedVariants, 0, job.outputTargetCount);
      job.currentVariant = `Finished ${getVariantLabel(payload.variant)}`;
      break;
    case 'variant-skipped':
      job.completedVariants = payload.variantIndex + 1;
      job.progress = calculateJobProgress(job.completedVariants, 0, job.outputTargetCount);
      job.currentVariant = `Skipped ${getVariantLabel(payload.variant)}`;
      break;
    case 'output':
      job.outputs.push(payload.artifact);
      for (const warning of payload.artifact.warnings ?? []) {
        appendUniqueMessage(job.warnings, warning);
      }
      break;
    default:
      break;
  }

  scheduleRender();
}

function appendUniqueMessage(target, message) {
  if (!message) {
    return;
  }

  if (!target.includes(message)) {
    target.push(message);
  }
}

function getStatusTone(job) {
  if (job.status === 'done') {
    return 'done';
  }

  if (job.status === 'stopped') {
    return 'stopped';
  }

  if (job.status === 'error') {
    return 'error';
  }

  return 'running';
}

function getStatusLabel(job) {
  switch (job.status) {
    case 'queued':
      return 'Queued';
    case 'probing':
      return 'Reading metadata';
    case 'transcoding':
      return job.kind === 'image'
        ? 'Compressing'
        : job.kind === 'poster'
          ? 'Creating poster'
          : 'Transcoding';
    case 'done':
      return job.errors.length || job.warnings.length ? 'Done with warnings' : 'Done';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return job.outputs.length ? 'Partial output' : 'Failed';
    default:
      return 'Queued';
  }
}

function createIdleInstallState() {
  return {
    supported: false,
    isInstalling: false,
    stage: '',
    label: '',
    meta: '',
    progressRatio: 0,
    bytesReceived: 0,
    totalBytes: 0,
  };
}

function applyFfmpegSelection(selection) {
  state.ffmpeg = {
    ffmpegPath: selection.ffmpegPath,
    ffprobePath: selection.ffprobePath,
    source: selection.source ?? state.ffmpeg.source ?? '',
    codecSupport: selection.codecSupport ?? null,
  };
  state.notice = selection.codecSupport?.supported === false
    ? (selection.codecSupport.errors?.[0] ?? 'This FFmpeg build is missing required video encoders.')
    : '';
}

function getFfmpegStatusLabel() {
  if (!state.ffmpeg.ffmpegPath) {
    return 'FFmpeg not configured';
  }

  if (state.ffmpeg.source === 'PATH') {
    return `${state.ffmpeg.ffmpegPath} (PATH)`;
  }

  if (state.ffmpeg.source === 'config') {
    return `${state.ffmpeg.ffmpegPath} (saved)`;
  }

  if (state.ffmpeg.source === 'installed') {
    return `${state.ffmpeg.ffmpegPath} (installed)`;
  }

  return state.ffmpeg.ffmpegPath;
}

function getInstallStageLabel(stage) {
  switch (stage) {
    case 'choosing-folder':
      return 'Choose where to install FFmpeg.';
    case 'downloading':
      return 'Downloading FFmpeg...';
    case 'extracting':
      return 'Extracting FFmpeg...';
    case 'verifying':
      return 'Verifying the FFmpeg install...';
    case 'complete':
      return 'FFmpeg installed.';
    default:
      return '';
  }
}

function formatInstallMeta(payload) {
  if (payload.stage === 'downloading') {
    if (payload.totalBytes > 0) {
      return `${formatPercent(normalizeInstallProgress(payload.progressRatio))} / ${formatBytes(payload.bytesReceived)} of ${formatBytes(payload.totalBytes)}`;
    }

    if (payload.bytesReceived > 0) {
      return formatBytes(payload.bytesReceived);
    }
  }

  return '';
}

function normalizeInstallProgress(value) {
  return Number.isFinite(value) && value >= 0
    ? Math.min(value, 1)
    : 0;
}

function scheduleRender() {
  if (state.renderQueued) {
    return;
  }

  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function render() {
  const completedFiles = state.jobs.filter((job) => ['done', 'error', 'stopped'].includes(job.status)).length;
  const savedBytes = state.jobs.reduce(
    (sum, job) => sum + job.outputs.reduce((jobSum, output) => jobSum + output.size, 0),
    0,
  );
  const ffmpegReady = Boolean(state.ffmpeg.ffmpegPath && state.ffmpeg.ffprobePath);
  const imageSupported = Boolean(state.ffmpeg.codecSupport?.images?.webp?.supported);
  const targetLabel = state.saveBesideSource ? 'source folders' : 'the selected folder';
  const showInstallButton = state.ffmpegInstall.supported && !ffmpegReady;
  const showInstallStatus = state.ffmpegInstall.isInstalling || state.ffmpegInstall.label;
  const installProgressWidth = `${Math.round((state.ffmpegInstall.progressRatio ?? 0) * 100)}%`;

  elements.ffmpegButton.disabled = state.ffmpegInstall.isInstalling;
  elements.installFfmpegButton.disabled = state.ffmpegInstall.isInstalling;
  elements.installFfmpegButton.classList.toggle('hidden', !showInstallButton);
  elements.installFfmpegButton.textContent = state.ffmpegInstall.isInstalling
    ? 'Installing FFmpeg...'
    : 'Install FFmpeg';
  elements.pickButton.disabled = !canAcceptVideoJobs() || state.stopRequested;
  elements.stopButton.disabled = !state.isProcessing || state.stopRequested;
  elements.resetButton.disabled = state.jobs.length === 0 || state.isProcessing;
  elements.saveBesideSourceToggle.checked = state.saveBesideSource;
  elements.hasAlphaToggle.checked = state.alphaRequested;
  elements.posterImageToggle.checked = state.posterRequested;
  elements.alphaNote.classList.toggle('hidden', !state.alphaRequested);
  elements.installStatus.classList.toggle('hidden', !showInstallStatus);
  elements.installStatusLabel.textContent = state.ffmpegInstall.label || 'Downloading FFmpeg...';
  elements.installStatusMeta.textContent = state.ffmpegInstall.meta || '';
  elements.installProgressFill.style.width = installProgressWidth;
  syncSelectionToggles();

  for (const [kind, element] of [
    ['video', elements.videoDropzone],
    ['image', elements.imageDropzone],
    ['poster', elements.posterDropzone],
  ]) {
    const canAccept = canAcceptKind(kind);
    element.disabled = !canAccept || state.stopRequested;
    element.classList.toggle('is-disabled', !canAccept || state.stopRequested);
  }

  elements.ffmpegName.textContent = ffmpegReady
    ? getFfmpegStatusLabel()
    : 'FFmpeg not configured';
  elements.folderName.textContent = state.saveBesideSource
    ? 'Source folders'
    : (state.outputDirectory.path || 'Not selected');

  if (state.ffmpegInstall.isInstalling) {
    elements.batchHeadline.textContent = 'Installing FFmpeg.';
    elements.batchNote.textContent = state.ffmpegInstall.label || 'Downloading and installing FFmpeg for Squish.';
  } else if (state.stopRequested) {
    elements.batchHeadline.textContent = 'Stopping current work.';
    elements.batchNote.textContent = 'The active native FFmpeg process is being killed. Any unfinished file for that variant will be deleted.';
  } else if (state.isProcessing) {
    elements.batchHeadline.textContent = state.saveBesideSource
      ? 'Processing locally and saving beside each source.'
      : 'Processing locally and writing directly to disk.';
    elements.batchNote.textContent = `Saved so far: ${formatBytes(savedBytes)}. FFmpeg is using native CPU threads instead of browser memory.`;
  } else if (state.notice) {
    elements.batchHeadline.textContent = 'Attention.';
    elements.batchNote.textContent = state.notice;
  } else if (state.jobs.length > 0 && completedFiles === state.jobs.length) {
    elements.batchHeadline.textContent = 'Batch finished.';
    elements.batchNote.textContent = `Saved ${state.jobs.reduce((sum, job) => sum + job.outputs.length, 0)} files (${formatBytes(savedBytes)}) into ${targetLabel}.`;
  } else if (!ffmpegReady) {
    elements.batchHeadline.textContent = showInstallButton ? 'Install or locate FFmpeg first.' : 'Locate FFmpeg first.';
    elements.batchNote.textContent = showInstallButton
      ? 'Squish can download the latest full Windows FFmpeg build for you, or you can point it at an existing ffmpeg.exe.'
      : 'Squish needs a native FFmpeg install. If it is already on PATH, it will auto-detect on launch.';
  } else if (state.ffmpeg.codecSupport?.supported === false) {
    elements.batchHeadline.textContent = 'This FFmpeg build is missing required video encoders.';
    elements.batchNote.textContent = state.ffmpeg.codecSupport.errors?.[0] ?? 'Choose another FFmpeg build.';
  } else if (!hasSelectedImageOutputs()) {
    elements.batchHeadline.textContent = 'Select output tiers.';
    elements.batchNote.textContent = 'Image compression and video tiers share the same tier checkboxes. Poster-only exports still work.';
  } else if (!hasSelectedVideoOutputs()) {
    elements.batchHeadline.textContent = 'Video outputs are disabled.';
    elements.batchNote.textContent = 'Choose at least one video format if you want MP4 or WebM exports. Image compression and poster-only WebP exports still work.';
  } else if (state.alphaRequested && !state.ffmpeg.codecSupport?.alphaTargets?.safari?.supported) {
    elements.batchHeadline.textContent = 'Alpha mode is ready for WebM.';
    elements.batchNote.textContent = 'This FFmpeg build can preserve alpha in WebM, but Safari alpha MP4 output will be skipped. In practice that path usually requires macOS FFmpeg with hevc_videotoolbox.';
  } else if (!imageSupported) {
    elements.batchHeadline.textContent = 'Video compression is ready.';
    elements.batchNote.textContent = 'This FFmpeg build can compress videos, but it does not include a WebP encoder for images.';
  } else if (!state.saveBesideSource && !state.outputDirectory.path) {
    elements.batchHeadline.textContent = 'Choose an output folder first.';
    elements.batchNote.textContent = 'Turn on Save beside source to write outputs next to each input file instead.';
  } else {
    elements.batchHeadline.textContent = 'Ready.';
    elements.batchNote.textContent = state.saveBesideSource
      ? 'Drop files to save outputs directly beside each source file.'
      : 'Drop videos for MP4 and WebM exports, drop images for WebP compression, or drop videos for poster-only WebP exports.';
  }

  if (state.jobs.length === 0) {
    elements.jobList.innerHTML = `
      <article class="empty-card">
        <strong>No files in the queue.</strong>
      </article>
    `;
    return;
  }

  elements.jobList.innerHTML = [...state.jobs].reverse().map(renderJob).join('');
}

function renderJob(job) {
  const statusLabel = getStatusLabel(job);
  const tone = getStatusTone(job);
  const progressWidth = `${Math.round(job.progress * 100)}%`;
  const outputBytes = job.outputs.reduce((sum, output) => sum + output.size, 0);
  const outputFolder = getJobOutputFolder(job);
  const dimensions = job.metadata
    ? `${job.metadata.width}x${job.metadata.height}${job.kind === 'video' && job.metadata.duration > 0 ? ` / ${job.metadata.duration.toFixed(1)}s / ${job.metadata.fps.toFixed(2)} fps` : ''}${job.metadata.hasAlpha ? ' / alpha' : ''}`
    : 'Inspecting metadata';
  const artifacts = job.outputs.length ? renderArtifactTable(job.outputs) : '';
  const warnings = job.warnings.length
    ? `
        <ul class="job-warnings">
          ${job.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
        </ul>
      `
    : '';
  const errors = job.errors.length
    ? `
        <ul class="job-errors">
          ${job.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}
        </ul>
      `
    : '';

  return `
    <article class="job-card">
      <div class="job-head">
        <div class="job-title">
          <strong>${escapeHtml(job.originalName)}</strong>
          <span class="job-meta">${escapeHtml(dimensions)} / ${formatBytes(job.inputSize)} / ${job.outputs.length}/${job.outputTargetCount} saved</span>
        </div>
        <div class="job-pill-row">
          ${job.outputs.length && outputFolder
            ? `<button class="job-folder-button" type="button" data-open-folder="${escapeHtml(outputFolder)}">Open folder</button>`
            : ''}
          <span class="job-pill ${tone}">${escapeHtml(statusLabel)}</span>
          <span class="job-pill">${escapeHtml(job.baseName)}</span>
        </div>
      </div>

      <div class="job-progress">
        <div class="job-progress-bar">
          <div class="job-progress-fill" style="width: ${progressWidth}"></div>
        </div>
        <div class="job-progress-copy">
          <span class="job-current">${escapeHtml(job.currentVariant || statusLabel)}</span>
          <span>${formatPercent(job.progress)} / ${formatBytes(outputBytes)}</span>
        </div>
      </div>

      ${artifacts}
      ${warnings}
      ${errors}
    </article>
  `;
}

function renderArtifactTable(outputs) {
  return `
    <div class="artifact-table-wrap">
      <table class="artifact-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Size</th>
            <th>Dimensions</th>
          </tr>
        </thead>
        <tbody>
          ${outputs.map((output) => `
            <tr>
              <td>
                <div class="artifact-file">${escapeHtml(output.filename)}</div>
                ${(output.warnings ?? []).length
                  ? `<div class="artifact-warning">${escapeHtml(output.warnings.join(' '))}</div>`
                  : ''}
              </td>
              <td>${formatBytes(output.size)}</td>
              <td>${escapeHtml(`${output.width}x${output.height}`)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getJobOutputFolder(job) {
  const firstOutput = job.outputs[0];

  if (firstOutput?.outputPath) {
    return getDirectoryPath(firstOutput.outputPath);
  }

  if (state.saveBesideSource) {
    return getDirectoryPath(job.inputPath);
  }

  return state.outputDirectory.path
    ? `${state.outputDirectory.path}\\${job.baseName}`
    : '';
}

function createDefaultVideoSelection() {
  return {
    formats: Object.fromEntries(Object.keys(PRESETS.formats).map((formatId) => [formatId, true])),
    tiers: Object.fromEntries(PRESETS.tiers.map((tier) => [tier.id, true])),
  };
}

function getSelectedVideoPlan() {
  return {
    formats: Object.entries(state.videoSelection.formats)
      .filter(([, enabled]) => enabled)
      .map(([formatId]) => formatId),
    tiers: getSelectedTierIds(),
  };
}

function getSelectedImagePlan() {
  return {
    tiers: getSelectedTierIds(),
  };
}

function getSelectedTierIds() {
  return Object.entries(state.videoSelection.tiers)
    .filter(([, enabled]) => enabled)
    .map(([tierId]) => tierId);
}

function countVideoOutputs(selection) {
  return (selection?.formats?.length ?? 0) * (selection?.tiers?.length ?? 0);
}

function countImageOutputs(selection) {
  return selection?.tiers?.length ?? 0;
}

function hasSelectedImageOutputs() {
  return countImageOutputs(getSelectedImagePlan()) > 0;
}

function hasSelectedVideoOutputs() {
  return countVideoOutputs(getSelectedVideoPlan()) > 0;
}

function syncSelectionToggles() {
  for (const toggle of elements.formatToggles) {
    const formatId = toggle.dataset.outputFormat;
    toggle.checked = Boolean(state.videoSelection.formats[formatId]);
  }

  for (const toggle of elements.tierToggles) {
    const tierId = toggle.dataset.outputTier;
    toggle.checked = Boolean(state.videoSelection.tiers[tierId]);
  }
}

render();
