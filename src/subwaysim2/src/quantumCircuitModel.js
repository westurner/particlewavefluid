import { summarizeModelDifference } from './lib/model-comparison.js';
import { sampleApertureField } from './waveModel.js';

export const QUANTUM_CIRCUIT_GATES = Object.freeze([
  { id: 'H', label: 'Hadamard' },
  { id: 'X', label: 'Pauli-X' },
  { id: 'Z', label: 'Pauli-Z' },
  { id: 'S', label: 'Phase-S' },
  { id: 'CNOT', label: 'Controlled-X' }
]);
export const QUANTUM_CIRCUIT_MODELS = Object.freeze([
  { value: 'ideal', label: 'Ideal state-vector intensity' },
  { value: 'classical-detector', label: 'Wave detector / Classical intensity' }
]);
export const LONGITUDINAL_FIELD_MODE_OPTIONS = Object.freeze([
  { value: 'transverse', label: 'Transverse / free-space' },
  { value: 'dielectric-guided', label: 'Dielectric guided hybrid' },
  { value: 'plasma-longitudinal', label: 'Plasma longitudinal' }
]);
export const DEFAULT_CLASSICAL_INTENSITY_SETTINGS = Object.freeze({
  fieldMode: 'transverse',
  wavelength: 1.5,
  railSpacing: 1.6,
  detectorDistance: 4,
  portWidth: 0.7,
  beamPhaseShift: 0,
  coreIndex: 1.5,
  effectiveIndex: 1.2,
  plasmaFrequencyRatio: 0.8,
  thermalSpeedRatio: 0.02,
  screenSamples: 128
});

const GATE_IDS = new Set(QUANTUM_CIRCUIT_GATES.map(({ id }) => id));
const SQRT_HALF = 1 / Math.sqrt(2);
const FIELD_PERIOD_SAMPLES = 8;
const DETECTOR_OPTIMIZATION_CANDIDATES = Object.freeze({
  wavelength: [0.65, 1, 2.2, 3.2],
  railSpacing: [0.8, 1.2, 2.4, 3.2],
  detectorDistance: [1.5, 2.5, 6, 8],
  portWidth: [0.18, 0.3, 0.45, 0.65, 0.9, 1.2],
  beamPhaseShift: [-Math.PI, -Math.PI / 2, Math.PI / 2, Math.PI]
});
const GUIDED_MODE_OPTIMIZATION_CANDIDATES = Object.freeze({
  coreIndex: [1.2, 1.5, 2, 3],
  effectiveIndex: [1.05, 1.15, 1.3, 1.45, 1.8, 2.2, 2.8]
});
const PLASMA_MODE_OPTIMIZATION_CANDIDATES = Object.freeze({
  plasmaFrequencyRatio: [0.4, 0.6, 0.9, 1.2, 1.6],
  thermalSpeedRatio: [0.005, 0.015, 0.03, 0.06, 0.1]
});
const DETECTOR_OPTIMIZATION_MAX_PASSES = 3;
const FIELD_MODE_IDS = new Set(LONGITUDINAL_FIELD_MODE_OPTIONS.map(({ value }) => value));

export function normalizeClassicalIntensitySettings(settings = {}) {
  const bounded = (value, fallback, minimum, maximum) => {
    const number = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
  };
  const fieldMode = FIELD_MODE_IDS.has(settings.fieldMode) ? settings.fieldMode : DEFAULT_CLASSICAL_INTENSITY_SETTINGS.fieldMode;
  const coreIndex = bounded(settings.coreIndex, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.coreIndex, 1.01, 4);
  return {
    fieldMode,
    wavelength: bounded(settings.wavelength, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.wavelength, 0.25, 6),
    railSpacing: bounded(settings.railSpacing, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.railSpacing, 0.4, 4),
    detectorDistance: bounded(settings.detectorDistance, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.detectorDistance, 0.5, 10),
    portWidth: bounded(settings.portWidth, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.portWidth, 0.1, 4),
    beamPhaseShift: bounded(settings.beamPhaseShift, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.beamPhaseShift, -Math.PI, Math.PI),
    coreIndex,
    effectiveIndex: bounded(settings.effectiveIndex, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.effectiveIndex, 1, coreIndex),
    plasmaFrequencyRatio: bounded(settings.plasmaFrequencyRatio, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.plasmaFrequencyRatio, 0.05, 2),
    thermalSpeedRatio: bounded(settings.thermalSpeedRatio, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.thermalSpeedRatio, 0, 0.3),
    screenSamples: Math.round(bounded(settings.screenSamples, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.screenSamples, 32, 512))
  };
}

function classicalFieldParameters(settings) {
  const carrierWaveNumber = 2 * Math.PI / settings.wavelength;
  if (settings.fieldMode === 'plasma-longitudinal') {
    const normalizedFrequency = Math.sqrt(settings.plasmaFrequencyRatio ** 2 + 3 * settings.thermalSpeedRatio ** 2);
    return { waveNumber: carrierWaveNumber, phaseRate: carrierWaveNumber * normalizedFrequency, longitudinalFraction: 1 };
  }
  if (settings.fieldMode === 'dielectric-guided') {
    const guidedRatio = Math.min(1, settings.effectiveIndex / settings.coreIndex);
    return {
      waveNumber: carrierWaveNumber * settings.effectiveIndex,
      phaseRate: carrierWaveNumber,
      longitudinalFraction: Math.sqrt(Math.max(0, 1 - guidedRatio ** 2))
    };
  }
  return { waveNumber: carrierWaveNumber, phaseRate: carrierWaveNumber, longitudinalFraction: 0 };
}

function bitMask(qubitCount, qubit) {
  return 1 << (qubitCount - 1 - qubit);
}

function validateCircuit({ qubitCount, initialState, gates }) {
  if (!Number.isInteger(qubitCount) || qubitCount < 1 || qubitCount > 2) {
    throw new RangeError('The basic circuit simulator supports one or two qubits.');
  }
  if (typeof initialState !== 'string' || !new RegExp(`^[01]{${qubitCount}}$`).test(initialState)) {
    throw new TypeError(`Initial state must be a ${qubitCount}-bit basis state.`);
  }
  if (!Array.isArray(gates)) throw new TypeError('Circuit gates must be an array.');
  gates.forEach((gate, index) => {
    if (!gate || !GATE_IDS.has(gate.type)) throw new TypeError(`Gate ${index + 1} has an unsupported type.`);
    if (!Number.isInteger(gate.target) || gate.target < 0 || gate.target >= qubitCount) {
      throw new RangeError(`Gate ${index + 1} has an invalid target qubit.`);
    }
    if (gate.type === 'CNOT') {
      if (qubitCount < 2 || !Number.isInteger(gate.control) || gate.control < 0 || gate.control >= qubitCount || gate.control === gate.target) {
        throw new RangeError(`Gate ${index + 1} needs distinct control and target qubits.`);
      }
    }
  });
}

function applySingleQubitGate(amplitudes, qubitCount, gate) {
  const mask = bitMask(qubitCount, gate.target);
  for (let index = 0; index < amplitudes.length; index += 1) {
    if ((index & mask) !== 0) continue;
    const other = index | mask;
    const first = amplitudes[index];
    const second = amplitudes[other];
    if (gate.type === 'H') {
      amplitudes[index] = {
        real: (first.real + second.real) * SQRT_HALF,
        imaginary: (first.imaginary + second.imaginary) * SQRT_HALF
      };
      amplitudes[other] = {
        real: (first.real - second.real) * SQRT_HALF,
        imaginary: (first.imaginary - second.imaginary) * SQRT_HALF
      };
    } else if (gate.type === 'X') {
      amplitudes[index] = second;
      amplitudes[other] = first;
    } else if (gate.type === 'Z') {
      amplitudes[other] = { real: -second.real, imaginary: -second.imaginary };
    } else if (gate.type === 'S') {
      amplitudes[other] = { real: -second.imaginary, imaginary: second.real };
    }
  }
}

function applyCnot(amplitudes, qubitCount, gate) {
  const controlMask = bitMask(qubitCount, gate.control);
  const targetMask = bitMask(qubitCount, gate.target);
  for (let index = 0; index < amplitudes.length; index += 1) {
    if ((index & controlMask) === 0 || (index & targetMask) !== 0) continue;
    const other = index | targetMask;
    [amplitudes[index], amplitudes[other]] = [amplitudes[other], amplitudes[index]];
  }
}

export function simulateIntensityCircuit({ qubitCount = 1, initialState, gates = [] } = {}) {
  const basisState = initialState ?? '0'.repeat(qubitCount);
  validateCircuit({ qubitCount, initialState: basisState, gates });
  const stateCount = 1 << qubitCount;
  const initialIndex = Number.parseInt(basisState, 2);
  const amplitudes = Array.from({ length: stateCount }, (_, index) => ({ real: index === initialIndex ? 1 : 0, imaginary: 0 }));
  gates.forEach((gate) => {
    if (gate.type === 'CNOT') applyCnot(amplitudes, qubitCount, gate);
    else applySingleQubitGate(amplitudes, qubitCount, gate);
  });
  const outcomes = amplitudes.map((amplitude, index) => ({
    state: index.toString(2).padStart(qubitCount, '0'),
    amplitude,
    intensity: amplitude.real ** 2 + amplitude.imaginary ** 2
  }));
  const totalIntensity = outcomes.reduce((sum, outcome) => sum + outcome.intensity, 0);
  return { qubitCount, initialState: basisState, amplitudes, outcomes, totalIntensity };
}

export function simulateClassicalIntensityDetector(circuit, detectorSettings = DEFAULT_CLASSICAL_INTENSITY_SETTINGS) {
  if (!circuit?.outcomes?.length || circuit.totalIntensity <= 0) throw new TypeError('A valid circuit state is required by the detector model.');
  const settings = normalizeClassicalIntensitySettings(detectorSettings);
  const outcomeCount = circuit.outcomes.length;
  const detectorSpan = outcomeCount * settings.railSpacing;
  const fieldParameters = classicalFieldParameters(settings);
  const field = {
    experimentMode: 'quantum-output-rails',
    emitters: circuit.outcomes.map(({ amplitude }, index) => ({
      x: 0,
      y: 0,
      z: (index - (outcomeCount - 1) / 2) * settings.railSpacing,
      waveNumber: fieldParameters.waveNumber,
      phaseRate: fieldParameters.phaseRate,
      phase: Math.atan2(amplitude.imaginary, amplitude.real) + index * settings.beamPhaseShift,
      amplitude: Math.hypot(amplitude.real, amplitude.imaginary),
      transverse: { x: 0, y: 1, z: 0 },
      side: { x: 0, y: 0, z: 1 },
      longitudinalFraction: fieldParameters.longitudinalFraction
    }))
  };
  const rawIntensities = new Array(outcomeCount).fill(0);
  const samplesPerPort = Math.max(8, Math.ceil(settings.screenSamples / outcomeCount));
  const portWidth = Math.min(settings.portWidth, settings.railSpacing);
  const sampleWidth = portWidth / samplesPerPort;
  for (let outputIndex = 0; outputIndex < outcomeCount; outputIndex += 1) {
    const portCenter = (outputIndex - (outcomeCount - 1) / 2) * settings.railSpacing;
    for (let sample = 0; sample < samplesPerPort; sample += 1) {
      const screenZ = portCenter - portWidth / 2 + (sample + 0.5) * sampleWidth;
      for (let phaseSample = 0; phaseSample < FIELD_PERIOD_SAMPLES; phaseSample += 1) {
        const time = (phaseSample + 0.5) / FIELD_PERIOD_SAMPLES * 2 * Math.PI / fieldParameters.phaseRate;
        const detectorSample = sampleApertureField(field, settings.detectorDistance, 0, screenZ, time);
        rawIntensities[outputIndex] += detectorSample.intensity * sampleWidth / FIELD_PERIOD_SAMPLES;
      }
    }
  }
  const totalIntensity = rawIntensities.reduce((sum, intensity) => sum + intensity, 0);
  if (!(totalIntensity > 0) || !Number.isFinite(totalIntensity)) throw new RangeError('The classical detector produced no finite intensity.');
  const outcomes = circuit.outcomes.map((outcome, index) => ({ ...outcome, intensity: rawIntensities[index] }));
  return {
    ...circuit,
    outcomes,
    totalIntensity,
    detectorSettings: settings,
    longitudinalFraction: fieldParameters.longitudinalFraction,
    waveNumber: fieldParameters.waveNumber,
    phaseRate: fieldParameters.phaseRate
  };
}

export function compareQuantumCircuitModels(referenceCircuit, candidateCircuit) {
  if (!referenceCircuit?.outcomes?.length || referenceCircuit.outcomes.length !== candidateCircuit?.outcomes?.length) {
    throw new RangeError('Compared circuits must have matching basis-state outputs.');
  }
  const referenceValues = referenceCircuit.outcomes.map(({ intensity }) => intensity / referenceCircuit.totalIntensity);
  const candidateValues = candidateCircuit.outcomes.map(({ intensity }) => intensity / candidateCircuit.totalIntensity);
  return summarizeModelDifference(referenceValues, candidateValues);
}

export async function optimizeClassicalIntensitySettings(circuit, configuration = DEFAULT_CLASSICAL_INTENSITY_SETTINGS, {
  onProgress = () => {},
  yieldControl = () => new Promise((resolve) => setTimeout(resolve, 0))
} = {}) {
  const baseSettings = normalizeClassicalIntensitySettings(configuration);
  const initialDetector = simulateClassicalIntensityDetector(circuit, baseSettings);
  const baselineScorePoints = compareQuantumCircuitModels(circuit, initialDetector).scorePoints;
  let bestSettings = baseSettings;
  let bestScorePoints = baselineScorePoints;
  let evaluations = 0;
  const modeCandidates = {
    ...DETECTOR_OPTIMIZATION_CANDIDATES,
    ...(baseSettings.fieldMode === 'dielectric-guided' ? GUIDED_MODE_OPTIMIZATION_CANDIDATES : {}),
    ...(baseSettings.fieldMode === 'plasma-longitudinal' ? PLASMA_MODE_OPTIMIZATION_CANDIDATES : {})
  };
  const totalEvaluations = DETECTOR_OPTIMIZATION_MAX_PASSES
    * Object.values(modeCandidates).reduce((sum, values) => sum + values.length, 0);
  const parameterNames = Object.keys(modeCandidates);
  for (let pass = 0; pass < DETECTOR_OPTIMIZATION_MAX_PASSES; pass += 1) {
    let improved = false;
    for (const parameter of parameterNames) {
      for (const value of modeCandidates[parameter]) {
        if (Object.is(value, bestSettings[parameter])) continue;
        const candidateSettings = normalizeClassicalIntensitySettings({ ...bestSettings, [parameter]: value });
        const candidateDetector = simulateClassicalIntensityDetector(circuit, candidateSettings);
        const score = compareQuantumCircuitModels(circuit, candidateDetector).scorePoints;
        evaluations += 1;
        if (Number.isFinite(score) && score < bestScorePoints) {
          bestSettings = candidateSettings;
          bestScorePoints = score;
          improved = true;
        }
        onProgress({ completed: evaluations, total: totalEvaluations, parameter, pass: pass + 1 });
        await yieldControl();
      }
    }
    if (!improved) break;
  }
  const parameterChanges = parameterNames
    .filter((parameter) => !Object.is(baseSettings[parameter], bestSettings[parameter]))
    .map((parameter) => ({ key: parameter, from: baseSettings[parameter], to: bestSettings[parameter] }));
  return {
    baselineScorePoints,
    optimizedScorePoints: bestScorePoints,
    improvementPoints: baselineScorePoints - bestScorePoints,
    evaluations,
    parameterChanges,
    settings: bestSettings
  };
}

export function sampleIntensityMeasurement(result, random = Math.random) {
  if (!result?.outcomes?.length || typeof random !== 'function') throw new TypeError('A simulated circuit and random source are required.');
  const threshold = Math.min(1 - Number.EPSILON, Math.max(0, Number(random())));
  let accumulated = 0;
  for (const outcome of result.outcomes) {
    accumulated += outcome.intensity / result.totalIntensity;
    if (threshold < accumulated) return outcome.state;
  }
  return result.outcomes.at(-1).state;
}