import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareQuantumCircuitModels,
  DEFAULT_CLASSICAL_INTENSITY_SETTINGS,
  normalizeClassicalIntensitySettings,
  optimizeClassicalIntensitySettings,
  sampleIntensityMeasurement,
  simulateClassicalIntensityDetector,
  simulateIntensityCircuit
} from './quantumCircuitModel.js';

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

test('Classical-intensity detector integrates Wave lab field intensity into output ports', () => {
  const circuit = simulateIntensityCircuit({ qubitCount: 2, gates: [
    { type: 'H', target: 0 },
    { type: 'CNOT', control: 0, target: 1 }
  ] });
  const detector = simulateClassicalIntensityDetector(circuit);
  assert.ok(detector.totalIntensity > 0);
  assert.ok(detector.outcomes.every(({ intensity }) => Number.isFinite(intensity) && intensity >= 0));
  assert.ok(Math.abs(detector.outcomes.reduce((sum, { intensity }) => sum + intensity, 0) - detector.totalIntensity) < 1e-12);
  const comparison = compareQuantumCircuitModels(circuit, detector);
  assert.equal(comparison.sampleCount, 4);
  assert.ok(comparison.scorePoints > 1, 'finite classical detector should show port cross-talk for an entangled state');
  assert.ok(Math.abs(detector.outcomes[0].amplitude.real - circuit.outcomes[0].amplitude.real) < 1e-12);
});

test('Classical detector parameter optimizer does not worsen the ideal-reference fit', async () => {
  const circuit = simulateIntensityCircuit({ qubitCount: 2, gates: [
    { type: 'H', target: 0 },
    { type: 'CNOT', control: 0, target: 1 }
  ] });
  const progress = [];
  const result = await optimizeClassicalIntensitySettings(circuit, DEFAULT_CLASSICAL_INTENSITY_SETTINGS, {
    onProgress: (update) => progress.push(update),
    yieldControl: async () => {}
  });
  assert.ok(result.evaluations > 16 && result.evaluations <= 66);
  assert.equal(progress.length, result.evaluations);
  assert.ok(result.optimizedScorePoints <= result.baselineScorePoints);
  assert.equal(result.parameterChanges.length > 0, true);
  assert.ok(result.settings.wavelength >= 0.25 && result.settings.wavelength <= 6);
});

test('classical detector settings are finite and bounded', () => {
  assert.deepEqual(normalizeClassicalIntensitySettings({ wavelength: -1, railSpacing: 99, detectorDistance: 0, portWidth: -1, beamPhaseShift: 10, screenSamples: 21 }), {
    wavelength: 0.25,
    railSpacing: 4,
    detectorDistance: 0.5,
    portWidth: 0.1,
    beamPhaseShift: Math.PI,
    screenSamples: 32
  });
});

test('narrow output ports reject more Bell-state cross-talk than full-width ports', () => {
  const circuit = simulateIntensityCircuit({ qubitCount: 2, gates: [
    { type: 'H', target: 0 },
    { type: 'CNOT', control: 0, target: 1 }
  ] });
  const ideal = compareQuantumCircuitModels(circuit, circuit);
  const broadDetector = simulateClassicalIntensityDetector(circuit, { ...DEFAULT_CLASSICAL_INTENSITY_SETTINGS, portWidth: 1.6 });
  const narrowDetector = simulateClassicalIntensityDetector(circuit, { ...DEFAULT_CLASSICAL_INTENSITY_SETTINGS, portWidth: 0.2 });
  assert.ok(compareQuantumCircuitModels(circuit, broadDetector).scorePoints > ideal.scorePoints);
  assert.ok(compareQuantumCircuitModels(circuit, narrowDetector).scorePoints < compareQuantumCircuitModels(circuit, broadDetector).scorePoints);
});

test('beam-to-beam phase shift changes Classical detector output intensities', () => {
  const circuit = simulateIntensityCircuit({ qubitCount: 2, gates: [
    { type: 'H', target: 0 },
    { type: 'CNOT', control: 0, target: 1 }
  ] });
  const baseline = simulateClassicalIntensityDetector(circuit);
  const shifted = simulateClassicalIntensityDetector(circuit, { ...DEFAULT_CLASSICAL_INTENSITY_SETTINGS, beamPhaseShift: Math.PI / 2 });
  const error = compareQuantumCircuitModels(baseline, shifted).rmsDifference;
  assert.ok(error > 1e-4, 'relative emitter phase should change detector port intensities');
});