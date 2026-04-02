import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFfmpegArgs, getVariantLabel } from '../src/lib/commands.js';
import { resolveCodecSupport } from '../src/lib/codec-support.js';
import { getErrorMessage } from '../src/lib/format.js';
import {
  calculateAverageBitrate,
  getVp9PhaseLabel,
  resolveVp9AttemptRateControl,
} from '../src/lib/video-delivery.js';
import {
  getDefaultFfmpegPath,
  parseEncoderNames,
  parseFrameRate,
  parseProgressLine,
  pixelFormatHasAlpha,
  resolvePeerBinary,
} from './ffmpeg-utils.js';
import { resolveJobOutputRoot } from './output-paths.js';
import { spawnForOutput } from './process-utils.js';

const state = {
  activeChild: null,
  stopRequested: false,
};

const VIDEO_FILTERS = [
  { name: 'Video files', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'wmv', 'mpeg', 'mpg', '3gp', 'ogg', 'ogv'] },
];

const IMAGE_FILTERS = [
  { name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif'] },
];

const WEBM_PROGRESS_WINDOWS = [
  [
    { start: 0, end: 0.3 },
    { start: 0.3, end: 0.9 },
  ],
  [
    { start: 0.9, end: 0.94 },
    { start: 0.94, end: 0.97 },
  ],
  [
    { start: 0.97, end: 0.985 },
    { start: 0.985, end: 0.995 },
  ],
];

export async function validateExecutable(command, args = ['-version']) {
  try {
    await spawnForOutput(command, args);
    return true;
  } catch {
    return false;
  }
}

export async function detectFfmpegTools(savedTools = null) {
  const candidates = [];

  if (savedTools?.ffmpegPath) {
    candidates.push({
      ffmpegPath: savedTools.ffmpegPath,
      ffprobePath: savedTools.ffprobePath || resolvePeerBinary(savedTools.ffmpegPath, 'ffprobe'),
      source: 'config',
      persisted: true,
    });
  }

  const defaultFfmpegPath = getDefaultFfmpegPath();

  if (defaultFfmpegPath) {
    candidates.push({
      ffmpegPath: defaultFfmpegPath,
      ffprobePath: resolvePeerBinary(defaultFfmpegPath, 'ffprobe'),
      source: 'default',
      persisted: false,
    });
  }

  candidates.push({
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    source: 'PATH',
    persisted: false,
  });

  let staleSavedPath = false;

  for (const candidate of candidates) {
    const detected = await inspectToolPair(candidate.ffmpegPath, candidate.ffprobePath, candidate.source);

    if (detected) {
      return {
        ...detected,
        staleSavedPath,
      };
    }

    if (candidate.persisted) {
      staleSavedPath = true;
    }
  }

  return {
    available: false,
    ffmpegPath: '',
    ffprobePath: '',
    source: '',
    codecSupport: null,
    staleSavedPath,
  };
}

export function getVideoDialogFilters() {
  return VIDEO_FILTERS;
}

export function getImageDialogFilters() {
  return IMAGE_FILTERS;
}

export async function validateToolPair(ffmpegPath, ffprobePath = resolvePeerBinary(ffmpegPath, 'ffprobe')) {
  const hasFfmpeg = await validateExecutable(ffmpegPath);
  const hasFfprobe = await validateExecutable(ffprobePath);

  if (!hasFfmpeg) {
    throw new Error('The selected FFmpeg binary could not be executed.');
  }

  if (!hasFfprobe) {
    throw new Error('Could not find a working ffprobe next to FFmpeg. Download a build that includes both ffmpeg and ffprobe.');
  }

  const codecSupport = await inspectCodecSupport(ffmpegPath);

  if (!codecSupport.supported) {
    throw new Error(codecSupport.errors[0] ?? 'This FFmpeg build is missing required encoders.');
  }

  return {
    ffmpegPath,
    ffprobePath,
    codecSupport,
  };
}

async function inspectToolPair(ffmpegPath, ffprobePath, source) {
  if (!ffmpegPath || !ffprobePath) {
    return null;
  }

  const hasFfmpeg = await validateExecutable(ffmpegPath);
  const hasFfprobe = hasFfmpeg ? await validateExecutable(ffprobePath) : false;

  if (!hasFfmpeg || !hasFfprobe) {
    return null;
  }

  const codecSupport = await inspectCodecSupport(ffmpegPath);

  return {
    available: true,
    ffmpegPath,
    ffprobePath,
    source,
    codecSupport,
  };
}

export async function describeFiles(filePaths) {
  return Promise.all(filePaths.map(async (filePath) => {
    const stats = await fs.stat(filePath);

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
    };
  }));
}

export async function probeVisualAsset({ ffprobePath, inputPath }) {
  const args = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,pix_fmt,avg_frame_rate,r_frame_rate:format=duration',
    '-of',
    'json',
    inputPath,
  ];
  const { stdout } = await spawnForOutput(ffprobePath, args);
  const payload = JSON.parse(stdout);
  const stream = payload.streams?.[0];
  const parsedDuration = Number(payload.format?.duration);
  const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0;

  if (!stream?.width || !stream?.height) {
    throw new Error('FFprobe could not read this video file.');
  }

  const fps = parseFrameRate(stream.avg_frame_rate)
    ?? parseFrameRate(stream.r_frame_rate)
    ?? 30;

  return {
    width: Number(stream.width),
    height: Number(stream.height),
    duration,
    fps,
    pixFmt: stream.pix_fmt ?? '',
    hasAlpha: pixelFormatHasAlpha(stream.pix_fmt),
  };
}

export async function probeVideo(options) {
  return probeVisualAsset(options);
}

export async function transcodeJob(options, emit) {
  const {
    jobId,
    inputPath,
    outputDirectory,
    baseName,
    ffmpegPath,
    variants,
    durationSeconds,
    saveBesideSource = false,
  } = options;

  if (state.activeChild) {
    throw new Error('Another transcode is already running.');
  }

  state.stopRequested = false;

  const outputRoot = resolveJobOutputRoot({
    inputPath,
    outputDirectory,
    baseName,
    saveBesideSource,
  });
  await fs.mkdir(outputRoot, { recursive: true });

  const artifacts = [];

  try {
    for (let index = 0; index < variants.length; index += 1) {
      if (state.stopRequested) {
        throw new Error('Stopped by user.');
      }

      const variant = variants[index];
      const outputPath = path.join(outputRoot, variant.filename);

      emit({
        type: 'variant-start',
        jobId,
        variant,
        variantIndex: index,
        label: getVariantLabel(variant),
      });

      try {
        const execution = variant.executionMode === 'vp9-two-pass'
          ? await runWebmVariant({
            ffmpegPath,
            inputPath,
            outputPath,
            outputRoot,
            variant,
            artifacts,
            durationSeconds,
            jobId,
            variantIndex: index,
          }, emit)
          : await runSinglePassVariant({
            ffmpegPath,
            inputPath,
            outputPath,
            variant,
            durationSeconds,
            jobId,
            variantIndex: index,
          }, emit);

        const stats = await fs.stat(execution.outputPath);
        const artifact = {
          jobId,
          tier: variant.tierId,
          format: variant.formatId,
          filename: variant.filename,
          outputPath: execution.outputPath,
          size: stats.size,
          width: variant.dimensions.width,
          height: variant.dimensions.height,
          warnings: execution.warnings ?? [],
        };

        artifacts.push(artifact);

        for (const warning of artifact.warnings) {
          emit({
            type: 'warning',
            jobId,
            variant,
            variantIndex: index,
            message: warning,
          });
        }

        emit({
          type: 'output',
          jobId,
          variant,
          variantIndex: index,
          artifact,
        });
        emit({
          type: 'variant-complete',
          jobId,
          variant,
          variantIndex: index,
        });
      } catch (error) {
        if (!variant.optional) {
          throw error;
        }

        emit({
          type: 'warning',
          jobId,
          variant,
          variantIndex: index,
          message: `${getVariantLabel(variant)} could not be created and was skipped. ${getErrorMessage(error)}`,
        });
        emit({
          type: 'variant-skipped',
          jobId,
          variant,
          variantIndex: index,
        });
      }
    }

    return { artifacts, errors: [] };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  } finally {
    state.activeChild = null;
    state.stopRequested = false;
  }
}

async function inspectCodecSupport(ffmpegPath) {
  const { stdout, stderr } = await spawnForOutput(ffmpegPath, ['-hide_banner', '-encoders']);
  const encoders = parseEncoderNames(`${stdout}\n${stderr}`);
  const alphaTargets = await inspectAlphaTargets(ffmpegPath, encoders);
  return resolveCodecSupport(encoders, { alphaTargets });
}

export function stopActiveTranscode() {
  state.stopRequested = true;

  if (state.activeChild) {
    state.activeChild.kill();
  }
}

async function runSinglePassVariant(context, emit) {
  const {
    ffmpegPath,
    inputPath,
    outputPath,
    variant,
    durationSeconds,
    jobId,
    variantIndex,
  } = context;
  const label = variant.mediaKind === 'image'
    ? `Creating ${getVariantLabel(variant)}`
    : `Encoding ${getVariantLabel(variant)}`;

  await runFfmpegProcess({
    ffmpegPath,
    inputPath,
    outputPath,
    args: buildFfmpegArgs({
      inputName: inputPath,
      outputName: outputPath,
      variant,
    }),
    durationSeconds,
    jobId,
    variantIndex,
    label,
    progressWindow: { start: 0, end: 1 },
    cleanupOutputOnFailure: true,
  }, emit);

  if (variant.verifyAlpha) {
    await verifyAlphaOutput({
      ffmpegPath,
      inputPath: outputPath,
      decoder: variant.videoCodec,
    });
  }

  return {
    outputPath,
    warnings: [],
  };
}

async function runWebmVariant(context, emit) {
  const {
    ffmpegPath,
    inputPath,
    outputPath,
    outputRoot,
    variant,
    artifacts,
    durationSeconds,
    jobId,
    variantIndex,
  } = context;
  const matchingMp4 = artifacts.find(
    (artifact) => artifact.tier === variant.tierId && artifact.format === 'mp4',
  );
  const shouldEnforceMp4Size = !variant.skipSizeGuard;
  const referenceMp4 = shouldEnforceMp4Size
    ? (matchingMp4
      ? matchingMp4
      : await createReferenceMp4({
        ffmpegPath,
        inputPath,
        outputRoot,
        variant,
        durationSeconds,
        jobId,
        variantIndex,
      }, emit))
    : null;

  if (shouldEnforceMp4Size && !referenceMp4) {
    throw new Error(`Missing MP4 reference output for ${variant.tierLabel} WebM sizing.`);
  }

  const mp4AverageBitrateBps = shouldEnforceMp4Size
    ? calculateAverageBitrate(referenceMp4.size, durationSeconds)
    : null;
  const nullOutput = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const attemptCount = shouldEnforceMp4Size ? variant.retrySteps.length : 1;

  for (let attemptIndex = 0; attemptIndex < attemptCount; attemptIndex += 1) {
    const passlogFile = path.join(outputRoot, `${variant.id}-attempt-${attemptIndex}`);
    const rateControl = resolveVp9AttemptRateControl({
      variant,
      mp4AverageBitrateBps,
      attemptIndex,
    });

    try {
      await runFfmpegProcess({
        ffmpegPath,
        inputPath,
        outputPath: nullOutput,
        args: buildFfmpegArgs({
          inputName: inputPath,
          outputName: nullOutput,
          variant,
          phase: { pass: 1 },
          passlogFile,
          rateControl,
        }),
        durationSeconds,
        jobId,
        variantIndex,
        label: getVp9PhaseLabel(variant, attemptIndex, 1),
        progressWindow: WEBM_PROGRESS_WINDOWS[attemptIndex][0],
        cleanupOutputOnFailure: false,
      }, emit);

      await runFfmpegProcess({
        ffmpegPath,
        inputPath,
        outputPath,
        args: buildFfmpegArgs({
          inputName: inputPath,
          outputName: outputPath,
          variant,
          phase: { pass: 2 },
          passlogFile,
          rateControl,
        }),
        durationSeconds,
        jobId,
        variantIndex,
        label: getVp9PhaseLabel(variant, attemptIndex, 2),
        progressWindow: WEBM_PROGRESS_WINDOWS[attemptIndex][1],
        cleanupOutputOnFailure: true,
      }, emit);
    } finally {
      await cleanupPasslogFiles(passlogFile);
    }

    const stats = await fs.stat(outputPath);

    if (!shouldEnforceMp4Size) {
      return {
        outputPath,
        warnings: [],
      };
    }

    if (stats.size <= referenceMp4.size) {
      return {
        outputPath,
        warnings: [],
      };
    }

    if (attemptIndex < variant.retrySteps.length - 1) {
      await cleanupPartialFile(outputPath);
      continue;
    }

    return {
      outputPath,
      warnings: [
        `WebM remained larger than the ${variant.tierLabel} MP4 after 2 retries.`,
      ],
    };
  }

  throw new Error(`Unable to finish ${getVariantLabel(variant)}.`);
}

async function inspectAlphaTargets(ffmpegPath, encoders) {
  const safariSupport = await inspectSafariAlphaSupport(ffmpegPath, encoders);

  return {
    safari: safariSupport,
  };
}

async function inspectSafariAlphaSupport(ffmpegPath, encoders) {
  if (!encoders.has('hevc_videotoolbox')) {
    return {
      supported: false,
      encoder: '',
      label: '',
      optionName: '',
      optionValue: '',
      pixelFormat: '',
      baseArgs: [],
    };
  }

  try {
    const { stdout, stderr } = await spawnForOutput(ffmpegPath, ['-hide_banner', '-h', 'encoder=hevc_videotoolbox']);
    const help = `${stdout}\n${stderr}`;

    if (!/alpha_quality/i.test(help)) {
      return {
        supported: false,
        encoder: '',
        label: '',
        optionName: '',
        optionValue: '',
        pixelFormat: '',
        baseArgs: [],
      };
    }

    return {
      supported: true,
      encoder: 'hevc_videotoolbox',
      label: 'hevc_videotoolbox',
      optionName: 'alpha_quality',
      optionValue: '0.75',
      pixelFormat: 'bgra',
      baseArgs: ['-allow_sw', '1', '-tag:v', 'hvc1', '-movflags', '+faststart'],
    };
  } catch {
    return {
      supported: false,
      encoder: '',
      label: '',
      optionName: '',
      optionValue: '',
      pixelFormat: '',
      baseArgs: [],
    };
  }
}

async function verifyAlphaOutput({ ffmpegPath, inputPath, decoder }) {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-c:v',
    decoder,
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-vf',
    'alphaextract',
    '-frames:v',
    '1',
    '-f',
    'null',
    '-',
  ];

  try {
    await spawnForOutput(ffmpegPath, args);
  } catch (error) {
    throw new Error(`Encoded WebM did not verify with an alpha plane. ${getErrorMessage(error)}`);
  }
}

async function createReferenceMp4(context, emit) {
  const {
    ffmpegPath,
    inputPath,
    outputRoot,
    variant,
    durationSeconds,
    jobId,
    variantIndex,
  } = context;

  if (!variant.referenceVariant) {
    return null;
  }

  const outputPath = path.join(outputRoot, variant.referenceVariant.filename);

  try {
    await runFfmpegProcess({
      ffmpegPath,
      inputPath,
      outputPath,
      args: buildFfmpegArgs({
        inputName: inputPath,
        outputName: outputPath,
        variant: variant.referenceVariant,
      }),
      durationSeconds,
      jobId,
      variantIndex,
      label: `Sizing reference ${variant.tierLabel} MP4`,
      progressWindow: { start: 0, end: 0.01 },
      cleanupOutputOnFailure: true,
    }, emit);

    const stats = await fs.stat(outputPath);

    return {
      size: stats.size,
      outputPath,
    };
  } finally {
    await cleanupPartialFile(outputPath);
  }
}

async function runFfmpegProcess(context, emit) {
  const {
    ffmpegPath,
    outputPath,
    args,
    durationSeconds,
    jobId,
    variantIndex,
    label,
    progressWindow,
    cleanupOutputOnFailure,
  } = context;

  const ffmpegArgs = [
    '-hide_banner',
    '-nostdin',
    '-progress',
    'pipe:2',
    '-nostats',
    ...args,
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    state.activeChild = child;

    let stderrBuffer = '';
    let lastErrorLine = '';

    const emitProgress = (ratio) => {
      emit({
        type: 'progress',
        jobId,
        variantIndex,
        ratio,
        label,
      });
    };

    const handleLine = (line) => {
      const parsed = parseProgressLine(line);

      if (parsed?.done) {
        emitProgress(progressWindow.end);
        return;
      }

      if (parsed?.seconds !== undefined) {
        const processRatio = durationSeconds > 0
          ? Math.min(parsed.seconds / durationSeconds, 0.999)
          : 0;
        const ratio = progressWindow.start + ((progressWindow.end - progressWindow.start) * processRatio);

        emitProgress(ratio);
      } else if (line.trim()) {
        lastErrorLine = line.trim();
      }
    };

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
      const parts = stderrBuffer.split(/\r?\n/);
      stderrBuffer = parts.pop() ?? '';

      for (const line of parts) {
        handleLine(line);
      }
    });

    child.once('error', async (error) => {
      state.activeChild = null;

      if (cleanupOutputOnFailure) {
        await cleanupPartialFile(outputPath);
      }

      reject(error);
    });

    child.once('close', async (code, signal) => {
      if (stderrBuffer.trim()) {
        handleLine(stderrBuffer);
      }

      state.activeChild = null;

      if (state.stopRequested || signal) {
        if (cleanupOutputOnFailure) {
          await cleanupPartialFile(outputPath);
        }

        reject(new Error('Stopped by user.'));
        return;
      }

      if (code === 0) {
        emitProgress(progressWindow.end);
        resolve();
        return;
      }

      if (cleanupOutputOnFailure) {
        await cleanupPartialFile(outputPath);
      }

      reject(new Error(lastErrorLine || `FFmpeg exited with code ${code}`));
    });
  });
}

async function cleanupPasslogFiles(basePath) {
  const candidates = [
    `${basePath}-0.log`,
    `${basePath}-0.log.mbtree`,
    `${basePath}.log`,
    `${basePath}.log.mbtree`,
  ];

  await Promise.all(candidates.map(async (candidate) => {
    try {
      await fs.rm(candidate, { force: true });
    } catch {
      // Ignore passlog cleanup failures.
    }
  }));
}

async function cleanupPartialFile(filePath) {
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // Ignore cleanup failures for partial outputs.
  }
}
