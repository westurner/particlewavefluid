import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPositiveGrassmannianCell,
  evaluateAmplitudeChannels,
  evaluateNBodyAmplitudeGravity
} from './amplitudeGravityModel.js';

test('positive cell has positive minors and satisfies the Plucker relation', () => {
  const cell = createPositiveGrassmannianCell({ cellGaps: [0.2, 0.7, 1.4], fourthColumnWeight: 1.3 });
  assert.equal(cell.positive, true);
  Object.values(cell.minors).forEach((minor) => assert.ok(minor > 0));
  assert.ok(Math.abs(cell.pluckerResidual) < 1e-12);
});

test('Newtonian mode matches the spin-2 reference kernel', () => {
  const channels = evaluateAmplitudeChannels(
    { distance: 2, massProduct: 6, chargeProduct: -2 },
    { mode: 'newtonian', gravitationalConstant: 1, softening: 0.1 }
  );
  assert.equal(channels.selectedKernel, channels.spin2Tree);
  assert.ok(channels.photonExchange < 0);
});

test('gravituhedron hypothesis approaches the reference at long range', () => {
  const configuration = { mode: 'gravituhedron', coupling: 1, correctionRange: 2 };
  const near = evaluateAmplitudeChannels({ distance: 1 }, configuration);
  const far = evaluateAmplitudeChannels({ distance: 20 }, configuration);
  assert.ok(near.relativeDifference > far.relativeDifference);
});

test('N-body pair forces conserve total momentum', () => {
  const result = evaluateNBodyAmplitudeGravity([
    { position: [-2, 0, 0], mass: 2, charge: 1 },
    { position: [1, 0.5, 0], mass: 3, charge: -1 },
    { position: [0, -1, 1], mass: 0.5, charge: 0 }
  ], { mode: 'gravituhedron', coupling: 0.8 });
  result.forceResidual.forEach((component) => assert.ok(Math.abs(component) < 1e-12));
  assert.equal(result.accelerations.length, 3);
  assert.ok(Number.isFinite(result.potential));
});