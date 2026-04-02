export const PRESETS = {
  totalVariants: 8,
  tiers: [
    { id: 'source', label: 'Source', cap: null },
    { id: '720p', label: '720p', cap: { width: 1280, height: 720 } },
    { id: '480p', label: '480p', cap: { width: 854, height: 480 } },
    { id: '240p', label: '240p', cap: { width: 426, height: 240 } },
  ],
  formats: {
    mp4: {
      id: 'mp4',
      label: 'MP4',
      extension: 'mp4',
      mimeType: 'video/mp4',
      videoProfiles: [{ encoder: 'libx264', label: 'libx264' }],
      audioProfiles: [{ encoder: 'aac', label: 'AAC' }],
    },
    webm: {
      id: 'webm',
      label: 'WebM',
      extension: 'webm',
      mimeType: 'video/webm',
      videoProfiles: [{ encoder: 'libvpx-vp9', label: 'libvpx-vp9' }],
      audioProfiles: [{ encoder: 'libopus', label: 'libopus' }],
    },
  },
  videoDelivery: {
    fpsSplit: 30,
    rungOrder: [
      { id: '240', width: 426, height: 240, tileColumns: 1 },
      { id: '360', width: 640, height: 360, tileColumns: 1 },
      { id: '480', width: 854, height: 480, tileColumns: 1 },
      { id: '720', width: 1280, height: 720, tileColumns: 1 },
      { id: '1080', width: 1920, height: 1080, tileColumns: 2 },
      { id: '1440', width: 2560, height: 1440, tileColumns: 2 },
      { id: '2160', width: 3840, height: 2160, tileColumns: 2 },
    ],
    mp4: {
      baseArgs: [
        '-preset',
        'slow',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-g',
        '240',
      ],
      crfByTier: {
        source: 21,
        '720p': 23,
        '480p': 25,
        '240p': 27,
      },
      audioBitrateByTier: {
        source: '128k',
        '720p': '96k',
        '480p': '64k',
        '240p': '48k',
      },
      vbvByRung: {
        '240': {
          le30: { maxrate: 500_000, bufsize: 1_000_000 },
          gt30: { maxrate: 750_000, bufsize: 1_500_000 },
        },
        '360': {
          le30: { maxrate: 900_000, bufsize: 1_800_000 },
          gt30: { maxrate: 1_300_000, bufsize: 2_600_000 },
        },
        '480': {
          le30: { maxrate: 1_600_000, bufsize: 3_200_000 },
          gt30: { maxrate: 2_400_000, bufsize: 4_800_000 },
        },
        '720': {
          le30: { maxrate: 2_800_000, bufsize: 5_600_000 },
          gt30: { maxrate: 4_200_000, bufsize: 8_400_000 },
        },
        '1080': {
          le30: { maxrate: 5_000_000, bufsize: 10_000_000 },
          gt30: { maxrate: 7_500_000, bufsize: 15_000_000 },
        },
        '1440': {
          le30: { maxrate: 8_000_000, bufsize: 16_000_000 },
          gt30: { maxrate: 12_000_000, bufsize: 24_000_000 },
        },
        '2160': {
          le30: { maxrate: 14_000_000, bufsize: 28_000_000 },
          gt30: { maxrate: 22_000_000, bufsize: 44_000_000 },
        },
      },
    },
    webm: {
      commonArgs: ['-pix_fmt', 'yuv420p', '-quality', 'good', '-row-mt', '1', '-frame-parallel', '1'],
      pass1Args: ['-speed', '4'],
      pass2Args: ['-speed', '1', '-auto-alt-ref', '1', '-lag-in-frames', '25'],
      audioArgs: ['-application', 'audio', '-vbr', 'on'],
      crfByTier: {
        source: 31,
        '720p': 33,
        '480p': 35,
        '240p': 37,
      },
      audioBitrateByTier: {
        source: '96k',
        '720p': '64k',
        '480p': '48k',
        '240p': '32k',
      },
      targetBitrateByRung: {
        '240': {
          le30: 260_000,
          gt30: 400_000,
        },
        '360': {
          le30: 450_000,
          gt30: 700_000,
        },
        '480': {
          le30: 700_000,
          gt30: 1_000_000,
        },
        '720': {
          le30: 1_100_000,
          gt30: 1_800_000,
        },
        '1080': {
          le30: 2_000_000,
          gt30: 3_000_000,
        },
        '1440': {
          le30: 3_500_000,
          gt30: 5_500_000,
        },
        '2160': {
          le30: 7_000_000,
          gt30: 11_000_000,
        },
      },
      retrySteps: [
        {
          targetMultiplier: 1,
          maxrateMultiplier: 1.45,
          bufsizeMultiplier: 2,
          crfOffset: 0,
        },
        {
          targetMultiplier: 0.85,
          maxrateMultiplier: 1.35,
          bufsizeMultiplier: 1.8,
          crfOffset: 2,
        },
        {
          targetMultiplier: 0.75,
          maxrateMultiplier: 1.25,
          bufsizeMultiplier: 1.6,
          crfOffset: 4,
        },
      ],
      mp4TargetRatio: 0.92,
      minrateRatio: 0.5,
    },
  },
  images: {
    totalVariants: 1,
    cap: { width: 1920, height: 1080 },
    format: {
      id: 'webp',
      label: 'WebP',
      extension: 'webp',
      mimeType: 'image/webp',
      quality: 82,
      compressionLevel: 6,
      videoProfiles: [
        {
          encoder: 'libwebp',
          label: 'libwebp',
          baseArgs: ['-lossless', '0', '-preset', 'photo'],
        },
        {
          encoder: 'libwebp_anim',
          label: 'libwebp_anim',
          baseArgs: ['-lossless', '0'],
        },
      ],
    },
  },
  poster: {
    cap: { width: 1920, height: 1080 },
    format: {
      id: 'webp',
      label: 'WebP',
      extension: 'webp',
      mimeType: 'image/webp',
      quality: 82,
      compressionLevel: 6,
    },
  },
  alphaVideo: {
    webmPixelFormat: 'yuva420p',
    webmProfiles: [
      {
        encoder: 'libvpx',
        label: 'libvpx (VP8 alpha)',
        executionMode: 'single-pass-alpha-webm',
        args: ['-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0'],
      },
      {
        encoder: 'libvpx-vp9',
        label: 'libvpx-vp9 (VP9 alpha)',
        executionMode: 'single-pass-alpha-webm',
        args: ['-deadline', 'good', '-row-mt', '1', '-frame-parallel', '1', '-speed', '2', '-auto-alt-ref', '0', '-lag-in-frames', '0'],
      },
    ],
    safari: {
      videotoolbox: {
        encoder: 'hevc_videotoolbox',
        encoderLabel: 'hevc_videotoolbox',
        optionName: 'alpha_quality',
        optionValue: '0.75',
        pixelFormat: 'bgra',
        baseArgs: ['-allow_sw', '1', '-tag:v', 'hvc1', '-movflags', '+faststart'],
      },
    },
  },
};
