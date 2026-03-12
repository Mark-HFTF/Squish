import { PRESETS } from '../config.js';
import { resolveCodecSupport } from './codec-support.js';
import { buildScaleFilter, getImageOutputDimensions, getOutputDimensions } from './sizing.js';
import {
  formatBitrate,
  resolveMp4EncodingProfile,
  resolveWebmEncodingProfile,
} from './video-delivery.js';

export function buildVideoVariantPlan(baseName, metadata, codecSupport = null, selection = null) {
  const resolvedSupport = codecSupport?.formats
    ? codecSupport
    : resolveCodecSupport([]);
  const enabledTierIds = new Set(selection?.tiers ?? PRESETS.tiers.map((tier) => tier.id));
  const enabledFormatIds = new Set(selection?.formats ?? Object.keys(PRESETS.formats));

  return PRESETS.tiers.flatMap((tier) => {
    if (!enabledTierIds.has(tier.id)) {
      return [];
    }

    const dimensions = getOutputDimensions(metadata.width, metadata.height, tier.cap);
    const mp4Format = PRESETS.formats.mp4;
    const mp4Support = resolvedSupport.formats?.mp4 ?? {};
    const mp4VideoProfile = mp4Support.videoProfile ?? mp4Format.videoProfiles[0];
    const mp4AudioProfile = mp4Support.audioProfile ?? mp4Format.audioProfiles[0];
    const mp4Profile = resolveMp4EncodingProfile(tier.id, dimensions, metadata.fps);

    const webmFormat = PRESETS.formats.webm;
    const webmSupport = resolvedSupport.formats?.webm ?? {};
    const webmVideoProfile = webmSupport.videoProfile ?? webmFormat.videoProfiles[0];
    const webmAudioProfile = webmSupport.audioProfile ?? webmFormat.audioProfiles[0];
    const webmProfile = resolveWebmEncodingProfile(tier.id, dimensions, metadata.fps);
    const mp4Variant = {
      mediaKind: 'video',
      executionMode: 'single-pass',
      id: `${tier.id}-mp4`,
      tierId: tier.id,
      tierLabel: tier.label,
      formatId: mp4Format.id,
      formatLabel: mp4Format.label,
      filename: `${baseName}-${tier.id}.${mp4Format.extension}`,
      mimeType: mp4Format.mimeType,
      dimensions,
      videoCodec: mp4VideoProfile.encoder,
      videoCodecLabel: mp4VideoProfile.label,
      audioCodec: mp4AudioProfile.encoder,
      audioCodecLabel: mp4AudioProfile.label,
      audioBitrate: mp4Profile.audioBitrate,
      crf: mp4Profile.crf,
      maxrateBps: mp4Profile.maxrateBps,
      bufsizeBps: mp4Profile.bufsizeBps,
      rungId: mp4Profile.rungId,
      fpsBand: mp4Profile.fpsBand,
      baseArgs: mp4Profile.baseArgs,
      threadCount: 0,
    };

    const variants = [];

    if (enabledFormatIds.has(mp4Format.id)) {
      variants.push(mp4Variant);
    }

    if (enabledFormatIds.has(webmFormat.id)) {
      variants.push({
        mediaKind: 'video',
        executionMode: 'vp9-two-pass',
        id: `${tier.id}-webm`,
        tierId: tier.id,
        tierLabel: tier.label,
        formatId: webmFormat.id,
        formatLabel: webmFormat.label,
        filename: `${baseName}-${tier.id}.${webmFormat.extension}`,
        mimeType: webmFormat.mimeType,
        dimensions,
        videoCodec: webmVideoProfile.encoder,
        videoCodecLabel: webmVideoProfile.label,
        audioCodec: webmAudioProfile.encoder,
        audioCodecLabel: webmAudioProfile.label,
        audioBitrate: webmProfile.audioBitrate,
        crf: webmProfile.crf,
        baselineTargetBps: webmProfile.baselineTargetBps,
        tileColumns: webmProfile.tileColumns,
        rungId: webmProfile.rungId,
        fpsBand: webmProfile.fpsBand,
        commonArgs: webmProfile.commonArgs,
        pass1Args: webmProfile.pass1Args,
        pass2Args: webmProfile.pass2Args,
        audioArgs: webmProfile.audioArgs,
        retrySteps: webmProfile.retrySteps,
        mp4TargetRatio: webmProfile.mp4TargetRatio,
        minrateRatio: webmProfile.minrateRatio,
        referenceVariant: enabledFormatIds.has(mp4Format.id) ? null : {
          ...mp4Variant,
          internalOnly: true,
          filename: `${baseName}-${tier.id}-reference.mp4`,
        },
        threadCount: 0,
      });
    }

    return variants;
  });
}

export function buildImageVariantPlan(baseName, metadata, codecSupport = null) {
  const resolvedSupport = codecSupport?.images
    ? codecSupport
    : resolveCodecSupport([]);
  const format = PRESETS.images.format;
  const support = resolvedSupport.images?.webp ?? {};
  const videoProfile = support.videoProfile ?? format.videoProfiles[0];

  return [
    {
      mediaKind: 'image',
      executionMode: 'single-pass',
      id: 'hd-webp',
      tierId: 'hd',
      tierLabel: 'HD',
      formatId: format.id,
      formatLabel: format.label,
      filename: `${baseName}.${format.extension}`,
      mimeType: format.mimeType,
      dimensions: getImageOutputDimensions(metadata.width, metadata.height, PRESETS.images.cap),
      videoCodec: videoProfile.encoder,
      videoCodecLabel: videoProfile.label,
      quality: format.quality,
      compressionLevel: format.compressionLevel,
      baseArgs: videoProfile.baseArgs,
      threadCount: 0,
    },
  ];
}

export function buildVariantPlan(baseName, metadata, codecSupport = null) {
  return buildVideoVariantPlan(baseName, metadata, codecSupport);
}

export function buildFfmpegArgs({
  inputName,
  outputName,
  variant,
  threadCount = null,
  phase = null,
  passlogFile = '',
  rateControl = null,
}) {
  const resolvedThreadCount = threadCount ?? variant.threadCount ?? null;

  if (variant.mediaKind === 'image') {
    const command = [
      '-i',
      inputName,
      '-vf',
      buildScaleFilter(variant.dimensions, { setSampleAspectRatio: false }),
      '-frames:v',
      '1',
      '-c:v',
      variant.videoCodec,
    ];

    if (resolvedThreadCount !== null && resolvedThreadCount !== undefined) {
      command.push('-threads', String(resolvedThreadCount));
    }

    command.push(
      ...variant.baseArgs,
      '-quality',
      String(variant.quality),
      '-compression_level',
      String(variant.compressionLevel),
      '-y',
      outputName,
    );

    return command;
  }

  const command = [
    '-i',
    inputName,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    buildScaleFilter(variant.dimensions),
    '-c:v',
    variant.videoCodec,
  ];

  if (resolvedThreadCount !== null && resolvedThreadCount !== undefined) {
    command.push('-threads', String(resolvedThreadCount));
  }

  if (variant.executionMode === 'vp9-two-pass') {
    if (!phase || !rateControl) {
      throw new Error('VP9 two-pass args require both phase and rate control.');
    }

    const passArgs = phase.pass === 1 ? variant.pass1Args : variant.pass2Args;

    command.push(
      ...variant.commonArgs,
      ...passArgs,
      '-tile-columns',
      String(variant.tileColumns),
      '-crf',
      String(rateControl.crf),
      '-b:v',
      formatBitrate(rateControl.targetBps),
      '-minrate',
      formatBitrate(rateControl.minrateBps),
      '-maxrate',
      formatBitrate(rateControl.maxrateBps),
      '-bufsize',
      formatBitrate(rateControl.bufsizeBps),
      '-pass',
      String(phase.pass),
      '-passlogfile',
      passlogFile,
    );

    if (phase.pass === 1) {
      command.push('-an', '-f', 'webm', '-y', outputName);
      return command;
    }

    command.push(
      '-c:a',
      variant.audioCodec,
      ...variant.audioArgs,
      '-b:a',
      variant.audioBitrate,
      '-y',
      outputName,
    );

    return command;
  }

  command.push(
    '-crf',
    String(variant.crf),
    ...variant.baseArgs,
    '-maxrate',
    formatBitrate(variant.maxrateBps),
    '-bufsize',
    formatBitrate(variant.bufsizeBps),
    '-c:a',
    variant.audioCodec,
    '-b:a',
    variant.audioBitrate,
    '-y',
    outputName,
  );

  return command;
}

export function getVariantLabel(variant) {
  return `${variant.tierLabel} ${variant.formatLabel}`;
}
