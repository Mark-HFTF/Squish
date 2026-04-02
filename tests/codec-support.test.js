import { describe, expect, it } from 'vitest';
import { resolveCodecSupport } from '../src/lib/codec-support.js';

describe('resolveCodecSupport', () => {
  it('requires the exact web-delivery codec set for video jobs', () => {
    const support = resolveCodecSupport(
      ['libx264', 'aac', 'libvpx-vp9', 'libopus', 'libwebp'],
      {
        alphaTargets: {
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
      },
    );

    expect(support.supported).toBe(true);
    expect(support.formats.mp4.videoProfile.encoder).toBe('libx264');
    expect(support.formats.webm.videoProfile.encoder).toBe('libvpx-vp9');
    expect(support.images.webp.videoProfile.encoder).toBe('libwebp');
    expect(support.alphaTargets.webm.supported).toBe(true);
    expect(support.alphaTargets.safari.supported).toBe(false);
  });

  it('prefers the dedicated VP8 alpha WebM encoder path when available', () => {
    const support = resolveCodecSupport(['libx264', 'aac', 'libvpx', 'libvpx-vp9', 'libopus', 'libwebp']);

    expect(support.alphaTargets.webm.supported).toBe(true);
    expect(support.alphaTargets.webm.encoder).toBe('libvpx');
  });

  it('reports unsupported builds when the required video encoders are missing', () => {
    const support = resolveCodecSupport(['libopenh264', 'aac', 'libvpx', 'libopus']);

    expect(support.supported).toBe(false);
    expect(support.errors[0]).toMatch(/mp4 video encoder/i);
  });

  it('keeps Safari alpha disabled unless explicitly verified by introspection', () => {
    const support = resolveCodecSupport(
      ['libx264', 'aac', 'libvpx-vp9', 'libopus', 'libwebp', 'hevc_videotoolbox'],
      {
        alphaTargets: {
          safari: {
            supported: true,
            encoder: 'hevc_videotoolbox',
            label: 'hevc_videotoolbox',
            optionName: 'alpha_quality',
            optionValue: '0.75',
            pixelFormat: 'bgra',
            baseArgs: ['-allow_sw', '1', '-tag:v', 'hvc1', '-movflags', '+faststart'],
          },
        },
      },
    );

    expect(support.alphaTargets.safari.supported).toBe(true);
    expect(support.alphaTargets.safari.encoder).toBe('hevc_videotoolbox');
  });
});
