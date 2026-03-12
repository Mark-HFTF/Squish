function floorToEven(value) {
  const floored = Math.floor(value);
  const even = floored % 2 === 0 ? floored : floored - 1;

  if (even < 2) {
    throw new Error('Video dimensions are too small after even normalization.');
  }

  return even;
}

function floorToInteger(value) {
  const floored = Math.floor(value);

  if (floored < 1) {
    throw new Error('Dimensions are too small after normalization.');
  }

  return floored;
}

export function getFittedDimensions(sourceWidth, sourceHeight, cap, { even = false } = {}) {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Source dimensions must be positive numbers.');
  }

  const scale = cap
    ? Math.min(1, cap.width / sourceWidth, cap.height / sourceHeight)
    : 1;

  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;

  return {
    width: even ? floorToEven(fittedWidth) : floorToInteger(fittedWidth),
    height: even ? floorToEven(fittedHeight) : floorToInteger(fittedHeight),
  };
}

export function getOutputDimensions(sourceWidth, sourceHeight, cap) {
  return getFittedDimensions(sourceWidth, sourceHeight, cap, { even: true });
}

export function getImageOutputDimensions(sourceWidth, sourceHeight, cap) {
  return getFittedDimensions(sourceWidth, sourceHeight, cap, { even: false });
}

export function buildScaleFilter(dimensions, { setSampleAspectRatio = true } = {}) {
  const filters = [`scale=${dimensions.width}:${dimensions.height}:flags=lanczos`];

  if (setSampleAspectRatio) {
    filters.push('setsar=1');
  }

  return filters.join(',');
}
