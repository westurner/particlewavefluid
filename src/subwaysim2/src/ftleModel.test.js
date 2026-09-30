import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFtle, integrateTrajectory, sampleFtleGrid, velocityAt } from './ftleModel.js';

test('affine saddle recovers its analytic FTLE and incompressible volume', () => {
  const rate = 0.7;
  const result = evaluateFtle((point, time) => velocityAt('saddle', point, time, { rate }), [0.4, -0.2], 0, 2, { steps: 120 });
  assert.ok(Math.abs(result.ftle - rate) < 1e-7);
  assert.ok(Math.abs(result.determinantF - 1) < 1e-7);
  assert.ok(result.ridgeConfidence > 0.98);
});

test('rigid rotation has zero FTLE and preserves volume', () => {
  const result = evaluateFtle((point, time) => velocityAt('rotation', point, time, { rate: 1.2 }), [0.8, 0.3], 0, 1.5, { steps: 160 });
  assert.ok(Math.abs(result.ftle) < 1e-7);
  assert.ok(Math.abs(result.determinantF - 1) < 1e-7);
  assert.ok(result.ridgeConfidence < 1e-7);
});

test('backward integration reverses an affine trajectory', () => {
  const sampler = (point, time) => velocityAt('saddle', point, time, { rate: 0.5 });
  const forward = integrateTrajectory(sampler, [0.5, 0.5], 0, 1, 100);
  const backward = integrateTrajectory(sampler, forward.finalPoint, 1, -1, 100);
  assert.ok(Math.hypot(backward.finalPoint[0] - 0.5, backward.finalPoint[1] - 0.5) < 1e-9);
});

test('FTLE grid returns finite deformation diagnostics', () => {
  const grid = sampleFtleGrid((point, time) => velocityAt('double-gyre', point, time), { minX: 0, maxX: 2, minY: 0, maxY: 1 }, [8, 5], 0, 1, { steps: 30 });
  assert.equal(grid.samples.length, 40);
  grid.samples.forEach((sample) => {
    assert.ok(Number.isFinite(sample.ftle));
    assert.ok(Number.isFinite(sample.determinantF));
  });
});