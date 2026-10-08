import assert from 'node:assert/strict';
import test from 'node:test';
import { compareModelVectors, rootMeanSquare, scoreWeightedNormalizedMetrics, summarizeModelDifference } from './model-comparison.js';

test('model comparison summarizes signed and absolute residuals', () => {
  assert.equal(rootMeanSquare([3, 4]), Math.sqrt(12.5));
  assert.deepEqual(summarizeModelDifference([1, 2], [2, 0]), {
    sampleCount: 2,
    meanDifference: -0.5,
    meanAbsoluteDifference: 1.5,
    rmsDifference: Math.sqrt(2.5),
    maximumAbsoluteDifference: 2,
    referenceRms: Math.sqrt(2.5),
    candidateRms: Math.sqrt(2),
    scorePoints: 100
  });
});

test('weighted normalized score renormalizes when a metric is unsupported', () => {
  assert.deepEqual(scoreWeightedNormalizedMetrics([
    { value: 10, tolerance: 10, weight: 0.5 },
    { value: 5, tolerance: 10, weight: 0.25 },
    { value: null, tolerance: 1, weight: 0.25 }
  ]), { scorePoints: 83.33333333333333, availableWeight: 0.75 });
});

test('vector model comparison reports per-sample absolute and relative deltas', () => {
  assert.deepEqual(compareModelVectors([[3, 4], [0, 3]], [[0, 0], [1, 3]]), [
    { absoluteDifference: 5, relativeDifference: 1 },
    { absoluteDifference: 1, relativeDifference: 1 / 3 }
  ]);
});

test('model comparison rejects incompatible or non-finite samples', () => {
  assert.throws(() => summarizeModelDifference([1], []), RangeError);
  assert.throws(() => summarizeModelDifference([NaN], [0]), TypeError);
  assert.throws(() => compareModelVectors([[1]], [[1, 2]]), RangeError);
});