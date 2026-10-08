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
export const DEFAULT_CLASSICAL_INTENSITY_SETTINGS = Object.freeze({ wavelength: 1.5, railSpacing: 1.6, detectorDistance: 4, portWidth: 0.7, beamPhaseShift: 0, screenSamples: 128 });

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
const DETECTOR_OPTIMIZATION_MAX_PASSES = 3;

export function normalizeClassicalIntensitySettings(settings = {}) {
  const bounded = (value, fallback, minimum, maximum) => {
    const number = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
  };
  return {
    wavelength: bounded(settings.wavelength, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.wavelength, 0.25, 6),
    railSpacing: bounded(settings.railSpacing, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.railSpacing, 0.4, 4),
    detectorDistance: bounded(settings.detectorDistance, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.detectorDistance, 0.5, 10),
    portWidth: bounded(settings.portWidth, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.portWidth, 0.1, 4),
    beamPhaseShift: bounded(settings.beamPhaseShift, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.beamPhaseShift, -Math.PI, Math.PI),
    screenSamples: Math.round(bounded(settings.screenSamples, DEFAULT_CLASSICAL_INTENSITY_SETTINGS.screenSamples, 32, 512))
  };
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
  const temporalPhaseRate = 2 * Math.PI / settings.wavelength;
  const field = {
    experimentMode: 'quantum-output-rails',
    emitters: circuit.outcomes.map(({ amplitude }, index) => ({
      x: 0,
      y: 0,
      z: (index - (outcomeCount - 1) / 2) * settings.railSpacing,
      waveNumber: temporalPhaseRate,
      phaseRate: temporalPhaseRate,
      phase: Math.atan2(amplitude.imaginary, amplitude.real) + index * settings.beamPhaseShift,
      amplitude: Math.hypot(amplitude.real, amplitude.imaginary),
      transverse: { x: 0, y: 1, z: 0 },
      side: { x: 0, y: 0, z: 1 }
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
        const time = (phaseSample + 0.5) / FIELD_PERIOD_SAMPLES * settings.wavelength;
        const detectorSample = sampleApertureField(field, settings.detectorDistance, 0, screenZ, time);
        rawIntensities[outputIndex] += detectorSample.intensity * sampleWidth / FIELD_PERIOD_SAMPLES;
      }
    }
  }
  const totalIntensity = rawIntensities.reduce((sum, intensity) => sum + intensity, 0);
  if (!(totalIntensity > 0) || !Number.isFinite(totalIntensity)) throw new RangeError('The classical detector produced no finite intensity.');
  const outcomes = circuit.outcomes.map((outcome, index) => ({ ...outcome, intensity: rawIntensities[index] }));
  return { ...circuit, outcomes, totalIntensity, detectorSettings: settings };
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
  const totalEvaluations = DETECTOR_OPTIMIZATION_MAX_PASSES
    * Object.values(DETECTOR_OPTIMIZATION_CANDIDATES).reduce((sum, values) => sum + values.length, 0);
  const parameterNames = Object.keys(DETECTOR_OPTIMIZATION_CANDIDATES);
  for (let pass = 0; pass < DETECTOR_OPTIMIZATION_MAX_PASSES; pass += 1) {
    let improved = false;
    for (const parameter of parameterNames) {
      for (const value of DETECTOR_OPTIMIZATION_CANDIDATES[parameter]) {
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
  const parameterChanges = Object.keys(DETECTOR_OPTIMIZATION_CANDIDATES)
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