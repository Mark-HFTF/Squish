import { PRESETS } from '../config.js';
import { resolveCodecSupport } from './codec-support.js';
import { buildScaleFilter, getImageOutputDimensions, getOutputDimensions } from './sizing.js';
import {
  formatBitrate,
  resolveMp4EncodingProfile,
  resolveWebmEncodingProfile,
} from './video-delivery.js';

function getResolvedSupport(codecSupport) {
  return codecSupport?.formats
    ? codecSupport
    : resolveCodecSupport([]);
}

function getEnabledSelection(selection) {
  return {
    enabledTierIds: new Set(selection?.tiers ?? PRESETS.tiers.map((tier) => tier.id)),
    enabledFormatIds: new Set(selection?.formats ?? Object.keys(PRESETS.formats)),
  };
}

function buildOpaqueMp4Variant(baseName, tier, dimensions, resolvedSupport, metadata) {
  const mp4Format = PRESETS.formats.mp4;
  const mp4Support = resolvedSupport.formats?.mp4 ?? {};
  const mp4VideoProfile = mp4Support.videoProfile ?? mp4Format.videoProfiles[0];
  const mp4AudioProfile = mp4Support.audioProfile ?? mp4Format.audioProfiles[0];
  const mp4Profile = resolveMp4EncodingProfile(tier.id, dimensions, metadata.fps);

  return {
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
}

function buildOpaqueWebmVariant(baseName, tier, dimensions, resolvedSupport, metadata, includeReferenceVariant) {
  const webmFormat = PRESETS.formats.webm;
  const webmSupport = resolvedSupport.formats?.webm ?? {};
  const webmVideoProfile = webmSupport.videoProfile ?? webmFormat.videoProfiles[0];
  const webmAudioProfile = webmSupport.audioProfile ?? webmFormat.audioProfiles[0];
  const webmProfile = resolveWebmEncodingProfile(tier.id, dimensions, metadata.fps);
  const referenceVariant = includeReferenceVariant
    ? {
      ...buildOpaqueMp4Variant(baseName, tier, dimensions, resolvedSupport, metadata),
      internalOnly: true,
      filename: `${baseName}-${tier.id}-reference.mp4`,
    }
    : null;

  return {
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
    referenceVariant,
    skipSizeGuard: false,
    threadCount: 0,
  };
}

function buildAlphaWebmVariant(baseName, tier, dimensions, resolvedSupport, metadata) {
  const webmFormat = PRESETS.formats.webm;
  const webmSupport = resolvedSupport.formats?.webm ?? {};
  const alphaWebmSupport = resolvedSupport.alphaTargets?.webm ?? {};
  const webmVideoProfile = alphaWebmSupport.supported
    ? {
      encoder: alphaWebmSupport.encoder,
      label: alphaWebmSupport.label,
    }
    : (webmSupport.videoProfile ?? webmFormat.videoProfiles[0]);
  const webmAudioProfile = webmSupport.audioProfile ?? webmFormat.audioProfiles[0];
  const webmProfile = resolveWebmEncodingProfile(tier.id, dimensions, metadata.fps);

  return {
    mediaKind: 'video',
    executionMode: alphaWebmSupport.executionMode || 'single-pass-alpha-webm',
    id: `${tier.id}-webm-alpha`,
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
    rungId: webmProfile.rungId,
    fpsBand: webmProfile.fpsBand,
    alphaArgs: alphaWebmSupport.args ?? [],
    audioArgs: webmProfile.audioArgs,
    filterChain: `${buildScaleFilter(dimensions)},format=${PRESETS.alphaVideo.webmPixelFormat}`,
    verifyAlpha: true,
    threadCount: 0,
  };
}

function buildSafariAlphaMp4Variant(baseName, tier, dimensions, resolvedSupport, metadata) {
  const safariSupport = resolvedSupport.alphaTargets?.safari;

  if (!safariSupport?.supported) {
    return null;
  }

  const mp4Format = PRESETS.formats.mp4;
  const mp4Support = resolvedSupport.formats?.mp4 ?? {};
  const mp4AudioProfile = mp4Support.audioProfile ?? mp4Format.audioProfiles[0];
  const mp4Profile = resolveMp4EncodingProfile(tier.id, dimensions, metadata.fps);

  return {
    mediaKind: 'video',
    executionMode: 'single-pass-alpha-hevc',
    id: `${tier.id}-mp4-alpha`,
    tierId: tier.id,
    tierLabel: tier.label,
    formatId: mp4Format.id,
    formatLabel: mp4Format.label,
    filename: `${baseName}-${tier.id}.${mp4Format.extension}`,
    mimeType: mp4Format.mimeType,
    dimensions,
    videoCodec: safariSupport.encoder,
    videoCodecLabel: safariSupport.label,
    audioCodec: mp4AudioProfile.encoder,
    audioCodecLabel: mp4AudioProfile.label,
    audioBitrate: mp4Profile.audioBitrate,
    bitrateBps: mp4Profile.maxrateBps,
    alphaOptionName: safariSupport.optionName,
    alphaOptionValue: safariSupport.optionValue,
    filterChain: `${buildScaleFilter(dimensions)},format=${safariSupport.pixelFormat}`,
    baseArgs: safariSupport.baseArgs,
    threadCount: null,
  };
}

export function buildVideoVariantPlan(baseName, metadata, codecSupport = null, selection = null) {
  const resolvedSupport = getResolvedSupport(codecSupport);
  const { enabledTierIds, enabledFormatIds } = getEnabledSelection(selection);

  return PRESETS.tiers.flatMap((tier) => {
    if (!enabledTierIds.has(tier.id)) {
      return [];
    }

    const dimensions = getOutputDimensions(metadata.width, metadata.height, tier.cap);
    const variants = [];

    if (enabledFormatIds.has('mp4')) {
      variants.push(buildOpaqueMp4Variant(baseName, tier, dimensions, resolvedSupport, metadata));
    }

    if (enabledFormatIds.has('webm')) {
      variants.push(buildOpaqueWebmVariant(
        baseName,
        tier,
        dimensions,
        resolvedSupport,
        metadata,
        !enabledFormatIds.has('mp4'),
      ));
    }

    return variants;
  });
}

function buildAlphaVideoVariantPlan(baseName, metadata, codecSupport = null, selection = null) {
  const resolvedSupport = getResolvedSupport(codecSupport);
  const { enabledTierIds, enabledFormatIds } = getEnabledSelection(selection);
  const warnings = [];
  const errors = [];

  if (!metadata.hasAlpha) {
    warnings.push('Has alpha was turned on, but this source appears opaque. Using the normal video pipeline.');
    return {
      variants: buildVideoVariantPlan(baseName, metadata, resolvedSupport, selection),
      warnings,
      errors,
    };
  }

  let skippedSafariAlpha = false;
  let skippedWebmAlpha = false;

  const variants = PRESETS.tiers.flatMap((tier) => {
    if (!enabledTierIds.has(tier.id)) {
      return [];
    }

    const dimensions = getOutputDimensions(metadata.width, metadata.height, tier.cap);
    const tierVariants = [];

    if (enabledFormatIds.has('webm')) {
      if (resolvedSupport.alphaTargets?.webm?.supported) {
        tierVariants.push(buildAlphaWebmVariant(baseName, tier, dimensions, resolvedSupport, metadata));
      } else {
        skippedWebmAlpha = true;
      }
    }

    if (enabledFormatIds.has('mp4')) {
      const safariVariant = buildSafariAlphaMp4Variant(baseName, tier, dimensions, resolvedSupport, metadata);

      if (safariVariant) {
        tierVariants.push(safariVariant);
      } else {
        skippedSafariAlpha = true;
      }
    }

    return tierVariants;
  });

  if (skippedWebmAlpha) {
    warnings.push('Alpha WebM output is unavailable in this FFmpeg build.');
  }

  if (skippedSafariAlpha) {
    warnings.push('Safari alpha MP4 output is unavailable in this FFmpeg build. This usually requires macOS FFmpeg with hevc_videotoolbox, so the selected MP4 alpha outputs were skipped.');
  }

  if (!variants.some((variant) => variant.mediaKind === 'video')) {
    errors.push('No alpha video outputs remain. Enable WebM or turn off Has alpha.');
  }

  return {
    variants,
    warnings,
    errors,
  };
}

export function buildPosterVariant(baseName, metadata, codecSupport = null) {
  const resolvedSupport = getResolvedSupport(codecSupport);
  const format = PRESETS.poster.format;
  const support = resolvedSupport.images?.webp ?? {};
  const profile = support.videoProfile ?? PRESETS.images.format.videoProfiles[0];

  if (!support.supported || !profile) {
    return null;
  }

  return {
    mediaKind: 'image',
    executionMode: 'single-pass',
    id: 'poster-webp',
    tierId: 'poster',
    tierLabel: 'Poster',
    formatId: format.id,
    formatLabel: format.label,
    filename: `${baseName}-poster.${format.extension}`,
    mimeType: format.mimeType,
    dimensions: getImageOutputDimensions(metadata.width, metadata.height, PRESETS.poster.cap),
    videoCodec: profile.encoder,
    videoCodecLabel: profile.label,
    quality: format.quality,
    compressionLevel: format.compressionLevel,
    baseArgs: profile.baseArgs,
    optional: true,
    threadCount: 0,
  };
}

export function buildVideoJobPlan({
  baseName,
  metadata,
  codecSupport = null,
  selection = null,
  alphaRequested = false,
  posterRequested = false,
}) {
  const resolvedSupport = getResolvedSupport(codecSupport);
  const warnings = [];
  const errors = [];
  const variants = [];

  if (posterRequested) {
    const posterVariant = buildPosterVariant(baseName, metadata, resolvedSupport);

    if (posterVariant) {
      variants.push(posterVariant);
    } else {
      warnings.push('Poster image was requested, but this FFmpeg build cannot create WebP posters.');
    }
  }

  const videoPlan = alphaRequested
    ? buildAlphaVideoVariantPlan(baseName, metadata, resolvedSupport, selection)
    : {
      variants: buildVideoVariantPlan(baseName, metadata, resolvedSupport, selection),
      warnings: [],
      errors: [],
    };

  variants.push(...videoPlan.variants);
  warnings.push(...videoPlan.warnings);
  errors.push(...videoPlan.errors);

  return {
    variants,
    warnings,
    errors,
  };
}

export function buildImageVariantPlan(baseName, metadata, codecSupport = null, selection = null) {
  const resolvedSupport = codecSupport?.images
    ? codecSupport
    : resolveCodecSupport([]);
  const format = PRESETS.images.format;
  const support = resolvedSupport.images?.webp ?? {};
  const videoProfile = support.videoProfile ?? format.videoProfiles[0];
  const enabledTierIds = new Set(selection?.tiers ?? PRESETS.tiers.map((tier) => tier.id));

  return PRESETS.tiers
    .filter((tier) => enabledTierIds.has(tier.id))
    .map((tier) => ({
      mediaKind: 'image',
      executionMode: 'single-pass',
      id: `${tier.id}-webp`,
      tierId: tier.id,
      tierLabel: tier.label,
      formatId: format.id,
      formatLabel: format.label,
      filename: `${baseName}-${tier.id}.${format.extension}`,
      mimeType: format.mimeType,
      dimensions: getImageOutputDimensions(metadata.width, metadata.height, tier.cap),
      videoCodec: videoProfile.encoder,
      videoCodecLabel: videoProfile.label,
      quality: format.quality,
      compressionLevel: format.compressionLevel,
      baseArgs: videoProfile.baseArgs,
      threadCount: 0,
    }));
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
      '-map',
      '0:v:0',
      '-an',
      '-vf',
      variant.filterChain ?? buildScaleFilter(variant.dimensions, { setSampleAspectRatio: false }),
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
    variant.filterChain ?? buildScaleFilter(variant.dimensions),
    '-c:v',
    variant.videoCodec,
  ];

  if (resolvedThreadCount !== null && resolvedThreadCount !== undefined) {
    command.push('-threads', String(resolvedThreadCount));
  }

  if (variant.executionMode === 'single-pass-alpha-hevc') {
    command.push(
      ...variant.baseArgs,
      `-${variant.alphaOptionName}`,
      String(variant.alphaOptionValue),
      '-b:v',
      formatBitrate(variant.bitrateBps),
      '-c:a',
      variant.audioCodec,
      '-b:a',
      variant.audioBitrate,
      '-y',
      outputName,
    );

    return command;
  }

  if (variant.executionMode === 'single-pass-alpha-webm') {
    command.push(
      '-pix_fmt',
      PRESETS.alphaVideo.webmPixelFormat,
      ...variant.alphaArgs,
      '-crf',
      String(variant.crf),
      '-b:v',
      '0',
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
