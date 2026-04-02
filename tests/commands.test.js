import { describe, expect, it } from 'vitest';
import {
  buildFfmpegArgs,
  buildImageVariantPlan,
  buildPosterVariant,
  buildVideoJobPlan,
  buildVideoVariantPlan,
} from '../src/lib/commands.js';

const codecSupport = {
  supported: true,
  formats: {
    mp4: {
      videoProfile: { encoder: 'libx264', label: 'libx264' },
      audioProfile: { encoder: 'aac', label: 'AAC' },
    },
    webm: {
      videoProfile: { encoder: 'libvpx-vp9', label: 'libvpx-vp9' },
      audioProfile: { encoder: 'libopus', label: 'libopus' },
    },
  },
  images: {
    webp: {
      supported: true,
      videoProfile: { encoder: 'libwebp', label: 'libwebp', baseArgs: ['-lossless', '0', '-preset', 'photo'] },
    },
  },
  alphaTargets: {
    webm: {
      supported: true,
      encoder: 'libvpx',
      label: 'libvpx (VP8 alpha)',
      executionMode: 'single-pass-alpha-webm',
      args: ['-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0'],
    },
    safari: {
      supported: false,
      encoder: '',
      label: '',
      optionName: '',
      optionValue: '',
      pixelFormat: '',
      baseArgs: [],
    },
  },
};

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

    expect(args).toContain('-map');
    expect(args).toContain('0:v:0');
    expect(args).toContain('-an');
    expect(args).toContain('-frames:v');
    expect(args).toContain('1');
    expect(args).toContain('libwebp');
    expect(args).toContain('-quality');
    expect(args).toContain('-compression_level');
    expect(args).toContain('-threads');
    expect(args[args.indexOf('-threads') + 1]).toBe('0');
  });

  it('builds Safari alpha HEVC args when a verified encoder path is available', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'output.mp4',
      variant: {
        mediaKind: 'video',
        executionMode: 'single-pass-alpha-hevc',
        formatId: 'mp4',
        dimensions: { width: 1280, height: 720 },
        filterChain: 'scale=1280:720:flags=lanczos,setsar=1,format=bgra',
        videoCodec: 'hevc_videotoolbox',
        audioCodec: 'aac',
        audioBitrate: '96k',
        bitrateBps: 2_800_000,
        alphaOptionName: 'alpha_quality',
        alphaOptionValue: '0.75',
        baseArgs: ['-allow_sw', '1', '-tag:v', 'hvc1', '-movflags', '+faststart'],
      },
    });

    expect(args).toContain('hevc_videotoolbox');
    expect(args).toContain('-alpha_quality');
    expect(args).toContain('0.75');
    expect(args).toContain('hvc1');
    expect(args).toContain('+faststart');
  });

  it('builds WebM alpha args using the dedicated alpha WebM path', () => {
    const args = buildFfmpegArgs({
      inputName: 'input.mov',
      outputName: 'output.webm',
      variant: {
        mediaKind: 'video',
        executionMode: 'single-pass-alpha-webm',
        formatId: 'webm',
        dimensions: { width: 1280, height: 720 },
        filterChain: 'scale=1280:720:flags=lanczos,setsar=1,format=yuva420p',
        videoCodec: 'libvpx',
        audioCodec: 'libopus',
        audioBitrate: '64k',
        audioArgs: ['-application', 'audio', '-vbr', 'on'],
        alphaArgs: ['-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0'],
        crf: 31,
      },
    });

    expect(args).toContain('libvpx');
    expect(args).toContain('yuva420p');
    expect(args).toContain('-b:v');
    expect(args).toContain('0');
    expect(args).toContain('-auto-alt-ref');
    expect(args).toContain('0');
  });

  it('builds only the selected video format-tier combinations', () => {
    const variants = buildVideoVariantPlan(
      'clip',
      { width: 1920, height: 1080, duration: 10, fps: 30 },
      null,
      { formats: ['webm'], tiers: ['720p', '480p', '240p'] },
    );

    expect(variants).toHaveLength(3);
    expect(variants.map((variant) => variant.id)).toEqual(['720p-webm', '480p-webm', '240p-webm']);
    expect(variants[0].referenceVariant?.internalOnly).toBe(true);
    expect(variants[0].referenceVariant?.formatId).toBe('mp4');
  });

  it('builds only the selected image tier combinations', () => {
    const variants = buildImageVariantPlan(
      'still',
      { width: 2400, height: 1600 },
      codecSupport,
      { tiers: ['source', '480p', '240p'] },
    );

    expect(variants.map((variant) => variant.id)).toEqual(['source-webp', '480p-webp', '240p-webp']);
    expect(variants.map((variant) => variant.filename)).toEqual([
      'still-source.webp',
      'still-480p.webp',
      'still-240p.webp',
    ]);
    expect(variants[1].dimensions).toEqual({ width: 720, height: 480 });
    expect(variants[2].dimensions).toEqual({ width: 360, height: 240 });
  });

  it('builds alpha WebM variants and a poster when requested', () => {
    const plan = buildVideoJobPlan({
      baseName: 'clip',
      metadata: {
        width: 1920,
        height: 1080,
        duration: 10,
        fps: 30,
        hasAlpha: true,
      },
      codecSupport,
      selection: { formats: ['webm'], tiers: ['source', '720p'] },
      alphaRequested: true,
      posterRequested: true,
    });

    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.variants.map((variant) => variant.id)).toEqual(['poster-webp', 'source-webm-alpha', '720p-webm-alpha']);
    expect(plan.variants[1].videoCodec).toBe('libvpx');
    expect(plan.variants[1].executionMode).toBe('single-pass-alpha-webm');
    expect(plan.variants[1].verifyAlpha).toBe(true);
  });

  it('builds a poster-only variant with a -poster filename suffix', () => {
    const variant = buildPosterVariant(
      'clip',
      {
        width: 3840,
        height: 2160,
        duration: 10,
        fps: 30,
      },
      codecSupport,
    );

    expect(variant.filename).toBe('clip-poster.webp');
    expect(variant.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(variant.formatId).toBe('webp');
  });

  it('falls back to opaque outputs when alpha is requested on an opaque source', () => {
    const plan = buildVideoJobPlan({
      baseName: 'clip',
      metadata: {
        width: 1920,
        height: 1080,
        duration: 10,
        fps: 30,
        hasAlpha: false,
      },
      codecSupport,
      selection: { formats: ['mp4', 'webm'], tiers: ['source'] },
      alphaRequested: true,
      posterRequested: false,
    });

    expect(plan.errors).toEqual([]);
    expect(plan.warnings[0]).toMatch(/appears opaque/i);
    expect(plan.variants.map((variant) => variant.id)).toEqual(['source-mp4', 'source-webm']);
  });

  it('errors when alpha mode leaves no video deliverables', () => {
    const plan = buildVideoJobPlan({
      baseName: 'clip',
      metadata: {
        width: 1920,
        height: 1080,
        duration: 10,
        fps: 30,
        hasAlpha: true,
      },
      codecSupport,
      selection: { formats: ['mp4'], tiers: ['source'] },
      alphaRequested: true,
      posterRequested: false,
    });

    expect(plan.variants).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/Safari alpha MP4 output is unavailable/i);
    expect(plan.errors[0]).toMatch(/No alpha video outputs remain/i);
  });
});
