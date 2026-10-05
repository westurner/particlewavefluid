import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBlackHoleStarField, createBlackHoleParticleSeed, createBlackHoleStarField } from './blackHoleStarModel.js';

const configuration = {
  attractorMassExponent: 7,
  particleGlobalMassExponent: 4,
  spinningStrength: 2.75,
  maxSpeed: 8,
  velocityDamping: 0.1,
  timeScale: 1
};

function createAttractor(overrides = {}) {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    magnitude: 1,
    blackHole: {
      eventHorizonShear: 10,
      fractureThreshold: 25,
      rotationSpeed: 1,
      testStarEccentricity: 0.8,
      thermalNoise: 2,
      orbitRadius: 8,
      orbitVerticalAmplitude: 0.5,
      fractureIntensity: 1,
      ...overrides
    }
  };
}

test('black-hole particle seed has finite 3D thickness and tangential orbital motion', () => {
  const seeds = Array.from({ length: 256 }, (_, index) => createBlackHoleParticleSeed(index, 256));
  const verticalPositions = seeds.map(({ position }) => position[1]);
  const verticalVelocities = seeds.map(({ velocity }) => velocity[1]);
  assert.ok(seeds.every(({ position, velocity, massFraction }) => [...position, ...velocity, massFraction].every(Number.isFinite)));
  assert.ok(Math.max(...verticalPositions) - Math.min(...verticalPositions) > 2);
  assert.ok(Math.max(...verticalVelocities) - Math.min(...verticalVelocities) > 0.02);
  seeds.forEach(({ position, velocity }) => {
    assert.ok(Math.abs(position[0] * velocity[0] + position[2] * velocity[2]) < 1e-9);
  });
});

test('black-hole star splats begin on the configured orbit with finite velocities', () => {
  const field = createBlackHoleStarField(createAttractor(), configuration, 24);

  assert.equal(field.count, 24);
  assert.ok(field.center[0] > 0);
  assert.ok(field.centerVelocity[2] > 0);
  assert.ok([...field.positions, ...field.velocities, ...field.masses].every(Number.isFinite));
  assert.ok(field.massFraction > field.count * 0.45 && field.massFraction < field.count);
});

test('star orbit responds to configured attractor mass and simulation time scale', () => {
  const attractor = createAttractor();
  const fastConfiguration = { ...configuration, attractorMassExponent: 8 };
  const initial = createBlackHoleStarField(attractor, configuration, 8);
  const heavier = createBlackHoleStarField(attractor, fastConfiguration, 8);
  assert.ok(heavier.centerVelocity[2] > initial.centerVelocity[2]);

  const paused = createBlackHoleStarField(attractor, { ...configuration, timeScale: 0 }, 8);
  const originalPosition = [...paused.center];
  advanceBlackHoleStarField(paused, attractor, { ...configuration, timeScale: 0 }, 1 / 60);
  assert.deepEqual([...paused.center], originalPosition);
});

test('high tidal stress sheds star-splat mass', () => {
  const attractor = createAttractor({ eventHorizonShear: 300, fractureThreshold: 0.1, fractureIntensity: 4 });
  const field = createBlackHoleStarField(attractor, configuration, 32);
  const initialMassFraction = field.massFraction;

  for (let frame = 0; frame < 120; frame += 1) {
    advanceBlackHoleStarField(field, attractor, configuration, 1 / 60);
  }

  assert.ok(field.massFraction < initialMassFraction);
});

test('moving an attractor carries its star field with it', () => {
  const field = createBlackHoleStarField(createAttractor(), configuration, 8);
  const before = [...field.center];
  const moved = createAttractor();
  moved.position = [2, -1, 3];

  advanceBlackHoleStarField(field, moved, configuration, 0.001);

  assert.ok(Math.abs((field.center[0] - before[0]) - 2) < 0.01);
  assert.ok(Math.abs((field.center[1] - before[1]) + 1) < 0.01);
  assert.ok(Math.abs((field.center[2] - before[2]) - 3) < 0.01);
});

test('moving a paused attractor still carries its star field without advancing the orbit', () => {
  const attractor = createAttractor();
  const pausedConfiguration = { ...configuration, timeScale: 0 };
  const field = createBlackHoleStarField(attractor, pausedConfiguration, 8);
  const initialCenter = [...field.center];
  const initialPositions = [...field.positions];
  attractor.position = [1, 2, -1];

  advanceBlackHoleStarField(field, attractor, pausedConfiguration, 1 / 60);

  const expectedCenter = [initialCenter[0] + 1, initialCenter[1] + 2, initialCenter[2] - 1];
  field.center.forEach((value, index) => assert.ok(Math.abs(value - expectedCenter[index]) < 1e-5));
  field.positions.forEach((value, index) => {
    const expectedPosition = initialPositions[index] + [1, 2, -1][index % 3];
    assert.ok(Math.abs(value - expectedPosition) < 1e-5);
  });
});