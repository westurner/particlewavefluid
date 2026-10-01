import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATTRACTOR_PATH_HISTORY_CAPACITY,
  DEFAULT_ATTRACTOR_PATH_SETTINGS,
  appendAttractorPathSample,
  createAttractorPathHistory,
  sanitizeAttractorPathSettings,
  writeAttractorPathSegments
} from './attractorPathModel.js';

test('attractor path settings are bounded and colors are validated', () => {
  const settings = sanitizeAttractorPathSettings({
    attractorPathsVisible: true,
    attractorPathLength: 30,
    attractorPathColor: 'red',
    attractorPathOpacity: -1
  });
  assert.equal(settings.attractorPathsVisible, true);
  assert.equal(settings.attractorPathLength, 12);
  assert.equal(settings.attractorPathColor, DEFAULT_ATTRACTOR_PATH_SETTINGS.attractorPathColor);
  assert.equal(settings.attractorPathOpacity, 0);
});

test('attractor paths remain separate and chronological through history wraparound', () => {
  const attractors = [{ position: [0, 1, 2] }, { position: [10, 11, 12] }];
  const history = createAttractorPathHistory(attractors.length);
  const target = new Float32Array(2 * (ATTRACTOR_PATH_HISTORY_CAPACITY - 1) * 6);
  let nextIndex = 0;
  let sampleCount = 0;
  for (let sample = 0; sample < ATTRACTOR_PATH_HISTORY_CAPACITY + 2; sample += 1) {
    attractors[0].position[0] = sample;
    attractors[1].position[0] = sample + 10;
    nextIndex = appendAttractorPathSample(history, attractors, nextIndex);
    sampleCount = Math.min(sampleCount + 1, ATTRACTOR_PATH_HISTORY_CAPACITY);
  }
  const vertexCount = writeAttractorPathSegments(target, history, nextIndex, sampleCount, 2, 3);
  assert.equal(vertexCount, 8);
  assert.deepEqual(Array.from(target.slice(0, 12)), [
    ATTRACTOR_PATH_HISTORY_CAPACITY - 1, 1, 2,
    ATTRACTOR_PATH_HISTORY_CAPACITY, 1, 2,
    ATTRACTOR_PATH_HISTORY_CAPACITY, 1, 2,
    ATTRACTOR_PATH_HISTORY_CAPACITY + 1, 1, 2
  ]);
  assert.deepEqual(Array.from(target.slice(12, 24)), [
    ATTRACTOR_PATH_HISTORY_CAPACITY + 9, 11, 12,
    ATTRACTOR_PATH_HISTORY_CAPACITY + 10, 11, 12,
    ATTRACTOR_PATH_HISTORY_CAPACITY + 10, 11, 12,
    ATTRACTOR_PATH_HISTORY_CAPACITY + 11, 11, 12
  ]);
});