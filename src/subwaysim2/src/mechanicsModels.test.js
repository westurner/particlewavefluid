import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFieldModels,
  DEFAULT_FIELD_MECHANICS,
  evaluateEffectiveViscosity,
  evaluateFieldModel,
  evaluateGpeResponse,
  fieldModelIndex,
  fluidModelIndex,
  quantumTransportIndex,
  sanitizeFieldMechanics
} from './mechanicsModels.js';

test('field model indices stay synchronized with shader selectors', () => {
  assert.equal(fieldModelIndex('newtonian'), 0);
  assert.equal(fieldModelIndex('ns-compressible'), 1);
  assert.equal(fieldModelIndex('ns-incompressible'), 2);
  assert.equal(fieldModelIndex('sqg'), 3);
  assert.equal(fieldModelIndex('ddf'), 4);
  assert.equal(fluidModelIndex('hbn-farnesane'), 1);
  assert.equal(quantumTransportIndex('gpe'), 1);
});

test('Navier-Stokes experiments distinguish compressible volume change from incompressible projection', () => {
  const state = { radius: 2, speed: 1, magnitude: 1, rotation: 0.5 };
  const compressible = evaluateFieldModel('ns-compressible', state);
  const incompressible = evaluateFieldModel('ns-incompressible', state);

  assert.ok(compressible.divergence < 0);
  assert.ok(compressible.volumeChangeRate < 0);
  assert.equal(incompressible.divergence, 0);
  assert.equal(incompressible.volumeChangeRate, 0);
  assert.equal(compressible.quantumPressure, 0);
  assert.equal(incompressible.quantumPressure, 0);
});

test('nanofluid and DDF constitutive modes respond oppositely to shear', () => {
  const state = { baseViscosity: 0.012, speed: 6, lengthScale: 0.85, temperature: 80, strength: 1, speedLimit: 8 };
  const baseline = evaluateEffectiveViscosity('baseline', state);
  assert.ok(evaluateEffectiveViscosity('hbn-farnesane', state) < baseline);
  assert.ok(evaluateEffectiveViscosity('ddf', state) > baseline);
});

test('GPE response combines cubic nonlinearity and dispersive curvature', () => {
  assert.equal(evaluateGpeResponse(2, -3, { nonlinearCoupling: 0.25, dispersion: 0.5 }), 1.5);
  assert.equal(evaluateGpeResponse(2, -3), 2);
});

test('SQG quantum pressure regularizes the model core', () => {
  const nearCore = evaluateFieldModel('sqg', { radius: 0.1, speed: 0, magnitude: 1 });
  const farField = evaluateFieldModel('sqg', { radius: 10, speed: 0, magnitude: 1 });
  assert.ok(nearCore.quantumPressure > farField.quantumPressure);
  assert.ok(Number.isFinite(nearCore.radialAcceleration));
});

test('DDF dilatancy increases viscosity and lowers mobility near the speed limit', () => {
  const slow = evaluateFieldModel('ddf', { radius: 1, speed: 0.5, magnitude: 1 });
  const fast = evaluateFieldModel('ddf', { radius: 1, speed: 7.9, magnitude: 1 });
  assert.ok(fast.effectiveViscosity > slow.effectiveViscosity);
  assert.ok(fast.mobility < slow.mobility);
});

test('model comparison is zero for the same model and nonzero across hypotheses', () => {
  const state = { radius: 2, speed: 4, magnitude: 1, rotation: 1 };
  assert.equal(compareFieldModels('sqg', 'sqg', state).absoluteDifference, 0);
  assert.ok(compareFieldModels('sqg', 'ddf', state).relativeDifference > 0);
});

test('field mechanics sanitization clamps unsafe imported values', () => {
  assert.deepEqual(sanitizeFieldMechanics({
    model: 'invalid',
    comparisonModel: 'ddf',
    coreRadius: 0,
    speedLimit: -2,
    baseViscosity: 8
  }), {
    ...DEFAULT_FIELD_MECHANICS,
    model: 'newtonian',
    comparisonModel: 'ddf',
    coreRadius: 0.05,
    speedLimit: 0.1,
    baseViscosity: 1
  });
});