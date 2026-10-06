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
  evaluateGeneralRelativityPair,
  evaluateNBodyAmplitudeGravity,
  integrateNBodyVelocityVerlet,
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

test('gravity softening preserves sub-AU physical scales while clamping singular zero input', () => {
  assert.equal(sanitizeAmplitudeGravity({ softening: 1e-8 }).softening, 1e-8);
  assert.equal(sanitizeAmplitudeGravity({ softening: 0 }).softening, 1e-9);
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

test('GR pair acceleration has the Newtonian limit and the standard 1PN circular correction', () => {
  const input = { positionFirst: [2, 0, 0], positionSecond: [0, 0, 0], velocityFirst: [0, 1, 0], velocitySecond: [0, 0, 0], massFirst: 1, massSecond: 0 };
  const newtonianLimit = evaluateGeneralRelativityPair(input, { mode: 'general-relativity', gravitationalConstant: 1, grSpeedOfLight: 1e9, softening: 1e-9 });
  const expectedNewtonian = evaluateGeneralRelativityPair(input, { mode: 'general-relativity', gravitationalConstant: 1, grSpeedOfLight: 1e9, softening: 1e-9 }).newtonian;
  assert.ok(Math.hypot(...newtonianLimit.generalRelativity.map((value, axis) => value - expectedNewtonian[axis])) < 1e-15);

  const circularSpeed = Math.sqrt(1 / 2);
  const circular = evaluateGeneralRelativityPair({ ...input, velocityFirst: [0, circularSpeed, 0] }, {
    mode: 'general-relativity', gravitationalConstant: 1, grSpeedOfLight: 1000, softening: 0
  });
  const expectedRadialCorrection = -circular.newtonian[0] * 3 / (2 * 1000 ** 2);
  assert.ok(Math.abs(circular.pnCorrection[0] - expectedRadialCorrection) < 1e-12);
  assert.equal(circular.pnCorrection[1], 0);
});

test('GR normed tensor-Gaussian splatter is trace-normalized, bounded, and tends to 1PN GR at the core', () => {
  const input = { positionFirst: [0.5, 0, 0], positionSecond: [0, 0, 0], velocityFirst: [0.2, 0.4, 0], velocitySecond: [0, 0, 0], massFirst: 1, massSecond: 0 };
  const gr = evaluateGeneralRelativityPair(input, { mode: 'general-relativity', gravitationalConstant: 1, grSpeedOfLight: 100, softening: 0.001 });
  const splatter = evaluateGeneralRelativityPair(input, { mode: 'gr-normed-tensor-gaussian', gravitationalConstant: 1, grSpeedOfLight: 100, grTensorGaussianWaist: 2, softening: 0.001 });
  assert.ok(Math.abs(splatter.normalizedTensor.flat().filter((_, index) => index % 4 === 0).reduce((sum, value) => sum + value, 0) - 3) < 1e-12);
  assert.ok(splatter.tensorGaussian > 0 && splatter.tensorGaussian <= 1);
  assert.ok(Math.hypot(...splatter.pnCorrection) <= Math.hypot(...gr.pnCorrection) * 1.01);
  const far = evaluateGeneralRelativityPair({ ...input, positionFirst: [20, 0, 0] }, { mode: 'gr-normed-tensor-gaussian', gravitationalConstant: 1, grSpeedOfLight: 100, grTensorGaussianWaist: 0.1, softening: 0.001 });
  assert.ok(Math.hypot(...far.pnCorrection) < 1e-12);
});

test('pairwise GR corrections preserve total momentum in the N-body model', () => {
  const result = evaluateNBodyAmplitudeGravity([
    { position: [-1, 0, 0], velocity: [0, -0.2, 0], mass: 1 },
    { position: [1, 0, 0], velocity: [0, 0.2, 0], mass: 1e-6 }
  ], { mode: 'general-relativity', gravitationalConstant: 1, grSpeedOfLight: 100 });
  result.forceResidual.forEach((component) => assert.ok(Math.abs(component) < 1e-12));
  assert.ok(result.maximumDifference > 0);
});

test('substepped velocity-Verlet keeps a Newtonian circular orbit energy-bounded', () => {
  const gravitationalConstant = 4 * Math.PI ** 2;
  const bodies = [
    { position: [0, 0, 0], velocity: [0, 0, 0], mass: 1 },
    { position: [1, 0, 0], velocity: [0, 2 * Math.PI, 0], mass: 1e-6 }
  ];
  const configuration = { mode: 'newtonian', gravitationalConstant, softening: 1e-6 };
  const initialPotential = evaluateNBodyAmplitudeGravity(bodies, configuration).potential;
  const initialInvariants = calculateSystemInvariants(bodies, initialPotential);
  let callbacks = 0;
  const integration = integrateNBodyVelocityVerlet(bodies, 1, configuration, { afterDrift: () => { callbacks += 1; } });
  const finalPotential = evaluateNBodyAmplitudeGravity(bodies, configuration).potential;
  const finalInvariants = calculateSystemInvariants(bodies, finalPotential);
  assert.equal(integration.substeps, 1000);
  assert.equal(callbacks, integration.substeps);
  assert.ok(Math.abs((finalInvariants.totalEnergy - initialInvariants.totalEnergy) / initialInvariants.totalEnergy) < 1e-5);
});

test('the 1PN two-body orbit advances periapsis in the direction predicted by GR', () => {
  const gravitationalConstant = 4 * Math.PI ** 2;
  const semiMajorAxis = 0.4;
  const eccentricity = 0.2;
  const speedOfLight = 800;
  const orbitalPeriod = 2 * Math.PI * Math.sqrt(semiMajorAxis ** 3 / gravitationalConstant);
  const stepCountPerOrbit = 1000;
  const step = orbitalPeriod / stepCountPerOrbit;
  const bodies = [
    { position: [0, 0, 0], velocity: [0, 0, 0], mass: 1 },
    {
      position: [semiMajorAxis * (1 - eccentricity), 0, 0],
      velocity: [0, Math.sqrt(gravitationalConstant * (1 + eccentricity) / (semiMajorAxis * (1 - eccentricity))), 0],
      mass: 1e-12
    }
  ];
  const configuration = { mode: 'general-relativity', gravitationalConstant, grSpeedOfLight: speedOfLight, softening: 1e-12 };
  let acceleration = evaluateNBodyAmplitudeGravity(bodies, configuration).accelerations[1];
  let previousRadialVelocity = 0;
  let periapsisAngles = [];
  const orbitCount = 4;
  for (let index = 0; index < stepCountPerOrbit * orbitCount; index += 1) {
    const position = bodies[1].position;
    const velocity = bodies[1].velocity;
    const positionBefore = [...position];
    const velocityBefore = [...velocity];
    for (let axis = 0; axis < 3; axis += 1) {
      position[axis] += velocity[axis] * step + 0.5 * acceleration[axis] * step ** 2;
      velocity[axis] += 0.5 * acceleration[axis] * step;
    }
    const nextAcceleration = evaluateNBodyAmplitudeGravity(bodies, configuration).accelerations[1];
    for (let axis = 0; axis < 3; axis += 1) velocity[axis] += 0.5 * nextAcceleration[axis] * step;
    const radiusNow = Math.hypot(...position);
    const radialVelocity = position.reduce((sum, component, axis) => sum + component * velocity[axis], 0) / radiusNow;
    if (previousRadialVelocity < 0 && radialVelocity >= 0) {
      const fraction = previousRadialVelocity / (previousRadialVelocity - radialVelocity);
      const periapsis = positionBefore.map((component, axis) => component + (position[axis] - component) * fraction);
      let angle = Math.atan2(periapsis[1], periapsis[0]);
      const previousAngle = periapsisAngles.at(-1) ?? 0;
      while (angle <= previousAngle + Math.PI) angle += 2 * Math.PI;
      periapsisAngles.push(angle);
    }
    previousRadialVelocity = radialVelocity;
    acceleration = nextAcceleration;
  }
  assert.equal(periapsisAngles.length, orbitCount - 1);
  const measuredAdvance = periapsisAngles.at(-1) / (orbitCount - 1) - 2 * Math.PI;
  const expectedAdvance = 6 * Math.PI * gravitationalConstant / (semiMajorAxis * (1 - eccentricity ** 2) * speedOfLight ** 2);
  assert.ok(measuredAdvance > 0, `expected prograde periapsis advance, received ${measuredAdvance}`);
  assert.ok(Math.abs(measuredAdvance - expectedAdvance) / expectedAdvance < 0.08, `expected ${expectedAdvance}, received ${measuredAdvance}`);
});

test('gravituhedron hypothesis approaches the reference at long range', () => {
  const configuration = { mode: 'gravituhedron', coupling: 1, correctionRange: 2 };
  const near = evaluateAmplitudeChannels({ distance: 1 }, configuration);
  const far = evaluateAmplitudeChannels({ distance: 20 }, configuration);
  assert.ok(near.relativeDifference > far.relativeDifference);
});

test('DDF tensor-Gaussian amplitude mode is normalized and reverts to the reference outside its waist', () => {
  const configuration = { mode: 'ddf-tensor-gaussian', tensorGaussianWaist: 2, ddfStrength: 1, ddfSpeedLimitMS: 8, ddfBaseViscosity: 0.02 };
  const near = evaluateAmplitudeChannels({ distance: 0.5, speedMS: 7 }, configuration);
  const far = evaluateAmplitudeChannels({ distance: 20, speedMS: 7 }, configuration);
  assert.ok(near.tensorGaussian > far.tensorGaussian);
  assert.ok(near.ddfMobility < 1);
  assert.equal(far.selectedKernel, far.spin2Tree);
  assert.ok(near.tensorGaussian <= 1);
});

test('DDF amplitude settings sanitize hypothesis inputs', () => {
  const settings = sanitizeAmplitudeGravity({ mode: 'ddf-tensor-gaussian', tensorGaussianWaist: 0, ddfStrength: 100, ddfSpeedLimitMS: 0, ddfBaseViscosity: -2 });
  assert.equal(settings.tensorGaussianWaist, 1e-6);
  assert.equal(settings.ddfStrength, 20);
  assert.equal(settings.ddfSpeedLimitMS, 0.1);
  assert.equal(settings.ddfBaseViscosity, 0);
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