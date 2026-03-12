import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, buildVideoVariantPlan } from '../src/lib/commands.js';

describe('buildFfmpegArgs', () => {
  it('builds web-optimized x264 MP4 args with VBV and +faststart', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'output.mp4',
      variant: {
        mediaKind: 'video',
        executionMode: 'single-pass',
        formatId: 'mp4',
        dimensions: { width: 1280, height: 720 },
        videoCodec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '96k',
        crf: 23,
        maxrateBps: 2_800_000,
        bufsizeBps: 5_600_000,
        baseArgs: ['-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '240'],
      },
    });

    expect(args).toContain('+faststart');
    expect(args).toContain('slow');
    expect(args).toContain('high');
    expect(args).toContain('-maxrate');
    expect(args).toContain('2800k');
    expect(args).toContain('-bufsize');
    expect(args).toContain('5600k');
  });

  it('maps audio optionally so silent videos still succeed', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'output.mp4',
      variant: {
        mediaKind: 'video',
        executionMode: 'single-pass',
        formatId: 'mp4',
        dimensions: { width: 854, height: 480 },
        videoCodec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '64k',
        crf: 25,
        maxrateBps: 1_600_000,
        bufsizeBps: 3_200_000,
        baseArgs: ['-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '240'],
      },
    });

    expect(args).toContain('0:a?');
  });

  it('builds VP9 pass 1 args with constrained-quality rate control', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'NUL',
      phase: { pass: 1 },
      passlogFile: 'temp-passlog',
      rateControl: {
        targetBps: 1_100_000,
        minrateBps: 550_000,
        maxrateBps: 1_595_000,
        bufsizeBps: 2_200_000,
        crf: 33,
      },
      variant: {
        mediaKind: 'video',
        executionMode: 'vp9-two-pass',
        formatId: 'webm',
        dimensions: { width: 1280, height: 720 },
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        audioBitrate: '64k',
        tileColumns: 1,
        commonArgs: ['-pix_fmt', 'yuv420p', '-quality', 'good', '-row-mt', '1', '-frame-parallel', '1'],
        pass1Args: ['-speed', '4'],
        pass2Args: ['-speed', '1', '-auto-alt-ref', '1', '-lag-in-frames', '25'],
        audioArgs: ['-application', 'audio', '-vbr', 'on'],
      },
    });

    expect(args).toContain('-pass');
    expect(args).toContain('1');
    expect(args).toContain('-an');
    expect(args).toContain('-speed');
    expect(args).toContain('4');
    expect(args).toContain('-b:v');
    expect(args).toContain('1100k');
    expect(args).toContain('-maxrate');
    expect(args).toContain('1595k');
  });

  it('builds VP9 pass 2 args with Opus audio', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'output.webm',
      phase: { pass: 2 },
      passlogFile: 'temp-passlog',
      rateControl: {
        targetBps: 700_000,
        minrateBps: 350_000,
        maxrateBps: 1_015_000,
        bufsizeBps: 1_400_000,
        crf: 35,
      },
      variant: {
        mediaKind: 'video',
        executionMode: 'vp9-two-pass',
        formatId: 'webm',
        dimensions: { width: 854, height: 480 },
        videoCodec: 'libvpx-vp9',
        audioCodec: 'libopus',
        audioBitrate: '48k',
        tileColumns: 1,
        commonArgs: ['-pix_fmt', 'yuv420p', '-quality', 'good', '-row-mt', '1', '-frame-parallel', '1'],
        pass1Args: ['-speed', '4'],
        pass2Args: ['-speed', '1', '-auto-alt-ref', '1', '-lag-in-frames', '25'],
        audioArgs: ['-application', 'audio', '-vbr', 'on'],
      },
    });

    expect(args).toContain('-pass');
    expect(args).toContain('2');
    expect(args).toContain('-c:a');
    expect(args).toContain('libopus');
    expect(args).toContain('-application');
    expect(args).toContain('-b:a');
    expect(args).toContain('48k');
    expect(args).not.toContain('-an');
  });

  it('adds an explicit thread count only when requested', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'output.mp4',
      threadCount: 4,
      variant: {
        mediaKind: 'video',
        executionMode: 'single-pass',
        formatId: 'mp4',
        dimensions: { width: 1280, height: 720 },
        videoCodec: 'libx264',
        audioCodec: 'aac',
        audioBitrate: '96k',
        crf: 23,
        maxrateBps: 2_800_000,
        bufsizeBps: 5_600_000,
        baseArgs: ['-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '240'],
      },
    });

    expect(args).toContain('-threads');
    expect(args[args.indexOf('-threads') + 1]).toBe('4');
  });

  it('builds single-frame WebP args for image jobs', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.png',
      outputName: 'output.webp',
      variant: {
        mediaKind: 'image',
        formatId: 'webp',
        dimensions: { width: 1280, height: 853 },
        videoCodec: 'libwebp',
        quality: 82,
        compressionLevel: 6,
        baseArgs: ['-lossless', '0', '-preset', 'photo'],
        threadCount: 0,
      },
    });

    expect(args).toContain('-frames:v');
    expect(args).toContain('1');
    expect(args).toContain('libwebp');
    expect(args).toContain('-quality');
    expect(args).toContain('-compression_level');
    expect(args).toContain('-threads');
    expect(args[args.indexOf('-threads') + 1]).toBe('0');
  });

  it('builds only the selected video format-tier combinations', () => {
    const variants = buildVideoVariantPlan(
      'clip',
      { width: 1920, height: 1080, duration: 10, fps: 30 },
      null,
      { formats: ['webm'], tiers: ['720p', '480p'] },
    );

    expect(variants).toHaveLength(2);
    expect(variants.map((variant) => variant.id)).toEqual(['720p-webm', '480p-webm']);
    expect(variants[0].referenceVariant?.internalOnly).toBe(true);
    expect(variants[0].referenceVariant?.formatId).toBe('mp4');
  });
});
