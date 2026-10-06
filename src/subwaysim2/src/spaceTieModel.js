import { createPositiveGrassmannianCell, DEFAULT_AMPLITUDE_GRAVITY } from './amplitudeGravityModel.js';
import { DEFAULT_FIELD_MECHANICS, evaluateFieldModel } from './mechanicsModels.js';
import { evaluateMechanicsResponse } from './lib/simulationMechanics.js';
import { DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION } from './lib/simulator-base.js';
import { calculateWaveTensorGaussian } from './waveModel.js';

const rangeParameter = (key, label, min, max, step, suffix) => ({ key, label, min, max, step, suffix });
const selectParameter = (key, label, options) => ({ key, label, type: 'select', options });
export const MASS_DRIVER_LOCATION_OPTIONS = [{ value: 'earth', label: 'Earth / vacuum tube' }, { value: 'moon', label: 'Lunar / open track' }];
export const MASS_DRIVER_PAYLOAD_OPTIONS = [{ value: 'cargo', label: 'Hardened cargo' }, { value: 'passenger', label: 'Passenger' }];

export const SPACE_TIE_WIDGETS = [
  {
    value: 'mass-driver', label: 'Orbital helix mass driver', type: 'scene', presentation: 'coilgun',
    description: 'Compare Earth-vacuum and lunar-open electromagnetic tracks against escape-speed and payload-g limits.',
    parameters: [selectParameter('massDriverLocation', 'Launch location', MASS_DRIVER_LOCATION_OPTIONS), selectParameter('massDriverPayloadType', 'Payload type', MASS_DRIVER_PAYLOAD_OPTIONS), rangeParameter('massDriverTrackLengthKm', 'Acceleration track length', 0.1, 1000, 0.1, 'km'), rangeParameter('payloadMassKg', 'Payload mass', 1, 20000, 1, 'kg'), rangeParameter('massDriverFluxT', 'Array flux density', 0, 10, 0.1, 'T'), rangeParameter('massDriverPoleAreaM2', 'Effective pole area', 0.001, 1, 0.001, 'm²'), rangeParameter('massDriverEfficiency', 'Electrical-to-kinetic efficiency', 0.1, 1, 0.01)]
  },
  {
    value: 'tunnel-envelope', label: 'Space-tie tunnel envelope', type: 'scene', presentation: 'envelope',
    description: 'Inspect the radius and tie density of the transparent accelerator bore.',
    parameters: [rangeParameter('tunnelRadiusM', 'Tunnel radius', 1, 250, 1, 'm'), rangeParameter('helixRadiusM', 'Tie orbit radius', 5, 250, 1, 'm'), rangeParameter('tieSpacingKm', 'Tie spacing', 500, 50000, 500, 'km'), rangeParameter('strandCount', 'Helix strands', 2, 3, 1)]
  },
  {
    value: 'helical-formation', label: 'Double / triple helix', type: 'scene', presentation: 'formation',
    description: 'Compare two- and three-strand formations, their radius, twist, and breathing motion.',
    parameters: [selectParameter('strandCount', 'Formation', [{ value: 2, label: 'Double helix' }, { value: 3, label: 'Triple helix' }]), rangeParameter('helixRadiusM', 'Formation radius', 5, 250, 1, 'm'), rangeParameter('tieSpacingKm', 'Tie spacing', 500, 50000, 500, 'km'), rangeParameter('nodeMotion', 'Radial breathing', 0, 1, 0.01), rangeParameter('swirlRate', 'Formation rotation', 0, 2, 0.01, 'rad/s')]
  },
  {
    value: 'tie-spacing', label: 'Tie spacing study', type: 'scene', presentation: 'spacing',
    description: 'Change route spacing and inspect the physical count versus the render-capped sample.',
    parameters: [rangeParameter('tieSpacingKm', 'Physical tie spacing', 500, 50000, 500, 'km'), rangeParameter('strandCount', 'Measured strands', 2, 3, 1), rangeParameter('helixRadiusM', 'Formation radius', 5, 250, 1, 'm')]
  },
  {
    value: 'dynamic-mesh', label: 'Moving orbital mesh', type: 'scene', presentation: 'mesh',
    description: 'Vary inter-strand motion and estimate recoil energy available to the mesh harvesters.',
    parameters: [rangeParameter('nodeMotion', 'Mesh breathing', 0, 1, 0.01), rangeParameter('swirlRate', 'Mesh rotation', 0, 2, 0.01, 'rad/s'), rangeParameter('meshPulsesPerHour', 'Harvest cycles', 0, 24, 0.1, '/h'), rangeParameter('recoilInternalMassKg', 'Internal proof mass', 0, 20000, 1, 'kg'), rangeParameter('recoilHullMassKg', 'Tie hull mass', 0, 20000, 1, 'kg'), rangeParameter('recoilVelocityMS', 'Recoil velocity', 0, 1000, 0.1, 'm/s')]
  },
  {
    value: 'energy-budget', label: 'BAT energy budget', type: 'analysis', presentation: 'energy',
    description: 'Compare pulse demand, stored battery energy, solar input, and captured beamed power.',
    parameters: [rangeParameter('batteryCapacityMWh', 'BAT capacity', 0.01, 1000, 0.01, 'MWh'), rangeParameter('batteryChargePercent', 'BAT charge', 0, 100, 1, '%'), rangeParameter('coilPulseEnergyMJ', 'Pulse energy', 0, 50000, 10, 'MJ'), rangeParameter('pulseEfficiency', 'Pulse efficiency', 0, 1, 0.01), rangeParameter('payloadCoupling', 'Payload coupling', 0, 1, 0.01), rangeParameter('solarArrayAreaM2', 'Solar collector area', 0, 100000, 100, 'm²'), rangeParameter('solarConversionEfficiency', 'Solar conversion', 0, 1, 0.01), rangeParameter('solarBeamPowerMW', 'SBSP beam power', 0, 100000, 10, 'MW'), rangeParameter('beamApertureM', 'Transmitter aperture', 0.1, 200, 0.1, 'm'), rangeParameter('receiverRadiusM', 'Receiver radius', 0.1, 250, 0.1, 'm')]
  },
  {
    value: 'propellant-logistics', label: 'Propellant logistics', type: 'diagram', presentation: 'logistics',
    description: 'Size cartridge transfers, depot inventory, tug fleet, and route turnaround assumptions.',
    parameters: [rangeParameter('logisticsCartridgeMassKg', 'Cartridge mass', 10, 100000, 10, 'kg'), rangeParameter('logisticsDepotCapacityKg', 'Depot capacity', 0, 10000000, 100, 'kg'), rangeParameter('logisticsTugFleetCount', 'Reusable tug fleet', 1, 100, 1), rangeParameter('logisticsTransferDays', 'Transfer turnaround', 1, 365, 1, 'days')]
  },
  {
    value: 'edt-tug', label: 'Electrodynamic-tether tug', type: 'scene', presentation: 'tug',
    description: 'Set tether current, length, field angle, and solar power for a bounded Lorentz-thrust estimate.',
    parameters: [rangeParameter('edtCurrentA', 'Tether current', -1000, 1000, 1, 'A'), rangeParameter('edtTetherLengthM', 'Tether length', 0, 100000, 10, 'm'), rangeParameter('edtFieldTesla', 'Magnetic field', 0, 0.001, 0.000001, 'T'), rangeParameter('edtAngleDeg', 'Field angle', 0, 180, 1, 'deg'), rangeParameter('edtSolarPowerKW', 'Available solar power', 0, 100000, 1, 'kW')]
  },
  {
    value: 'halbach-alignment', label: 'Halbach alignment field', type: 'analysis', presentation: 'alignment',
    description: 'Vary idealized array gap, flux, pole pitch, and active area to inspect alignment force decay.',
    parameters: [rangeParameter('halbachArrayFluxT', 'Array flux density', 0, 30, 0.1, 'T'), rangeParameter('halbachActiveAreaM2', 'Active area', 0, 100, 0.01, 'm²'), rangeParameter('halbachGapM', 'Array gap', 0, 50, 0.1, 'm'), rangeParameter('halbachCharacteristicLengthM', 'Characteristic length', 0.1, 50, 0.1, 'm'), rangeParameter('halbachPolePairs', 'Pole pairs', 1, 24, 1)]
  },
  {
    value: 'recoil-harvesting', label: 'Recoil energy harvesting', type: 'analysis', presentation: 'recoil',
    description: 'Bound piezoelectric and triboelectric recovery by the recoil energy of an internal proof mass.',
    parameters: [rangeParameter('recoilInternalMassKg', 'Internal proof mass', 0, 20000, 1, 'kg'), rangeParameter('recoilHullMassKg', 'Tie hull mass', 0, 20000, 1, 'kg'), rangeParameter('recoilVelocityMS', 'Recoil velocity', 0, 1000, 0.1, 'm/s'), rangeParameter('piezoSplit', 'Piezo energy share', 0, 1, 0.01), rangeParameter('piezoCoupling', 'Piezo coupling', 0, 1, 0.01), rangeParameter('tengEfficiency', 'TENG efficiency', 0, 1, 0.01)]
  },
  {
    value: 'payload-energy', label: 'Payload energy budget', type: 'analysis', presentation: 'payload',
    description: 'Compare payload mass, target velocity, useful kinetic energy, and assumed coupling losses.',
    parameters: [rangeParameter('payloadMassKg', 'Payload mass', 1, 20000, 1, 'kg'), rangeParameter('launchVelocityKmS', 'Target velocity', 0, 30, 0.1, 'km/s'), rangeParameter('payloadCoupling', 'Payload coupling', 0, 1, 0.01)]
  },
  {
    value: 'vacuum-channel', label: 'Vacuum-channel hypothesis', type: 'scene', presentation: 'vacuum',
    description: 'Visualize a bounded channel-contrast hypothesis without adding energy to the launch budget.',
    parameters: [rangeParameter('tunnelRadiusM', 'Channel radius', 1, 250, 1, 'm'), rangeParameter('vacuumChannelContrast', 'Visual channel contrast', 0, 1, 0.01), rangeParameter('ddfStrength', 'DDF dilatancy', 0, 20, 0.1), rangeParameter('ddfSpeedLimitMS', 'DDF speed limit', 100, 100000, 100, 'm/s'), rangeParameter('tensorGaussianWaistM', 'Tensor-Gaussian waist', 0.2, 100, 0.2, 'm')]
  },
  {
    value: 'qed-profile', label: 'Halbach / QED profile', type: 'analysis', presentation: 'qed',
    description: 'Inspect a multipole field profile and weak-field birefringence scaling only.',
    parameters: [rangeParameter('tunnelRadiusM', 'Profile radius', 1, 250, 1, 'm'), rangeParameter('edgeFluxT', 'Edge field', 0, 1000, 1, 'T'), selectParameter('multipoleOrder', 'Multipole order', [{ value: 2, label: 'Quadrupole' }, { value: 3, label: 'Sextupole' }, { value: 4, label: 'Octupole' }])]
  },
  {
    value: 'vortex-sail', label: 'Helical vortex sail', type: 'scene', presentation: 'vortex',
    description: 'Inspect a helical phase-charge field intersecting an annular sail; the vortex is a beam hypothesis.',
    parameters: [rangeParameter('vortexCharge', 'Vortex topological charge', -3, 3, 1), rangeParameter('tensorGaussianWaistM', 'Beam waist', 0.2, 100, 0.2, 'm'), rangeParameter('sailInnerRadiusM', 'Sail inner radius', 0, 50, 1, 'm'), rangeParameter('sailOuterRadiusM', 'Sail outer radius', 5, 56, 1, 'm')]
  }
];

export const SPACE_TIE_DESTINATIONS = [
  { value: 'moon', label: 'Earth → Moon', routeLengthKm: 384400, distanceAU: 1 },
  { value: 'mars', label: 'Earth → Mars (reference distance)', routeLengthKm: 225000000, distanceAU: 1.52 }
];

export const SPACE_TIE_OPERATOR_OPTIONS = [
  { value: 'classical', label: 'Classical coilgun / Maxwell-energy baseline' },
  { value: 'ddf', label: 'DDF / normalized tensor-Gaussian hypothesis' },
  { value: 'grassmannian', label: 'Gr(2,4) / twistor-Gaussian hypothesis' }
];

export const SPACE_TIE_DEFAULTS = Object.freeze({
  widget: 'mass-driver',
  destination: 'moon',
  operator: 'classical',
  strandCount: 3,
  tieSpacingKm: 10000,
  helixRadiusM: 25,
  nodeMotion: 0.18,
  swirlRate: 0.14,
  simulationSpeed: 1,
  payloadMassKg: 100,
  launchVelocityKmS: 15,
  initialVelocityMS: 0,
  batteryCapacityMWh: 16.25,
  batteryChargePercent: 72,
  coilPulseEnergyMJ: 350,
  coilFluxT: 2,
  massDriverLocation: 'earth',
  massDriverPayloadType: 'cargo',
  massDriverTrackLengthKm: 130,
  massDriverFluxT: 2,
  massDriverPoleAreaM2: 0.032,
  massDriverEfficiency: 0.85,
  pulseEfficiency: 0.72,
  payloadCoupling: 0.85,
  magneticWaveSpeedKmS: 12,
  solarDistanceAU: 1,
  solarArrayAreaM2: 1200,
  solarConversionEfficiency: 0.32,
  solarBeamPowerMW: 80,
  beamApertureM: 12,
  receiverRadiusM: 25,
  beamWavelengthM: 0.000001,
  vortexCharge: 1,
  sailInnerRadiusM: 5,
  sailOuterRadiusM: 25,
  meshPulsesPerHour: 1,
  logisticsCartridgeMassKg: 500,
  logisticsDepotCapacityKg: 25000,
  logisticsTugFleetCount: 3,
  logisticsTransferDays: 21,
  recoilInternalMassKg: 600,
  recoilHullMassKg: 400,
  recoilVelocityMS: 5,
  piezoSplit: 0.7,
  piezoCoupling: 0.65,
  tengEfficiency: 0.15,
  edtSolarPowerKW: 50,
  edtTetherLengthM: 2000,
  edtCurrentA: 5,
  edtFieldTesla: 35e-6,
  edtAngleDeg: 90,
  halbachGapM: 2,
  halbachCharacteristicLengthM: 3,
  halbachPolePairs: 2,
  halbachArrayFluxT: 2,
  halbachActiveAreaM2: 0.25,
  multipoleOrder: 2,
  edgeFluxT: 10,
  tunnelRadiusM: 25,
  ddfStrength: 0.5,
  ddfSpeedLimitMS: 15000,
  ddfBaseViscosity: 0.02,
  tensorGaussianWaistM: 8,
  tensorGaussianCharge: 1,
  grassmannianCellGaps: [...DEFAULT_AMPLITUDE_GRAVITY.cellGaps],
  grassmannianFourthWeight: DEFAULT_AMPLITUDE_GRAVITY.fourthColumnWeight,
  geometryAccelerationCoupling: 0,
  vacuumChannelContrast: 0,
  showFieldSplats: true,
  launchSequence: false,
  particleCount: 4096,
  cameraViewMode: 'ortho1',
  cameraControlsEnabled: true,
  replayCameraTrack: 'easing',
  cameraOrbitOn: true,
  cameraZoomEnabled: true,
  cameraWheelMode: 'zoom',
  replayCameraOrbitSpeed: 0.1,
  replayCameraOrbitX: 0,
  replayCameraOrbitY: 1,
  replayCameraOrbitZ: 0,
  particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, sizeScale: 1.5, opacity: 0.85 }
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function sanitizeSpaceTieSettings(value = {}) {
  const widget = SPACE_TIE_WIDGETS.some((option) => option.value === value.widget) ? value.widget : SPACE_TIE_DEFAULTS.widget;
  const destination = SPACE_TIE_DESTINATIONS.some((option) => option.value === value.destination) ? value.destination : SPACE_TIE_DEFAULTS.destination;
  const operator = SPACE_TIE_OPERATOR_OPTIONS.some((option) => option.value === value.operator) ? value.operator : SPACE_TIE_DEFAULTS.operator;
  return {
    ...SPACE_TIE_DEFAULTS,
    ...value,
    widget,
    destination,
    operator,
    strandCount: finite(value.strandCount, SPACE_TIE_DEFAULTS.strandCount) < 2 ? 2 : 3,
    tieSpacingKm: clamp(finite(value.tieSpacingKm, SPACE_TIE_DEFAULTS.tieSpacingKm), 500, 50000),
    helixRadiusM: clamp(finite(value.helixRadiusM, SPACE_TIE_DEFAULTS.helixRadiusM), 5, 250),
    nodeMotion: clamp(finite(value.nodeMotion, SPACE_TIE_DEFAULTS.nodeMotion), 0, 1),
    swirlRate: clamp(finite(value.swirlRate, SPACE_TIE_DEFAULTS.swirlRate), 0, 2),
    simulationSpeed: clamp(finite(value.simulationSpeed, SPACE_TIE_DEFAULTS.simulationSpeed), 0, 20),
    payloadMassKg: clamp(finite(value.payloadMassKg, SPACE_TIE_DEFAULTS.payloadMassKg), 1, 20000),
    launchVelocityKmS: clamp(finite(value.launchVelocityKmS, SPACE_TIE_DEFAULTS.launchVelocityKmS), 0, 30),
    initialVelocityMS: clamp(finite(value.initialVelocityMS, SPACE_TIE_DEFAULTS.initialVelocityMS), 0, 30000),
    batteryCapacityMWh: clamp(finite(value.batteryCapacityMWh, SPACE_TIE_DEFAULTS.batteryCapacityMWh), 0.01, 1000),
    batteryChargePercent: clamp(finite(value.batteryChargePercent, SPACE_TIE_DEFAULTS.batteryChargePercent), 0, 100),
    coilPulseEnergyMJ: clamp(finite(value.coilPulseEnergyMJ, SPACE_TIE_DEFAULTS.coilPulseEnergyMJ), 0, 50000),
    coilFluxT: clamp(finite(value.coilFluxT, SPACE_TIE_DEFAULTS.coilFluxT), 0, 30),
    pulseEfficiency: clamp(finite(value.pulseEfficiency, SPACE_TIE_DEFAULTS.pulseEfficiency), 0, 1),
    payloadCoupling: clamp(finite(value.payloadCoupling, SPACE_TIE_DEFAULTS.payloadCoupling), 0, 1),
    solarArrayAreaM2: clamp(finite(value.solarArrayAreaM2, SPACE_TIE_DEFAULTS.solarArrayAreaM2), 0, 1e8),
    solarConversionEfficiency: clamp(finite(value.solarConversionEfficiency, SPACE_TIE_DEFAULTS.solarConversionEfficiency), 0, 1),
    solarBeamPowerMW: clamp(finite(value.solarBeamPowerMW, SPACE_TIE_DEFAULTS.solarBeamPowerMW), 0, 1e9),
    batteryChargePercent: clamp(finite(value.batteryChargePercent, SPACE_TIE_DEFAULTS.batteryChargePercent), 0, 100),
    ddfStrength: clamp(finite(value.ddfStrength, SPACE_TIE_DEFAULTS.ddfStrength), 0, 20),
    ddfSpeedLimitMS: clamp(finite(value.ddfSpeedLimitMS, SPACE_TIE_DEFAULTS.ddfSpeedLimitMS), 0.1, 1e7),
    geometryAccelerationCoupling: clamp(finite(value.geometryAccelerationCoupling, SPACE_TIE_DEFAULTS.geometryAccelerationCoupling), 0, 0.25),
    vacuumChannelContrast: clamp(finite(value.vacuumChannelContrast, SPACE_TIE_DEFAULTS.vacuumChannelContrast), 0, 1),
    ...Object.fromEntries(SPACE_TIE_WIDGETS.flatMap(({ parameters }) => parameters).filter(({ type }) => type !== 'select').map(({ key, min, max }) => [key, clamp(finite(value[key], SPACE_TIE_DEFAULTS[key]), min, max)])),
    ...Object.fromEntries(SPACE_TIE_WIDGETS.flatMap(({ parameters }) => parameters).filter(({ type }) => type === 'select').map(({ key, options }) => {
      const selected = options.find((option) => option.value === value[key])?.value;
      return [key, selected ?? SPACE_TIE_DEFAULTS[key]];
    })),
    particleCount: Math.round(clamp(finite(value.particleCount, SPACE_TIE_DEFAULTS.particleCount), 512, 16384) / 512) * 512,
    particleAppearance: {
      ...SPACE_TIE_DEFAULTS.particleAppearance,
      ...(value.particleAppearance ?? {}),
      sizeScale: clamp(finite(value.particleAppearance?.sizeScale, SPACE_TIE_DEFAULTS.particleAppearance.sizeScale), 0.25, 8)
    }
  };
}

export function calculateRotatingTracerAngle({ baseAngle = 0, simulationTime = 0, swirlRate = 0, accelerationScale = 1, splatWeight = 1 } = {}) {
  return baseAngle + simulationTime * swirlRate * accelerationScale * splatWeight;
}

export function routeLengthKm(destination) {
  return SPACE_TIE_DESTINATIONS.find((option) => option.value === destination)?.routeLengthKm ?? SPACE_TIE_DESTINATIONS[0].routeLengthKm;
}

export function createHelixNodes({ destination = 'moon', spacingKm = SPACE_TIE_DEFAULTS.tieSpacingKm, strands = 3, radius = 3, motion = 0, swirlRate = 0, time = 0, maxPerStrand = 72 } = {}) {
  const lengthKm = routeLengthKm(destination);
  const physicalCountPerStrand = Math.max(2, Math.ceil(lengthKm / Math.max(1, spacingKm)));
  const renderCountPerStrand = Math.min(maxPerStrand, physicalCountPerStrand);
  const nodes = [];
  for (let strand = 0; strand < strands; strand += 1) {
    const strandPhase = Math.PI * 2 * strand / strands;
    for (let index = 0; index < renderCountPerStrand; index += 1) {
      const progress = renderCountPerStrand <= 1 ? 0 : index / (renderCountPerStrand - 1);
      const angle = progress * Math.PI * 2 * Math.max(2, lengthKm / spacingKm) + strandPhase + time * swirlRate;
      const radialBreath = radius * (1 + motion * 0.08 * Math.sin(time * 0.7 + index * 0.31 + strandPhase));
      nodes.push({
        index: strand * renderCountPerStrand + index,
        strand,
        strandIndex: index,
        physicalCountPerStrand,
        progress,
        x: Math.cos(angle) * radialBreath,
        y: Math.sin(angle) * radialBreath,
        z: (progress - 0.5) * 24,
        phase: angle
      });
    }
  }
  return { nodes, physicalCountPerStrand, renderCountPerStrand, totalPhysicalNodes: physicalCountPerStrand * strands };
}

export function calculateSolarHarvest({ distanceAU = 1, areaM2 = 1, conversionEfficiency = 1 } = {}) {
  const irradianceWm2 = 1361 / Math.max(0.01, distanceAU) ** 2;
  const inputPowerW = irradianceWm2 * Math.max(0, areaM2);
  const electricalPowerW = inputPowerW * clamp(conversionEfficiency, 0, 1);
  return { irradianceWm2, inputPowerW, electricalPowerW };
}

export function calculateSailRadiationPressure({ powerW = 0, sailAreaM2 = 0, reflectivity = 1, spacecraftMassKg = 1 } = {}) {
  const collectedPowerW = Math.max(0, powerW);
  const area = Math.max(0, sailAreaM2);
  const reflection = clamp(reflectivity, 0, 1);
  const forceN = (1 + reflection) * collectedPowerW / 299792458;
  return { forceN, accelerationMS2: forceN / Math.max(1e-6, spacecraftMassKg), beamPressurePa: area > 0 ? forceN / area : 0 };
}

export function calculateBeamCapture({ distanceM = 1, wavelengthM = 1e-6, apertureM = 1, receiverRadiusM = 1, beamingPowerW = 0 } = {}) {
  const aperture = Math.max(1e-4, apertureM);
  const wavelength = Math.max(1e-12, wavelengthM);
  const beamRadius = Math.max(1e-6, 1.22 * wavelength * Math.max(1, distanceM) / aperture);
  const captureFraction = clamp(1 - Math.exp(-2 * receiverRadiusM * receiverRadiusM / (beamRadius * beamRadius)), 0, 1);
  return { beamRadiusM: beamRadius, captureFraction, receivedPowerW: Math.max(0, beamingPowerW) * captureFraction };
}

export function calculatePayloadEnergy({ massKg = 1, velocityKmS = 0, couplingEfficiency = 1 } = {}) {
  const velocityMS = Math.max(0, velocityKmS) * 1000;
  const kineticEnergyJ = 0.5 * Math.max(0, massKg) * velocityMS * velocityMS;
  const efficiency = clamp(couplingEfficiency, 1e-6, 1);
  const inputEnergyJ = kineticEnergyJ / efficiency;
  return { velocityMS, kineticEnergyJ, inputEnergyJ, thermalLossJ: Math.max(0, inputEnergyJ - kineticEnergyJ), efficiency };
}

export function calculateElectromagneticMassDriver(settings = SPACE_TIE_DEFAULTS) {
  const location = settings.massDriverLocation === 'moon' ? 'moon' : 'earth';
  const payloadType = settings.massDriverPayloadType === 'passenger' ? 'passenger' : 'cargo';
  const payloadMassKg = Math.max(1, finite(settings.payloadMassKg, 1));
  const trackLengthM = Math.max(0.1, finite(settings.massDriverTrackLengthKm, 0.1)) * 1000;
  const fluxT = Math.max(0, finite(settings.massDriverFluxT, 0));
  const poleAreaM2 = Math.max(0, finite(settings.massDriverPoleAreaM2, 0));
  const efficiency = clamp(finite(settings.massDriverEfficiency, 0.85), 0.01, 1);
  const magneticPressurePa = fluxT * fluxT / (2 * 1.25663706212e-6);
  const magneticForceN = magneticPressurePa * poleAreaM2;
  const accelerationMS2 = magneticForceN / payloadMassKg;
  const magneticExitVelocityMS = Math.sqrt(2 * accelerationMS2 * trackLengthM);
  const battery = calculateBatteryOperatingPoint({ settings });
  const energyLimitedVelocityMS = Math.sqrt(2 * battery.availableJ * efficiency / payloadMassKg);
  const exitVelocityMS = Math.min(magneticExitVelocityMS, energyLimitedVelocityMS);
  const kineticEnergyJ = 0.5 * payloadMassKg * exitVelocityMS ** 2;
  const electricalEnergyRequiredJ = kineticEnergyJ / efficiency;
  const requiredEscapeVelocityMS = location === 'earth' ? 11200 : 2400;
  const payloadToleranceG = payloadType === 'passenger' ? 3 : 1000;
  const peakG = accelerationMS2 / 9.80665;
  return {
    location,
    payloadType,
    payloadMassKg,
    trackLengthM,
    magneticPressurePa,
    magneticForceN,
    accelerationMS2,
    peakG,
    payloadToleranceG,
    magneticExitVelocityMS,
    energyLimitedVelocityMS,
    exitVelocityMS,
    requiredEscapeVelocityMS,
    reachesEscapeVelocity: exitVelocityMS >= requiredEscapeVelocityMS,
    withinPayloadTolerance: peakG <= payloadToleranceG,
    kineticEnergyJ,
    electricalEnergyRequiredJ,
    availableBatteryEnergyJ: battery.availableJ,
    efficiency,
    status: 'Idealized magnetic-pressure drive envelope; coil coupling, field gradients, and thermal limits require hardware validation.'
  };
}

export function calculateRecoilHarvest({ internalMassKg = 600, hullMassKg = 400, recoilVelocityMS = 5, piezoSplit = 0.7, piezoCoupling = 0.65, tengEfficiency = 0.15 } = {}) {
  const internalMass = Math.max(0, internalMassKg);
  const hullMass = Math.max(0, hullMassKg);
  const reducedMassKg = internalMass + hullMass > 0 ? internalMass * hullMass / (internalMass + hullMass) : 0;
  const availableEnergyJ = 0.5 * reducedMassKg * Math.max(0, recoilVelocityMS) ** 2;
  const piezoAvailableJ = availableEnergyJ * clamp(piezoSplit, 0, 1);
  const tengAvailableJ = availableEnergyJ - piezoAvailableJ;
  const piezoEnergyJ = piezoAvailableJ * clamp(piezoCoupling, 0, 1) ** 2;
  const tengEnergyJ = tengAvailableJ * clamp(tengEfficiency, 0, 1);
  return { reducedMassKg, availableEnergyJ, piezoEnergyJ, tengEnergyJ, harvestedEnergyJ: piezoEnergyJ + tengEnergyJ, lossEnergyJ: Math.max(0, availableEnergyJ - piezoEnergyJ - tengEnergyJ) };
}

export function calculateEdtTug({ currentA = 0, tetherLengthM = 0, magneticFieldT = 0, angleDeg = 90, solarPowerKW = 0, circuitResistanceOhm = 1 } = {}) {
  const angle = angleDeg * Math.PI / 180;
  const thrustN = currentA * tetherLengthM * magneticFieldT * Math.sin(angle);
  const electricalInputW = Math.max(0, solarPowerKW) * 1000;
  const resistiveLossW = currentA * currentA * Math.max(0, circuitResistanceOhm);
  return { thrustN, electricalInputW, resistiveLossW, powerLimited: resistiveLossW > electricalInputW };
}

export function calculateHalbachAlignment({ fieldT = 0, activeAreaM2 = 0, gapM = 0, characteristicLengthM = 1, polePairs = 2 } = {}) {
  const waveNumber = Math.max(1, polePairs) / Math.max(1e-3, characteristicLengthM);
  const magneticPressurePa = fieldT * fieldT / (2 * 1.25663706212e-6);
  const distanceEnvelope = Math.exp(-2 * waveNumber * Math.max(0, gapM));
  return { forceN: magneticPressurePa * Math.max(0, activeAreaM2) * distanceEnvelope, distanceEnvelope, status: 'idealized array-envelope estimate; validate with finite-array field measurements' };
}

export function calculateHalbachQED({ radiusM = 0, tunnelRadiusM = 1, edgeFluxT = 0, multipoleOrder = 2 } = {}) {
  const normalizedRadius = clamp(radiusM / Math.max(1e-6, tunnelRadiusM), 0, 1);
  const order = Math.max(2, Math.floor(multipoleOrder));
  const fieldT = edgeFluxT * normalizedRadius ** (order - 1);
  const criticalFieldT = 4.414e9;
  const alpha = 1 / 137.035999084;
  const deltaNApprox = alpha / (30 * Math.PI) * (fieldT / criticalFieldT) ** 2;
  return { fieldT, normalizedRadius, deltaNApprox, status: 'weak-field QED birefringence scaling; not vacuum viscosity or propulsion' };
}

export function calculateVortexBeamIntensity({ radiusM = 0, beamWaistM = 1, topologicalCharge = 1 } = {}) {
  const waist = Math.max(1e-6, beamWaistM);
  const charge = Math.max(0, Math.floor(Math.abs(topologicalCharge)));
  const scaledRadius = 2 * radiusM * radiusM / (waist * waist);
  if (charge === 0) return Math.exp(-scaledRadius);
  return Math.min(1, scaledRadius ** charge * Math.exp(charge - scaledRadius) / Math.max(1, charge ** charge));
}

function createTensorWave(settings) {
  const charge = Math.max(-3, Math.min(3, Math.round(settings.tensorGaussianCharge)));
  return [{
    wavelength: Math.max(0.1, settings.tensorGaussianWaistM * 0.75),
    amplitude: 1,
    phaseMode: charge >= 0 ? 'Helical-Left' : 'Helical-Right',
    phaseOffset: 0,
    phaseRate: 0.7,
    decayRate: 0,
    beamWaist: Math.max(0.1, settings.tensorGaussianWaistM),
    orbitalAngularMomentum: charge,
    polarization: 'EM-Tensor-Gaussian',
    enabled: true,
    origin: { x: 0, y: 0, z: -12 },
    direction: { x: 0, y: 0, z: 1 },
    rotation: { x: 0, y: 0, z: 0 }
  }];
}

export function evaluateSpaceTieOperator({ operator = 'classical', radiusM = 0, speedMS = 0, axialPosition = 0, time = 0, settings = SPACE_TIE_DEFAULTS } = {}) {
  const normalizedRadius = clamp(Math.abs(radiusM) / Math.max(1, settings.helixRadiusM), 0, 1);
  const gaussian = calculateWaveTensorGaussian(createTensorWave(settings), radiusM, axialPosition, time, { constructive: false, superposition: true }, 0);
  if (operator === 'ddf') {
    const ddf = evaluateFieldModel('ddf', { radius: Math.max(0.05, Math.abs(radiusM)), speed: Math.abs(speedMS), magnitude: 1 }, {
      ...DEFAULT_FIELD_MECHANICS,
      coreRadius: Math.max(0.05, settings.helixRadiusM),
      speedLimit: settings.ddfSpeedLimitMS,
      dilatancy: settings.ddfStrength,
      baseViscosity: settings.ddfBaseViscosity
    });
    const response = evaluateMechanicsResponse({ regime: 'ddf-tensor-gaussian', gaussianWeight: gaussian, ddfMobility: ddf.mobility });
    return { ...response, gaussian, ddf, status: 'DDF is a bounded constitutive hypothesis' };
  }
  if (operator === 'grassmannian') {
    const cell = createPositiveGrassmannianCell({ cellGaps: settings.grassmannianCellGaps, fourthColumnWeight: settings.grassmannianFourthWeight });
    const geometryWeight = cell.canonicalPoleWeight * (1 - normalizedRadius * 0.25);
    const response = evaluateMechanicsResponse({ regime: 'grassmannian-amplituhedron', gaussianWeight: gaussian, grassmannianWeight: geometryWeight, geometryCoupling: settings.geometryAccelerationCoupling });
    return { ...response, gaussian, cell, status: 'Gr(2,4) / twistor overlay is exploratory; coupling defaults to zero' };
  }
  return { ...evaluateMechanicsResponse({ regime: 'classical', gaussianWeight: gaussian }), gaussian, status: 'classical energy-transfer baseline' };
}

export function calculateCoilgunStage({ payloadMassKg = 1, currentVelocityMS = 0, batteryEnergyJ = 0, pulseEnergyMJ = 0, pulseEfficiency = 0.7, payloadCoupling = 0.8, operator = 'classical', accelerationScale = 1 } = {}) {
  const availablePulseJ = Math.min(Math.max(0, batteryEnergyJ), Math.max(0, pulseEnergyMJ) * 1e6);
  const effectiveTransfer = clamp(pulseEfficiency * payloadCoupling * Math.max(0, accelerationScale), 0, 1);
  const payloadEnergyJ = availablePulseJ * effectiveTransfer;
  const nextVelocityMS = Math.sqrt(Math.max(0, currentVelocityMS ** 2 + 2 * payloadEnergyJ / Math.max(1e-6, payloadMassKg)));
  const recoilMomentumNs = Math.max(0, payloadMassKg) * (nextVelocityMS - Math.max(0, currentVelocityMS));
  return {
    availablePulseJ,
    payloadEnergyJ,
    lossEnergyJ: Math.max(0, availablePulseJ - payloadEnergyJ),
    nextVelocityMS,
    recoilMomentumNs,
    energyConserved: payloadEnergyJ <= availablePulseJ + 1e-9,
    operator
  };
}

export function calculateSpaceEnergyBudget(settings = SPACE_TIE_DEFAULTS) {
  const solar = calculateSolarHarvest({ distanceAU: settings.solarDistanceAU, areaM2: settings.solarArrayAreaM2, conversionEfficiency: settings.solarConversionEfficiency });
  const beam = calculateBeamCapture({ distanceM: settings.destination === 'mars' ? 2.25e11 : 3.844e8, wavelengthM: settings.beamWavelengthM, apertureM: settings.beamApertureM, receiverRadiusM: settings.receiverRadiusM, beamingPowerW: settings.solarBeamPowerMW * 1e6 });
  const recoil = calculateRecoilHarvest({ internalMassKg: settings.recoilInternalMassKg, hullMassKg: settings.recoilHullMassKg, recoilVelocityMS: settings.recoilVelocityMS, piezoSplit: settings.piezoSplit, piezoCoupling: settings.piezoCoupling, tengEfficiency: settings.tengEfficiency });
  const meshHarvestW = recoil.harvestedEnergyJ * Math.max(0, settings.meshPulsesPerHour ?? 1) / 3600;
  const solarBeamCaptureW = beam.receivedPowerW;
  const totalSupplyW = solar.electricalPowerW + meshHarvestW + solarBeamCaptureW;
  return { solar, beam, recoil, meshHarvestW, solarBeamCaptureW, totalSupplyW, status: 'scenario accounting; beam fracture multiplier excluded from power balance' };
}

export function calculateBatteryOperatingPoint({ settings = SPACE_TIE_DEFAULTS, pulseCount = 1 } = {}) {
  const capacityJ = settings.batteryCapacityMWh * 3.6e9;
  const availableJ = capacityJ * clamp(settings.batteryChargePercent / 100, 0, 1);
  const requestedPulseJ = Math.max(0, settings.coilPulseEnergyMJ) * 1e6 * Math.max(0, pulseCount);
  return { capacityJ, availableJ, requestedPulseJ, enoughEnergy: availableJ >= requestedPulseJ, remainingJ: Math.max(0, availableJ - requestedPulseJ) };
}