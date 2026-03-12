import path from 'node:path';

export function resolveJobOutputRoot({ inputPath, outputDirectory, baseName, saveBesideSource }) {
  if (saveBesideSource) {
    return path.dirname(inputPath);
  }

  if (!outputDirectory) {
    throw new Error('An output folder is required when Save beside source is off.');
  }

  return path.join(outputDirectory, baseName);
}
