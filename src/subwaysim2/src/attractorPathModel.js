export const ATTRACTOR_PATH_SAMPLE_RATE = 24;
export const ATTRACTOR_PATH_HISTORY_SECONDS = 12;
export const ATTRACTOR_PATH_HISTORY_CAPACITY = ATTRACTOR_PATH_SAMPLE_RATE * ATTRACTOR_PATH_HISTORY_SECONDS + 1;

export const DEFAULT_ATTRACTOR_PATH_SETTINGS = Object.freeze({
  attractorPathsVisible: false,
  attractorPathLength: 6,
  attractorPathColor: '#ffc85a',
  attractorPathOpacity: 0.8
});

export function sanitizeAttractorPathSettings(value = {}) {
  const length = Number(value.attractorPathLength ?? DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathLength);
  const opacity = Number(value.attractorPathOpacity ?? DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathOpacity);
  return {
    attractorPathsVisible: value.attractorPathsVisible === undefined
      ? DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathsVisible
      : Boolean(value.attractorPathsVisible),
    attractorPathLength: Number.isFinite(length) ? Math.min(ATTRACTOR_PATH_HISTORY_SECONDS, Math.max(1, length)) : DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathLength,
    attractorPathColor: typeof value.attractorPathColor === 'string' && /^#[\da-f]{6}$/i.test(value.attractorPathColor)
      ? value.attractorPathColor.toLowerCase()
      : DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathColor,
    attractorPathOpacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathOpacity
  };
}

export function createAttractorPathHistory(attractorCapacity) {
  return new Float32Array(attractorCapacity * ATTRACTOR_PATH_HISTORY_CAPACITY * 3);
}

export function appendAttractorPathSample(history, attractors, nextIndex) {
  const sampleIndex = nextIndex % ATTRACTOR_PATH_HISTORY_CAPACITY;
  for (let attractorIndex = 0; attractorIndex < attractors.length; attractorIndex += 1) {
    const offset = (attractorIndex * ATTRACTOR_PATH_HISTORY_CAPACITY + sampleIndex) * 3;
    const position = attractors[attractorIndex].position;
    history[offset] = position[0];
    history[offset + 1] = position[1];
    history[offset + 2] = position[2];
  }
  return (sampleIndex + 1) % ATTRACTOR_PATH_HISTORY_CAPACITY;
}

export function writeAttractorPathSegments(target, history, nextIndex, sampleCount, attractorCount, visiblePointCount) {
  const pointCount = Math.min(sampleCount, visiblePointCount, ATTRACTOR_PATH_HISTORY_CAPACITY);
  if (pointCount < 2) return 0;
  const firstSample = (nextIndex - pointCount + ATTRACTOR_PATH_HISTORY_CAPACITY) % ATTRACTOR_PATH_HISTORY_CAPACITY;
  let outputOffset = 0;

  for (let attractorIndex = 0; attractorIndex < attractorCount; attractorIndex += 1) {
    const historyOffset = attractorIndex * ATTRACTOR_PATH_HISTORY_CAPACITY * 3;
    for (let pointIndex = 1; pointIndex < pointCount; pointIndex += 1) {
      const previousSample = (firstSample + pointIndex - 1) % ATTRACTOR_PATH_HISTORY_CAPACITY;
      const currentSample = (firstSample + pointIndex) % ATTRACTOR_PATH_HISTORY_CAPACITY;
      const previousOffset = historyOffset + previousSample * 3;
      const currentOffset = historyOffset + currentSample * 3;
      target[outputOffset] = history[previousOffset];
      target[outputOffset + 1] = history[previousOffset + 1];
      target[outputOffset + 2] = history[previousOffset + 2];
      target[outputOffset + 3] = history[currentOffset];
      target[outputOffset + 4] = history[currentOffset + 1];
      target[outputOffset + 5] = history[currentOffset + 2];
      outputOffset += 6;
    }
  }
  return outputOffset / 3;
}