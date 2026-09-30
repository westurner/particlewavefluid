import { calculateWaveSample } from './waveModel.js';

const ELEMENTARY_CHARGE_C = 1.602176634e-19;
const ATOMIC_MASS_KG = 1.66053906660e-27;
const SPEED_OF_LIGHT_MPS = 299792458;

export const PLASMA_FOCUS_ION_SPECIES = {
  proton: { label: 'Proton (H+)', massAMU: 1.007276, chargeState: 1 },
  deuteron: { label: 'Deuteron (D+)', massAMU: 2.013553, chargeState: 1 },
  triton: { label: 'Triton (T+)', massAMU: 3.015501, chargeState: 1 },
  alpha: { label: 'Helium nucleus (He2+)', massAMU: 4.001506, chargeState: 2 },
  argon: { label: 'Argon ion (Ar+)', massAMU: 39.948, chargeState: 1 }
};

function bounded(value, fallback, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value ?? fallback)));
}

export function calculateFocusBeamDirection({ inward, flowTangent, tubeDirection, flowRelativeCantDegrees = 0, tubeAxisCantDegrees = 0 }) {
  const flowCant = bounded(flowRelativeCantDegrees, 0, -75, 75) * Math.PI / 180;
  const tubeAxisCant = bounded(tubeAxisCantDegrees, 0, -60, 60) * Math.PI / 180;
  const flowAimed = inward.map((component, index) => (
    component * Math.cos(flowCant) + flowTangent[index] * Math.sin(flowCant)
  ));
  const direction = flowAimed.map((component, index) => (
    component * Math.cos(tubeAxisCant) + tubeDirection[index] * Math.sin(tubeAxisCant)
  ));
  const magnitude = Math.hypot(...direction) || 1;
  return direction.map((component) => component / magnitude);
}

export function calculatePlasmaFocusBeam({
  acceleratorVoltageKV = 30,
  totalBeamCurrentKA = 2,
  pulseDurationMicroseconds = 20,
  pulseRepetitionHz = 20,
  ionSpecies = 'deuteron',
  focusGapM = 0.35,
  launcherCount = 16,
  waveModulationDepth = 0.12,
  waveWavelengthM = 2.4,
  waveFrequencyKHz = 100,
  wavePhaseRadians = 0,
  wavePosition = { x: 0, y: 0, z: 0 },
  timeSeconds = 0
} = {}) {
  const ion = PLASMA_FOCUS_ION_SPECIES[ionSpecies] ?? PLASMA_FOCUS_ION_SPECIES.deuteron;
  const voltage = bounded(acceleratorVoltageKV, 30, 1, 500);
  const current = bounded(totalBeamCurrentKA, 2, 0, 100);
  const pulseDuration = bounded(pulseDurationMicroseconds, 20, 0.1, 1000);
  const repetition = bounded(pulseRepetitionHz, 20, 0.1, 1000);
  const gap = bounded(focusGapM, 0.35, 0.01, 5);
  const focusCount = Math.max(1, Math.round(Number(launcherCount) || 1));
  const modulationDepth = bounded(waveModulationDepth, 0.12, 0, 0.5);
  const wavelength = bounded(waveWavelengthM, 2.4, 0.1, 20);
  const modulationFrequencyKHz = bounded(waveFrequencyKHz, 100, 0, 5000);
  const phase = bounded(wavePhaseRadians, 0, -Math.PI, Math.PI);
  const wave = {
    wavelength,
    phaseMode: 'Standard',
    phaseOffset: phase,
    phaseRate: 2 * Math.PI * modulationFrequencyKHz * 1000,
    decayRate: 0,
    enabled: true,
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
  };
  const wavePhaseSample = calculateWaveSample(wave, wavePosition.x ?? 0, wavePosition.z ?? 0, timeSeconds, wavePosition.y ?? 0);
  const instantaneousVoltageKV = voltage * (1 + modulationDepth * wavePhaseSample);
  const ionEnergyKeV = instantaneousVoltageKV * ion.chargeState;
  const ionMassKg = ion.massAMU * ATOMIC_MASS_KG;
  const ionEnergyJ = ionEnergyKeV * 1e3 * ELEMENTARY_CHARGE_C;
  const lorentzFactor = 1 + ionEnergyJ / (ionMassKg * SPEED_OF_LIGHT_MPS ** 2);
  const ionSpeedMps = SPEED_OF_LIGHT_MPS * Math.sqrt(1 - 1 / (lorentzFactor ** 2));
  const accelerationMps2 = ionSpeedMps ** 2 / (2 * gap);
  const accelerationTimeSeconds = ionSpeedMps / accelerationMps2;
  const peakPowerMW = voltage * current;
  const dutyFactor = Math.min(1, repetition * pulseDuration * 1e-6);

  return {
    acceleratorVoltageKV: voltage,
    instantaneousVoltageKV,
    totalBeamCurrentKA: current,
    currentPerLauncherKA: current / focusCount,
    pulseDurationMicroseconds: pulseDuration,
    pulseRepetitionHz: repetition,
    dutyFactor,
    ionSpecies,
    ionMassAMU: ion.massAMU,
    ionChargeState: ion.chargeState,
    ionEnergyKeV,
    ionSpeedMps,
    ionSpeedFractionC: ionSpeedMps / SPEED_OF_LIGHT_MPS,
    focusGapM: gap,
    accelerationMps2,
    accelerationTimeMicroseconds: accelerationTimeSeconds * 1e6,
    peakPowerMW,
    averagePowerMW: peakPowerMW * dutyFactor,
    pulseEnergyJ: peakPowerMW * pulseDuration,
    energyPerLauncherPerPulseJ: peakPowerMW * pulseDuration / focusCount,
    launcherCount: focusCount,
    waveModulationDepth: modulationDepth,
    waveWavelengthM: wavelength,
    waveFrequencyKHz: modulationFrequencyKHz,
    wavePhaseRadians: phase,
    wavePhaseSample,
    waveModulationEnabled: modulationDepth > 0
  };
}

export function samplePlasmaFocusTrajectory({ origin, direction, beam, ageSeconds, travelLengthM }) {
  const distance = Math.max(0, Number(travelLengthM));
  const age = Math.max(0, Number(ageSeconds));
  const accelerationTime = beam.accelerationTimeMicroseconds * 1e-6;
  const acceleratedDistance = Math.min(distance, 0.5 * beam.accelerationMps2 * Math.min(age, accelerationTime) ** 2);
  const coastDistance = Math.max(0, age - accelerationTime) * beam.ionSpeedMps;
  const distanceAlongBeam = Math.min(distance, acceleratedDistance + coastDistance);
  const active = ageSeconds >= 0 && acceleratedDistance + coastDistance <= distance;
  return {
    active,
    distanceM: distanceAlongBeam,
    progress: distance > 0 ? distanceAlongBeam / distance : 0,
    position: {
      x: origin.x + direction.x * distanceAlongBeam,
      y: origin.y + direction.y * distanceAlongBeam,
      z: origin.z + direction.z * distanceAlongBeam
    },
    velocityMps: Math.min(beam.ionSpeedMps, beam.accelerationMps2 * age)
  };
}