export const PARTICLE_PATH_SAMPLE_COUNT = 64;
export const PARTICLE_PATH_SAMPLE_RATE = 12;
export const PARTICLE_PATH_MAX_DURATION = 12;
export const PARTICLE_PATH_HISTORY_CAPACITY = PARTICLE_PATH_SAMPLE_RATE * PARTICLE_PATH_MAX_DURATION + 1;

export const DEFAULT_PARTICLE_PATH_SETTINGS = Object.freeze({
  particlePathsVisible: false,
  particlePathDuration: 6,
  particlePathColor: '#7de3dc',
  particlePathOpacity: 0.72
});

export function sanitizeParticlePathSettings(value = {}) {
  const duration = Number(value.particlePathDuration ?? DEFAULT_PARTICLE_PATH_SETTINGS.particlePathDuration);
  const opacity = Number(value.particlePathOpacity ?? DEFAULT_PARTICLE_PATH_SETTINGS.particlePathOpacity);
  return {
    particlePathsVisible: value.particlePathsVisible === undefined
      ? DEFAULT_PARTICLE_PATH_SETTINGS.particlePathsVisible
      : Boolean(value.particlePathsVisible),
    particlePathDuration: Number.isFinite(duration)
      ? Math.min(PARTICLE_PATH_MAX_DURATION, Math.max(1, duration))
      : DEFAULT_PARTICLE_PATH_SETTINGS.particlePathDuration,
    particlePathColor: typeof value.particlePathColor === 'string' && /^#[\da-f]{6}$/i.test(value.particlePathColor)
      ? value.particlePathColor.toLowerCase()
      : DEFAULT_PARTICLE_PATH_SETTINGS.particlePathColor,
    particlePathOpacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : DEFAULT_PARTICLE_PATH_SETTINGS.particlePathOpacity
  };
}

export function particlePathWindow(nextRow, sampleCount, duration) {
  const pointCount = Math.min(
    sampleCount,
    Math.round(duration * PARTICLE_PATH_SAMPLE_RATE) + 1,
    PARTICLE_PATH_HISTORY_CAPACITY
  );
  const firstRow = (nextRow - pointCount + PARTICLE_PATH_HISTORY_CAPACITY) % PARTICLE_PATH_HISTORY_CAPACITY;
  return {
    firstRow,
    pointCount,
    vertexCount: Math.max(0, pointCount - 1) * PARTICLE_PATH_SAMPLE_COUNT * 2
  };
}