import { describe, expect, it } from 'vitest';
import { getImageOutputDimensions, getOutputDimensions } from '../src/lib/sizing.js';

describe('getOutputDimensions', () => {
  it('fits landscape video inside a 720p bounding box', () => {
    expect(getOutputDimensions(1920, 1080, { width: 1280, height: 720 })).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('preserves a vertical aspect ratio inside a 720p bounding box', () => {
    expect(getOutputDimensions(1080, 1920, { width: 1280, height: 720 })).toEqual({
      width: 404,
      height: 720,
    });
  });

  it('preserves square sources instead of forcing a widescreen ratio', () => {
    expect(getOutputDimensions(1000, 1000, { width: 1280, height: 720 })).toEqual({
      width: 720,
      height: 720,
    });
  });

  it('does not upscale sources that already fit inside the cap', () => {
    expect(getOutputDimensions(640, 360, { width: 1280, height: 720 })).toEqual({
      width: 640,
      height: 360,
    });
  });

  it('rounds odd source dimensions down to even integers', () => {
    expect(getOutputDimensions(1919, 1079, null)).toEqual({
      width: 1918,
      height: 1078,
    });
  });

  it('keeps image dimensions inside an HD cap without forcing even values', () => {
    expect(getImageOutputDimensions(1501, 1001, { width: 1920, height: 1080 })).toEqual({
      width: 1501,
      height: 1001,
    });
  });

  it('fits tall images inside an HD bounding box while preserving aspect ratio', () => {
    expect(getImageOutputDimensions(2400, 3600, { width: 1920, height: 1080 })).toEqual({
      width: 720,
      height: 1080,
    });
  });
});
