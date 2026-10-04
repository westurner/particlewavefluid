export const OAM_MODES = Object.freeze([-3, -2, -1, 0, 1, 2, 3]);

export const OAM_OPERATOR_OPTIONS = Object.freeze([
  { value: 'beam-splitter', label: 'Beam splitter' },
  { value: 'phase-shift', label: 'Relative phase' },
  { value: 'hadamard', label: 'Hadamard' },
  { value: 'swap', label: 'Rail swap' },
  { value: 'oam-rotation', label: 'OAM rotation' },
  { value: 'identity', label: 'Identity' }
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

export function getOamOperatorMatrix(operator, angleRadians = Math.PI / 4) {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  switch (operator) {
    case 'identity':
    case 'oam-rotation':
      return [[UNIT, ZERO], [ZERO, UNIT]];
    case 'phase-shift':
      return [[UNIT, ZERO], [ZERO, polar(1, angleRadians)]];
    case 'beam-splitter':
      return [[{ re: cosine, im: 0 }, multiply(IMAGINARY_UNIT, { re: sine, im: 0 })], [multiply(IMAGINARY_UNIT, { re: sine, im: 0 }), { re: cosine, im: 0 }]];
    case 'hadamard':
      return [[{ re: SQRT_HALF, im: 0 }, { re: SQRT_HALF, im: 0 }], [{ re: SQRT_HALF, im: 0 }, { re: -SQRT_HALF, im: 0 }]];
    case 'swap':
      return [[ZERO, UNIT], [UNIT, ZERO]];
    default:
      throw new RangeError(`Unknown OAM operator: ${operator}`);
  }
}

export function applyOamOperator(state, { operator = 'beam-splitter', angleRadians = Math.PI / 4 } = {}) {
  if (!Array.isArray(state) || state.length !== OAM_MODES.length || state.some((pair) => !Array.isArray(pair) || pair.length !== 2)) {
    throw new TypeError(`OAM state must contain two rail amplitudes for each of ${OAM_MODES.length} modes.`);
  }
  const matrix = getOamOperatorMatrix(operator, angleRadians);
  return state.map((pair, index) => {
    const input = pair.map((value) => ({ re: Number(value.re) || 0, im: Number(value.im) || 0 }));
    if (operator === 'oam-rotation') {
      const phase = polar(1, angleRadians * OAM_MODES[index]);
      return input.map((value) => multiply(phase, value));
    }
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