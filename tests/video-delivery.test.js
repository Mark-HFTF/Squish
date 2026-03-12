import { describe, expect, it } from 'vitest';
import {
  calculateAverageBitrate,
  resolveFpsBand,
  resolveMp4EncodingProfile,
  resolvePixelAreaRung,
  resolveVp9AttemptRateControl,
  resolveWebmEncodingProfile,
} from '../src/lib/video-delivery.js';

describe('video delivery laddering', () => {
  it('uses pixel area so tall 720-high outputs fall into the 480 rung', () => {
    const rung = resolvePixelAreaRung({ width: 404, height: 720 });
    expect(rung.id).toBe('480');
  });

  it('splits fps bands at 30 fps', () => {
    expect(resolveFpsBand(30)).toBe('le30');
    expect(resolveFpsBand(59.94)).toBe('gt30');
  });

  it('resolves MP4 VBV caps from rung and fps', () => {
    const profile = resolveMp4EncodingProfile('720p', { width: 1280, height: 720 }, 60);

    expect(profile.maxrateBps).toBe(4_200_000);
    expect(profile.bufsizeBps).toBe(8_400_000);
    expect(profile.crf).toBe(23);
  });

  it('resolves VP9 baseline settings from rung and fps', () => {
    const profile = resolveWebmEncodingProfile('480p', { width: 854, height: 480 }, 24);

    expect(profile.baselineTargetBps).toBe(700_000);
    expect(profile.tileColumns).toBe(1);
    expect(profile.crf).toBe(35);
  });

  it('derives tighter retry budgets for VP9 size enforcement', () => {
    const variant = {
      baselineTargetBps: 1_100_000,
      crf: 33,
      retrySteps: [
        { targetMultiplier: 1, maxrateMultiplier: 1.45, bufsizeMultiplier: 2, crfOffset: 0 },
        { targetMultiplier: 0.85, maxrateMultiplier: 1.35, bufsizeMultiplier: 1.8, crfOffset: 2 },
        { targetMultiplier: 0.75, maxrateMultiplier: 1.25, bufsizeMultiplier: 1.6, crfOffset: 4 },
      ],
      mp4TargetRatio: 0.92,
      minrateRatio: 0.5,
    };

    const attemptOne = resolveVp9AttemptRateControl({
      variant,
      mp4AverageBitrateBps: 1_500_000,
      attemptIndex: 0,
    });
    const attemptThree = resolveVp9AttemptRateControl({
      variant,
      mp4AverageBitrateBps: 1_500_000,
      attemptIndex: 2,
    });

    expect(attemptOne.targetBps).toBe(1_100_000);
    expect(attemptThree.targetBps).toBe(825_000);
    expect(attemptThree.crf).toBe(37);
  });

  it('computes average bitrate from bytes and duration', () => {
    expect(calculateAverageBitrate(10_000_000, 20)).toBe(4_000_000);
  });
});
