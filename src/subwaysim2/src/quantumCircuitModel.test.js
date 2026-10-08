import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleIntensityMeasurement, simulateIntensityCircuit } from './quantumCircuitModel.js';

test('Hadamard produces equal output intensities and interference recombines them', () => {
  const superposition = simulateIntensityCircuit({ gates: [{ type: 'H', target: 0 }] });
  assert.deepEqual(superposition.outcomes.map(({ state }) => state), ['0', '1']);
  superposition.outcomes.forEach(({ intensity }) => assert.ok(Math.abs(intensity - 0.5) < 1e-12));
  const recombined = simulateIntensityCircuit({ gates: [{ type: 'H', target: 0 }, { type: 'H', target: 0 }] });
  assert.ok(Math.abs(recombined.outcomes[0].intensity - 1) < 1e-12);
  assert.ok(recombined.outcomes[1].intensity < 1e-12);
  assert.ok(Math.abs(superposition.totalIntensity - 1) < 1e-12);
});

test('Pauli-X, phase gates, and CNOT transform the complex amplitudes correctly', () => {
  const flipped = simulateIntensityCircuit({ initialState: '1', gates: [{ type: 'X', target: 0 }] });
  assert.deepEqual(flipped.outcomes.map(({ state, intensity }) => [state, intensity]), [['0', 1], ['1', 0]]);
  const bellState = simulateIntensityCircuit({ qubitCount: 2, initialState: '00', gates: [
    { type: 'H', target: 0 },
    { type: 'CNOT', control: 0, target: 1 }
  ] });
  assert.deepEqual(bellState.outcomes.map(({ state }) => state), ['00', '01', '10', '11']);
  assert.ok(Math.abs(bellState.outcomes[0].intensity - 0.5) < 1e-12);
  assert.equal(bellState.outcomes[1].intensity, 0);
  assert.equal(bellState.outcomes[2].intensity, 0);
  assert.ok(Math.abs(bellState.outcomes[3].intensity - 0.5) < 1e-12);
  const phaseInterference = simulateIntensityCircuit({ initialState: '0', gates: [
    { type: 'H', target: 0 },
    { type: 'S', target: 0 },
    { type: 'H', target: 0 }
  ] });
  assert.ok(Math.abs(phaseInterference.outcomes[0].intensity - 0.5) < 1e-12);
  assert.ok(Math.abs(phaseInterference.outcomes[1].intensity - 0.5) < 1e-12);
});

test('measurement samples outcomes according to their normalized intensities', () => {
  const result = simulateIntensityCircuit({ gates: [{ type: 'H', target: 0 }] });
  assert.equal(sampleIntensityMeasurement(result, () => 0.1), '0');
  assert.equal(sampleIntensityMeasurement(result, () => 0.9), '1');
  assert.equal(sampleIntensityMeasurement(simulateIntensityCircuit(), () => 0.99), '0');
});

test('two-qubit circuits default to the all-zero basis state', () => {
  const circuit = simulateIntensityCircuit({ qubitCount: 2 });
  assert.equal(circuit.initialState, '00');
  assert.equal(circuit.outcomes[0].intensity, 1);
});

test('circuit validation rejects unsupported qubit counts and invalid gates', () => {
  assert.throws(() => simulateIntensityCircuit({ qubitCount: 3 }), RangeError);
  assert.throws(() => simulateIntensityCircuit({ qubitCount: 2, initialState: '0' }), TypeError);
  assert.throws(() => simulateIntensityCircuit({ gates: [{ type: 'CNOT', target: 0, control: 0 }] }), RangeError);
});