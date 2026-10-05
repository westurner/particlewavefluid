import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDdfMobility, calculateMaxwellStressTensor, calculateMaxwellTensorGaussian, evaluateMechanicsResponse } from './simulationMechanics.js';

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