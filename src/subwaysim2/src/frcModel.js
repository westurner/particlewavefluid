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

export function getFrcVisualizationVisibility({ configuration = 'thetaPinch', input = 'DT' } = {}) {
  const configurationModel = FRC_CONFIGURATIONS[configuration] || FRC_CONFIGURATIONS.thetaPinch;
  const inputKey = FRC_INPUTS[input] ? input : 'DT';
  const inputModel = FRC_INPUTS[inputKey];
  const hasCaptureStage = configurationModel.energyCaptureEfficiency > 0;

  return {
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

export function calculateFrcModel({ shape = 'elongated', configuration = 'thetaPinch', input = 'DT', magneticField, density, ionTemperature, rotation } = {}) {
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
  const plasmaVolume = 2 * Math.PI * plasmaRadius ** 2 * plasmaHalfLength;
  const plasmaCurrentMA = field * plasmaRadius * 0.52 / MU_0 / 1e6;
  const axialField = field * configurationModel.axialFieldRatio;
  const confinement = Math.min(1, Math.max(0, configurationModel.confinement * (0.82 + beta * 0.28) * (1 - rotationRate * 0.08)));
  const stability = Math.min(1, Math.max(0, 0.48 + beta * 0.38 + confinement * 0.25 - Math.abs(axialField / field) * 0.18));
  const fusionTemperatureFactor = 1 - Math.exp(-temperature / 2.5);
  const fusionPowerMW = particleDensity ** 2 * fusionTemperatureFactor * plasmaVolume * 0.24 * confinement * shapeModel.shapeFactor * inputModel.reactionRateFactor;
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

  return {
    shape,
    configuration,
    input: inputKey,
    wallRadius: shapeModel.wallRadius,
    wallHalfLength: shapeModel.wallHalfLength,
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
    reversedField: axialField < 0
  };
}
