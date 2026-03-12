import { describe, expect, it } from 'vitest';
import { calculateJobProgress } from '../src/lib/progress.js';

describe('calculateJobProgress', () => {
  it('aggregates finished variants plus active progress across six outputs', () => {
    expect(calculateJobProgress(2, 0.5, 6)).toBeCloseTo(2.5 / 6);
  });

  it('clamps completed jobs to 100 percent', () => {
    expect(calculateJobProgress(6, 0.5, 6)).toBe(1);
  });
});
