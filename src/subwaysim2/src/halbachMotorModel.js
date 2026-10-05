import { DEFAULT_FIELD_MECHANICS, evaluateFieldModel } from './mechanicsModels.js';
import { calculateMaxwellStressTensor, evaluateMechanicsResponse, normalizeTensorGaussian, SIMULATION_MECHANICS_REGIMES } from './lib/simulationMechanics.js';

const TAU = Math.PI * 2;
const MU_0 = 1.25663706212e-6;

export const HALBACH_ARRANGEMENT_OPTIONS = [
  { value: 'alternating', label: 'Standard alternating' },
  { value: 'halbach', label: 'Halbach sequence' }
];

export const DEFAULT_HALBACH_MOTOR_SETTINGS = Object.freeze({
  arrangement: 'halbach',
  magnetCount: 8,
  arraySpacingM: 0.65,
  coilGapM: 0.6,
  magnetFluxT: 1.2,
  coilCurrentA: 300,
  coilPhaseDegrees: 35,
  coilFrequencyHz: 2,
  coilConductorLengthM: 0.35,
  armatureMassKg: 100,
  mechanicsRegime: 'classical',
  tensorGaussianWaistM: 2.5,
  ddfStrength: 1,
  ddfSpeedLimitMS: 8,
  ddfBaseViscosity: 0.02,
  grassmannianPoleWeight: 0.72,
  geometryCoupling: 0.15,
  cameraViewMode: 'ortho1',
  cameraControlsEnabled: true,
  cameraOrbitOn: true,
  cameraZoomEnabled: true,
  cameraWheelMode: 'zoom',
  replayCameraOrbitSpeed: 0.1,
  replayCameraOrbitX: 0,
  replayCameraOrbitY: 1,
  replayCameraOrbitZ: 0
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function sanitizeHalbachMotorSettings(value = {}) {
  const arrangement = HALBACH_ARRANGEMENT_OPTIONS.some((option) => option.value === value.arrangement)
    ? value.arrangement
    : DEFAULT_HALBACH_MOTOR_SETTINGS.arrangement;
  const mechanicsRegime = SIMULATION_MECHANICS_REGIMES.some((option) => option.value === value.mechanicsRegime)
    ? value.mechanicsRegime
    : DEFAULT_HALBACH_MOTOR_SETTINGS.mechanicsRegime;
  return {
    ...DEFAULT_HALBACH_MOTOR_SETTINGS,
    ...value,
    arrangement,
    mechanicsRegime,
    magnetCount: Math.round(clamp(finite(value.magnetCount, DEFAULT_HALBACH_MOTOR_SETTINGS.magnetCount), 4, 16)),
    arraySpacingM: clamp(finite(value.arraySpacingM, DEFAULT_HALBACH_MOTOR_SETTINGS.arraySpacingM), 0.1, 5),
    coilGapM: clamp(finite(value.coilGapM, DEFAULT_HALBACH_MOTOR_SETTINGS.coilGapM), 0.1, 5),
    magnetFluxT: clamp(finite(value.magnetFluxT, DEFAULT_HALBACH_MOTOR_SETTINGS.magnetFluxT), 0, 5),
    coilCurrentA: clamp(finite(value.coilCurrentA, DEFAULT_HALBACH_MOTOR_SETTINGS.coilCurrentA), -10000, 10000),
    coilPhaseDegrees: clamp(finite(value.coilPhaseDegrees, DEFAULT_HALBACH_MOTOR_SETTINGS.coilPhaseDegrees), 0, 360),
    coilFrequencyHz: clamp(finite(value.coilFrequencyHz, DEFAULT_HALBACH_MOTOR_SETTINGS.coilFrequencyHz), 0.01, 20),
    coilConductorLengthM: clamp(finite(value.coilConductorLengthM, DEFAULT_HALBACH_MOTOR_SETTINGS.coilConductorLengthM), 0.05, 10),
    armatureMassKg: clamp(finite(value.armatureMassKg, DEFAULT_HALBACH_MOTOR_SETTINGS.armatureMassKg), 1, 10000),
    tensorGaussianWaistM: clamp(finite(value.tensorGaussianWaistM, DEFAULT_HALBACH_MOTOR_SETTINGS.tensorGaussianWaistM), 0.1, 100),
    ddfStrength: clamp(finite(value.ddfStrength, DEFAULT_HALBACH_MOTOR_SETTINGS.ddfStrength), 0, 20),
    ddfSpeedLimitMS: clamp(finite(value.ddfSpeedLimitMS, DEFAULT_HALBACH_MOTOR_SETTINGS.ddfSpeedLimitMS), 0.1, 1e6),
    ddfBaseViscosity: clamp(finite(value.ddfBaseViscosity, DEFAULT_HALBACH_MOTOR_SETTINGS.ddfBaseViscosity), 0, 1),
    grassmannianPoleWeight: clamp(finite(value.grassmannianPoleWeight, DEFAULT_HALBACH_MOTOR_SETTINGS.grassmannianPoleWeight), 0, 1),
    geometryCoupling: clamp(finite(value.geometryCoupling, DEFAULT_HALBACH_MOTOR_SETTINGS.geometryCoupling), 0, 0.25)
  };
}

function magnetAngle(index, arrangement) {
  if (arrangement === 'halbach') return index * Math.PI / 2;
  return index % 2 === 0 ? 0 : Math.PI;
}

function calculateDipoleField(settings, x, y, z = 0) {
  let fieldX = 0;
  let fieldY = 0;
  let fieldZ = 0;
  const moment = settings.magnetFluxT * settings.arraySpacingM ** 3;
  for (let index = 0; index < settings.magnetCount; index += 1) {
    const magnetX = (index - (settings.magnetCount - 1) / 2) * settings.arraySpacingM;
    const dx = x - magnetX;
    const dy = y;
    const dz = z;
    const radiusSquared = dx * dx + dy * dy + dz * dz + 0.04;
    const inverseRadiusCubed = 1 / (radiusSquared * Math.sqrt(radiusSquared));
    const angle = magnetAngle(index, settings.arrangement);
    const momentX = moment * Math.cos(angle);
    const momentY = moment * Math.sin(angle);
    const projection = momentX * dx + momentY * dy;
    fieldX += (3 * projection * dx / radiusSquared - momentX) * inverseRadiusCubed;
    fieldY += (3 * projection * dy / radiusSquared - momentY) * inverseRadiusCubed;
    fieldZ += (3 * projection * dz / radiusSquared) * inverseRadiusCubed;
  }
  return { x: fieldX, y: fieldY, z: fieldZ, magnitudeT: Math.hypot(fieldX, fieldY, fieldZ) };
}

export function calculateHalbachMotorState(value = DEFAULT_HALBACH_MOTOR_SETTINGS, timeSeconds = 0) {
  const settings = sanitizeHalbachMotorSettings(value);
  const sampleCount = Math.max(9, settings.magnetCount * 2 + 1);
  const spanM = Math.max(settings.arraySpacingM, (settings.magnetCount - 1) * settings.arraySpacingM);
  let coilSideFluxT = 0;
  let shieldSideFluxT = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const x = (sample / (sampleCount - 1) - 0.5) * spanM;
    coilSideFluxT += calculateDipoleField(settings, x, settings.coilGapM).magnitudeT / sampleCount;
    shieldSideFluxT += calculateDipoleField(settings, x, -settings.coilGapM).magnitudeT / sampleCount;
  }
  const phaseRadians = settings.coilPhaseDegrees * Math.PI / 180;
  const coils = Array.from({ length: settings.magnetCount }, (_, index) => {
    const x = (index - (settings.magnetCount - 1) / 2) * settings.arraySpacingM;
    const coilField = calculateDipoleField(settings, x, settings.coilGapM);
    const phase = phaseRadians + index * Math.PI / 2 - timeSeconds * settings.coilFrequencyHz * TAU;
    const currentFraction = Math.sin(phase);
    return { index, x, phase, currentFraction, currentA: currentFraction * settings.coilCurrentA, fieldT: coilField.magnitudeT, forceN: currentFraction * settings.coilCurrentA * settings.coilConductorLengthM * coilField.magnitudeT };
  });
  const forceN = coils.reduce((sum, coil) => sum + coil.forceN, 0);
  const ddf = evaluateFieldModel('ddf', { radius: settings.coilGapM, speed: Math.abs(forceN) / settings.armatureMassKg, magnitude: 1 }, {
    ...DEFAULT_FIELD_MECHANICS,
    coreRadius: settings.tensorGaussianWaistM,
    speedLimit: settings.ddfSpeedLimitMS,
    dilatancy: settings.ddfStrength,
    baseViscosity: settings.ddfBaseViscosity
  });
  const gaussianWeight = Math.exp(-(settings.coilGapM * settings.coilGapM) / (2 * settings.tensorGaussianWaistM ** 2));
  const mechanics = evaluateMechanicsResponse({ regime: settings.mechanicsRegime, gaussianWeight, ddfMobility: ddf.mobility, grassmannianWeight: settings.grassmannianPoleWeight, geometryCoupling: settings.geometryCoupling });
  const adjustedForceN = forceN * mechanics.accelerationScale;
  const magneticEnergy = calculateMaxwellStressTensor({ x: 0, y: 0, z: 0 }, { x: 0, y: coilSideFluxT, z: 0 });
  return {
    settings,
    magnets: Array.from({ length: settings.magnetCount }, (_, index) => ({ index, x: (index - (settings.magnetCount - 1) / 2) * settings.arraySpacingM, angle: magnetAngle(index, settings.arrangement) })),
    coils,
    coilSideFluxT,
    shieldSideFluxT,
    fluxConcentrationRatio: coilSideFluxT / Math.max(1e-9, shieldSideFluxT),
    forceN: adjustedForceN,
    rawForceN: forceN,
    accelerationMS2: adjustedForceN / settings.armatureMassKg,
    maxwellMagneticPressurePa: magneticEnergy.energyDensity / MU_0,
    tensorGaussianWeight: normalizeTensorGaussian(coilSideFluxT * coilSideFluxT, gaussianWeight),
    mechanics,
    spanM,
    status: 'Dipole superposition and traveling-coil envelope; finite-array fringing, eddy currents, and thermal limits are not solved.'
  };
}

export function createHalbachFieldLineVertices(value = DEFAULT_HALBACH_MOTOR_SETTINGS, samplesPerLine = 28) {
  const settings = sanitizeHalbachMotorSettings(value);
  const spanM = Math.max(settings.arraySpacingM, (settings.magnetCount - 1) * settings.arraySpacingM);
  const coilSideLines = settings.arrangement === 'halbach' ? settings.magnetCount * 2 : settings.magnetCount;
  const shieldSideLines = settings.arrangement === 'halbach' ? Math.max(2, Math.ceil(settings.magnetCount / 3)) : settings.magnetCount;
  const vertices = [];
  for (const [side, count] of [[1, coilSideLines], [-1, shieldSideLines]]) {
    for (let line = 0; line < count; line += 1) {
      const centerX = (line / Math.max(1, count - 1) - 0.5) * spanM;
      const offsetZ = (line % 3 - 1) * 0.08;
      const points = Array.from({ length: samplesPerLine }, (_, index) => {
        const progress = index / (samplesPerLine - 1);
        const x = centerX + (progress - 0.5) * settings.arraySpacingM * 1.7;
        const y = side * (settings.coilGapM + 0.08 + Math.sin(progress * Math.PI) * settings.arraySpacingM * 0.85);
        return [x, y, offsetZ];
      });
      for (let index = 0; index < points.length - 1; index += 1) vertices.push(...points[index], ...points[index + 1]);
    }
  }
  return new Float32Array(vertices);
}