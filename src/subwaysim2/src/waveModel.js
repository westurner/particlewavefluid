export const MAX_WAVES = 8;
export const DEFAULT_WAVE_COUNT = 6;
export const DEFAULT_SIGNAL_ORIGIN = { x: 0, y: 0, z: 0 };
export const DEFAULT_SIGNAL_DIRECTION = { x: 1, y: 0, z: 0 };
export const DEFAULT_SIGNAL_ROTATION = { x: 0, y: 0, z: 0 };
export const HELICAL_TOPOLOGICAL_CHARGE = 1;
export const OAM_CHARGE_MIN = -3;
export const OAM_CHARGE_MAX = 3;
export const DEFAULT_BEAM_WAIST = 6;
export const DOUBLE_SLIT_SCREEN_X = 0;
export const DOUBLE_SLIT_CENTERS = [-2.1, 2.1];
export const DOUBLE_SLIT_WIDTH = 1.1;
export const DOUBLE_SLIT_SCREEN_THICKNESS = 0.4;
export const APERTURE_SCREEN_DEPTH = 0.22;
export const DOUBLE_SLIT_DETECTOR_X = 7.2;
export const DOUBLE_SLIT_DETECTOR_SPAN = 16;
export const APERTURE_SCREEN_HEIGHT = 3.2;
export const DETECTOR_TRANSVERSE_SPAN = 16;
export const PINHOLE_RADIUS = 0.85;
export const SINGLE_SLIT_WIDTH = 3.6;
export const GRATING_SLIT_COUNT = 5;
export const GRATING_SLIT_SPACING = 1.6;
export const GRATING_SLIT_WIDTH = 0.55;
export const GRATING_SLIT_CENTERS = Array.from({ length: GRATING_SLIT_COUNT }, (_, index) => (index - (GRATING_SLIT_COUNT - 1) / 2) * GRATING_SLIT_SPACING);
export const TWO_SOURCE_CENTERS = [-2.1, 2.1];
export const DEFAULT_APERTURE_SETTINGS = {
  slitPosition: 0,
  slitWidthA: DOUBLE_SLIT_WIDTH,
  slitWidthB: DOUBLE_SLIT_WIDTH,
  slitWidthsLinked: true,
  slitCount: null,
  slitSpacing: null,
  slitWallMargin: 0,
  slitOpacity: 0.2,
  slitScreenPositionX: DOUBLE_SLIT_SCREEN_X,
  slitScreenPositionY: 0,
  slitScreenPositionZ: 0,
  slitScreenRotationX: 0,
  slitScreenRotationY: 0,
  slitScreenRotationZ: 0,
  detectorDistance: DOUBLE_SLIT_DETECTOR_X - DOUBLE_SLIT_SCREEN_X
};
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
  { id: 'pinhole', name: 'Pinhole', description: 'A circular aperture in a transverse screen, sampled across both transverse dimensions.' },
  { id: 'single-slit', name: 'Single slit', description: 'One wider aperture for a single-slit transmission pattern.' },
  { id: 'double-slit', name: 'Double slit', description: 'Two separated apertures in an otherwise blocking screen.' },
  { id: 'diffraction-grating', name: 'Diffraction grating', description: 'Five coherent slits in a transverse screen.' },
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

export function getOrbitalAngularMomentum(wave) {
  const fallback = wave.phaseMode === 'Helical-Right'
    ? -HELICAL_TOPOLOGICAL_CHARGE
    : wave.phaseMode === 'Helical-Left'
      ? HELICAL_TOPOLOGICAL_CHARGE
      : 0;
  const requested = Number(wave.orbitalAngularMomentum);
  const charge = Number.isFinite(requested) ? Math.round(requested) : fallback;
  return Math.max(OAM_CHARGE_MIN, Math.min(OAM_CHARGE_MAX, charge));
}

function cloneWave(wave) {
  return {
    ...wave,
    origin: { ...DEFAULT_SIGNAL_ORIGIN, ...(wave.origin || {}) },
    direction: { ...DEFAULT_SIGNAL_DIRECTION, ...(wave.direction || {}) },
    rotation: { ...DEFAULT_SIGNAL_ROTATION, ...(wave.rotation || {}) },
    decayRate: Math.max(0, Number(wave.decayRate) || 0),
    beamWaist: Math.max(0.1, Number(wave.beamWaist) || DEFAULT_BEAM_WAIST),
    orbitalAngularMomentum: getOrbitalAngularMomentum(wave),
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
const DOUBLE_SLIT_SOURCE = cloneWave({ wavelength: 1.5, amplitude: 0.95, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, decayRate: 0, polarization: 'Electromagnetic', origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true });
const PINHOLE_SOURCE = cloneWave({ wavelength: 0.95, amplitude: 0.95, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, decayRate: 0, polarization: 'Electromagnetic', origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true });
const SINGLE_SLIT_SOURCE = cloneWave({ wavelength: 1.5, amplitude: 0.95, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, decayRate: 0, polarization: 'Electromagnetic', origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true });
const GRATING_SOURCE = cloneWave({ wavelength: 0.95, amplitude: 0.95, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, decayRate: 0, polarization: 'Electromagnetic', origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true });
const TWO_SOURCE_WAVE = cloneWave({ wavelength: 1.5, amplitude: 0.95, phaseMode: 'Standard', phaseOffset: 0, phaseRate: 1, decayRate: 0, polarization: 'Electromagnetic', origin: { x: -8, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, enabled: true });

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
  waveState('Double-slit experiment', 'A monochromatic transverse electromagnetic wave illuminates two finite apertures; the detector records coherent field intensity.', 1, 'superposition', [
    DOUBLE_SLIT_SOURCE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Single-slit experiment', 'A monochromatic transverse electromagnetic wave forms a single-slit diffraction envelope on the detector.', 1, 'superposition', [
    SINGLE_SLIT_SOURCE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Pinhole experiment', 'A coherent electromagnetic wave passes through a circular aperture and forms a two-dimensional diffraction pattern.', 1, 'superposition', [
    PINHOLE_SOURCE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Diffraction grating', 'Five coherent slits produce narrow principal maxima on the two-dimensional detector.', 1, 'superposition', [
    GRATING_SOURCE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
  ]),
  waveState('Two coherent sources', 'Two in-phase point sources interfere without an intervening screen.', 1, 'superposition', [
    TWO_SOURCE_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE, SILENT_WAVE
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

export function calculateOcclusionTransmission(presetId, x, z, y = 0, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  const aperturePreset = ['pinhole', 'single-slit', 'double-slit', 'diffraction-grating'].includes(presetId);
  if (presetId === 'none') return 1;
  if (presetId === 'pinhole') {
    if (Math.abs(x - DOUBLE_SLIT_SCREEN_X) > DOUBLE_SLIT_SCREEN_THICKNESS / 2) return 1;
    return y ** 2 + z ** 2 <= PINHOLE_RADIUS ** 2 ? 1 : 0;
  }
  if (['single-slit', 'double-slit', 'diffraction-grating'].includes(presetId)) {
    const mode = presetId === 'diffraction-grating' ? 'grating' : presetId;
    const geometry = getSlitGeometry(mode, apertureSettings);
    const point = slitScreenWorldToLocal({ x, y, z }, apertureSettings);
    if (Math.abs(point.x) > DOUBLE_SLIT_SCREEN_THICKNESS / 2) return 1;
    if (Math.abs(point.y) > geometry.openingHeight / 2) return 0;
    return geometry.centers.some((center, index) => Math.abs(point.z - center) <= geometry.widths[index] / 2) ? 1 : 0;
  }
  if (!aperturePreset && x <= 0) return 1;
  if (presetId === 'sierpinski-carpet') return sierpinskiCarpetPass(x, z) ? 1 : 0;
  if (presetId === 'unilluminable-room') return x > 1.5 && x < 8.2 && Math.abs(z) < 4.2 ? 0 : 1;
  if (presetId === 'boulder') {
    const distanceFromBoulder = Math.hypot(x - 2.8, z);
    const shadowWidth = 1.8 + Math.max(0, x - 2.8) * 0.32;
    return distanceFromBoulder < 1.8 || (x > 2.8 && Math.abs(z) < shadowWidth) ? 0 : 1;
  }
  return 1;
}

export function normalizeApertureSettings(settings = {}) {
  const finiteValue = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const optionalInteger = (value, minimum, maximum) => value === null || value === undefined
    ? null
    : Math.min(maximum, Math.max(minimum, Math.round(finiteValue(value, minimum))));
  const slitScreenPosition = {
    x: Math.min(9, Math.max(-9, finiteValue(settings.slitScreenPositionX, DEFAULT_APERTURE_SETTINGS.slitScreenPositionX))),
    y: Math.min(9, Math.max(-9, finiteValue(settings.slitScreenPositionY, DEFAULT_APERTURE_SETTINGS.slitScreenPositionY))),
    z: Math.min(9, Math.max(-9, finiteValue(settings.slitScreenPositionZ, DEFAULT_APERTURE_SETTINGS.slitScreenPositionZ)))
  };
  const detectorDistance = settings.detectorDistance === null || settings.detectorDistance === undefined
    ? detectorDistanceForSlitScreenPosition(slitScreenPosition)
    : Math.min(21, Math.max(0.5, finiteValue(settings.detectorDistance, DEFAULT_APERTURE_SETTINGS.detectorDistance)));
  return {
    slitPosition: Math.min(3, Math.max(-3, finiteValue(settings.slitPosition, DEFAULT_APERTURE_SETTINGS.slitPosition))),
    slitWidthA: Math.min(3.6, Math.max(0.2, finiteValue(settings.slitWidthA, DEFAULT_APERTURE_SETTINGS.slitWidthA))),
    slitWidthB: Math.min(3.6, Math.max(0.2, finiteValue(settings.slitWidthB, DEFAULT_APERTURE_SETTINGS.slitWidthB))),
    slitWidthsLinked: settings.slitWidthsLinked ?? DEFAULT_APERTURE_SETTINGS.slitWidthsLinked,
    slitCount: optionalInteger(settings.slitCount, 1, 12),
    slitSpacing: settings.slitSpacing === null || settings.slitSpacing === undefined
      ? null
      : Math.min(8, Math.max(0.5, finiteValue(settings.slitSpacing, 4.2))),
    slitWallMargin: Math.min(APERTURE_SCREEN_HEIGHT / 2 - 0.05, Math.max(0, finiteValue(settings.slitWallMargin, DEFAULT_APERTURE_SETTINGS.slitWallMargin))),
    slitOpacity: Math.min(1, Math.max(0, finiteValue(settings.slitOpacity, DEFAULT_APERTURE_SETTINGS.slitOpacity))),
    slitScreenPositionX: slitScreenPosition.x,
    slitScreenPositionY: slitScreenPosition.y,
    slitScreenPositionZ: slitScreenPosition.z,
    slitScreenRotationX: Math.min(Math.PI, Math.max(-Math.PI, finiteValue(settings.slitScreenRotationX, DEFAULT_APERTURE_SETTINGS.slitScreenRotationX))),
    slitScreenRotationY: Math.min(Math.PI, Math.max(-Math.PI, finiteValue(settings.slitScreenRotationY, DEFAULT_APERTURE_SETTINGS.slitScreenRotationY))),
    slitScreenRotationZ: Math.min(Math.PI, Math.max(-Math.PI, finiteValue(settings.slitScreenRotationZ, DEFAULT_APERTURE_SETTINGS.slitScreenRotationZ))),
    detectorDistance
  };
}

export function getSlitGeometry(experimentMode, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  const settings = normalizeApertureSettings(apertureSettings);
  if (!['single-slit', 'double-slit', 'grating'].includes(experimentMode)) {
    return { centers: [], widths: [] };
  }
  const defaultCount = experimentMode === 'single-slit' ? 1 : experimentMode === 'grating' ? GRATING_SLIT_COUNT : DOUBLE_SLIT_CENTERS.length;
  const defaultSpacing = experimentMode === 'grating' ? GRATING_SLIT_SPACING : Math.abs(DOUBLE_SLIT_CENTERS[1] - DOUBLE_SLIT_CENTERS[0]);
  const count = settings.slitCount ?? defaultCount;
  const spacing = settings.slitSpacing ?? defaultSpacing;
  const centers = Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * spacing);
  const maximumSlitWidth = Math.max(0.2, spacing - 0.1);
  const widths = centers.map((_, index) => {
    const requestedWidth = experimentMode === 'double-slit' && index === 1 && !settings.slitWidthsLinked
      ? settings.slitWidthB
      : settings.slitWidthA;
    return Math.min(requestedWidth, maximumSlitWidth);
  });
  return {
    centers: centers.map((center) => center + settings.slitPosition),
    widths,
    count,
    spacing,
    openingHeight: APERTURE_SCREEN_HEIGHT - settings.slitWallMargin * 2,
    wallMargin: settings.slitWallMargin,
    opacity: settings.slitOpacity,
    screenPosition: slitScreenPosition(settings),
    screenRotation: slitScreenRotation(settings),
    detectorDistance: settings.detectorDistance
  };
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

function slitScreenRotation(settings) {
  return {
    x: settings.slitScreenRotationX,
    y: settings.slitScreenRotationY,
    z: settings.slitScreenRotationZ
  };
}

function slitScreenPosition(settings) {
  return {
    x: settings.slitScreenPositionX,
    y: settings.slitScreenPositionY,
    z: settings.slitScreenPositionZ
  };
}

export function slitScreenLocalToWorld(point, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  const settings = normalizeApertureSettings(apertureSettings);
  const rotated = rotateVector(point, slitScreenRotation(settings));
  const position = slitScreenPosition(settings);
  return { x: position.x + rotated.x, y: position.y + rotated.y, z: position.z + rotated.z };
}

export function slitScreenWorldToLocal(point, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  const settings = normalizeApertureSettings(apertureSettings);
  const position = slitScreenPosition(settings);
  const relative = { x: point.x - position.x, y: point.y - position.y, z: point.z - position.z };
  const rotation = slitScreenRotation(settings);
  return {
    x: dot(relative, rotateVector({ x: 1, y: 0, z: 0 }, rotation)),
    y: dot(relative, rotateVector({ x: 0, y: 1, z: 0 }, rotation)),
    z: dot(relative, rotateVector({ x: 0, y: 0, z: 1 }, rotation))
  };
}

export function detectorDistanceForSlitScreenPosition(position) {
  return Math.hypot(
    DOUBLE_SLIT_DETECTOR_X - position.x,
    -position.y,
    -position.z
  );
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

function calculateHelicalPhase(wave, travel, angle) {
  return travel + getOrbitalAngularMomentum(wave) * angle;
}

export function calculateWaveOrbitalPhase(waves, x, z, time, y = 0) {
  let real = 0;
  let imaginary = 0;
  for (let index = 0; index < Math.min(waves.length, MAX_WAVES); index += 1) {
    const wave = waves[index];
    if (wave.enabled === false || wave.polarization !== 'EM-Tensor-Gaussian') continue;
    if (wave.phaseMode !== 'Helical-Left' && wave.phaseMode !== 'Helical-Right') continue;
    const wavelength = Math.max(0.1, Number(wave.wavelength) || 0.1);
    const waveNumber = (Math.PI * 2) / wavelength;
    const temporalPhase = time * (Number(wave.phaseRate) || 0);
    const frame = calculateWaveFrame(wave, x, y, z);
    const travel = waveNumber * frame.longitudinal - temporalPhase + (Number(wave.phaseOffset) || 0);
    const gaussian = Math.exp(-(frame.transverseRadius * frame.transverseRadius) / (2 * Math.max(0.1, Number(wave.beamWaist) || DEFAULT_BEAM_WAIST) ** 2));
    const amplitude = (Number(wave.amplitude) || 0) * calculateWaveEnvelope(wave, frame.longitudinal) * gaussian;
    const phase = calculateHelicalPhase(wave, travel, frame.angle);
    real += amplitude * Math.cos(phase);
    imaginary += amplitude * Math.sin(phase);
  }
  return Math.hypot(real, imaginary) > 0 ? Math.atan2(imaginary, real) : null;
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
    case 'Helical-Right':
      return Math.sin(calculateHelicalPhase(wave, travel, angle)) * envelope;
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

export function calculateElectromagneticField(wave, x, z, time, y = 0, includeTensor = true, includeMagnetic = includeTensor) {
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
  const vortexPhase = wave.phaseMode === 'Helical-Left' || wave.phaseMode === 'Helical-Right'
    ? calculateHelicalPhase(wave, travel, frame.angle)
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
  const magnetic = includeMagnetic ? cross(frame.direction, electric) : { x: 0, y: 0, z: 0 };
  const electricEnergy = dot(electric, electric);
  const magneticEnergy = includeMagnetic ? dot(magnetic, magnetic) : 0;
  const energy = includeTensor ? 0.5 * (electricEnergy + magneticEnergy) : 0;
  let normalizedTensor;
  if (includeTensor) {
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
    normalizedTensor = electricEnergy > 0 ? stressTensor.map((value) => value / electricEnergy) : stressTensor;
  }
  return {
    electric,
    magnetic,
    gaussian,
    intensity: electricEnergy + magneticEnergy,
    ...(includeTensor ? { tensor: normalizedTensor } : {}),
    tensorGaussian: Math.min(1, electricEnergy) * gaussian
  };
}

export function createApertureSamplePoints(experimentMode, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  if (experimentMode === 'pinhole') {
    const sampleCount = 96;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: sampleCount }, (_, index) => {
      const radius = PINHOLE_RADIUS * Math.sqrt((index + 0.5) / sampleCount);
      const angle = index * goldenAngle;
      return { y: radius * Math.cos(angle), z: radius * Math.sin(angle), weight: 1 / sampleCount };
    });
  }
  if (['single-slit', 'double-slit', 'grating'].includes(experimentMode)) {
    const rows = 5;
    const columns = 7;
    const { centers, widths, openingHeight } = getSlitGeometry(experimentMode, apertureSettings);
    return centers.flatMap((center, slitIndex) => Array.from({ length: rows * columns }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      return {
        y: ((row + 0.5) / rows - 0.5) * openingHeight,
        z: center + ((column + 0.5) / columns - 0.5) * widths[slitIndex],
        weight: widths[slitIndex] * openingHeight / APERTURE_SCREEN_HEIGHT / (rows * columns)
      };
    }));
  }
  if (experimentMode === 'two-source') return TWO_SOURCE_CENTERS.map((z) => ({ y: 0, z, weight: 1 }));
  return [];
}

export function prepareApertureField(waves, experimentMode, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  const samplePoints = createApertureSamplePoints(experimentMode, apertureSettings);
  const emitters = [];
  for (const wave of waves.slice(0, MAX_WAVES)) {
    if (wave.enabled === false) continue;
    const wavelength = Math.max(0.1, Number(wave.wavelength) || 0.1);
    const waveNumber = (Math.PI * 2) / wavelength;
    const amplitude = Number(wave.amplitude) || 0;
    const phaseOffset = (Number(wave.phaseOffset) || 0)
      + (wave.phaseMode === 'Inverted' ? Math.PI : wave.phaseMode === 'Quadrature' ? Math.PI / 2 : 0);
    const phaseRate = Number(wave.phaseRate) || 0;
    const beamWaist = Math.max(0.1, Number(wave.beamWaist) || DEFAULT_BEAM_WAIST);
    for (const point of samplePoints) {
      const emitterPosition = ['single-slit', 'double-slit', 'grating'].includes(experimentMode)
        ? slitScreenLocalToWorld({ x: 0, y: point.y, z: point.z }, apertureSettings)
        : { x: DOUBLE_SLIT_SCREEN_X, y: point.y, z: point.z };
      const frame = calculateWaveFrame(wave, emitterPosition.x, emitterPosition.y, emitterPosition.z);
      const beamProfile = Math.exp(-(frame.transverseRadius ** 2) / (2 * beamWaist ** 2));
      emitters.push({
        x: emitterPosition.x,
        y: emitterPosition.y,
        z: emitterPosition.z,
        waveNumber,
        phaseRate,
        phase: waveNumber * frame.longitudinal + phaseOffset,
        amplitude: amplitude * calculateWaveEnvelope(wave, frame.longitudinal) * beamProfile * point.weight,
        transverse: frame.transverse,
        side: frame.side
      });
    }
  }
  return { experimentMode, emitters };
}

export function sampleApertureField(preparedField, x, y, z, time) {
  const electric = { x: 0, y: 0, z: 0 };
  const constructiveElectric = { x: 0, y: 0, z: 0 };
  if (!preparedField) return { electric, constructiveElectric, intensity: 0, constructiveIntensity: 0 };
  for (const emitter of preparedField.emitters) {
    const offsetX = x - (emitter.x ?? DOUBLE_SLIT_SCREEN_X);
    const offsetY = y - emitter.y;
    const offsetZ = z - emitter.z;
    const distance = Math.hypot(offsetX, offsetY, offsetZ);
    if (distance < 1e-6) continue;
    const propagationX = offsetX / distance;
    const propagationY = offsetY / distance;
    const propagationZ = offsetZ / distance;
    const polarizationAlongRay = emitter.transverse.x * propagationX + emitter.transverse.y * propagationY + emitter.transverse.z * propagationZ;
    let polarizationX = emitter.transverse.x - polarizationAlongRay * propagationX;
    let polarizationY = emitter.transverse.y - polarizationAlongRay * propagationY;
    let polarizationZ = emitter.transverse.z - polarizationAlongRay * propagationZ;
    const polarizationLength = Math.hypot(polarizationX, polarizationY, polarizationZ);
    if (polarizationLength < 1e-6) {
      const sideAlongRay = emitter.side.x * propagationX + emitter.side.y * propagationY + emitter.side.z * propagationZ;
      polarizationX = emitter.side.x - sideAlongRay * propagationX;
      polarizationY = emitter.side.y - sideAlongRay * propagationY;
      polarizationZ = emitter.side.z - sideAlongRay * propagationZ;
    }
    const phase = emitter.waveNumber * distance + emitter.phase - emitter.phaseRate * time;
    const fieldAmplitude = emitter.amplitude * Math.sin(phase) / distance;
    const constructiveAmplitude = Math.abs(fieldAmplitude);
    electric.x += polarizationX * fieldAmplitude;
    electric.y += polarizationY * fieldAmplitude;
    electric.z += polarizationZ * fieldAmplitude;
    constructiveElectric.x += polarizationX * constructiveAmplitude;
    constructiveElectric.y += polarizationY * constructiveAmplitude;
    constructiveElectric.z += polarizationZ * constructiveAmplitude;
  }
  return {
    electric,
    constructiveElectric,
    intensity: dot(electric, electric),
    constructiveIntensity: dot(constructiveElectric, constructiveElectric)
  };
}

export function calculateDoubleSlitField(waves, x, z, time, y = 0, apertureSettings = DEFAULT_APERTURE_SETTINGS) {
  return sampleApertureField(prepareApertureField(waves, 'double-slit', apertureSettings), x, y, z, time);
}

export function calculatePinholeField(waves, x, y, z, time) {
  return sampleApertureField(prepareApertureField(waves, 'pinhole'), x, y, z, time);
}

export function advanceDetectorResponse(response, intensity, delta, detectionTime, glowTime) {
  const elapsed = Math.max(0, Number(delta) || 0);
  const detectionDuration = Math.max(0.01, Number(detectionTime) || 0.01);
  const glowDuration = Math.max(0.01, Number(glowTime) || 0.01);
  const average = response.average + (Math.max(0, intensity) - response.average) * (1 - Math.exp(-elapsed / detectionDuration));
  const glow = Math.max(average, response.glow * Math.exp(-elapsed / glowDuration));
  return { average, glow };
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

export function calculateWaveDisplacementAndTensorGaussian(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  const activeModes = normalizeInterferenceModes(interferenceModes);
  const responseLayerCount = Number(activeModes.constructive) + Number(activeModes.superposition);
  const displacement = { x: 0, y: 0, z: 0 };
  let tensorGaussianTotal = 0;
  for (let index = 0; index < Math.min(waves.length, MAX_WAVES); index += 1) {
    const wave = waves[index];
    if (wave.enabled === false) continue;
    if (wave.polarization === 'Electromagnetic' || wave.polarization === 'EM-Tensor-Gaussian') {
      if (responseLayerCount === 0) continue;
      const field = calculateElectromagneticField(wave, x, z, time, y, false);
      const isTensorGaussian = wave.polarization === 'EM-Tensor-Gaussian';
      const fieldScale = (isTensorGaussian ? field.tensorGaussian : 1) * responseLayerCount;
      const electromagneticDisplacement = scaleVector(field.electric, fieldScale);
      displacement.x += electromagneticDisplacement.x;
      displacement.y += electromagneticDisplacement.y;
      displacement.z += electromagneticDisplacement.z;
      if (isTensorGaussian) tensorGaussianTotal += field.tensorGaussian * responseLayerCount;
      continue;
    }
    const contribution = waveInterferenceContribution(wave, x, z, time, activeModes, y);
    if (contribution === 0) continue;
    const frame = calculateWaveFrame(wave, x, y, z);
    if (wave.polarization === 'Longitudinal') {
      displacement.x += contribution * frame.direction.x;
      displacement.y += contribution * frame.direction.y;
      displacement.z += contribution * frame.direction.z;
    } else if (wave.polarization === 'Transverse') {
      displacement.x += contribution * frame.transverse.x;
      displacement.y += contribution * frame.transverse.y;
      displacement.z += contribution * frame.transverse.z;
    } else {
      displacement.y += contribution;
    }
  }
  return { displacement, tensorGaussian: Math.min(1, tensorGaussianTotal) };
}

export function calculateWaveDisplacement(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  return calculateWaveDisplacementAndTensorGaussian(waves, x, z, time, interferenceModes, y).displacement;
}

export function calculateWaveTensorGaussian(waves, x, z, time, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  const activeModes = normalizeInterferenceModes(interferenceModes);
  const responseLayerCount = Number(activeModes.constructive) + Number(activeModes.superposition);
  if (responseLayerCount === 0) return 0;
  let total = 0;
  for (let index = 0; index < Math.min(waves.length, MAX_WAVES); index += 1) {
    const wave = waves[index];
    if (wave.enabled === false || wave.polarization !== 'EM-Tensor-Gaussian') continue;
    const wavelength = Math.max(0.1, Number(wave.wavelength) || 0.1);
    const phaseOffset = Number(wave.phaseOffset) || 0;
    const phaseRate = Number(wave.phaseRate) || 0;
    const waveNumber = (Math.PI * 2) / wavelength;
    const temporalPhase = time * phaseRate;
    const frame = calculateWaveFrame(wave, x, y, z);
    const gaussian = Math.exp(-(frame.transverseRadius * frame.transverseRadius) / (2 * Math.max(0.1, Number(wave.beamWaist) || DEFAULT_BEAM_WAIST) ** 2));
    const magnitude = (Number(wave.amplitude) || 0) * calculateWaveEnvelope(wave, frame.longitudinal) * gaussian;
    const travel = waveNumber * frame.longitudinal - temporalPhase + phaseOffset;
    const vortexPhase = wave.phaseMode === 'Helical-Left' || wave.phaseMode === 'Helical-Right'
      ? calculateHelicalPhase(wave, travel, frame.angle)
      : travel;
    const isCircular = wave.phaseMode === 'Circular-Left'
      || wave.phaseMode === 'Circular-Right'
      || wave.phaseMode === 'Helical-Left'
      || wave.phaseMode === 'Helical-Right';
    let carrier;
    if (wave.phaseMode === 'Quadrature') carrier = Math.cos(vortexPhase);
    else if (wave.phaseMode === 'Inverted') carrier = -Math.sin(vortexPhase);
    else if (wave.phaseMode === 'Standing') carrier = Math.sin(waveNumber * frame.longitudinal + phaseOffset) * Math.cos(temporalPhase);
    else carrier = Math.sin(vortexPhase);
    const electricEnergy = magnitude * magnitude * (isCircular ? 1 : carrier * carrier);
    total += Math.min(1, electricEnergy) * gaussian * responseLayerCount;
  }
  return Math.min(1, total);
}

export function calculateWaveDerivative(waves, x, z, time, order, interferenceModes = DEFAULT_INTERFERENCE_MODES, y = 0) {
  if (order <= 0) return combineWaves(waves, x, z, time, interferenceModes, y);
  const step = 0.05;
  return (calculateWaveDerivative(waves, x + step, z, time, order - 1, interferenceModes, y)
    - calculateWaveDerivative(waves, x - step, z, time, order - 1, interferenceModes, y)) / (step * 2);
}
