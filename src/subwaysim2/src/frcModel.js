import { calculatePlasmaFocusBeam } from './plasmaFocusModel.js';

export const FRC_SHAPES = {
  elongated: {
    label: 'Elongated FRC',
    description: 'Long axial plasma column with a narrow separatrix.',
    radius: 2.2,
    halfLength: 5.2,
    wallRadius: 2.9,
    wallHalfLength: 5.8,
    shapeFactor: 1.35
  },
  compact: {
    label: 'Compact FRC',
    description: 'Short, broad compact toroid for high-beta studies.',
    radius: 3.1,
    halfLength: 3.1,
    wallRadius: 3.8,
    wallHalfLength: 3.7,
    shapeFactor: 0.92
  },
  doubleLobed: {
    label: 'Double-lobed FRC',
    description: 'Two linked plasma lobes with a defined midplane waist.',
    radius: 2.35,
    halfLength: 5.0,
    wallRadius: 3.0,
    wallHalfLength: 5.7,
    shapeFactor: 1.18
  },
  oblate: {
    label: 'Oblate FRC',
    description: 'Wide radial section with reduced axial extent.',
    radius: 3.7,
    halfLength: 2.7,
    wallRadius: 4.4,
    wallHalfLength: 3.3,
    shapeFactor: 0.76
  },
  tokamak: {
    label: 'Tokamak torus',
    description: 'Axisymmetric toroidal vessel with a central bore and circular plasma cross-section.',
    geometry: 'tokamak',
    radius: 1.35,
    halfLength: 3.4,
    wallRadius: 1.85,
    wallHalfLength: 4.15,
    shapeFactor: 0.78
  },
  stellarator: {
    label: 'Stellarator torus',
    description: 'Non-axisymmetric toroidal vessel with a three-period helical centerline modulation.',
    geometry: 'stellarator',
    fieldPeriods: 3,
    helicalExcursion: 0.34,
    radius: 1.15,
    halfLength: 3.75,
    wallRadius: 1.68,
    wallHalfLength: 4.45,
    shapeFactor: 0.7
  }
};

export const FRC_CONFIGURATIONS = {
  thetaPinch: {
    label: 'Field-reversed theta pinch',
    description: 'Rapid axial compression and excluded-flux formation.',
    magneticField: 2.8,
    density: 1.8,
    ionTemperature: 1.6,
    axialFieldRatio: -0.42,
    rotation: 0.18,
    confinement: 0.78,
    energyCaptureEfficiency: 0.62,
    nitrogenPurgeSLM: 18
  },
  rotatingField: {
    label: 'Rotating magnetic field',
    description: 'Rotating-field sustainment with azimuthal plasma flow.',
    magneticField: 2.1,
    density: 1.35,
    ionTemperature: 2.2,
    axialFieldRatio: -0.3,
    rotation: 0.82,
    confinement: 0.68,
    energyCaptureEfficiency: 0.54,
    nitrogenPurgeSLM: 12
  },
  translation: {
    label: 'Translated compact toroid',
    description: 'Axial translation through a transparent confinement vessel.',
    magneticField: 2.45,
    density: 1.5,
    ionTemperature: 1.9,
    axialFieldRatio: -0.36,
    rotation: 0.32,
    confinement: 0.72,
    energyCaptureEfficiency: 0.58,
    nitrogenPurgeSLM: 15
  },
  steadyState: {
    label: 'Steady-state sustainment',
    description: 'Lower transient drive with continuous field support.',
    magneticField: 1.75,
    density: 1.1,
    ionTemperature: 2.5,
    axialFieldRatio: -0.24,
    rotation: 0.55,
    confinement: 0.61,
    energyCaptureEfficiency: 0.48,
    nitrogenPurgeSLM: 10
  },
  tokamakStudy: {
    label: 'Tokamak magnetic-confinement study',
    description: 'Reduced axisymmetric toroidal study with a plasma-current and loop-drive proxy; not a Grad-Shafranov equilibrium solver.',
    shape: 'tokamak',
    excitationConfiguration: 'tokamakLoop',
    deviceTopology: 'tokamak',
    magneticField: 3.6,
    density: 1.45,
    ionTemperature: 3.2,
    axialFieldRatio: 0.38,
    rotation: 0.34,
    confinement: 0.82,
    energyCaptureEfficiency: 0.56,
    nitrogenPurgeSLM: 14
  },
  stellaratorStudy: {
    label: 'Stellarator magnetic-confinement study',
    description: 'Reduced non-axisymmetric toroidal study with prescribed helical field periods; not a coil-optimized stellarator equilibrium.',
    shape: 'stellarator',
    excitationConfiguration: 'stellaratorLoop',
    deviceTopology: 'stellarator',
    magneticField: 3.2,
    density: 1.25,
    ionTemperature: 3.5,
    axialFieldRatio: 0.3,
    rotation: 0.22,
    confinement: 0.8,
    energyCaptureEfficiency: 0.53,
    nitrogenPurgeSLM: 13
  },
  argonMhdAxial: {
    label: 'Argon MHD / axial FRC',
    description: 'Axially driven field-reversed MHD transport experiment for a non-fusing argon plasma.',
    magneticField: 1.8,
    density: 1.1,
    ionTemperature: 0.8,
    axialFieldRatio: -0.22,
    rotation: 0.65,
    confinement: 0.66,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 8,
    mhdMode: 'axial',
    mhdSearchBase: true
  },
  argonMhdRotating: {
    label: 'Argon MHD / rotating field',
    description: 'Rotating magnetic drive for azimuthal transport and field-coupling studies in argon plasma.',
    magneticField: 1.45,
    density: 0.9,
    ionTemperature: 0.65,
    axialFieldRatio: -0.16,
    rotation: 1.05,
    confinement: 0.59,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 7,
    mhdMode: 'rotating',
    mhdSearchBase: true
  },
  argonMhdNozzle: {
    label: 'Argon MHD / magnetic nozzle',
    description: 'Axial magnetic-pressure gradient experiment for directed argon plasma exhaust.',
    magneticField: 2.25,
    density: 0.75,
    ionTemperature: 1.1,
    axialFieldRatio: -0.12,
    rotation: 0.28,
    confinement: 0.54,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 6,
    mhdMode: 'nozzle',
    mhdSearchBase: true
  },
  argonMhdPiezoRmf: {
    label: 'Argon MHD / piezo-modulated RMF',
    description: 'Engineering experiment in which measured piezoelectric strain modulates an external rotating-field structure; no direct piezo-plasma coupling is assumed.',
    magneticField: 1.6,
    density: 0.9,
    ionTemperature: 0.7,
    axialFieldRatio: -0.18,
    rotation: 0.9,
    confinement: 0.6,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 7,
    mhdMode: 'piezo-rmf',
    driveMode: 'piezo-rmf',
    piezoDriveFrequencyKHz: 20,
    piezoStrainPpm: 80,
    driveCoupling: 0.08
  },
  argonMhdIonAcoustic: {
    label: 'Argon MHD / longitudinal ion-acoustic packet',
    description: 'Established longitudinal electrostatic plasma-wave experiment with a bounded external drive; it is not a longitudinal photon or Proca mode.',
    magneticField: 1.35,
    density: 0.8,
    ionTemperature: 0.6,
    axialFieldRatio: -0.15,
    rotation: 0.35,
    confinement: 0.57,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 6,
    mhdMode: 'ion-acoustic',
    driveMode: 'ion-acoustic',
    longitudinalDriveFrequencyKHz: 2,
    longitudinalDriveAmplitude: 0.2,
    wavePacketWidth: 0.35,
    driveCoupling: 0.12
  },
  argonMhdAxialQGrid: {
    label: 'Axial FRC, DT projection from Argon grid optimum',
    description: 'Counterfactual DT projection at the axial-FRC operating point selected by the Argon-constrained grid; not an Argon fusion result.',
    shape: 'elongated',
    magneticField: 1.5,
    density: 3,
    ionTemperature: 5,
    axialFieldRatio: -0.22,
    rotation: 0.1,
    confinement: 0.66,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 8,
    mhdMode: 'axial',
    mhdGridOptimized: true
  },
  argonMhdRotatingQGrid: {
    label: 'Rotating-field FRC, DT projection from Argon grid optimum',
    description: 'Counterfactual DT projection at the rotating-field operating point selected by the Argon-constrained grid; not an Argon fusion result.',
    shape: 'elongated',
    magneticField: 1.5,
    density: 3,
    ionTemperature: 5,
    axialFieldRatio: -0.16,
    rotation: 0.1,
    confinement: 0.59,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 7,
    mhdMode: 'rotating',
    mhdGridOptimized: true
  },
  argonMhdNozzleQGrid: {
    label: 'Magnetic-nozzle FRC, DT projection from Argon grid optimum',
    description: 'Counterfactual DT projection at the magnetic-nozzle operating point selected by the Argon-constrained grid; not an Argon fusion result.',
    shape: 'elongated',
    magneticField: 1.5,
    density: 3,
    ionTemperature: 5,
    axialFieldRatio: -0.12,
    rotation: 0.1,
    confinement: 0.54,
    energyCaptureEfficiency: 0,
    nitrogenPurgeSLM: 6,
    mhdMode: 'nozzle',
    mhdGridOptimized: true
  }
};

export const FRC_INPUTS = {
  DT: {
    label: 'DT',
    description: 'Deuterium-tritium fuel with a high neutron branch.',
    reactionEnergyMeV: 17.6,
    reactionRateFactor: 1,
    neutronYield: 0.94,
    heliumYield: 1,
    chargedEnergyFraction: 0.2,
    conversionBaseEfficiency: 0.48
  },
  DHe_3: {
    label: 'DHe_3',
    description: 'Deuterium-helium-3 fuel with an aneutronic primary branch.',
    reactionEnergyMeV: 18.3,
    reactionRateFactor: 0.42,
    neutronYield: 0.025,
    heliumYield: 1,
    chargedEnergyFraction: 0.95,
    conversionBaseEfficiency: 0.58
  },
  Argon: {
    label: 'Argon',
    description: 'Non-fusing argon working gas for transport and diagnostic studies.',
    reactionEnergyMeV: 0,
    reactionRateFactor: 0,
    neutronYield: 0,
    heliumYield: 0,
    chargedEnergyFraction: 0,
    conversionBaseEfficiency: 0
  }
};

export const FRC_EXCITATION_CONFIGURATIONS = {
  axialReference: {
    label: 'Axial reference drive',
    description: 'Baseline axial excitation with no inferred multi-angle benefit.',
    topology: 'axial',
    ringCount: 0,
    launchersPerRing: 2,
    driveAngleDegrees: 0,
    angleSpreadDegrees: 0,
    phaseOffsetDegrees: 180,
    fieldPeriods: 1,
    rotationalTransform: 0,
    responseGain: 1
  },
  radialGunRings: {
    label: 'Inward radial plasma focus arrays',
    description: 'Pulsed ion focus arrays aimed inward for reduced radial-compression and beam-transport studies.',
    topology: 'gun-rings',
    ringCount: 2,
    launchersPerRing: 8,
    driveAngleDegrees: 0,
    flowRelativeCantDegrees: 0,
    tubeAxisCantDegrees: 0,
    angleSpreadDegrees: 0,
    phaseOffsetDegrees: 22.5,
    acceleratorVoltageKV: 30,
    totalBeamCurrentKA: 2,
    pulseDurationMicroseconds: 20,
    pulseRepetitionHz: 20,
    ionSpecies: 'deuteron',
    focusGapM: 0.35,
    waveModulationDepth: 0.12,
    waveWavelengthM: 2.4,
    waveFrequencyKHz: 100,
    wavePhaseRadians: 0,
    fieldPeriods: 1,
    rotationalTransform: 0,
    responseGain: 1.04
  },
  vortexGunRings: {
    label: 'Canted vortex plasma focus arrays',
    description: 'Pulsed ion focus arrays with tangential cant for reduced vortex and beam-transport studies.',
    topology: 'gun-rings',
    ringCount: 3,
    launchersPerRing: 10,
    driveAngleDegrees: 28,
    flowRelativeCantDegrees: 28,
    tubeAxisCantDegrees: 0,
    angleSpreadDegrees: 12,
    phaseOffsetDegrees: 12,
    acceleratorVoltageKV: 45,
    totalBeamCurrentKA: 3,
    pulseDurationMicroseconds: 15,
    pulseRepetitionHz: 15,
    ionSpecies: 'deuteron',
    focusGapM: 0.35,
    waveModulationDepth: 0.18,
    waveWavelengthM: 2.4,
    waveFrequencyKHz: 120,
    wavePhaseRadians: 0,
    fieldPeriods: 1,
    rotationalTransform: 0,
    responseGain: 1.08
  },
  tokamakLoop: {
    label: 'Tokamak-like loop study',
    description: 'Axisymmetric toroidal/poloidal loop-drive analogue around the FRC vessel; not a tokamak equilibrium.',
    topology: 'tokamak-loop',
    ringCount: 2,
    launchersPerRing: 0,
    driveAngleDegrees: 0,
    angleSpreadDegrees: 0,
    phaseOffsetDegrees: 0,
    fieldPeriods: 1,
    rotationalTransform: 0.18,
    responseGain: 1.03
  },
  stellaratorLoop: {
    label: 'Stellarator-like helical loop study',
    description: 'Non-axisymmetric helical loop-drive analogue around the FRC vessel; not a stellarator equilibrium.',
    topology: 'stellarator-loop',
    ringCount: 3,
    launchersPerRing: 0,
    driveAngleDegrees: 34,
    angleSpreadDegrees: 10,
    phaseOffsetDegrees: 40,
    fieldPeriods: 3,
    rotationalTransform: 0.42,
    responseGain: 1.05
  }
};

export const FRC_RECOVERY_CONFIGURATIONS = {
  inductiveDirect: {
    label: 'Pulsed inductive + direct',
    description: 'Scenario combining pulse-field energy recovery with direct conversion of captured charged fusion products.',
    drivePowerMW: 18,
    inductiveRecoveryEfficiency: 0.82,
    chargedParticleCaptureEfficiency: 0.75,
    directConversionEfficiency: 0.72,
    thermalCaptureEfficiency: 0.1,
    thermalConversionEfficiency: 0.35,
    auxiliaryWallPlugEfficiency: 0.7,
    facilityPowerMW: 4
  },
  chargedDirect: {
    label: 'Charged-particle direct',
    description: 'Scenario prioritizing electrostatic or inductive conversion of charged fusion products with little thermal recovery.',
    drivePowerMW: 10,
    inductiveRecoveryEfficiency: 0.25,
    chargedParticleCaptureEfficiency: 0.9,
    directConversionEfficiency: 0.78,
    thermalCaptureEfficiency: 0.05,
    thermalConversionEfficiency: 0.32,
    auxiliaryWallPlugEfficiency: 0.72,
    facilityPowerMW: 3
  },
  thermalCycle: {
    label: 'Thermal cycle',
    description: 'Conventional blanket and heat-engine scenario with no direct charged-particle or pulse-drive recovery.',
    drivePowerMW: 8,
    inductiveRecoveryEfficiency: 0,
    chargedParticleCaptureEfficiency: 0,
    directConversionEfficiency: 0,
    thermalCaptureEfficiency: 0.88,
    thermalConversionEfficiency: 0.42,
    auxiliaryWallPlugEfficiency: 0.68,
    facilityPowerMW: 5
  },
  hybrid: {
    label: 'Hybrid recovery',
    description: 'Scenario combining partial pulse, charged-particle, and thermal recovery without reusing the same fusion-energy channel.',
    drivePowerMW: 14,
    inductiveRecoveryEfficiency: 0.65,
    chargedParticleCaptureEfficiency: 0.72,
    directConversionEfficiency: 0.7,
    thermalCaptureEfficiency: 0.65,
    thermalConversionEfficiency: 0.4,
    auxiliaryWallPlugEfficiency: 0.7,
    facilityPowerMW: 4.5
  }
};

function boundedFraction(value, fallback) {
  return Math.min(1, Math.max(0, Number(value ?? fallback)));
}

function nonNegative(value, fallback) {
  return Math.max(0, Number(value ?? fallback));
}

function boundedNumber(value, fallback, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value ?? fallback)));
}

function calculateExcitation(configuration, configurations, geometry = 'frc') {
  const configurationKey = FRC_EXCITATION_CONFIGURATIONS[configuration]
    ? configuration
    : 'axialReference';
  const defaults = FRC_EXCITATION_CONFIGURATIONS[configurationKey];
  const overrides = configurations?.[configurationKey] ?? {};
  const ringCount = Math.round(boundedNumber(overrides.ringCount, defaults.ringCount, 0, 6));
  const launchersPerRing = Math.round(boundedNumber(overrides.launchersPerRing, defaults.launchersPerRing, 0, 24));
  const flowRelativeCantDegrees = boundedNumber(
    overrides.flowRelativeCantDegrees,
    overrides.driveAngleDegrees ?? defaults.flowRelativeCantDegrees ?? defaults.driveAngleDegrees,
    -75,
    75
  );
  const driveAngleDegrees = flowRelativeCantDegrees;
  const tubeAxisCantDegrees = boundedNumber(
    overrides.tubeAxisCantDegrees,
    overrides.endBiasDegrees ?? defaults.tubeAxisCantDegrees ?? defaults.endBiasDegrees ?? 0,
    -60,
    60
  );
  const angleSpreadDegrees = boundedNumber(overrides.angleSpreadDegrees, defaults.angleSpreadDegrees, 0, 45);
  const phaseOffsetDegrees = boundedNumber(overrides.phaseOffsetDegrees, defaults.phaseOffsetDegrees, -180, 180);
  const fieldPeriods = Math.round(boundedNumber(overrides.fieldPeriods, defaults.fieldPeriods, 1, 8));
  const rotationalTransform = boundedNumber(overrides.rotationalTransform, defaults.rotationalTransform, 0, 1);
  const launcherCount = ringCount * launchersPerRing;
  const sampleCount = Math.max(1, launcherCount);
  const launcherAnglesDegrees = Array.from({ length: sampleCount }, (_, index) => {
    if (launcherCount === 0) return driveAngleDegrees;
    const ringIndex = Math.floor(index / launchersPerRing);
    const launcherIndex = index % launchersPerRing;
    const phase = launcherIndex / launchersPerRing * Math.PI * 2
      + ringIndex * phaseOffsetDegrees * Math.PI / 180;
    return driveAngleDegrees + angleSpreadDegrees * Math.sin(phase);
  });
  const angleComponents = launcherAnglesDegrees.map((angle) => {
    const radians = angle * Math.PI / 180;
    const tubeAxisCantRadians = tubeAxisCantDegrees * Math.PI / 180;
    const alongTube = geometry !== 'frc';
    const radialComponent = Math.max(0, Math.cos(radians)) * Math.cos(tubeAxisCantRadians);
    const tangentialComponent = alongTube
      ? Math.sin(radians) * Math.cos(tubeAxisCantRadians) + Math.max(0, Math.cos(radians)) * Math.sin(tubeAxisCantRadians)
      : Math.sin(radians) * Math.cos(tubeAxisCantRadians);
    return {
      radial: radialComponent,
      tangential: tangentialComponent,
      tubeAxis: Math.sin(tubeAxisCantRadians)
    };
  });
  const hasGunRings = defaults.topology === 'gun-rings';
  const radialCoupling = hasGunRings
    ? angleComponents.reduce((sum, value) => sum + value.radial, 0) / sampleCount
    : 0;
  const tangentialCoupling = hasGunRings
    ? angleComponents.reduce((sum, value) => sum + Math.abs(value.tangential), 0) / sampleCount
    : 0;
  const signedVorticity = hasGunRings
    ? angleComponents.reduce((sum, value) => sum + value.tangential, 0) / sampleCount
    : 0;
  const signedTubeAxisBias = hasGunRings
    ? angleComponents.reduce((sum, value) => sum + value.tubeAxis, 0) / sampleCount
    : 0;
  const coverage = defaults.topology === 'gun-rings'
    ? 1 - Math.exp(-launcherCount / 12)
    : Math.min(1, 0.62 + fieldPeriods * 0.07 + ringCount * 0.04);
  const spreadCoherence = 1 - angleSpreadDegrees / 180;
  const topologyResponse = defaults.topology === 'axial'
    ? 1
    : defaults.topology === 'gun-rings'
      ? defaults.responseGain * (0.62 + radialCoupling * 0.2 + tangentialCoupling * 0.1 + coverage * 0.08) * spreadCoherence
      : defaults.responseGain * (0.72 + coverage * 0.14 + rotationalTransform * 0.14);
  const couplingScore = Math.min(1.12, Math.max(0.75, topologyResponse));
  const confinementMultiplier = defaults.topology === 'axial'
    ? 1
    : Math.min(1.08, Math.max(0.94, 0.88 + couplingScore * 0.14));
  const focusBeam = defaults.topology === 'gun-rings'
    ? calculatePlasmaFocusBeam({ ...defaults, ...overrides, launcherCount })
    : null;

  return {
    configuration: configurationKey,
    topology: defaults.topology,
    ringCount,
    launchersPerRing,
    launcherCount,
    driveAngleDegrees,
    flowRelativeCantDegrees,
    tubeAxisCantDegrees,
    endBiasDegrees: tubeAxisCantDegrees,
    angleSpreadDegrees,
    phaseOffsetDegrees,
    fieldPeriods,
    rotationalTransform,
    launcherAnglesDegrees,
    focusBeam,
    radialCoupling,
    tangentialCoupling,
    signedVorticity,
    signedTubeAxisBias,
    signedEndBias: signedTubeAxisBias,
    coverage,
    couplingScore,
    confinementMultiplier
  };
}

export function getFrcVisualizationVisibility({ configuration = 'thetaPinch', input = 'DT' } = {}) {
  const configurationModel = FRC_CONFIGURATIONS[configuration] || FRC_CONFIGURATIONS.thetaPinch;
  const inputKey = FRC_INPUTS[input] ? input : 'DT';
  const inputModel = FRC_INPUTS[inputKey];
  const hasCaptureStage = configurationModel.energyCaptureEfficiency > 0;

  return {
    ancillary: {
      energyHarness: true,
      outputManifold: true,
      nitrogenGasFlow: true,
      chargeFlow: true,
      inputParticles: true
    },
    input: Object.fromEntries(Object.keys(FRC_INPUTS).map((key) => [key, key === inputKey])),
    output: {
      nitrogen: configurationModel.nitrogenPurgeSLM > 0,
      helium: hasCaptureStage && inputModel.heliumYield > 0,
      neutrons: hasCaptureStage && inputModel.neutronYield > 0
    }
  };
}

const MU_0 = 4 * Math.PI * 1e-7;
const PLASMA_PRESSURE_PER_DENSITY_TEMPERATURE = 32.1;
const MAGNETIC_PRESSURE_PER_FIELD_SQUARED = 398;
const ELECTRONVOLT_JOULES = 1.602176634e-19;
const NEUTRON_ENERGY_JOULES = 14.1e6 * 1.602176634e-19;
const HELIUM_ATOMIC_MASS_KG = 4.002602 * 1.66053906660e-27;
const ELECTRON_CHARGE_COULOMBS = 1.602176634e-19;
const ELECTRON_MASS_KG = 9.1093837015e-31;
const VACUUM_PERMITTIVITY_FARADS_PER_METER = 8.8541878128e-12;
const MODEL_DENSITY_TO_ELECTRON_DENSITY = 1e20;
const OUTPUT_FREQUENCY_HZ = 60;
const ARGON_ION_MASS_KG = 39.948 * 1.66053906660e-27;
const ADIABATIC_INDEX = 5 / 3;

export function calculateFrcModel({ shape = 'elongated', configuration = 'thetaPinch', input = 'DT', magneticField, density, ionTemperature, rotation, auxiliaryHeatingMW = 12, excitationConfiguration = 'axialReference', excitationConfigurations = {}, recoveryConfiguration = 'inductiveDirect', recoveryConfigurations = {}, piezoDriveFrequencyKHz, piezoStrainPpm, longitudinalDriveFrequencyKHz, longitudinalDriveAmplitude, wavePacketWidth, driveCoupling } = {}) {
  const shapeModel = FRC_SHAPES[shape] || FRC_SHAPES.elongated;
  const configurationModel = FRC_CONFIGURATIONS[configuration] || FRC_CONFIGURATIONS.thetaPinch;
  const inputKey = FRC_INPUTS[input] ? input : 'DT';
  const inputModel = FRC_INPUTS[inputKey];
  const field = Math.max(0.1, Number(magneticField ?? configurationModel.magneticField));
  const particleDensity = Math.max(0.05, Number(density ?? configurationModel.density));
  const temperature = Math.max(0.05, Number(ionTemperature ?? configurationModel.ionTemperature));
  const rotationRate = Math.max(0, Number(rotation ?? configurationModel.rotation));
  const plasmaPressureKPa = PLASMA_PRESSURE_PER_DENSITY_TEMPERATURE * particleDensity * temperature;
  const magneticPressureKPa = MAGNETIC_PRESSURE_PER_FIELD_SQUARED * field ** 2;
  const beta = Math.min(0.98, plasmaPressureKPa / magneticPressureKPa);
  const plasmaRadius = shapeModel.radius * (0.7 + beta * 0.28);
  const plasmaHalfLength = shapeModel.halfLength * (0.84 + beta * 0.2);
  const toroidal = Boolean(shapeModel.geometry);
  const toroidalMajorRadius = toroidal ? shapeModel.wallHalfLength : null;
  const plasmaVolume = toroidal
    ? 2 * Math.PI ** 2 * toroidalMajorRadius * plasmaRadius ** 2
    : 2 * Math.PI * plasmaRadius ** 2 * plasmaHalfLength;
  const plasmaCurrentMA = field * plasmaRadius * 0.52 / MU_0 / 1e6;
  const axialField = field * configurationModel.axialFieldRatio;
  const excitation = calculateExcitation(excitationConfiguration, excitationConfigurations, shapeModel.geometry ?? 'frc');
  const referenceConfinement = Math.min(1, Math.max(0, configurationModel.confinement * (0.82 + beta * 0.28) * (1 - rotationRate * 0.08)));
  const confinement = Math.min(1, referenceConfinement * excitation.confinementMultiplier);
  const stability = Math.min(1, Math.max(0, 0.48 + beta * 0.38 + confinement * 0.25 - Math.abs(axialField / field) * 0.18));
  const fusionTemperatureFactor = 1 - Math.exp(-temperature / 2.5);
  const fusionPowerMW = particleDensity ** 2 * fusionTemperatureFactor * plasmaVolume * 0.24 * confinement * shapeModel.shapeFactor * inputModel.reactionRateFactor;
  const projectedDtFusionPowerMW = particleDensity ** 2 * fusionTemperatureFactor * plasmaVolume * 0.24 * confinement * shapeModel.shapeFactor * FRC_INPUTS.DT.reactionRateFactor;
  const reactionEnergyJoules = inputModel.reactionEnergyMeV * 1e6 * ELECTRONVOLT_JOULES;
  const fusionReactionRate = reactionEnergyJoules > 0 ? fusionPowerMW * 1e6 / reactionEnergyJoules : 0;
  const neutronProductionRate = fusionReactionRate * inputModel.neutronYield * (0.82 + Math.min(0.12, temperature * 0.025));
  const neutronFlux = neutronProductionRate / (2 * Math.PI ** 2 * Math.max(plasmaRadius, 0.1) ** 2);
  const neutronPowerMW = neutronProductionRate * NEUTRON_ENERGY_JOULES / 1e6;
  const heliumOutputGPerHour = fusionReactionRate * inputModel.heliumYield * HELIUM_ATOMIC_MASS_KG * 3600 * 1000;
  const electronDensity = particleDensity * MODEL_DENSITY_TO_ELECTRON_DENSITY;
  const plasmaFrequencyHz = Math.sqrt(electronDensity * ELECTRON_CHARGE_COULOMBS ** 2 / (ELECTRON_MASS_KG * VACUUM_PERMITTIVITY_FARADS_PER_METER)) / (2 * Math.PI);
  const plasmaPeriodSeconds = 1 / plasmaFrequencyHz;
  const nitrogenOutputSLM = configurationModel.nitrogenPurgeSLM * (0.78 + confinement * 0.32) * (0.92 + beta * 0.4);
  const energyCaptureEfficiency = configurationModel.energyCaptureEfficiency * (0.86 + confinement * 0.18);
  const capturedPowerMW = fusionPowerMW * energyCaptureEfficiency;
  const conversionQuality = Math.min(1, Math.max(0, 0.76 + confinement * 0.2 + beta * 0.08 - rotationRate * 0.04));
  const electricConversionEfficiency = inputModel.conversionBaseEfficiency
    * (0.82 + inputModel.chargedEnergyFraction * 0.18)
    * conversionQuality;
  const electricPowerMW = capturedPowerMW * electricConversionEfficiency;
  const auxiliaryPowerMW = Math.max(0.01, Number(auxiliaryHeatingMW));
  const fusionGainQ = fusionPowerMW / auxiliaryPowerMW;
  const referenceFusionPowerMW = confinement > 0 ? fusionPowerMW * referenceConfinement / confinement : 0;
  const referenceFusionGainQ = referenceFusionPowerMW / auxiliaryPowerMW;
  excitation.referenceFusionGainQ = referenceFusionGainQ;
  excitation.fusionGainDelta = referenceFusionGainQ > 0 ? fusionGainQ / referenceFusionGainQ - 1 : 0;
  const recoveryConfigurationKey = FRC_RECOVERY_CONFIGURATIONS[recoveryConfiguration]
    ? recoveryConfiguration
    : 'inductiveDirect';
  const recoveryDefaults = FRC_RECOVERY_CONFIGURATIONS[recoveryConfigurationKey];
  const recoveryOverrides = recoveryConfigurations?.[recoveryConfigurationKey] ?? {};
  const drivePowerMW = nonNegative(recoveryOverrides.drivePowerMW, recoveryDefaults.drivePowerMW);
  const inductiveRecoveryEfficiency = boundedFraction(recoveryOverrides.inductiveRecoveryEfficiency, recoveryDefaults.inductiveRecoveryEfficiency);
  const chargedParticleCaptureEfficiency = boundedFraction(recoveryOverrides.chargedParticleCaptureEfficiency, recoveryDefaults.chargedParticleCaptureEfficiency);
  const directConversionEfficiency = boundedFraction(recoveryOverrides.directConversionEfficiency, recoveryDefaults.directConversionEfficiency);
  const thermalCaptureEfficiency = boundedFraction(recoveryOverrides.thermalCaptureEfficiency, recoveryDefaults.thermalCaptureEfficiency);
  const thermalConversionEfficiency = boundedFraction(recoveryOverrides.thermalConversionEfficiency, recoveryDefaults.thermalConversionEfficiency);
  const auxiliaryWallPlugEfficiency = Math.max(0.01, boundedFraction(recoveryOverrides.auxiliaryWallPlugEfficiency, recoveryDefaults.auxiliaryWallPlugEfficiency));
  const facilityPowerMW = nonNegative(recoveryOverrides.facilityPowerMW, recoveryDefaults.facilityPowerMW);
  const chargedFusionPowerMW = fusionPowerMW * inputModel.chargedEnergyFraction;
  const directlyCapturedFusionPowerMW = chargedFusionPowerMW * chargedParticleCaptureEfficiency;
  const directElectricPowerMW = directlyCapturedFusionPowerMW * directConversionEfficiency;
  const thermalAvailablePowerMW = Math.max(0, fusionPowerMW - directlyCapturedFusionPowerMW);
  const thermalElectricPowerMW = thermalAvailablePowerMW * thermalCaptureEfficiency * thermalConversionEfficiency;
  const inductiveElectricPowerMW = drivePowerMW * inductiveRecoveryEfficiency;
  const recoveredPowerMW = directElectricPowerMW + thermalElectricPowerMW + inductiveElectricPowerMW;
  const auxiliaryElectricPowerMW = auxiliaryPowerMW / auxiliaryWallPlugEfficiency;
  const totalElectricLoadMW = drivePowerMW + auxiliaryElectricPowerMW + facilityPowerMW;
  const netElectricPowerMW = recoveredPowerMW - totalElectricLoadMW;
  const massDensityKgM3 = electronDensity * ARGON_ION_MASS_KG;
  const ionThermalEnergyJoules = temperature * 1e3 * ELECTRONVOLT_JOULES;
  const alfvenSpeedMps = field / Math.sqrt(MU_0 * massDensityKgM3);
  const ionSoundSpeedMps = Math.sqrt(ADIABATIC_INDEX * ionThermalEnergyJoules / ARGON_ION_MASS_KG);
  const ionCyclotronFrequencyHz = ELECTRON_CHARGE_COULOMBS * field / (2 * Math.PI * ARGON_ION_MASS_KG);
  const ionThermalSpeedMps = Math.sqrt(2 * ionThermalEnergyJoules / ARGON_ION_MASS_KG);
  const ionGyroradiusM = ionThermalSpeedMps / (2 * Math.PI * ionCyclotronFrequencyHz);
  const piezoFrequencyHz = Math.max(0, Number(piezoDriveFrequencyKHz ?? configurationModel.piezoDriveFrequencyKHz ?? 0)) * 1e3;
  const longitudinalFrequencyHz = Math.max(0, Number(longitudinalDriveFrequencyKHz ?? configurationModel.longitudinalDriveFrequencyKHz ?? 0)) * 1e3;
  const acousticFundamentalHz = ionSoundSpeedMps / Math.max(4 * plasmaHalfLength, 0.1);
  const acousticWavelengthM = longitudinalFrequencyHz > 0 ? ionSoundSpeedMps / longitudinalFrequencyHz : 0;
  const boundedDriveCoupling = Math.min(1, Math.max(0, Number(driveCoupling ?? configurationModel.driveCoupling ?? 0)));
  const boundedPiezoStrainPpm = Math.min(1000, Math.max(0, Number(piezoStrainPpm ?? configurationModel.piezoStrainPpm ?? 0)));
  const boundedLongitudinalAmplitude = Math.min(1, Math.max(0, Number(longitudinalDriveAmplitude ?? configurationModel.longitudinalDriveAmplitude ?? 0)));
  const boundedWavePacketWidth = Math.min(1, Math.max(0.05, Number(wavePacketWidth ?? configurationModel.wavePacketWidth ?? 0.35)));

  return {
    shape,
    configuration,
    input: inputKey,
    wallRadius: shapeModel.wallRadius,
    wallHalfLength: shapeModel.wallHalfLength,
    geometry: shapeModel.geometry ?? 'frc',
    toroidalMajorRadius,
    fieldPeriods: shapeModel.fieldPeriods ?? 1,
    helicalExcursion: shapeModel.helicalExcursion ?? 0,
    shapeFactor: shapeModel.shapeFactor,
    magneticField: field,
    density: particleDensity,
    ionTemperature: temperature,
    rotation: rotationRate,
    axialField,
    beta,
    plasmaPressureKPa,
    magneticPressureKPa,
    plasmaRadius,
    plasmaHalfLength,
    plasmaVolume,
    plasmaCurrentMA,
    confinement,
    stability,
    fusionPowerMW,
    fusionReactionRate,
    neutronProductionRate,
    neutronFlux,
    neutronPowerMW,
    heliumOutputGPerHour,
    electronDensity,
    plasmaFrequencyHz,
    plasmaPeriodSeconds,
    nitrogenOutputSLM,
    energyCaptureEfficiency,
    capturedPowerMW,
    outputFrequencyHz: OUTPUT_FREQUENCY_HZ,
    electricConversionEfficiency,
    electricPowerMW,
    auxiliaryHeatingMW: auxiliaryPowerMW,
    fusionGainQ,
    excitation,
    recovery: {
      configuration: recoveryConfigurationKey,
      drivePowerMW,
      inductiveRecoveryEfficiency,
      chargedParticleCaptureEfficiency,
      directConversionEfficiency,
      thermalCaptureEfficiency,
      thermalConversionEfficiency,
      auxiliaryWallPlugEfficiency,
      facilityPowerMW,
      chargedFusionPowerMW,
      directlyCapturedFusionPowerMW,
      thermalAvailablePowerMW,
      directElectricPowerMW,
      thermalElectricPowerMW,
      inductiveElectricPowerMW,
      recoveredPowerMW,
      auxiliaryElectricPowerMW,
      totalElectricLoadMW,
      netElectricPowerMW
    },
    reversedField: axialField < 0,
    mhd: {
      active: Boolean(configurationModel.mhdMode) && inputKey === 'Argon',
      mode: configurationModel.mhdMode ?? null,
      workingGas: inputKey === 'Argon' ? 'Argon' : inputModel.label,
      massDensityKgM3,
      alfvenSpeedMps,
      ionSoundSpeedMps,
      ionCyclotronFrequencyHz,
      ionGyroradiusM,
      gyroradiusRatio: ionGyroradiusM / plasmaRadius,
      projectedDtFusionPowerMW,
      projectedDtFusionGainQ: projectedDtFusionPowerMW / auxiliaryPowerMW
    },
    drive: {
      active: Boolean(configurationModel.driveMode) && inputKey === 'Argon',
      mode: configurationModel.driveMode ?? null,
      status: configurationModel.driveMode === 'piezo-rmf'
        ? 'Engineering hypothesis requiring measured actuator coupling'
        : configurationModel.driveMode === 'ion-acoustic'
          ? 'Established plasma mode with reduced external forcing'
          : null,
      piezoFrequencyHz,
      piezoStrainPpm: boundedPiezoStrainPpm,
      piezoCyclotronRatio: ionCyclotronFrequencyHz > 0 ? piezoFrequencyHz / ionCyclotronFrequencyHz : 0,
      acousticFundamentalHz,
      longitudinalFrequencyHz,
      acousticWavelengthM,
      wavelengthToLengthRatio: acousticWavelengthM / Math.max(2 * plasmaHalfLength, 0.1),
      longitudinalAmplitude: boundedLongitudinalAmplitude,
      wavePacketWidth: boundedWavePacketWidth,
      coupling: boundedDriveCoupling
    }
  };
}

export function searchArgonMhdParameterGrid({ auxiliaryHeatingMW = 12 } = {}) {
  const fields = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  const densities = [0.5, 1, 1.5, 2, 2.5, 3];
  const temperatures = [0.5, 1, 2, 3, 4, 5];
  const rotations = [0.1, 0.3, 0.5, 0.7, 0.9];
  const baseConfigurations = Object.entries(FRC_CONFIGURATIONS)
    .filter(([, configuration]) => configuration.mhdSearchBase);

  return baseConfigurations.map(([configuration, definition]) => {
    let best = null;
    for (const shape of Object.keys(FRC_SHAPES)) {
      for (const magneticField of fields) {
        for (const density of densities) {
          for (const ionTemperature of temperatures) {
            for (const rotation of rotations) {
              const model = calculateFrcModel({
                shape,
                configuration,
                input: 'Argon',
                magneticField,
                density,
                ionTemperature,
                rotation,
                auxiliaryHeatingMW
              });
              const admissible = model.beta >= 0.05
                && model.beta <= 0.8
                && model.stability >= 0.55
                && model.confinement >= 0.45
                && model.mhd.gyroradiusRatio <= 0.05;
              if (!admissible) continue;
              const candidate = {
                baseConfiguration: configuration,
                mode: definition.mhdMode,
                shape,
                magneticField,
                density,
                ionTemperature,
                rotation,
                auxiliaryHeatingMW,
                argonFusionGainQ: model.fusionGainQ,
                projectedDtFusionGainQ: model.mhd.projectedDtFusionGainQ,
                beta: model.beta,
                stability: model.stability,
                confinement: model.confinement,
                gyroradiusRatio: model.mhd.gyroradiusRatio
              };
              if (!best
                || candidate.projectedDtFusionGainQ > best.projectedDtFusionGainQ
                || (candidate.projectedDtFusionGainQ === best.projectedDtFusionGainQ
                  && candidate.stability > best.stability)) {
                best = candidate;
              }
            }
          }
        }
      }
    }
    return best;
  }).filter(Boolean);
}
