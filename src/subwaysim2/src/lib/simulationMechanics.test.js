import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDdfMobility, calculateMaxwellStressTensor, calculateMaxwellTensorGaussian, calculateTensorGaussianWeight, calculateZoomCoupledFieldExtent, evaluateGeneralRelativityPair, evaluateGpeResponse, evaluateMechanicsResponse, evaluateRadialGeneralRelativity, evaluateSqgGpeResponse, GRAVITY_MODEL_LIBRARY, SIMPLE_ATTRACTOR_GRAVITY_FIELD_GLSL } from './simulationMechanics.js';

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

test('shared GR pair and radial response agree, and the tensor-Gaussian is bounded', () => {
  const pair = evaluateGeneralRelativityPair({ positionFirst: [2, 0, 0], positionSecond: [0, 0, 0], velocityFirst: [0, 0.5, 0], massFirst: 1, massSecond: 0 }, { gravitationalConstant: 1, grSpeedOfLight: 100, softening: 0 });
  const radial = evaluateRadialGeneralRelativity({ radius: 2, magnitude: 1, speed: 0.5, grSpeedOfLight: 100 });
  assert.equal(pair.generalRelativity[0], radial);
  assert.equal(calculateTensorGaussianWeight(0, 2), 1);
  assert.ok(calculateTensorGaussianWeight(20, 0.1) < 1e-12);
});

test('shared attractor shader contains the canonical GR/GPE, DDF, and Gr(2,4) branches', () => {
  for (const token of ['uGravitySpeedOfLight', 'gpeLaplacian', 'ddfSplatScale', 'geometryCorrection']) {
    assert.ok(SIMPLE_ATTRACTOR_GRAVITY_FIELD_GLSL.includes(token), `${token} is in the shared shader`);
  }
});
test('camera zoom leaves field bounds fixed by default and scales them only when enabled', () => {
  assert.equal(calculateZoomCoupledFieldExtent(8, 2.5), 8);
  assert.equal(calculateZoomCoupledFieldExtent(8, 2.5, false), 8);
  assert.equal(calculateZoomCoupledFieldExtent(8, 2.5, true), 20);
  assert.equal(calculateZoomCoupledFieldExtent(8, 99, true), 80);
});