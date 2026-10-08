import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFieldModels,
  DEFAULT_FIELD_MECHANICS,
  FIELD_MECHANICS_PARAMETER_FIELDS,
  FIELD_MODEL_DETAILS,
  FIELD_MODEL_PARAMETER_DEPENDENCIES,
  evaluateEffectiveViscosity,
  evaluateFieldModel,
  evaluateGpeResponse,
  fieldModelIndex,
  fluidModelIndex,
  quantumTransportIndex,
  sanitizeFieldMechanics
} from './mechanicsModels.js';

test('field model indices stay synchronized with shader selectors', () => {
  assert.equal(fieldModelIndex('default'), 0);
  assert.equal(fieldModelIndex('newtonian'), 1);
  assert.equal(fieldModelIndex('ns-compressible'), 2);
  assert.equal(fieldModelIndex('ns-incompressible'), 3);
  assert.equal(fieldModelIndex('sqg'), 4);
  assert.equal(fieldModelIndex('sqg-tensor-gaussian'), 5);
  assert.equal(fieldModelIndex('ddf'), 6);
  assert.equal(fieldModelIndex('ddf-tensor-gaussian'), 7);
  assert.equal(fieldModelIndex('grassmannian-amplituhedron'), 8);
  assert.equal(fluidModelIndex('hbn-farnesane'), 1);
  assert.equal(quantumTransportIndex('gpe'), 1);
  assert.ok(Object.values(FIELD_MODEL_DETAILS).every(({ description, solver }) => description && solver));
});

test('mechanics parameter dependencies expose only inputs consumed by each active model', () => {
  assert.deepEqual(FIELD_MODEL_PARAMETER_DEPENDENCIES.default, []);
  assert.deepEqual(FIELD_MODEL_PARAMETER_DEPENDENCIES.newtonian, []);
  assert.deepEqual(FIELD_MODEL_PARAMETER_DEPENDENCIES['ns-incompressible'], []);
  assert.deepEqual(FIELD_MODEL_PARAMETER_DEPENDENCIES['ns-compressible'], ['coreRadius', 'compressibility']);
  assert.ok(!FIELD_MODEL_PARAMETER_DEPENDENCIES.ddf.includes('tensorGaussianWaist'));
  assert.ok(FIELD_MODEL_PARAMETER_DEPENDENCIES['ddf-tensor-gaussian'].includes('tensorGaussianWaist'));
  assert.ok(FIELD_MODEL_PARAMETER_DEPENDENCIES['grassmannian-amplituhedron'].includes('geometryCoupling'));
  for (const fields of Object.values(FIELD_MODEL_PARAMETER_DEPENDENCIES)) {
    assert.ok(fields.every((field) => field in FIELD_MECHANICS_PARAMETER_FIELDS));
  }
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
  assert.ok(Number.isFinite(nearCore.generalRelativityAcceleration));
  assert.equal(nearCore.radialAcceleration, nearCore.generalRelativityAcceleration + nearCore.sqgCorrection);
});

test('SQG phase/vorticity response follows the spin axis and DDF inherits it through mobility', () => {
  const state = {
    radius: 1,
    speed: 0.5,
    magnitude: 1,
    rotation: 0,
    spinAxis: [0, 0, 1],
    phaseGradient: [0, 0, 1],
    phaseVorticity: [0, 0, 0]
  };
  const withoutSpin = evaluateFieldModel('sqg', state, { ...DEFAULT_FIELD_MECHANICS, spinPhaseCoupling: 0 });
  const sqg = evaluateFieldModel('sqg', state, { ...DEFAULT_FIELD_MECHANICS, spinPhaseCoupling: 0.4 });
  const ddf = evaluateFieldModel('ddf', state, { ...DEFAULT_FIELD_MECHANICS, spinPhaseCoupling: 0.4, baseViscosity: 0.08 });
  const oppositeAxis = evaluateFieldModel('sqg', { ...state, spinAxis: [0, 0, -1] }, { ...DEFAULT_FIELD_MECHANICS, spinPhaseCoupling: 0.4 });

  assert.equal(withoutSpin.rotationalResponse, 0);
  assert.ok(sqg.rotationalResponse > 0);
  assert.ok(oppositeAxis.rotationalResponse < 0);
  assert.ok(Math.abs(ddf.radialAcceleration - sqg.radialAcceleration) > 0);
  assert.equal(ddf.rotationalResponse, sqg.rotationalResponse * ddf.mobility);
  assert.ok(ddf.mobility < 1);
});

test('SQG correction stays bounded relative to Newtonian gravity at large source mass', () => {
  const response = evaluateFieldModel('sqg', {
    radius: 0.1,
    speed: 8,
    magnitude: 1e7,
    spinAxis: [0, 1, 0],
    phaseGradient: [0, 8, 0],
    phaseVorticity: [0, 0, 1]
  }, {
    ...DEFAULT_FIELD_MECHANICS,
    coreRadius: 0.05,
    quantumPressure: 20,
    compressibility: 4,
    spinPhaseCoupling: 1,
    grSpeedOfLight: 1e6
  });
  const inverseSquare = 1e7 / 0.1 ** 2;
  assert.ok(Number.isFinite(response.radialAcceleration));
  assert.ok(Math.abs(response.sqgCorrection) <= inverseSquare * 0.5);
});

test('SQG tensor-Gaussian keeps the GR baseline and localizes its GPE correction', () => {
  const settings = { ...DEFAULT_FIELD_MECHANICS, coreRadius: 1, tensorGaussianWaist: 0.5 };
  const near = evaluateFieldModel('sqg-tensor-gaussian', { radius: 0.2, speed: 1, magnitude: 1 }, settings);
  const far = evaluateFieldModel('sqg-tensor-gaussian', { radius: 4, speed: 1, magnitude: 1 }, settings);
  assert.ok(near.tensorGaussian > far.tensorGaussian);
  assert.notEqual(near.radialAcceleration, near.generalRelativityAcceleration);
  assert.ok(Math.abs(far.radialAcceleration - far.generalRelativityAcceleration) < Math.abs(near.radialAcceleration - near.generalRelativityAcceleration));
});

test('default particle mechanics is the enabled baseline model', () => {
  assert.equal(DEFAULT_FIELD_MECHANICS.enabled, true);
  assert.equal(DEFAULT_FIELD_MECHANICS.model, 'default');
  const state = { radius: 2, speed: 1, magnitude: 1, rotation: 1 };
  assert.equal(evaluateFieldModel('default', state).radialAcceleration, evaluateFieldModel('newtonian', state).radialAcceleration);
  assert.notEqual(evaluateFieldModel('default', state).tangentialAcceleration, evaluateFieldModel('newtonian', state).tangentialAcceleration);
});

test('DDF dilatancy increases viscosity and lowers mobility near the speed limit', () => {
  const slow = evaluateFieldModel('ddf', { radius: 1, speed: 0.5, magnitude: 1 });
  const fast = evaluateFieldModel('ddf', { radius: 1, speed: 7.9, magnitude: 1 });
  assert.ok(fast.effectiveViscosity > slow.effectiveViscosity);
  assert.ok(fast.mobility < slow.mobility);
});

test('Grassmannian mechanics adds a bounded on-axis tensor-Gaussian acceleration splat', () => {
  const state = { radius: 1, speed: 2, magnitude: 1, rotation: 0.5 };
  const classical = evaluateFieldModel('newtonian', state);
  const geometry = evaluateFieldModel('grassmannian-amplituhedron', state, { ...DEFAULT_FIELD_MECHANICS, geometryCoupling: 0.2 });
  const farField = evaluateFieldModel('grassmannian-amplituhedron', { ...state, radius: 10 }, { ...DEFAULT_FIELD_MECHANICS, geometryCoupling: 0.2 });
  assert.ok(geometry.radialAcceleration < classical.radialAcceleration);
  assert.ok(geometry.tensorGaussian > farField.tensorGaussian);
  assert.ok(geometry.mobility <= 1.25);
});

test('Gr(2,4) amplituhedron field mechanics changes the Newtonian acceleration response', () => {
  const state = { radius: 0.8, speed: 1.5, magnitude: 1, rotation: 0.6 };
  const classical = evaluateFieldModel('newtonian', state);
  const geometry = evaluateFieldModel('grassmannian-amplituhedron', state, {
    ...DEFAULT_FIELD_MECHANICS,
    tensorGaussianWaist: 2,
    grassmannianPoleWeight: 0.9,
    geometryCoupling: 0.25
  });
  assert.notEqual(geometry.radialAcceleration, classical.radialAcceleration);
  assert.ok(geometry.tensorGaussian > 0);
  assert.ok(geometry.mobility > 1 && geometry.mobility <= 1.25);
});

test('Gr(2,4) spin-axis tensor distinguishes axial and equatorial directions', () => {
  const settings = { ...DEFAULT_FIELD_MECHANICS, geometryCoupling: 0, geometrySpinCoupling: 0.2 };
  const axial = evaluateFieldModel('grassmannian-amplituhedron', {
    radius: 1, magnitude: 1, spinAxis: [0, 1, 0], radialDirection: [0, 1, 0]
  }, settings);
  const equatorial = evaluateFieldModel('grassmannian-amplituhedron', {
    radius: 1, magnitude: 1, spinAxis: [0, 1, 0], radialDirection: [1, 0, 0]
  }, settings);

  assert.notEqual(axial.spinAxisTensor, equatorial.spinAxisTensor);
  assert.notEqual(axial.spinAxisCorrection, equatorial.spinAxisCorrection);
  assert.ok(Math.abs(axial.geometricCorrection) <= 0.2);
  assert.ok(Math.abs(equatorial.geometricCorrection) <= 0.2);
});

test('DDF mechanics return toward the SQG baseline outside the tensor-Gaussian waist', () => {
  const settings = { ...DEFAULT_FIELD_MECHANICS, coreRadius: 1, tensorGaussianWaist: 1, speedLimit: 8, dilatancy: 12, baseViscosity: 0.1 };
  const nearDdf = evaluateFieldModel('ddf-tensor-gaussian', { radius: 0.2, speed: 7, magnitude: 1 }, settings);
  const nearSqg = evaluateFieldModel('sqg', { radius: 0.2, speed: 7, magnitude: 1 }, settings);
  const farDdf = evaluateFieldModel('ddf-tensor-gaussian', { radius: 20, speed: 7, magnitude: 1 }, settings);
  const farSqg = evaluateFieldModel('sqg', { radius: 20, speed: 7, magnitude: 1 }, settings);
  const nearDifference = Math.abs(nearDdf.radialAcceleration - nearSqg.radialAcceleration);
  const farDifference = Math.abs(farDdf.radialAcceleration - farSqg.radialAcceleration);
  assert.ok(nearDifference > farDifference);
  assert.ok(nearDdf.tensorGaussian > farDdf.tensorGaussian);
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
    model: 'default',
    comparisonModel: 'ddf',
    coreRadius: 0.05,
    speedLimit: 0.1,
    baseViscosity: 1
  });
});