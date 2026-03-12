import { describe, expect, it } from 'vitest';
import { resolveJobOutputRoot } from '../electron/output-paths.js';

describe('resolveJobOutputRoot', () => {
  it('writes into the chosen output folder when save-beside-source is off', () => {
    expect(resolveJobOutputRoot({
      inputPath: 'C:\\clips\\shot-01.mp4',
      outputDirectory: 'E:\\CompressedVideos',
      baseName: 'shot-01',
      saveBesideSource: false,
    })).toBe('E:\\CompressedVideos\\shot-01');
  });

  it('writes beside the source file when save-beside-source is on', () => {
    expect(resolveJobOutputRoot({
      inputPath: 'C:\\clips\\shot-01.mp4',
      outputDirectory: 'E:\\CompressedVideos',
      baseName: 'shot-01',
      saveBesideSource: true,
    })).toBe('C:\\clips');
  });
});
