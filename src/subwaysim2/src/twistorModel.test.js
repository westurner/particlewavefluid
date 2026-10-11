import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTwistorState, DEFAULT_TWISTOR_PARAMETERS } from './twistorModel.js';

test('spinor dyadic produces a future-directed null momentum', () => {
  const state = buildTwistorState({ ...DEFAULT_TWISTOR_PARAMETERS, scale: 1.7, polar: 1.2, azimuth: -0.8 });
  assert.ok(state.momentum.energy > 0);
  assert.ok(Math.abs(state.massSquared) < 1e-12);
  assert.ok(Math.abs(state.momentumMatrix[0][1].real - state.momentumMatrix[1][0].real) < 1e-12);
  assert.ok(Math.abs(state.momentumMatrix[0][1].imaginary + state.momentumMatrix[1][0].imaginary) < 1e-12);
});

test('twistor components satisfy the chosen incidence relation', () => {
  const state = buildTwistorState(DEFAULT_TWISTOR_PARAMETERS);
  for (let row = 0; row < 2; row += 1) {
    const product = state.positionMatrix[row].reduce((sum, entry, column) => ({
      real: sum.real + entry.real * state.pi[column].real - entry.imaginary * state.pi[column].imaginary,
      imaginary: sum.imaginary + entry.real * state.pi[column].imaginary + entry.imaginary * state.pi[column].real
    }), { real: 0, imaginary: 0 });
    assert.ok(Math.abs(state.omega[row].real + product.imaginary) < 1e-12);
    assert.ok(Math.abs(state.omega[row].imaginary - product.real) < 1e-12);
  }
});

test('a common spinor phase rotates the twistor but leaves its projective ray and momentum unchanged', () => {
  const phaseShift = 0.63;
  const original = buildTwistorState({ ...DEFAULT_TWISTOR_PARAMETERS, phase: 0 });
  const shifted = buildTwistorState({ ...DEFAULT_TWISTOR_PARAMETERS, phase: phaseShift });
  for (let index = 0; index < original.twistor.length; index += 1) {
    const expectedReal = original.twistor[index].real * Math.cos(phaseShift) + original.twistor[index].imaginary * Math.sin(phaseShift);
    const expectedImaginary = original.twistor[index].imaginary * Math.cos(phaseShift) - original.twistor[index].real * Math.sin(phaseShift);
    assert.ok(Math.abs(shifted.twistor[index].real - expectedReal) < 1e-12);
    assert.ok(Math.abs(shifted.twistor[index].imaginary - expectedImaginary) < 1e-12);
  }
  assert.ok(Math.abs(shifted.momentum.energy - original.momentum.energy) < 1e-12);
  assert.ok(Math.abs(shifted.momentum.x - original.momentum.x) < 1e-12);
  assert.ok(Math.abs(shifted.momentum.y - original.momentum.y) < 1e-12);
  assert.ok(Math.abs(shifted.momentum.z - original.momentum.z) < 1e-12);
});

test('the stereographic coordinate remains finite at both spinor poles', () => {
  for (const polar of [0, Math.PI]) {
    const state = buildTwistorState({ ...DEFAULT_TWISTOR_PARAMETERS, polar });
    assert.ok(Number.isFinite(state.stereographicChart.coordinate.real));
    assert.ok(Number.isFinite(state.stereographicChart.coordinate.imaginary));
  }
});