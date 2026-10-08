export const QUANTUM_CIRCUIT_GATES = Object.freeze([
  { id: 'H', label: 'Hadamard' },
  { id: 'X', label: 'Pauli-X' },
  { id: 'Z', label: 'Pauli-Z' },
  { id: 'S', label: 'Phase-S' },
  { id: 'CNOT', label: 'Controlled-X' }
]);

const GATE_IDS = new Set(QUANTUM_CIRCUIT_GATES.map(({ id }) => id));
const SQRT_HALF = 1 / Math.sqrt(2);

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