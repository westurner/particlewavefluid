import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY,
  AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS,
  AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY,
  appendAmplitudeGravityPathSample,
  calculateSystemInvariants,
  calculateWeakFieldObservables,
  compareSystemInvariants,
  createPositiveGrassmannianCell,
  evaluateAmplitudeChannels,
  evaluateNBodyAmplitudeGravity,
  sanitizeAmplitudeGravity,
  writeAmplitudeGravityPathSegments,
  updateAmplitudeGravityStreamlines
} from './amplitudeGravityModel.js';

test('streamline settings are bounded and colors are validated', () => {
  const settings = sanitizeAmplitudeGravity({ showStreamlines: true, streamlineLength: 100, streamlineColor: 'red', streamlineOpacity: -1 });
  assert.equal(settings.showStreamlines, true);
  assert.equal(settings.streamlineLength, 24);
  assert.equal(settings.streamlineColor, '#59dbe0');
  assert.equal(settings.streamlineOpacity, 0);
});

test('streamline sampling reuses its buffer and honors configured length', () => {
  const bodies = [{ mass: 10, radius: 0.5, position: [0, 0, 0] }];
  const positions = new Float32Array(AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY * AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS * 6);
  const result = updateAmplitudeGravityStreamlines(positions, bodies, { mode: 'newtonian', streamlineLength: 4 });
  assert.equal(result, positions);
  for (let index = 0; index < positions.length; index += 1) assert.ok(Number.isFinite(positions[index]));
  const firstSegmentLength = Math.hypot(positions[3] - positions[0], positions[4] - positions[1], positions[5] - positions[2]);
  assert.ok(Math.abs(firstSegmentLength - 4 / AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS) < 1e-6);
});

test('attractor path segments stay chronological when the history buffer wraps', () => {
  const history = new Float32Array(AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY * 3);
  const target = new Float32Array((AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY - 1) * 6);
  const bodies = [{ position: [0, 0, 0] }];
  let nextIndex = 0;
  let sampleCount = 0;
  for (let sample = 0; sample < AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY + 2; sample += 1) {
    bodies[0].position[0] = sample;
    nextIndex = appendAmplitudeGravityPathSample(history, bodies, nextIndex);
    sampleCount = Math.min(sampleCount + 1, AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY);
  }
  const vertexCount = writeAmplitudeGravityPathSegments(target, history, nextIndex, sampleCount, 1, 3);
  assert.equal(vertexCount, 4);
  assert.deepEqual(Array.from(target.slice(0, 12)), [
    AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY - 1, 0, 0,
    AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY, 0, 0,
    AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY, 0, 0,
    AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY + 1, 0, 0
  ]);
});

test('positive cell has positive minors and satisfies the Plucker relation', () => {
  const cell = createPositiveGrassmannianCell({ cellGaps: [0.2, 0.7, 1.4], fourthColumnWeight: 1.3 });
  assert.equal(cell.positive, true);
  Object.values(cell.minors).forEach((minor) => assert.ok(minor > 0));
  assert.ok(Math.abs(cell.pluckerResidual) < 1e-12);
});

test('weak-field observables decrease with the relativistic scale', () => {
  const slowScale = calculateWeakFieldObservables({ centralMass: 12, semiMajorAxis: 3.2, eccentricity: 0.2, impactParameter: 4, asymptoticSpeed: 2 }, { speedOfLight: 20 });
  const largeScale = calculateWeakFieldObservables({ centralMass: 12, semiMajorAxis: 3.2, eccentricity: 0.2, impactParameter: 4, asymptoticSpeed: 2 }, { speedOfLight: 200 });
  assert.ok(slowScale.periapsisAdvanceRadians > largeScale.periapsisAdvanceRadians);
  assert.ok(slowScale.scatteringAngleRadians > largeScale.scatteringAngleRadians);
  assert.match(slowScale.sources.periapsis, /1PN/);
  assert.match(slowScale.sources.scattering, /1PM/);
});

test('system invariant comparison reports no drift for identical states', () => {
  const bodies = [{ mass: 2, position: [1, 0, 0], velocity: [0, 1, 0] }];
  const invariants = calculateSystemInvariants(bodies, -1);
  assert.deepEqual(compareSystemInvariants(invariants, invariants), {
    energyDrift: 0,
    momentumResidual: 0,
    angularMomentumResidual: 0
  });
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