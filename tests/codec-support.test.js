import { describe, expect, it } from 'vitest';
import { resolveCodecSupport } from '../src/lib/codec-support.js';

describe('resolveCodecSupport', () => {
  it('requires the exact web-delivery codec set for video jobs', () => {
    const support = resolveCodecSupport(['libx264', 'aac', 'libvpx-vp9', 'libopus', 'libwebp']);

    expect(support.supported).toBe(true);
    expect(support.formats.mp4.videoProfile.encoder).toBe('libx264');
    expect(support.formats.webm.videoProfile.encoder).toBe('libvpx-vp9');
    expect(support.images.webp.videoProfile.encoder).toBe('libwebp');
  });

  it('reports unsupported builds when the required video encoders are missing', () => {
    const support = resolveCodecSupport(['libopenh264', 'aac', 'libvpx', 'libopus']);

    expect(support.supported).toBe(false);
    expect(support.errors[0]).toMatch(/mp4 video encoder/i);
  });
});
