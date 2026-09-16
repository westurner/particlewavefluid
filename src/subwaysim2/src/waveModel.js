export const MAX_WAVES = 8;
export const DEFAULT_WAVE_COUNT = 6;
export const DEFAULT_SIGNAL_ORIGIN = { x: 0, y: 0, z: 0 };
export const DEFAULT_SIGNAL_DIRECTION = { x: 1, y: 0, z: 0 };
export const DEFAULT_SIGNAL_ROTATION = { x: 0, y: 0, z: 0 };
export const HELICAL_TOPOLOGICAL_CHARGE = 1;
export const DEFAULT_BEAM_WAIST = 6;
export const POLARIZATION_MODES = ['Scalar', 'Transverse', 'Longitudinal', 'Electromagnetic', 'EM-Tensor-Gaussian'];

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

export const OCCLUSION_PRESETS = [
  { id: 'none', name: 'Open field', description: 'No occluding geometry; every sampled particle receives the field.' },
  { id: 'pinhole', name: 'Pinhole', description: 'A small central aperture in an otherwise blocking screen.' },
  { id: 'single-slit', name: 'Single slit', description: 'One wider aperture for a single-slit transmission pattern.' },
  { id: 'double-slit', name: 'Double slit', description: 'Two separated apertures in an otherwise blocking screen.' },
  { id: 'sierpinski-carpet', name: 'Sierpinski carpet', description: 'A recursive fractal transmission mask across the downstream field.' },
  { id: 'unilluminable-room', name: 'Unilluminable room', description: 'A closed room region that remains outside the source field.' },
  { id: 'boulder', name: 'Boulder', description: 'A rounded obstacle with a widening downstream shadow.' }
];

export function normalizeInterferenceModes(value) {
  if (typeof value === 'string') {
    return { constructive: value === 'constructive', superposition: value === 'superposition' };
  }
  return {
    constructive: Boolean(value?.constructive),
    superposition: Boolean(value?.superposition)
  };
}

function cloneWave(wave) {
  return {
    ...wave,
    origin: { ...DEFAULT_SIGNAL_ORIGIN, ...(wave.origin || {}) },
    direction: { ...DEFAULT_SIGNAL_DIRECTION, ...(wave.direction || {}) },
    rotation: { ...DEFAULT_SIGNAL_ROTATION, ...(wave.rotation || {}) },
    decayRate: Math.max(0, Number(wave.decayRate) || 0),
    beamWaist: Math.max(0.1, Number(wave.beamWaist) || DEFAULT_BEAM_WAIST),
    polarization: POLARIZATION_MODES.includes(wave.polarization) ? wave.polarization : 'Scalar'
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
].map(cloneWave);

const WAVE_STATE_STORAGE_KEY = 'sqgsim-wave-states';

function waveState(name, description, waveCount, interferenceMode, waves) {
  return { name, description, waveCount, interferenceModes: normalizeInterferenceModes(interferenceMode), waves: waves.map(cloneWave) };
}

const SILENT_WAVE = cloneWave({ wavelength: 4, amplitude: 0, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 0, decayRate: 0, enabled: false });
const SINGLE_TRAVELING = cloneWave({ wavelength: 4, amplitude: 0.9, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, decayRate: 0, enabled: true });

function waveSlots(waves) {
  return Array.from({ length: MAX_WAVES }, (_, index) => cloneWave(waves[index] || SILENT_WAVE));
}

export const SIGNAL_SOURCE_PRESETS = [
  {
    id: 'continuous-wave-laser',
    name: 'Continuous-wave laser',
    description: 'A coherent traveling wave with a fixed source origin and forward propagation direction.',
    waveCount: 1,
    interferenceModes: { constructive: false, superposition: true },
    waves: waveSlots([{ wavelength: 3, amplitude: 0.95, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true }])
  },
  {
    id: 'continuous-wave-laser-helical-pair',
    name: 'Continuous-wave laser w/ Helical-L and Helical-R',
    description: 'A coherent carrier with matching left- and right-handed helical phase components.',
    waveCount: 3,
    interferenceModes: { constructive: false, superposition: true },
    waves: waveSlots([
      { wavelength: 3, amplitude: 0.8, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true },
      { wavelength: 3, amplitude: 0.55, phaseMode: 'Helical-Left', phaseOffset: 0, phaseRate: 1, origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true },
      { wavelength: 3, amplitude: 0.55, phaseMode: 'Helical-Right', phaseOffset: 0, phaseRate: 1, origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true }
    ])
  }
];

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
    waves: Array.from({ length: MAX_WAVES }, (_, index) => cloneWave(state.waves?.[index] || SILENT_WAVE))
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

function sierpinskiCarpetPass(x, z) {
  let cellX = Math.floor(Math.min(0.999999, Math.max(0, x / 9)) * 81);
  let cellZ = Math.floor(Math.min(0.999999, Math.max(0, (z + 9) / 18)) * 81);
  for (let level = 0; level < 4; level += 1) {
    if (cellX % 3 === 1 && cellZ % 3 === 1) return false;
    cellX = Math.floor(cellX / 3);
    cellZ = Math.floor(cellZ / 3);
  }
  return true;
}

export function calculateOcclusionTransmission(presetId, x, z) {
  if (presetId === 'none' || x <= 0) return 1;
  if (presetId === 'pinhole') return Math.abs(z) < 0.55 ? 1 : 0;
  if (presetId === 'single-slit') return Math.abs(z) < 1.8 ? 1 : 0;
  if (presetId === 'double-slit') return Math.abs(Math.abs(z) - 2.1) < 0.55 ? 1 : 0;
  if (presetId === 'sierpinski-carpet') return sierpinskiCarpetPass(x, z) ? 1 : 0;
  if (presetId === 'unilluminable-room') return x > 1.5 && x < 8.2 && Math.abs(z) < 4.2 ? 0 : 1;
  if (presetId === 'boulder') {
    const distanceFromBoulder = Math.hypot(x - 2.8, z);
    const shadowWidth = 1.8 + Math.max(0, x - 2.8) * 0.32;
    return distanceFromBoulder < 1.8 || (x > 2.8 && Math.abs(z) < shadowWidth) ? 0 : 1;
  }
  return 1;
}

function rotateVector(vector, rotation) {
  const sinX = Math.sin(rotation.x);
  const cosX = Math.cos(rotation.x);
  const sinY = Math.sin(rotation.y);
  const cosY = Math.cos(rotation.y);
  const sinZ = Math.sin(rotation.z);
  const cosZ = Math.cos(rotation.z);
  const xRotated = vector.x;
  const yRotated = cosX * vector.y - sinX * vector.z;
  const zRotated = sinX * vector.y + cosX * vector.z;
  const xTurned = cosY * xRotated + sinY * zRotated;
  const yTurned = yRotated;
  const zTurned = -sinY * xRotated + cosY * zRotated;
  return {
    x: cosZ * xTurned - sinZ * yTurned,
    y: sinZ * xTurned + cosZ * yTurned,
    z: zTurned
  };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function calculateWaveFrame(wave, x = 0, y = 0, z = 0) {
  const rawOrigin = { ...DEFAULT_SIGNAL_ORIGIN, ...(wave.origin || {}) };
  const origin = { x: Number(rawOrigin.x) || 0, y: Number(rawOrigin.y) || 0, z: Number(rawOrigin.z) || 0 };
  const rawDirection = { ...DEFAULT_SIGNAL_DIRECTION, ...(wave.direction || {}) };
  const numericDirection = { x: Number(rawDirection.x) || 0, y: Number(rawDirection.y) || 0, z: Number(rawDirection.z) || 0 };
  const directionLength = Math.hypot(numericDirection.x, numericDirection.y, numericDirection.z);
  const direction = directionLength > 0 ? {
    x: numericDirection.x / directionLength,
    y: numericDirection.y / directionLength,
    z: numericDirection.z / directionLength
  } : DEFAULT_SIGNAL_DIRECTION;
  const reference = Math.abs(direction.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const referenceProjection = reference.x * direction.x + reference.y * direction.y + reference.z * direction.z;
  const upRaw = {
    x: reference.x - referenceProjection * direction.x,
    y: reference.y - referenceProjection * direction.y,
    z: reference.z - referenceProjection * direction.z
  };
  const upLength = Math.hypot(upRaw.x, upRaw.y, upRaw.z) || 1;
  const up = { x: upRaw.x / upLength, y: upRaw.y / upLength, z: upRaw.z / upLength };
  const side = {
    x: direction.y * up.z - direction.z * up.y,
    y: direction.z * up.x - direction.x * up.z,
    z: direction.x * up.y - direction.y * up.x
  };
  const rawRotation = { ...DEFAULT_SIGNAL_ROTATION, ...(wave.rotation || {}) };
  const rotation = {
    x: Number(rawRotation.x) || 0,
    y: Number(rawRotation.y) || 0,
    z: Number(rawRotation.z) || 0
  };
  const rotatedDirection = rotateVector(direction, rotation);
  const rotatedUp = rotateVector(up, rotation);
  const rotatedSide = rotateVector(side, rotation);
  const relative = { x: x - origin.x, y: y - origin.y, z: z - origin.z };
  const longitudinal = dot(relative, rotatedDirection);
  const upCoordinate = dot(relative, rotatedUp);
  const sideCoordinate = dot(relative, rotatedSide);
  return {
    origin,
    longitudinal,
    transverseRadius: Math.hypot(upCoordinate, sideCoordinate),
    angle: Math.atan2(sideCoordinate, upCoordinate),
    direction: rotatedDirection,
    transverse: rotatedUp,
    side: rotatedSide
  };
}

export function calculateWaveEnvelope(wave, longitudinal) {
  const decayRate = Math.max(0, Number(wave.decayRate) || 0);
  return Math.exp(-decayRate * Math.max(0, longitudinal));
}

export function calculateWaveSample(wave, x, z, time, y = 0) {
  const wavelength = Math.max(0.1, Number(wave.wavelength) || 0.1);
  const phase = Number(wave.phaseOffset) || 0;
  const rate = Number(wave.phaseRate) || 0;
  const waveNumber = (Math.PI * 2) / wavelength;
  const temporalPhase = time * rate;
  const { longitudinal, transverseRadius, angle } = calculateWaveFrame(wave, x, y, z);
  const travel = waveNumber * longitudinal - temporalPhase + phase;
  const envelope = calculateWaveEnvelope(wave, longitudinal);

  switch (wave.phaseMode) {
    case 'Inverted':
      return -Math.sin(travel) * envelope;
    case 'Quadrature':
      return Math.cos(travel) * envelope;
    case 'Standing':
      return Math.sin(waveNumber * longitudinal + phase) * Math.cos(temporalPhase) * envelope;
    case 'Circular-Left':
      return Math.sin(waveNumber * transverseRadius - temporalPhase + phase + angle) * envelope;
    case 'Circular-Right':
      return Math.sin(waveNumber * transverseRadius - temporalPhase + phase - angle) * envelope;
    case 'Helical-Left':
      return Math.sin(travel + HELICAL_TOPOLOGICAL_CHARGE * angle) * envelope;
    case 'Helical-Right':
      return Math.sin(travel - HELICAL_TOPOLOGICAL_CHARGE * angle) * envelope;
    case 'Standard':
    default:
      return Math.sin(travel) * envelope;
  }
}

function scaleVector(vector, scale) {
  return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
}

function addVectors(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

function tensorNorm(tensor) {
  return Math.sqrt(tensor.reduce((sum, value) => sum + value * value, 0));
}

export function calculateElectromagneticField(wave, x, z, time, y = 0) {
  const wavelength = Math.max(0.1, Number(wave.wavelength) || 0.1);
  const phase = Number(wave.phaseOffset) || 0;
  const rate = Number(wave.phaseRate) || 0;
  const waveNumber = (Math.PI * 2) / wavelength;
  const temporalPhase = time * rate;
  const frame = calculateWaveFrame(wave, x, y, z);
  const travel = waveNumber * frame.longitudinal - temporalPhase + phase;
  const envelope = calculateWaveEnvelope(wave, frame.longitudinal);
  const beamWaist = Math.max(0.1, Number(wave.beamWaist) || DEFAULT_BEAM_WAIST);
  const gaussian = Math.exp(-(frame.transverseRadius * frame.transverseRadius) / (2 * beamWaist * beamWaist));
  const handedness = wave.phaseMode === 'Helical-Right' || wave.phaseMode === 'Circular-Right' ? -1 : 1;
  const vortexPhase = wave.phaseMode === 'Helical-Left'
    ? travel + HELICAL_TOPOLOGICAL_CHARGE * frame.angle
    : wave.phaseMode === 'Helical-Right'
      ? travel - HELICAL_TOPOLOGICAL_CHARGE * frame.angle
      : travel;
  const carrier = wave.phaseMode === 'Quadrature'
    ? Math.cos(vortexPhase)
    : wave.phaseMode === 'Inverted'
      ? -Math.sin(vortexPhase)
      : wave.phaseMode === 'Standing'
        ? Math.sin(waveNumber * frame.longitudinal + phase) * Math.cos(temporalPhase)
        : Math.sin(vortexPhase);
  const magnitude = (Number(wave.amplitude) || 0) * envelope * gaussian;
  const circular = wave.phaseMode === 'Circular-Left'
    || wave.phaseMode === 'Circular-Right'
    || wave.phaseMode === 'Helical-Left'
    || wave.phaseMode === 'Helical-Right';
  const electric = circular
    ? scaleVector(addVectors(scaleVector(frame.transverse, Math.cos(vortexPhase)), scaleVector(frame.side, handedness * Math.sin(vortexPhase))), magnitude)
    : scaleVector(frame.transverse, magnitude * carrier);
  const magnetic = cross(frame.direction, electric);
  const electricEnergy = dot(electric, electric);
  const magneticEnergy = dot(magnetic, magnetic);
  const energy = 0.5 * (electricEnergy + magneticEnergy);
  const stressTensor = [
    electric.x * electric.x + magnetic.x * magnetic.x - energy,
    electric.x * electric.y + magnetic.x * magnetic.y,
    electric.x * electric.z + magnetic.x * magnetic.z,
    electric.y * electric.x + magnetic.y * magnetic.x,
    electric.y * electric.y + magnetic.y * magnetic.y - energy,
    electric.y * electric.z + magnetic.y * magnetic.z,
    electric.z * electric.x + magnetic.z * magnetic.x,
    electric.z * electric.y + magnetic.z * magnetic.y,
    electric.z * electric.z + magnetic.z * magnetic.z - energy
  ];
  const norm = tensorNorm(stressTensor);
  const normalizedTensor = norm > 0 ? stressTensor.map((value) => value / norm) : stressTensor;
  return {
    electric,
    magnetic,
    gaussian,
    intensity: electricEnergy + magneticEnergy,
    tensor: normalizedTensor,
    tensorGaussian: Math.min(1, norm) * gaussian
  };
}

function waveInterferenceContribution(wave, x, z, time, interferenceModes, y) {
  if (wave.enabled === false) return 0;
  const contribution = (Number(wave.amplitude) || 0) * calculateWaveSample(wave, x, z, time, y);
  const constructiveContribution = interferenceModes.constructive ? Math.abs(contribution) : 0;
  const superpositionContribution = interferenceModes.superposition ? contribution : 0;
  return constructiveContribution + superpositionContribution;
}

export function combineWaves(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  const activeModes = normalizeInterferenceModes(interferenceModes);
  const activeWaves = waves.slice(0, MAX_WAVES);
  return activeWaves.reduce((total, wave) => total + waveInterferenceContribution(wave, x, z, time, activeModes, y), 0);
}

export function calculateWaveDisplacement(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  const activeModes = normalizeInterferenceModes(interferenceModes);
  return waves.slice(0, MAX_WAVES).reduce((total, wave) => {
    const contribution = waveInterferenceContribution(wave, x, z, time, activeModes, y);
    if (contribution === 0) return total;
    if (wave.polarization === 'Electromagnetic' || wave.polarization === 'EM-Tensor-Gaussian') {
      const field = calculateElectromagneticField(wave, x, z, time, y);
      const fieldScale = wave.polarization === 'EM-Tensor-Gaussian' ? field.tensorGaussian : 1;
      const electromagneticDisplacement = scaleVector(field.electric, fieldScale);
      return addVectors(total, electromagneticDisplacement);
    }
    const frame = calculateWaveFrame(wave, x, y, z);
    if (wave.polarization === 'Longitudinal') {
      return {
        x: total.x + contribution * frame.direction.x,
        y: total.y + contribution * frame.direction.y,
        z: total.z + contribution * frame.direction.z
      };
    }
    if (wave.polarization === 'Transverse') {
      return {
        x: total.x + contribution * frame.transverse.x,
        y: total.y + contribution * frame.transverse.y,
        z: total.z + contribution * frame.transverse.z
      };
    }
    return { x: total.x, y: total.y + contribution, z: total.z };
  }, { x: 0, y: 0, z: 0 });
}

export function calculateWaveTensorGaussian(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  const activeModes = normalizeInterferenceModes(interferenceModes);
  return Math.min(1, waves.slice(0, MAX_WAVES).reduce((total, wave) => {
    if (wave.enabled === false || wave.polarization !== 'EM-Tensor-Gaussian') return total;
    const contribution = Math.abs(waveInterferenceContribution(wave, x, z, time, activeModes, y));
    const field = calculateElectromagneticField(wave, x, z, time, y);
    return total + field.tensorGaussian * Math.max(contribution, 0.25);
  }, 0));
}

export function calculateWaveDerivative(waves, x, z, time, order, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  if (order <= 0) return combineWaves(waves, x, z, time, interferenceModes, y);
  const step = 0.05;
  return (calculateWaveDerivative(waves, x + step, z, time, order - 1, interferenceModes, y)
    - calculateWaveDerivative(waves, x - step, z, time, order - 1, interferenceModes, y)) / (step * 2);
}
