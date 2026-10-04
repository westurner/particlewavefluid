export const OAM_MODES = Object.freeze([-3, -2, -1, 0, 1, 2, 3]);
export const QUDIT_DIMENSIONS = Object.freeze([2, 3, 4, 5, 6, 7]);

export const QUANTUM_OPERATOR_SUPPORTED_BY = Object.freeze(['electron spin', 'electron charge', 'photons', 'solitons']);

export const QUANTUM_OPERATOR_SCHEMA = Object.freeze({
  title: 'QuantumOperator',
  type: 'object',
  required: ['value', 'label', 'shortName', 'type', 'arity', 'registers', 'controls', 'targets', 'parameter', 'matrixDimension', 'matrixKind', 'minimumQuditDimension', 'supportedBy'],
  properties: {
    value: { type: 'string' },
    label: { type: 'string' },
    shortName: { type: 'string' },
    type: { enum: ['unary', 'binary', 'ternary'] },
    arity: { type: 'integer', minimum: 1, maximum: 3 },
    registers: { type: 'array', items: { type: 'string' } },
    controls: { type: 'array', items: { type: 'string' } },
    targets: { type: 'array', items: { type: 'string' } },
    parameter: {
      oneOf: [
        { type: 'null' },
        { type: 'object', required: ['name', 'symbol', 'min', 'max', 'unit'], properties: { name: { type: 'string' }, symbol: { type: 'string' }, min: { type: 'number' }, max: { type: 'number' }, unit: { type: 'string' } } }
      ]
    },
    matrixDimension: { type: 'string' },
    matrixKind: { type: 'string' },
    minimumQuditDimension: { type: 'integer', minimum: 1 },
    supportedBy: { type: 'array', items: { enum: QUANTUM_OPERATOR_SUPPORTED_BY }, minItems: 1 }
  }
});

function defineQuantumOperator({ value, label, shortName, type = 'unary', arity = type === 'unary' ? 1 : type === 'ternary' ? 3 : 2, registers, controls = [], targets, parameter = null, matrixDimension, matrixKind = 'complex unitary', minimumQuditDimension = 2 }) {
  return Object.freeze({
    value,
    label,
    shortName,
    type,
    arity,
    registers,
    controls,
    targets,
    parameter,
    matrixDimension,
    matrixKind,
    minimumQuditDimension,
    supportedBy: QUANTUM_OPERATOR_SUPPORTED_BY
  });
}

const qubitRegister = ['dual-rail qubit'];
const hybridRegisters = ['dual-rail qubit', 'OAM qudit (m)'];
const angleParameter = (name, symbol) => ({ name, symbol, min: -180, max: 180, unit: 'degrees' });

export const OAM_OPERATOR_OPTIONS = Object.freeze([
  defineQuantumOperator({ value: 'beam-splitter', label: '1Q · Beam splitter', shortName: 'BEAM SPLITTER', registers: qubitRegister, targets: ['dual-rail qubit'], parameter: angleParameter('coupling angle', 'θ'), matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'phase-shift', label: '1Q · Relative phase', shortName: 'PHASE SHIFT', registers: qubitRegister, targets: ['rail 1 phase'], parameter: angleParameter('relative phase', 'φ'), matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'hadamard', label: '1Q · Hadamard', shortName: 'HADAMARD', registers: qubitRegister, targets: ['dual-rail qubit'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'swap', label: '1Q · Pauli X / rail swap', shortName: 'PAULI X', registers: qubitRegister, targets: ['dual-rail qubit'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'pauli-x', label: '1Q · Pauli X', shortName: 'PAULI X', registers: qubitRegister, targets: ['dual-rail qubit'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'pauli-y', label: '1Q · Pauli Y', shortName: 'PAULI Y', registers: qubitRegister, targets: ['dual-rail qubit'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'pauli-z', label: '1Q · Pauli Z', shortName: 'PAULI Z', registers: qubitRegister, targets: ['dual-rail qubit'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'rotation-x', label: '1Q · Rotation X', shortName: 'RX', registers: qubitRegister, targets: ['dual-rail qubit'], parameter: angleParameter('rotation angle', 'θ'), matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'rotation-y', label: '1Q · Rotation Y', shortName: 'RY', registers: qubitRegister, targets: ['dual-rail qubit'], parameter: angleParameter('rotation angle', 'θ'), matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'rotation-z', label: '1Q · Rotation Z', shortName: 'RZ', registers: qubitRegister, targets: ['dual-rail qubit'], parameter: angleParameter('rotation angle', 'θ'), matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'phase-s', label: '1Q · S phase', shortName: 'S PHASE', registers: qubitRegister, targets: ['rail 1 phase'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'phase-t', label: '1Q · T phase', shortName: 'T PHASE', registers: qubitRegister, targets: ['rail 1 phase'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'oam-rotation', label: '1Q · OAM rotation', shortName: 'OAM ROTATION', registers: qubitRegister, targets: ['OAM mode phase'], parameter: angleParameter('OAM rotation angle', 'φ'), matrixDimension: '2×2 per ℓ', matrixKind: 'mode-dependent complex unitary' }),
  defineQuantumOperator({ value: 'identity', label: '1Q · Identity', shortName: 'IDENTITY', registers: qubitRegister, targets: ['dual-rail qubit'], matrixDimension: '2×2' }),
  defineQuantumOperator({ value: 'controlled-oam-sum', label: '2R · Controlled OAM SUM', shortName: 'C-OAM SUM', type: 'binary', registers: hybridRegisters, controls: ['dual-rail qubit = 1'], targets: ['OAM level'], matrixDimension: '2m×2m', matrixKind: 'controlled cyclic shift' }),
  defineQuantumOperator({ value: 'controlled-oam-phase', label: '2R · Controlled OAM phase', shortName: 'C-PHASE', type: 'binary', registers: hybridRegisters, controls: ['dual-rail qubit = 1'], targets: ['OAM level phase'], parameter: angleParameter('controlled phase', 'θ'), matrixDimension: '2m×2m', matrixKind: 'controlled diagonal phase' }),
  defineQuantumOperator({ value: 'cnot', label: '2Q · CNOT / CX', shortName: 'CNOT', type: 'binary', registers: hybridRegisters, controls: ['dual-rail qubit = 1'], targets: ['encoded OAM bit 0 (levels 0/1)'], matrixDimension: '2m×2m', matrixKind: 'controlled bit flip', minimumQuditDimension: 2 }),
  defineQuantumOperator({ value: 'cz', label: '2Q · CZ', shortName: 'CZ', type: 'binary', registers: hybridRegisters, controls: ['dual-rail qubit = 1'], targets: ['OAM level 1 phase'], matrixDimension: '2m×2m', matrixKind: 'controlled sign phase', minimumQuditDimension: 2 }),
  defineQuantumOperator({ value: 'toffoli', label: '3Q · Toffoli / CCNOT / CCX', shortName: 'TOFFOLI', type: 'ternary', registers: hybridRegisters, controls: ['dual-rail qubit = 1', 'encoded OAM bit 1 = 1'], targets: ['encoded OAM bit 0'], matrixDimension: '2m×2m', matrixKind: 'encoded controlled-controlled bit flip', minimumQuditDimension: 4 })
]);
const ZERO = Object.freeze({ re: 0, im: 0 });
const UNIT = Object.freeze({ re: 1, im: 0 });
const IMAGINARY_UNIT = Object.freeze({ re: 0, im: 1 });
const SQRT_HALF = Math.SQRT1_2;

function polar(amplitude, phase) {
  return { re: amplitude * Math.cos(phase), im: amplitude * Math.sin(phase) };
}

function multiply(left, right) {
  return {
    re: left.re * right.re - left.im * right.im,
    im: left.re * right.im + left.im * right.re
  };
}

function add(left, right) {
  return { re: left.re + right.re, im: left.im + right.im };
}

function amplitude(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function mode(value) {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) ? Math.min(OAM_MODES.at(-1), Math.max(OAM_MODES[0], numeric)) : 0;
}

export function getActiveOamModes(dimension = OAM_MODES.length) {
  const numeric = Math.round(Number(dimension));
  const count = Number.isFinite(numeric) ? Math.min(OAM_MODES.length, Math.max(2, numeric)) : OAM_MODES.length;
  const start = Math.floor((OAM_MODES.length - count) / 2);
  return OAM_MODES.slice(start, start + count);
}

export function createOamInputState({ amplitudeA = 1, amplitudeB = 0.7, phaseA = 0, phaseB = Math.PI / 2, modeA = 1, modeB = -1 } = {}) {
  const firstMode = mode(modeA);
  const secondMode = mode(modeB);
  const firstAmplitude = amplitude(amplitudeA);
  const secondAmplitude = amplitude(amplitudeB);
  return OAM_MODES.map((orbitalMode) => [
    orbitalMode === firstMode ? polar(firstAmplitude, Number(phaseA) || 0) : { ...ZERO },
    orbitalMode === secondMode ? polar(secondAmplitude, Number(phaseB) || 0) : { ...ZERO }
  ]);
}

export function getOamOperatorMatrix(operator, angleRadians = Math.PI / 4, orbitalMode = 0) {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  const rotationCosine = Math.cos(angleRadians / 2);
  const rotationSine = Math.sin(angleRadians / 2);
  switch (operator) {
    case 'identity':
      return [[UNIT, ZERO], [ZERO, UNIT]];
    case 'oam-rotation': {
      const phase = polar(1, orbitalMode * angleRadians);
      return [[phase, ZERO], [ZERO, phase]];
    }
    case 'phase-shift':
      return [[UNIT, ZERO], [ZERO, polar(1, angleRadians)]];
    case 'beam-splitter':
      return [[{ re: cosine, im: 0 }, multiply(IMAGINARY_UNIT, { re: sine, im: 0 })], [multiply(IMAGINARY_UNIT, { re: sine, im: 0 }), { re: cosine, im: 0 }]];
    case 'hadamard':
      return [[{ re: SQRT_HALF, im: 0 }, { re: SQRT_HALF, im: 0 }], [{ re: SQRT_HALF, im: 0 }, { re: -SQRT_HALF, im: 0 }]];
    case 'swap':
    case 'pauli-x':
      return [[ZERO, UNIT], [UNIT, ZERO]];
    case 'cnot':
    case 'cz':
    case 'controlled-oam-sum':
    case 'controlled-oam-phase':
    case 'toffoli':
      return [[UNIT, ZERO], [ZERO, UNIT]];
    case 'pauli-y':
      return [[ZERO, { re: 0, im: -1 }], [IMAGINARY_UNIT, ZERO]];
    case 'pauli-z':
      return [[UNIT, ZERO], [ZERO, { re: -1, im: 0 }]];
    case 'rotation-x':
      return [[{ re: rotationCosine, im: 0 }, { re: 0, im: -rotationSine }], [{ re: 0, im: -rotationSine }, { re: rotationCosine, im: 0 }]];
    case 'rotation-y':
      return [[{ re: rotationCosine, im: 0 }, { re: -rotationSine, im: 0 }], [{ re: rotationSine, im: 0 }, { re: rotationCosine, im: 0 }]];
    case 'rotation-z':
      return [[polar(1, -angleRadians / 2), ZERO], [ZERO, polar(1, angleRadians / 2)]];
    case 'phase-s':
      return [[UNIT, ZERO], [ZERO, IMAGINARY_UNIT]];
    case 'phase-t':
      return [[UNIT, ZERO], [ZERO, polar(1, Math.PI / 4)]];
    case 'controlled-oam-sum':
    case 'controlled-oam-phase':
    case 'toffoli':
      return [[UNIT, ZERO], [ZERO, UNIT]];
    default:
      throw new RangeError(`Unknown OAM operator: ${operator}`);
  }
}

function createZeroMatrix(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ ...ZERO })));
}

export function getQuantumOperatorMatrix(operator, { angleRadians = Math.PI / 4, quditDimension = OAM_MODES.length, orbitalMode = 0 } = {}) {
  const metadata = OAM_OPERATOR_OPTIONS.find((entry) => entry.value === operator);
  if (!metadata) throw new RangeError(`Unknown OAM operator: ${operator}`);
  if (metadata.type === 'unary') return getOamOperatorMatrix(operator, angleRadians, orbitalMode);
  if (quditDimension < metadata.minimumQuditDimension || !Number.isInteger(quditDimension) || quditDimension > OAM_MODES.length) {
    throw new RangeError(`${metadata.shortName} requires an OAM qudit dimension from ${metadata.minimumQuditDimension} to ${OAM_MODES.length}.`);
  }

  const dimension = quditDimension * 2;
  const matrix = createZeroMatrix(dimension);
  for (let control = 0; control < 2; control += 1) {
    for (let level = 0; level < quditDimension; level += 1) {
      let outputLevel = level;
      let phase = UNIT;
      if (control === 1) {
        if (operator === 'controlled-oam-sum') outputLevel = (level + 1) % quditDimension;
        if (operator === 'controlled-oam-phase') phase = polar(1, angleRadians * level);
        if (operator === 'cnot' && level < 2) outputLevel = 1 - level;
        if (operator === 'cz' && level === 1) phase = { re: -1, im: 0 };
        if (operator === 'toffoli' && (level === 2 || level === 3)) outputLevel = level === 2 ? 3 : 2;
      }
      matrix[control * quditDimension + outputLevel][control * quditDimension + level] = phase;
    }
  }
  return matrix;
}

function applyHybridOperator(state, operator, angleRadians, quditDimension) {
  const modes = getActiveOamModes(quditDimension);
  const sourceIndices = modes.map((orbitalMode) => OAM_MODES.indexOf(orbitalMode));
  const matrix = getQuantumOperatorMatrix(operator, { angleRadians, quditDimension });
  const output = state.map((pair) => pair.map((value) => ({ re: Number(value.re) || 0, im: Number(value.im) || 0 })));
  sourceIndices.forEach((modeIndex) => { output[modeIndex] = [{ ...ZERO }, { ...ZERO }]; });
  for (let inputRail = 0; inputRail < 2; inputRail += 1) {
    for (let inputLevel = 0; inputLevel < quditDimension; inputLevel += 1) {
      const inputIndex = inputRail * quditDimension + inputLevel;
      const amplitude = state[sourceIndices[inputLevel]][inputRail];
      if (amplitude.re === 0 && amplitude.im === 0) continue;
      for (let outputRail = 0; outputRail < 2; outputRail += 1) {
        for (let outputLevel = 0; outputLevel < quditDimension; outputLevel += 1) {
          const coefficient = matrix[outputRail * quditDimension + outputLevel][inputIndex];
          const contribution = multiply(coefficient, amplitude);
          const destination = output[sourceIndices[outputLevel]][outputRail];
          destination.re += contribution.re;
          destination.im += contribution.im;
        }
      }
    }
  }
  return output;
}

export function applyOamOperator(state, { operator = 'beam-splitter', angleRadians = Math.PI / 4, quditDimension = OAM_MODES.length } = {}) {
  if (!Array.isArray(state) || state.length !== OAM_MODES.length || state.some((pair) => !Array.isArray(pair) || pair.length !== 2)) {
    throw new TypeError(`OAM state must contain two rail amplitudes for each of ${OAM_MODES.length} modes.`);
  }
  const metadata = OAM_OPERATOR_OPTIONS.find((entry) => entry.value === operator);
  if (!metadata) throw new RangeError(`Unknown OAM operator: ${operator}`);
  if (metadata.type !== 'unary') return applyHybridOperator(state, operator, angleRadians, quditDimension);
  return state.map((pair, index) => {
    const input = pair.map((value) => ({ re: Number(value.re) || 0, im: Number(value.im) || 0 }));
    const matrix = getOamOperatorMatrix(operator, angleRadians, OAM_MODES[index]);
    return [
      add(multiply(matrix[0][0], input[0]), multiply(matrix[0][1], input[1])),
      add(multiply(matrix[1][0], input[0]), multiply(matrix[1][1], input[1]))
    ];
  });
}

export function measureOamState(state) {
  const railIntensities = [0, 0];
  const modeIntensities = OAM_MODES.map(() => 0);
  for (let index = 0; index < OAM_MODES.length; index += 1) {
    for (let rail = 0; rail < 2; rail += 1) {
      const value = state[index][rail];
      const intensity = value.re ** 2 + value.im ** 2;
      railIntensities[rail] += intensity;
      modeIntensities[index] += intensity;
    }
  }
  const totalIntensity = railIntensities[0] + railIntensities[1];
  const normalize = (value) => totalIntensity > 0 ? value / totalIntensity : 0;
  return {
    totalIntensity,
    railProbabilities: railIntensities.map(normalize),
    modeProbabilities: modeIntensities.map(normalize)
  };
}