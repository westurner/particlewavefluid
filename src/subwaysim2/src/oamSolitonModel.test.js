import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOamOperator, createOamInputState, getOamOperatorMatrix, measureOamState, OAM_MODES, OAM_OPERATOR_OPTIONS } from './oamSolitonModel.js';

const power = (state) => measureOamState(state).totalIntensity;

test('a balanced beam splitter divides a single occupied rail equally', () => {
  const input = createOamInputState({ amplitudeA: 1, amplitudeB: 0, modeA: 2 });
  const output = applyOamOperator(input, { operator: 'beam-splitter', angleRadians: Math.PI / 4 });
  const measurement = measureOamState(output);
  assert.ok(Math.abs(measurement.railProbabilities[0] - 0.5) < 1e-12);
  assert.ok(Math.abs(measurement.railProbabilities[1] - 0.5) < 1e-12);
});

test('each supported operator preserves total intensity', () => {
  const input = createOamInputState({ amplitudeA: 0.82, amplitudeB: 0.61, phaseA: 0.4, phaseB: -1.2, modeA: 2, modeB: -1 });
  for (const { value: operator } of OAM_OPERATOR_OPTIONS) {
    const output = applyOamOperator(input, { operator, angleRadians: 0.63 });
    assert.ok(Math.abs(power(output) - power(input)) < 1e-12, `${operator} changed total intensity`);
  }
});

test('OAM rotation changes mode phase without changing mode probability', () => {
  const input = createOamInputState({ amplitudeA: 1, amplitudeB: 0, modeA: -2 });
  const output = applyOamOperator(input, { operator: 'oam-rotation', angleRadians: Math.PI / 3 });
  const activeIndex = OAM_MODES.indexOf(-2);
  const value = output[activeIndex][0];
  assert.ok(Math.abs(value.re - Math.cos(-2 * Math.PI / 3)) < 1e-12);
  assert.ok(Math.abs(value.im - Math.sin(-2 * Math.PI / 3)) < 1e-12);
  assert.equal(measureOamState(output).modeProbabilities[activeIndex], 1);
});

test('relative phase can redirect interference into one output rail', () => {
  const input = createOamInputState({ amplitudeA: 1, amplitudeB: 1, phaseA: 0, phaseB: 0, modeA: 0, modeB: 0 });
  const phaseAdjusted = applyOamOperator(input, { operator: 'phase-shift', angleRadians: Math.PI / 2 });
  const output = applyOamOperator(phaseAdjusted, { operator: 'beam-splitter', angleRadians: Math.PI / 4 });
  const measurement = measureOamState(output);
  assert.ok(measurement.railProbabilities[0] < 1e-12);
  assert.ok(Math.abs(measurement.railProbabilities[1] - 1) < 1e-12);
});

test('unknown operators and malformed states are rejected', () => {
  assert.throws(() => getOamOperatorMatrix('non-unitary'), RangeError);
  assert.throws(() => applyOamOperator([], { operator: 'identity' }), TypeError);
});