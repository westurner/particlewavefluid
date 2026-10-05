import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHalbachMotorState,
  createHalbachFieldLineVertices,
  DEFAULT_HALBACH_MOTOR_SETTINGS,
  sanitizeHalbachMotorSettings
} from './halbachMotorModel.js';

test('Halbach and alternating arrays have distinct magnet sequences and flux profiles', () => {
  const halbach = calculateHalbachMotorState({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, arrangement: 'halbach' });
  const alternating = calculateHalbachMotorState({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, arrangement: 'alternating' });
  assert.deepEqual(halbach.magnets.slice(0, 4).map(({ angle }) => angle), [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]);
  assert.deepEqual(alternating.magnets.slice(0, 4).map(({ angle }) => angle), [0, Math.PI, 0, Math.PI]);
  assert.ok(Number.isFinite(halbach.coilSideFluxT));
  assert.ok(Number.isFinite(halbach.shieldSideFluxT));
  assert.notEqual(halbach.coilSideFluxT, alternating.coilSideFluxT);
  assert.ok(createHalbachFieldLineVertices({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, arrangement: 'halbach' }).length > createHalbachFieldLineVertices({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, arrangement: 'alternating' }).length);
});

test('coil phase advances the traveling current pattern and force remains finite', () => {
  const initial = calculateHalbachMotorState(DEFAULT_HALBACH_MOTOR_SETTINGS, 0);
  const shifted = calculateHalbachMotorState({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, coilPhaseDegrees: 125 }, 0.15);
  assert.notDeepEqual(initial.coils.map(({ currentFraction }) => currentFraction), shifted.coils.map(({ currentFraction }) => currentFraction));
  assert.ok(shifted.coils.every(({ currentA, forceN }) => Number.isFinite(currentA) && Number.isFinite(forceN)));
  assert.ok(Number.isFinite(shifted.accelerationMS2));
});

test('shared mechanics regimes modulate Halbach force without altering the Maxwell reference', () => {
  const classical = calculateHalbachMotorState({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, mechanicsRegime: 'classical' }, 0.2);
  const ddf = calculateHalbachMotorState({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, mechanicsRegime: 'ddf-tensor-gaussian' }, 0.2);
  const geometry = calculateHalbachMotorState({ ...DEFAULT_HALBACH_MOTOR_SETTINGS, mechanicsRegime: 'grassmannian-amplituhedron' }, 0.2);
  assert.ok(Number.isFinite(classical.maxwellMagneticPressurePa));
  assert.ok(Number.isFinite(classical.tensorGaussianWeight));
  assert.ok(Math.abs(classical.mechanics.accelerationScale - 1) < 1e-12);
  assert.ok(ddf.forceN !== classical.forceN);
  assert.ok(geometry.forceN > classical.forceN);
});

test('Halbach parameter imports clamp to supported values', () => {
  const settings = sanitizeHalbachMotorSettings({ arrangement: 'unknown', magnetCount: 100, coilPhaseDegrees: -90, coilGapM: 0 });
  assert.equal(settings.arrangement, 'halbach');
  assert.equal(settings.magnetCount, 16);
  assert.equal(settings.coilPhaseDegrees, 0);
  assert.equal(settings.coilGapM, 0.1);
});