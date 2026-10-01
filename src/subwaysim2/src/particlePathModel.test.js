import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PARTICLE_PATH_SETTINGS,
  PARTICLE_PATH_HISTORY_CAPACITY,
  PARTICLE_PATH_SAMPLE_COUNT,
  PARTICLE_PATH_SAMPLE_RATE,
  particlePathWindow,
  sanitizeParticlePathSettings
} from './particlePathModel.js';

test('particle path settings clamp duration and opacity and validate color', () => {
  const settings = sanitizeParticlePathSettings({
    particlePathsVisible: true,
    particlePathDuration: 50,
    particlePathColor: 'teal',
    particlePathOpacity: -1
  });
  assert.equal(settings.particlePathsVisible, true);
  assert.equal(settings.particlePathDuration, 12);
  assert.equal(settings.particlePathColor, DEFAULT_PARTICLE_PATH_SETTINGS.particlePathColor);
  assert.equal(settings.particlePathOpacity, 0);
});

test('particle path window selects the newest samples across circular wraparound', () => {
  const window = particlePathWindow(2, PARTICLE_PATH_HISTORY_CAPACITY, 1);
  assert.equal(window.firstRow, PARTICLE_PATH_HISTORY_CAPACITY + 2 - PARTICLE_PATH_SAMPLE_RATE - 1);
  assert.equal(window.pointCount, PARTICLE_PATH_SAMPLE_RATE + 1);
  assert.equal(window.vertexCount, PARTICLE_PATH_SAMPLE_RATE * PARTICLE_PATH_SAMPLE_COUNT * 2);
});