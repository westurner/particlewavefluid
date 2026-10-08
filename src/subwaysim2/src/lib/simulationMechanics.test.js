import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDdfMobility, calculateMaxwellStressTensor, calculateMaxwellTensorGaussian, calculateTensorGaussianWeight, calculateZoomCoupledFieldExtent, evaluateGeneralRelativityPair, evaluateGpeResponse, evaluateMechanicsResponse, evaluateRadialGeneralRelativity, evaluateRotationalGravityPair, evaluateSpinAxisTensorResponse, evaluateSpinPhaseResponse, evaluateSqgGpeResponse, GRAVITY_MODEL_LIBRARY, SIMPLE_ATTRACTOR_GRAVITY_FIELD_GLSL } from './simulationMechanics.js';

test('Maxwell tensor uses electric and magnetic energy and produces a normalized Gaussian weight', () => {
  const stress = calculateMaxwellStressTensor({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  assert.equal(stress.electricEnergy, 1);
  assert.equal(stress.magneticEnergy, 1);
  assert.equal(stress.energyDensity, 1);
  assert.equal(stress.tensor.length, 9);
  assert.equal(calculateMaxwellTensorGaussian({ x: 0.5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5).tensorGaussian, 0.125);
});

test('classical, DDF, and Grassmannian responses share bounded splat and acceleration scaling', () => {
  const classical = evaluateMechanicsResponse({ regime: 'classical', gaussianWeight: 0.8 });
  const ddf = evaluateMechanicsResponse({ regime: 'ddf-tensor-gaussian', gaussianWeight: 0.8, ddfMobility: 0.4 });
  const geometry = evaluateMechanicsResponse({ regime: 'grassmannian-amplituhedron', gaussianWeight: 0.8, grassmannianWeight: 0.5, geometryCoupling: 0.2 });
  assert.equal(classical.accelerationScale, 1);
  assert.ok(Math.abs(ddf.accelerationScale - 0.52) < 1e-12);
  assert.ok(Math.abs(ddf.splatWeight - 0.44) < 1e-12);
  assert.equal(evaluateMechanicsResponse({ regime: 'ddf-tensor-gaussian', gaussianWeight: 0, ddfMobility: 0.4 }).accelerationScale, 1);
  assert.ok(Math.abs(geometry.accelerationScale - 1.08) < 1e-12);
  assert.ok(Math.abs(geometry.splatWeight - 0.4) < 1e-12);
  assert.ok(evaluateMechanicsResponse({ regime: 'grassmannian-amplituhedron', geometryCoupling: 5 }).accelerationScale <= 1.25);
  assert.equal(evaluateMechanicsResponse({ regime: 'grassmannian-amplituhedron', gaussianWeight: 1, geometryCoupling: 5, geometryCouplingMax: 4 }).accelerationScale, 5);
});

test('shared DDF mobility increases with speed and agrees with the reduced field model', async () => {
  const { evaluateFieldModel } = await import('../mechanicsModels.js');
  const slow = calculateDdfMobility({ radiusM: 1, speedMS: 0.5, coreRadiusM: 0.8, speedLimitMS: 8, dilatancy: 1, baseViscosity: 0.02 });
  const fast = calculateDdfMobility({ radiusM: 1, speedMS: 7.9, coreRadiusM: 0.8, speedLimitMS: 8, dilatancy: 1, baseViscosity: 0.02 });
  assert.ok(fast < slow);
  assert.equal(slow, evaluateFieldModel('ddf', { radius: 1, speed: 0.5, magnitude: 1 }).ddfMobility);
});

test('gravity library registers the requested variants and composes SQG from GR plus GPE', () => {
  for (const id of ['gravituhedron', 'grassmannian-amplituhedron', 'sqg', 'sqg-tensor-gaussian', 'ddf', 'ddf-tensor-gaussian']) {
    assert.ok(GRAVITY_MODEL_LIBRARY[id]?.label, `${id} is registered`);
  }
  const gpe = evaluateGpeResponse(2, -3, { nonlinearCoupling: 0.25, dispersion: 0.5 });
  const sqg = evaluateSqgGpeResponse({ generalRelativityAcceleration: -4, amplitude: 2, laplacian: -3, nonlinearCoupling: 0.25, dispersion: 0.5 });
  assert.equal(sqg.acceleration, -4 + gpe);
  const localized = evaluateSqgGpeResponse({ generalRelativityAcceleration: -4, amplitude: 2, laplacian: -3, nonlinearCoupling: 0.25, dispersion: 0.5, tensorGaussianWeight: 0 });
  assert.equal(localized.acceleration, -4);
});

test('SQG spin-phase response is bounded, signed by axis alignment, and Gaussian-localized', () => {
  const aligned = evaluateSpinPhaseResponse({
    phaseGradient: [0, 0, 2], phaseVorticity: [0, 0, 1], spinAxis: [0, 0, 1], coupling: 0.5
  });
  const opposed = evaluateSpinPhaseResponse({
    phaseGradient: [0, 0, 2], phaseVorticity: [0, 0, 1], spinAxis: [0, 0, -1], coupling: 0.5
  });
  assert.ok(Math.abs(aligned.response - 7 / 12) < 1e-12);
  assert.ok(Math.abs(opposed.response + aligned.response) < 1e-12);
  assert.ok(Math.abs(evaluateSpinPhaseResponse({ phaseGradient: [0, 0, 100], phaseVorticity: [0, 0, 100], spinAxis: [0, 0, 1], coupling: 2 }).response) <= 4);

  const unwindowed = evaluateSqgGpeResponse({ generalRelativityAcceleration: -4, amplitude: 0, rotationalResponse: aligned.response });
  const windowedOut = evaluateSqgGpeResponse({ generalRelativityAcceleration: -4, amplitude: 0, rotationalResponse: aligned.response, tensorGaussianWeight: 0 });
  assert.equal(unwindowed.acceleration, -4 + aligned.response);
  assert.equal(windowedOut.acceleration, -4);
});

test('Gr(2,4) spin-axis tensor has bounded polar and equatorial limits', () => {
  assert.equal(evaluateSpinAxisTensorResponse({ spinAxis: [0, 1, 0], radialDirection: [0, 1, 0] }), 1);
  assert.equal(evaluateSpinAxisTensorResponse({ spinAxis: [0, 1, 0], radialDirection: [1, 0, 0] }), -0.5);
  const geometry = evaluateMechanicsResponse({
    regime: 'grassmannian-amplituhedron', gaussianWeight: 1, geometryCoupling: 0,
    spinAxisCoupling: 0.25, spinAxis: [0, 1, 0], radialDirection: [0, 1, 0]
  });
  assert.equal(geometry.accelerationScale, 1.25);
  assert.equal(geometry.spinAxisCorrection, 0.25);
  const capped = evaluateMechanicsResponse({
    regime: 'grassmannian-amplituhedron', gaussianWeight: 1, geometryCoupling: 0.2,
    spinAxisCoupling: 0.25, spinAxis: [0, 1, 0], radialDirection: [0, 1, 0]
  });
  assert.equal(capped.accelerationScale, 1.25);
  assert.ok(capped.spinAxisCorrection <= 0.05);
});

test('shared GR pair and radial response agree, and the tensor-Gaussian is bounded', () => {
  const pair = evaluateGeneralRelativityPair({ positionFirst: [2, 0, 0], positionSecond: [0, 0, 0], velocityFirst: [0, 0.5, 0], massFirst: 1, massSecond: 0 }, { gravitationalConstant: 1, grSpeedOfLight: 100, softening: 0 });
  const radial = evaluateRadialGeneralRelativity({ radius: 2, magnitude: 1, speed: 0.5, grSpeedOfLight: 100 });
  assert.equal(pair.generalRelativity[0], radial);
  assert.equal(calculateTensorGaussianWeight(0, 2), 1);
  assert.ok(calculateTensorGaussianWeight(20, 0.1) < 1e-12);
});

test('rotational pair correction has exact zero-spin/J2 baseline and separate terms', () => {
  const state = {
    positionFirst: [1, 0, 0], positionSecond: [0, 0, 0],
    velocityFirst: [0, 1, 0], velocitySecond: [0, 0, 0],
    massFirst: 0.2, massSecond: 1
  };
  const baseline = evaluateRotationalGravityPair(state);
  assert.deepEqual(baseline, { spinOrbit: [0, 0, 0], spinSpin: [0, 0, 0], j2: [0, 0, 0], total: [0, 0, 0] });
  const corrected = evaluateRotationalGravityPair({
    ...state,
    spinFirst: [0, 0, 0.01],
    spinSecond: [0, 0, 0.5],
    bodySecond: { j2: 0.01, equatorialRadius: 0.1, spinAxis: [0, 0, 1] }
  }, { gravitationalConstant: 1, speedOfLight: 100 });
  assert.ok(Math.hypot(...corrected.spinOrbit) > 0);
  assert.ok(Math.hypot(...corrected.spinSpin) > 0);
  assert.ok(Math.hypot(...corrected.j2) > 0);
  assert.deepEqual(corrected.total, corrected.spinOrbit.map((value, axis) => value + corrected.spinSpin[axis] + corrected.j2[axis]));
});

test('spin-orbit, spin-spin, and J2 corrections rotate covariantly with the system', () => {
  const rotateZ = ([x, y, z]) => [-y, x, z];
  const state = {
    positionFirst: [1, 2, 3], positionSecond: [-0.3, 0.2, 0.1],
    velocityFirst: [0.2, -0.4, 0.1], velocitySecond: [-0.1, 0.3, 0.2],
    massFirst: 0.4, massSecond: 1,
    spinFirst: [0.002, 0.001, 0.003], spinSecond: [-0.001, 0.004, 0.006],
    bodyFirst: { j2: 0.001, equatorialRadius: 0.2, spinAxis: [0, 1, 0] },
    bodySecond: { j2: 0.01, equatorialRadius: 0.5, spinAxis: [1, 0, 0] }
  };
  const original = evaluateRotationalGravityPair(state, { gravitationalConstant: 1, speedOfLight: 20 });
  const rotated = evaluateRotationalGravityPair({
    ...state,
    positionFirst: rotateZ(state.positionFirst), positionSecond: rotateZ(state.positionSecond),
    velocityFirst: rotateZ(state.velocityFirst), velocitySecond: rotateZ(state.velocitySecond),
    spinFirst: rotateZ(state.spinFirst), spinSecond: rotateZ(state.spinSecond),
    bodyFirst: { ...state.bodyFirst, spinAxis: rotateZ(state.bodyFirst.spinAxis) },
    bodySecond: { ...state.bodySecond, spinAxis: rotateZ(state.bodySecond.spinAxis) }
  }, { gravitationalConstant: 1, speedOfLight: 20 });
  for (const term of ['spinOrbit', 'spinSpin', 'j2', 'total']) {
    const expected = rotateZ(original[term]);
    assert.ok(Math.hypot(...rotated[term].map((value, axis) => value - expected[axis])) < 1e-12, `${term} should rotate with the coordinate system`);
  }
});

test('shared attractor shader contains bounded GR/GPE, DDF, and spin-aware Gr(2,4) branches', () => {
  for (const token of ['GRAVITY_CONSTANT * magnitude', 'boundedMagnitude', 'clamp(gpeResponse + spinPhaseResponse, -0.5, 0.5)', 'uGravitySpeedOfLight', 'uSpinPhaseCoupling', 'uSpinAxisCoupling', 'ddfSplatScale', 'geometryCorrection']) {
    assert.ok(SIMPLE_ATTRACTOR_GRAVITY_FIELD_GLSL.includes(token), `${token} is in the shared shader`);
  }
});
test('camera zoom leaves field bounds fixed by default and scales them only when enabled', () => {
  assert.equal(calculateZoomCoupledFieldExtent(8, 2.5), 8);
  assert.equal(calculateZoomCoupledFieldExtent(8, 2.5, false), 8);
  assert.equal(calculateZoomCoupledFieldExtent(8, 2.5, true), 20);
  assert.equal(calculateZoomCoupledFieldExtent(8, 99, true), 80);
});