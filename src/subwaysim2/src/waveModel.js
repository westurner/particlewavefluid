export const MAX_WAVES = 8;
export const DEFAULT_WAVE_COUNT = 6;

export const PHASE_MODES = [
  'Standard',
  'Inverted',
  'Quadrature',
  'Standing',
  'Circular-Left',
  'Circular-Right',
  'Helical-Left',
  'Helical-Right'
];

export const INTERFERENCE_MODES = {
  constructive: {
    label: 'Constructive interference',
    description: 'Displays the positive magnitude of every wave contribution.'
  },
  superposition: {
    label: 'Superposition',
    description: 'Adds signed wave amplitudes, preserving cancellation.'
  }
};

export const DEFAULT_INTERFERENCE_MODES = { constructive: false, superposition: true };

export function normalizeInterferenceModes(value) {
  if (typeof value === 'string') {
    return { constructive: value === 'constructive', superposition: value === 'superposition' };
  }
  return {
    constructive: Boolean(value?.constructive),
    superposition: Boolean(value?.superposition)
  };
}

export const DEFAULT_WAVES = [
  { wavelength: 3.8, amplitude: 0.85, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, enabled: true },
  { wavelength: 4.4, amplitude: 0.3, phaseMode: 'Standing', phaseOffset: 1.4, phaseRate: 0.35, enabled: true },
  { wavelength: 6.8, amplitude: 0.25, phaseMode: 'Quadrature', phaseOffset: 0.3, phaseRate: 0.9, enabled: true },
  { wavelength: 3.2, amplitude: 0.2, phaseMode: 'Inverted', phaseOffset: 2.1, phaseRate: 0.6, enabled: true },
  { wavelength: 5.6, amplitude: 0.55, phaseMode: 'Circular-Left', phaseOffset: 0.8, phaseRate: 0.75, enabled: false },
  { wavelength: 7.2, amplitude: 0.38, phaseMode: 'Helical-Right', phaseOffset: -0.6, phaseRate: 0.5, enabled: false },
  { wavelength: 8.4, amplitude: 0.18, phaseMode: 'Circular-Right', phaseOffset: -1.2, phaseRate: 0.45, enabled: true },
  { wavelength: 5.1, amplitude: 0.15, phaseMode: 'Helical-Left', phaseOffset: 0.5, phaseRate: 0.7, enabled: true }
];

const WAVE_STATE_STORAGE_KEY = 'sqgsim-wave-states';

function waveState(name, description, waveCount, interferenceMode, waves) {
  return { name, description, waveCount, interferenceModes: normalizeInterferenceModes(interferenceMode), waves: waves.map((wave) => ({ ...wave })) };
}

const SILENT_WAVE = { wavelength: 4, amplitude: 0, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0, enabled: false };
const SINGLE_TRAVELING = { wavelength: 4, amplitude: 0.9, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, enabled: true };

export const DEFAULT_WAVE_STATES = [
  waveState('Single traveling wave', 'Begin with one clean sinusoid: wavelength controls spacing, while phase rate moves the pattern.', 1, 'superposition', [SINGLE_TRAVELING, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE]),
  waveState('Cancellation pair', 'Two equal waves with opposite phase cancel in superposition. Switch to constructive to reveal their magnitudes.', 2, 'superposition', [
    { ...SINGLE_TRAVELING },
    { ...SINGLE_TRAVELING, phaseMode: 'Inverted' },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Constructive pair', 'Identical waves add together, making a taller field without changing the wavelength.', 2, 'constructive', [
    { ...SINGLE_TRAVELING, amplitude: 0.55 },
    { ...SINGLE_TRAVELING, amplitude: 0.55, phaseOffset: 0.15 },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Standing wave', 'A standing wave keeps nodes in place while its antinodes oscillate in time.', 1, 'superposition', [
    { wavelength: 4.6, amplitude: 0.95, phaseMode: 'Standing', phaseOffset: 0, phaseRate: 1, enabled: true },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Quadrature pair', 'A quarter-cycle phase shift places two waves in quadrature, a useful bridge toward circular motion.', 2, 'superposition', [
    { wavelength: 5.2, amplitude: 0.62, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0.8, enabled: true },
    { wavelength: 5.2, amplitude: 0.62, phaseMode: 'Quadrature', phaseOffset: 0, phaseRate: 0.8, enabled: true },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Circular wave', 'A radial wave expands from the origin; left and right variants reverse the angular phase.', 1, 'superposition', [
    { wavelength: 4.8, amplitude: 0.9, phaseMode: 'Circular-Left', phaseOffset: 0, phaseRate: 0.65, enabled: true },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Counter-rotating rings', 'Opposite circular modes interfere to expose angular phase and symmetry.', 2, 'superposition', [
    { wavelength: 5.8, amplitude: 0.56, phaseMode: 'Circular-Left', phaseOffset: 0, phaseRate: 0.55, enabled: true },
    { wavelength: 5.8, amplitude: 0.56, phaseMode: 'Circular-Right', phaseOffset: 0, phaseRate: 0.55, enabled: true },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Helical pair', 'Opposite helical handedness twists the phase around the field instead of only translating it.', 2, 'superposition', [
    { wavelength: 4.4, amplitude: 0.54, phaseMode: 'Helical-Left', phaseOffset: 0, phaseRate: 0.7, enabled: true },
    { wavelength: 4.4, amplitude: 0.54, phaseMode: 'Helical-Right', phaseOffset: 0, phaseRate: 0.7, enabled: true },
    SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Mixed phase field', 'A compact study set: traveling, standing, quadrature, and inverted contributions share one field.', DEFAULT_WAVE_COUNT, 'superposition', DEFAULT_WAVES)
];

export function cloneWaveState(state) {
  return {
    name: state.name,
    description: state.description || '',
    waveCount: Math.max(1, Math.min(MAX_WAVES, Number(state.waveCount) || 1)),
    interferenceModes: normalizeInterferenceModes(state.interferenceModes ?? state.interferenceMode ?? DEFAULT_INTERFERENCE_MODES),
    waves: Array.from({ length: MAX_WAVES }, (_, index) => ({ ...(state.waves?.[index] || SILENT_WAVE) }))
  };
}

export function readSavedWaveStates() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const saved = JSON.parse(localStorage.getItem(WAVE_STATE_STORAGE_KEY) || '{}');
    return Object.fromEntries(Object.entries(saved).map(([name, state]) => [name, cloneWaveState({ ...state, name })]));
  } catch {
    return {};
  }
}

export function writeSavedWaveStates(states) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(WAVE_STATE_STORAGE_KEY, JSON.stringify(states));
}

export function calculateWaveSample(wave, x, z, time) {
  const wavelength = Math.max(0.1, Number(wave.wavelength) || 0.1);
  const phase = Number(wave.phaseOffset) || 0;
  const rate = Number(wave.phaseRate) || 0;
  const waveNumber = (Math.PI * 2) / wavelength;
  const temporalPhase = time * rate;
  const distance = Math.sqrt(x * x + z * z);
  const angle = Math.atan2(z, x);
  const travel = waveNumber * x - temporalPhase + phase;

  switch (wave.phaseMode) {
    case 'Inverted':
      return -Math.sin(travel);
    case 'Quadrature':
      return Math.cos(travel);
    case 'Standing':
      return Math.sin(waveNumber * x + phase) * Math.cos(temporalPhase);
    case 'Circular-Left':
      return Math.sin(waveNumber * distance - temporalPhase + phase + angle);
    case 'Circular-Right':
      return Math.sin(waveNumber * distance - temporalPhase + phase - angle);
    case 'Helical-Left':
      return Math.sin(travel + angle * 1.5);
    case 'Helical-Right':
      return Math.sin(travel - angle * 1.5);
    case 'Standard':
    default:
      return Math.sin(travel);
  }
}

export function combineWaves(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES) {
  const activeModes = normalizeInterferenceModes(interferenceModes);
  const activeWaves = waves.slice(0, MAX_WAVES);
  return activeWaves.reduce((total, wave) => {
    if (wave.enabled === false) return total;
    const contribution = (Number(wave.amplitude) || 0) * calculateWaveSample(wave, x, z, time);
    const constructiveContribution = activeModes.constructive ? Math.abs(contribution) : 0;
    const superpositionContribution = activeModes.superposition ? contribution : 0;
    return total + constructiveContribution + superpositionContribution;
  }, 0);
}

export function calculateWaveDerivative(waves, x, z, time, order, interferenceModes = DEFAULT_INTERFERENCE_MODES) {
  if (order <= 0) return combineWaves(waves, x, z, time, interferenceModes);
  const step = 0.05;
  return (calculateWaveDerivative(waves, x + step, z, time, order - 1, interferenceModes)
    - calculateWaveDerivative(waves, x - step, z, time, order - 1, interferenceModes)) / (step * 2);
}
