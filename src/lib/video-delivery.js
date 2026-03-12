import { PRESETS } from '../config.js';

const LOW_FPS_BAND = 'le30';
const HIGH_FPS_BAND = 'gt30';

export function resolveFpsBand(fps, split = PRESETS.videoDelivery.fpsSplit) {
  return Number.isFinite(fps) && fps > split ? HIGH_FPS_BAND : LOW_FPS_BAND;
}

export function resolvePixelAreaRung(dimensions) {
  const area = dimensions.width * dimensions.height;
  const rung = PRESETS.videoDelivery.rungOrder.find(
    (candidate) => area <= candidate.width * candidate.height,
  );

  return rung ?? PRESETS.videoDelivery.rungOrder.at(-1);
}

export function formatBitrate(bps) {
  const safeBps = Number.isFinite(bps) && bps > 0 ? bps : 1_000;
  return `${Math.max(1, Math.round(safeBps / 1_000))}k`;
}

export function calculateAverageBitrate(bytes, durationSeconds) {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  return Math.round((bytes * 8) / durationSeconds);
}

export function resolveMp4EncodingProfile(tierId, dimensions, fps) {
  const rung = resolvePixelAreaRung(dimensions);
  const fpsBand = resolveFpsBand(fps);
  const vbv = PRESETS.videoDelivery.mp4.vbvByRung[rung.id][fpsBand];

  return {
    rungId: rung.id,
    fpsBand,
    crf: PRESETS.videoDelivery.mp4.crfByTier[tierId],
    audioBitrate: PRESETS.videoDelivery.mp4.audioBitrateByTier[tierId],
    maxrateBps: vbv.maxrate,
    bufsizeBps: vbv.bufsize,
    baseArgs: PRESETS.videoDelivery.mp4.baseArgs,
  };
}

export function resolveWebmEncodingProfile(tierId, dimensions, fps) {
  const rung = resolvePixelAreaRung(dimensions);
  const fpsBand = resolveFpsBand(fps);

  return {
    rungId: rung.id,
    fpsBand,
    tileColumns: rung.tileColumns,
    crf: PRESETS.videoDelivery.webm.crfByTier[tierId],
    audioBitrate: PRESETS.videoDelivery.webm.audioBitrateByTier[tierId],
    baselineTargetBps: PRESETS.videoDelivery.webm.targetBitrateByRung[rung.id][fpsBand],
    commonArgs: PRESETS.videoDelivery.webm.commonArgs,
    pass1Args: PRESETS.videoDelivery.webm.pass1Args,
    pass2Args: PRESETS.videoDelivery.webm.pass2Args,
    audioArgs: PRESETS.videoDelivery.webm.audioArgs,
    retrySteps: PRESETS.videoDelivery.webm.retrySteps,
    mp4TargetRatio: PRESETS.videoDelivery.webm.mp4TargetRatio,
    minrateRatio: PRESETS.videoDelivery.webm.minrateRatio,
  };
}

export function resolveVp9AttemptRateControl({
  variant,
  mp4AverageBitrateBps,
  attemptIndex,
}) {
  const step = variant.retrySteps[attemptIndex];

  if (!step) {
    throw new Error(`No VP9 retry step exists for attempt index ${attemptIndex}.`);
  }

  const sourceBudget = Number.isFinite(mp4AverageBitrateBps) && mp4AverageBitrateBps > 0
    ? Math.min(variant.baselineTargetBps, Math.round(mp4AverageBitrateBps * variant.mp4TargetRatio))
    : variant.baselineTargetBps;
  const targetBps = Math.max(1_000, Math.round(sourceBudget * step.targetMultiplier));

  return {
    targetBps,
    minrateBps: Math.max(1_000, Math.round(targetBps * variant.minrateRatio)),
    maxrateBps: Math.max(1_000, Math.round(targetBps * step.maxrateMultiplier)),
    bufsizeBps: Math.max(1_000, Math.round(targetBps * step.bufsizeMultiplier)),
    crf: variant.crf + step.crfOffset,
    attemptIndex,
  };
}

export function getVp9PhaseLabel(variant, attemptIndex, passNumber) {
  const retryPrefix = attemptIndex > 0 ? ` Retry ${attemptIndex}` : '';
  return `Encoding ${variant.tierLabel} ${variant.formatLabel}${retryPrefix} Pass ${passNumber}/2`;
}
