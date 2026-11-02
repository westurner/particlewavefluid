import {
  COMMON_SIMULATOR_PARAMETER_META,
  createParameterDefaults,
  createParameterMetaFromDefaults,
  generateJsonSchema,
  SUBWAY_SIMULATOR_PARAMETER_META
} from './simulatorParameterSchema.js';
import { DEFAULT_FIELD_MECHANICS, FIELD_MECHANICS_PARAMETER_FIELDS, FIELD_MODEL_OPTIONS } from './mechanicsModels.js';
import { FTLE_FLOW_PRESETS } from './ftleModel.js';
import { QUANTUM_FLUID_PRESETS } from './quantumFluidModel.js';
import { THERMAL_FLUID_OPTIONS } from './thermalLoopModel.js';
import { SIGNAL_EVENT_PRESETS } from './phaseSignalModel.js';
import { DEFAULT_CLASSICAL_INTENSITY_SETTINGS, LONGITUDINAL_FIELD_MODE_OPTIONS, QUANTUM_CIRCUIT_MODELS } from './quantumCircuitModel.js';
import { DEFAULT_TWISTOR_PARAMETERS } from './twistorModel.js';
import { DEFAULT_HALBACH_MOTOR_SETTINGS, HALBACH_ARRANGEMENT_OPTIONS } from './halbachMotorModel.js';
import { SPACE_TIE_DEFAULTS, SPACE_TIE_OPERATOR_OPTIONS, SPACE_TIE_WIDGETS } from './spaceTieModel.js';
import { RAIL_HEAT_MODELS } from './railHeatModel.js';
import { RAIL_HARVEST_MODES, RAIL_TIE_FORMULATIONS, RAIL_TIE_SCREENING_LIMITS } from './railTieModel.js';
import { OAM_MODES, OAM_OPERATOR_OPTIONS, QUDIT_DIMENSIONS } from './oamSolitonModel.js';
import { DEFAULT_AMPLITUDE_GRAVITY, AMPLITUDE_GRAVITY_MODES } from './amplitudeGravityModel.js';
import { FRC_CONFIGURATIONS, FRC_EXCITATION_CONFIGURATIONS, FRC_INPUTS, FRC_RECOVERY_CONFIGURATIONS, FRC_SHAPES } from './frcModel.js';
import { DEFAULT_ATTRACTOR_PATH_SETTINGS } from './attractorPathModel.js';
import { DEFAULT_PARTICLE_PATH_SETTINGS } from './particlePathModel.js';
import { DEFAULT_SIMULATOR_CAMERA_CONFIGURATION } from './lib/simulator-base.js';
import {
  cloneWaveState,
  DEFAULT_APERTURE_SETTINGS,
  DEFAULT_BEAM_WAIST,
  DEFAULT_WAVE_STATES,
  OCCLUSION_PRESETS,
  OAM_CHARGE_MAX,
  OAM_CHARGE_MIN,
  PHASE_MODES,
  POLARIZATION_MODES,
  WIGNER_MECHANICS_QUANTITIES
} from './waveModel.js';
import {
  DEFAULT_SOLITON_CONFIG,
  OAM_SOLITON_CHARGE_MAX,
  OAM_SOLITON_CHARGE_MIN,
  SOLITON_BATHYMETRY_OPTIONS,
  SOLITON_BOUNDARY_OPTIONS,
  SOLITON_DOMAIN_OPTIONS,
  SOLITON_EMISSION_SIDE_OPTIONS,
  SOLITON_EQUATION_OPTIONS,
  SOLITON_FLUID_OPTIONS,
  WATER_HDL_LDL_PATHWAY_OPTIONS
} from './solitonWaveModel.js';
import { COLOR_PALETTES } from './lib/color-palettes.js';
import { HISTORIC_MISSIONS, PLANET_DIAMETER_MODES, SOLAR_SYSTEM_ATTRACTOR_MODELS } from './solarSystemModel.js';

const COMMON_3D_DEFAULTS = createParameterDefaults(COMMON_SIMULATOR_PARAMETER_META);
const FIELD_MECHANICS_DESCRIPTIONS = Object.fromEntries(Object.entries(FIELD_MECHANICS_PARAMETER_FIELDS)
  .filter(([, field]) => field.description)
  .map(([key, field]) => [`fieldMechanics.${key}`, field.description]));
const SPACE_TIE_RANGES = {};
const SPACE_TIE_ENUMS = {};
for (const widget of SPACE_TIE_WIDGETS) {
  for (const parameter of widget.parameters) {
    if (parameter.type === 'select') {
      SPACE_TIE_ENUMS[parameter.key] = parameter.options.map(({ value }) => value);
    } else {
      SPACE_TIE_RANGES[parameter.key] = [parameter.min, parameter.max, parameter.step];
    }
  }
}

const DEFAULT_BLACK_HOLE_ATTRACTOR = {
  eventHorizonShear: 10,
  fractureThreshold: 25,
  rotationSpeed: 1,
  testStarEccentricity: 0.8,
  thermalNoise: 2,
  orbitRadius: 8,
  orbitVerticalAmplitude: 0.5,
  fractureIntensity: 1
};

function createAttractorProfile(variant) {
  const isHypothesis = variant !== 'simple';
  const type = isHypothesis ? 'blackhole' : 'simple';
  const attractor = (position, name, rotation = [0, 0, 0]) => ({
    position,
    rotation,
    name,
    magnitude: 1,
    type,
    simple: { massMultiplier: 1, spinMultiplier: 1 },
    blackHole: { ...DEFAULT_BLACK_HOLE_ATTRACTOR }
  });
  const defaults = {
    ...DEFAULT_SIMULATOR_CAMERA_CONFIGURATION,
    attractorMassExponent: 7,
    particleGlobalMassExponent: 4,
    particleCount: 2 ** 18,
    maxSpeed: 8,
    velocityDamping: 0.1,
    spinningStrength: 2.75,
    scale: 0.06,
    boundHalfExtent: 8,
    axesVisible: true,
    axesColorX: '#e66b5d',
    axesColorY: '#74d3c5',
    axesColorZ: '#f2c14e',
    colorA: isHypothesis ? '#4de8ff' : '#33905f',
    colorB: variant === 'ddf' ? '#f4c750' : isHypothesis ? '#e74315' : '#55e699',
    controlsColorX: '#e66b5d',
    controlsColorY: '#74d3c5',
    controlsColorZ: '#f2c14e',
    controlsMode: 'rotate',
    showTransformControls: true,
    particleFacing: 'world',
    particleFieldOrientation: 'xz',
    helperVisible: true,
    helperShowName: false,
    helperNamePlacement: 'above',
    helperShowAttributes: false,
    newAttractorPlacement: 'origin',
    newAttractorRandomDist: 3.14,
    cameraZoomAffectsField: false,
    timeScale: 1,
    playbackSpeed: 1,
    blackHoleEventHorizonShear: 10,
    blackHoleFractureThreshold: 25,
    blackHoleRotationSpeed: 1,
    blackHoleTestStarEccentricity: 0.8,
    blackHoleThermalNoise: 2,
    blackHoleOrbitRadius: 8,
    blackHoleOrbitVerticalAmplitude: 0.5,
    blackHoleFractureIntensity: 1,
    blackHoleStreamlines: true,
    ...DEFAULT_ATTRACTOR_PATH_SETTINGS,
    ...DEFAULT_PARTICLE_PATH_SETTINGS,
    blackHoleStarsVisible: true,
    blackHoleStarColor: '#fff4d6',
    blackHoleStarOpacity: 0.72,
    particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance },
    fieldMechanics: {
      ...DEFAULT_FIELD_MECHANICS,
      enabled: true,
      model: variant === 'ddf' ? 'ddf' : variant === 'blackhole' ? 'sqg' : 'default',
      comparisonModel: variant === 'ddf' ? 'sqg' : 'ddf'
    },
    attractors: [
      attractor([-1, 0, 0], 'Attractor 0'),
      attractor([1, 0, -0.5], 'Attractor 1'),
      attractor([0, 0.5, 1], 'Attractor 2', [-0.51, 0.41, -1.35])
    ]
  };
  return profile(defaults, {
    common3d: true,
    descriptions: FIELD_MECHANICS_DESCRIPTIONS,
    ranges: {
      attractorMassExponent: [1, 10, 1],
      particleGlobalMassExponent: [1, 10, 1],
      particleCount: [1024, 2 ** 18, 1024],
      maxSpeed: [0, 10, 0.01],
      velocityDamping: [0, 0.1, 0.001],
      spinningStrength: [0, 10, 0.01],
      timeScale: [0, 5, 0.05],
      boundHalfExtent: [0.5, 20, 0.01],
      scale: [0, 0.1, 0.001],
      particlePathDuration: [1, 12, 0.1],
      particlePathOpacity: [0, 1, 0.01],
      attractorPathLength: [1, 12, 0.1],
      attractorPathOpacity: [0, 1, 0.01],
      blackHoleStarOpacity: [0, 1, 0.01],
      newAttractorRandomDist: [0, 20, 0.01],
      'fieldMechanics.differenceScale': [0, 10, 0.1],
      'fieldMechanics.coreRadius': [0.05, 20, 0.01],
      'fieldMechanics.quantumPressure': [0, 20, 0.01],
      'fieldMechanics.compressibility': [0, 4, 0.01],
      'fieldMechanics.dilatancy': [0, 20, 0.1],
      'fieldMechanics.speedLimit': [0.1, 1000000, 0.1],
      'fieldMechanics.grSpeedOfLight': [5, 1000000, 1],
      'fieldMechanics.baseViscosity': [0, 1, 0.01],
      'fieldMechanics.tensorGaussianWaist': [0.1, 100, 0.1],
      'fieldMechanics.grassmannianPoleWeight': [0, 1, 0.01],
      'fieldMechanics.geometryCoupling': [0, 0.25, 0.005],
      'fieldMechanics.spinPhaseCoupling': [0, 1, 0.01],
      'fieldMechanics.geometrySpinCoupling': [0, 0.25, 0.005],
      'attractors[].magnitude': [0, undefined, 0.01],
      'attractors[].simple.massMultiplier': [0, undefined, 0.01],
      'attractors[].simple.spinMultiplier': [0, undefined, 0.01],
      'attractors[].blackHole.eventHorizonShear': [0, undefined, 0.1],
      'attractors[].blackHole.fractureThreshold': [0.1, undefined, 0.1],
      'attractors[].blackHole.rotationSpeed': [0, undefined, 0.01],
      'attractors[].blackHole.testStarEccentricity': [0, 0.99, 0.01],
      'attractors[].blackHole.thermalNoise': [0, undefined, 0.01],
      'attractors[].blackHole.orbitRadius': [0, undefined, 0.1],
      'attractors[].blackHole.orbitVerticalAmplitude': [0, undefined, 0.01],
      'attractors[].blackHole.fractureIntensity': [0, 4, 0.1]
    },
    enums: {
      controlsMode: ['translate', 'rotate', 'disabled'],
      particleFacing: ['world', 'camera'],
      particleFieldOrientation: ['xz', 'xy', 'yz'],
      helperNamePlacement: ['above', 'center', 'below'],
      newAttractorPlacement: ['origin', 'previous', 'centroid', 'random', 'random within distance'],
      'fieldMechanics.model': FIELD_MODEL_OPTIONS.map(({ value }) => value),
      'fieldMechanics.comparisonModel': FIELD_MODEL_OPTIONS.map(({ value }) => value),
      'attractors[].type': ['simple', 'blackhole']
    },
    integers: ['attractorMassExponent', 'particleGlobalMassExponent', 'particleCount'],
    arrayBounds: {
      attractors: [1, 20],
      'attractors[].position': [3, 3],
      'attractors[].rotation': [3, 3]
    }
  });
}

const WAVE_STATE = cloneWaveState(DEFAULT_WAVE_STATES.at(-1));
const WAVE_DETECTOR_DEFAULTS = {
  enabled: false,
  showDifference: false,
  referenceModel: 'classical',
  candidateModel: 'pilot-wave',
  classical: { detectionTime: 1, glowTime: 100, brightness: 1.8 },
  pilotWave: { detectionTime: 1, glowTime: 3, brightness: 1 },
  wignerGpu: { detectionTime: 1, glowTime: 3, brightness: 1 }
};

function createWaveProfile() {
  const defaults = {
    waves: WAVE_STATE.waves,
    waveCount: WAVE_STATE.waveCount,
    interferenceModes: WAVE_STATE.interferenceModes,
    particleCount: 1024,
    doubleSided: true,
    particleSize: 0.075,
    particleOpacity: 0.9,
    particleShape: 'circle',
    particleDerivativeOrder: 1,
    showWaveRepresentation: true,
    showTensorGaussianSplatters: true,
    classicalWavePalette: 'native',
    superpositionPalette: 'native',
    oamSplatterPalette: 'native',
    orbitControlsVisible: true,
    sourceVectorsVisible: true,
    occlusionPreset: 'none',
    experimentMode: 'field',
    detectionTime: 1,
    glowTime: 3,
    apertureSettings: { ...DEFAULT_APERTURE_SETTINGS },
    detectorVisible: true,
    showOamStatesOnDetector: false,
    detectorMechanicsMode: 'classical',
    detectorModelComparison: structuredClone(WAVE_DETECTOR_DEFAULTS),
    wignerMechanics: { showOnDetector: false, showOnWaveField: false, showNegativeValues: true, quantities: [...WIGNER_MECHANICS_QUANTITIES] },
    detectorPhaseMode: 'all',
    detectorPhaseValue: 0,
    detectorBrightness: 1,
    detectorPalette: 'thermal',
    detectorMaskEnabled: false,
    detectorPixelDensity: 1,
    detectorImplementation: 'classic',
    simulationSpeed: 1,
    showCurrentHertz: false,
    running: true,
    waveMechanics: { model: 'linear', nonlinearCoupling: 0.08, dispersion: 0.05, showDifference: false, mechanicsRegime: 'classical', tensorGaussianWaistM: 6, ddfStrength: 0.5, ddfSpeedLimitMS: 15000, ddfBaseViscosity: 0.02, grassmannianPoleWeight: 0.72, geometryCoupling: 0.1 },
    solitonConfig: structuredClone(DEFAULT_SOLITON_CONFIG)
  };
  return profile(defaults, {
    common3d: true,
    ranges: {
      waveCount: [1, 8, 1],
      particleCount: [1024, 2 ** 14, 512],
      particleSize: [0.02, 0.4, 0.005],
      particleOpacity: [0.05, 1, 0.01],
      particleDerivativeOrder: [0, 4, 1],
      simulationSpeed: [0.1, 4, 0.1],
      detectionTime: [0.1, 100, 0.1],
      glowTime: [0.1, 100, 0.1],
      detectorBrightness: [0.25, 2.5, 0.05],
      detectorPixelDensity: [0.5, 4, 0.25],
      detectorPhaseValue: [-3.14, 3.14, 0.01],
      'waves[].wavelength': [0.01, 12, 0.1],
      'waves[].amplitude': [0, 1.5, 0.01],
      'waves[].decayRate': [0, 1, 0.01],
      'waves[].phaseOffset': [-Math.PI, Math.PI, 0.01],
      'waves[].phaseRate': [-3, 3, 0.01],
      'waves[].orbitalAngularMomentum': [OAM_CHARGE_MIN, OAM_CHARGE_MAX, 1],
      'waves[].beamWaist': [0.5, 9, 0.1],
      'waveMechanics.tensorGaussianWaistM': [0.1, 100, 0.1],
      'waveMechanics.ddfStrength': [0, 20, 0.1],
      'waveMechanics.ddfSpeedLimitMS': [100, 100000, 100],
      'waveMechanics.ddfBaseViscosity': [0, 1, 0.01],
      'waveMechanics.grassmannianPoleWeight': [0, 1, 0.01],
      'waveMechanics.geometryCoupling': [0, 0.25, 0.005],
      'apertureSettings.slitPosition': [-3, 3, 0.05],
      'apertureSettings.slitWidthA': [0, 5, 0.05],
      'apertureSettings.slitWidthB': [0, 5, 0.05],
      'apertureSettings.slitCount': [1, 12, 1],
      'apertureSettings.slitSpacing': [0.5, 8, 0.1],
      'apertureSettings.slitWallMargin': [0, 1.55, 0.05],
      'apertureSettings.slitOpacity': [0, 1, 0.01],
      'apertureSettings.slitScreenPositionX': [-9, 9, 0.1],
      'apertureSettings.slitScreenPositionY': [-9, 9, 0.1],
      'apertureSettings.slitScreenPositionZ': [-9, 9, 0.1],
      'apertureSettings.slitScreenRotationX': [-3.15, 3.15, 0.05],
      'apertureSettings.slitScreenRotationY': [-3.15, 3.15, 0.05],
      'apertureSettings.slitScreenRotationZ': [-3.15, 3.15, 0.05],
      'apertureSettings.detectorDistance': [0, 21, 0.1],
      'detectorModelComparison.classical.detectionTime': [0.1, 100, 0.1],
      'detectorModelComparison.classical.glowTime': [0.1, 100, 0.1],
      'detectorModelComparison.classical.brightness': [0.25, 2.5, 0.05],
      'detectorModelComparison.pilotWave.detectionTime': [0.1, 100, 0.1],
      'detectorModelComparison.pilotWave.glowTime': [0.1, 100, 0.1],
      'detectorModelComparison.pilotWave.brightness': [0.25, 2.5, 0.05],
      'detectorModelComparison.wignerGpu.detectionTime': [0.1, 100, 0.1],
      'detectorModelComparison.wignerGpu.glowTime': [0.1, 100, 0.1],
      'detectorModelComparison.wignerGpu.brightness': [0.25, 2.5, 0.05],
      'solitonConfig.solitonCount': [1, 2, 1],
      'solitonConfig.viscosityScale': [0, 5, 0.05],
      'solitonConfig.nonlinearScale': [0.1, 3, 0.05],
      'solitonConfig.dispersionScale': [0.1, 3, 0.05],
      'solitonConfig.poolDepthM': [0.4, 5, 0.1],
      'solitonConfig.pneumaticPressureKPa': [5, 120, 1],
      'solitonConfig.bathymetryRelief': [0, 0.78, 0.02],
      'solitonConfig.bathymetryCenterX': [-6, 6, 0.2],
      'solitonConfig.tubularCurlStrength': [0, 1.5, 0.05],
      'solitonConfig.electronTempEv': [0.2, 25, 0.1],
      'solitonConfig.ionTempEv': [0.02, 10, 0.02],
      'solitonConfig.plasmaDensity1e16M3': [0.2, 50, 0.2],
      'solitonConfig.magneticFieldT': [0, 5, 0.05],
      'solitonConfig.collisionDamping': [0, 0.5, 0.01],
      'solitonConfig.nonlinearityScale': [0, 3, 0.05],
      'solitonConfig.vectorCoupling': [-1, 2, 0.05],
      'solitonConfig.oamWaist': [0.6, 5, 0.1],
      'solitonConfig.oamHelicalTwist': [0.1, 3, 0.05],
      'solitonConfig.cubicNonlinearity': [-2, 2, 0.05],
      'solitonConfig.hdlLdlCoupling': [0, 1.5, 0.05],
      'solitonConfig.hdlLdlTemperatureK': [175, 310, 1],
      'solitonConfig.hdlLdlPressureBar': [1, 2500, 25],
      'solitonConfig.tubularCurlStrength': [0, 1.5, 0.05],
      'solitonConfig.solitons[].amplitude': [0.05, 1.5, 0.02],
      'solitonConfig.solitons[].width': [0.45, 4.5, 0.05],
      'solitonConfig.solitons[].positionOffset': [-7.5, 7.5, 0.1],
      'solitonConfig.solitons[].vectorAngleDeg': [-90, 90, 1],
      'solitonConfig.solitons[].oamCharge': [OAM_SOLITON_CHARGE_MIN, OAM_SOLITON_CHARGE_MAX, 1]
    },
    integers: ['waveCount', 'particleCount', 'particleDerivativeOrder', 'apertureSettings.slitCount', 'solitonConfig.solitonCount', 'solitonConfig.solitons[].oamCharge'],
    nullable: ['apertureSettings.slitCount', 'apertureSettings.slitSpacing'],
    enums: {
      particleShape: ['circle', 'square', 'sphere', 'vector'],
      occlusionPreset: OCCLUSION_PRESETS.map(({ id }) => id),
      detectorMechanicsMode: ['classical', 'pilot-wave', 'wigner-function', 'wigner-gpu'],
      detectorPhaseMode: ['all', ...PHASE_MODES],
      detectorPalette: COLOR_PALETTES.map(({ value }) => value),
      detectorImplementation: ['classic', 'native'],
      'waves[].phaseMode': PHASE_MODES,
      'waves[].polarization': POLARIZATION_MODES,
      'waveMechanics.model': ['linear', 'gpe'],
      'solitonConfig.domain': SOLITON_DOMAIN_OPTIONS.map(({ value }) => value),
      'solitonConfig.equation': SOLITON_EQUATION_OPTIONS.map(({ value }) => value),
      'solitonConfig.fluidId': SOLITON_FLUID_OPTIONS.map(({ value }) => value),
      'solitonConfig.emissionSide': SOLITON_EMISSION_SIDE_OPTIONS.map(({ value }) => value),
      'solitonConfig.boundaryCondition': SOLITON_BOUNDARY_OPTIONS.map(({ value }) => value),
      'solitonConfig.bathymetryProfile': SOLITON_BATHYMETRY_OPTIONS.map(({ value }) => value),
      'solitonConfig.hdlLdlPathway': WATER_HDL_LDL_PATHWAY_OPTIONS.map(({ value }) => value),
      'solitonConfig.solitons[].sideOverride': ['auto', 'left', 'right']
    },
    arrayBounds: {
      waves: [8, 8],
      'waves[].origin': [3, 3],
      'waves[].direction': [3, 3],
      'waves[].rotation': [3, 3],
      'solitonConfig.solitons': [2, 2],
      'solitonConfig.solitons[].position': [3, 3],
      'solitonConfig.solitons[].direction': [3, 3]
    }
  });
}

function createFrcProfile() {
  return profile({
    ...COMMON_3D_DEFAULTS,
    shape: 'elongated',
    configuration: 'thetaPinch',
    input: 'DT',
    magneticField: 2.8,
    density: 1.8,
    ionTemperature: 1.6,
    auxiliaryHeatingMW: 12,
    excitationConfiguration: 'axialReference',
    excitationConfigurations: Object.fromEntries(Object.entries(FRC_EXCITATION_CONFIGURATIONS).map(([id, value]) => [id, { ...value }])),
    recoveryConfiguration: 'inductiveDirect',
    recoveryConfigurations: Object.fromEntries(Object.entries(FRC_RECOVERY_CONFIGURATIONS).map(([id, value]) => [id, { ...value }])),
    rotation: 0.18,
    piezoDriveFrequencyKHz: 20,
    piezoStrainPpm: 80,
    longitudinalDriveFrequencyKHz: 2,
    longitudinalDriveAmplitude: 0.2,
    wavePacketWidth: 0.35,
    driveCoupling: 0.08,
    vesselScale: 1,
    vesselOpacity: 0.18,
    fieldVolumeOpacity: 0.06,
    showToroidalPlasmaVolume: false,
    toroidalPlasmaOpacity: 0.28,
    fieldTilt: 0,
    transportSpeed: 1,
    transportModel: 'classical',
    quantumPressure: 0.35,
    transportDilatancy: 1,
    transportSpeedLimit: 1.2,
    plasmaOpacity: 0.85,
    plasmaColor: '#ff4fa3',
    vesselShellColor: '#a9d9dd',
    vesselShellEmissiveColor: '#000000',
    separatrixVolumeColor: '#ff4fa3',
    separatrixVolumeEmissiveColor: '#ff4fa3',
    plasmaRunning: true,
    showPlasma: true,
    showPlasmaFocusBeamlets: true,
    showKeyReadouts: true,
    showCabling: true,
    showEnergyHarness: true,
    showOutputManifold: true,
    showNitrogenOutput: true,
    showHeliumOutput: true,
    showNeutronOutput: true,
    showGasFlow: true,
    showChargeFlow: true,
    gasFlowSpeed: 1,
    chargeFlowSpeed: 1,
    heliumFlowSpeed: 1,
    neutronFlowSpeed: 1,
    inputParticleSpeed: 1,
    showInputParticles: true,
    showDTInput: true,
    showDHe3Input: false,
    showArgonInput: false,
    showInputAnnotations: true,
    showInputAttributes: true,
    showPlasmaAnnotations: true,
    showPlasmaAttributes: true,
    showDeviceAnnotations: true,
    showDeviceAttributes: true,
    showAnnotations: true,
    showCoils: true,
    showExcitationHardware: true,
    showFieldVolume: true,
    showAxis: true,
    harnessHeight: 1.15,
    harnessCollectorCount: 7,
    outputSpread: 1.8,
    outputTubeRadius: 0.085,
    devicePitch: 0,
    deviceYaw: 0,
    deviceRoll: 0
  }, {
    common3d: true,
    ranges: {
      magneticField: [1, 4.5, 0.1],
      density: [0.5, 3, 0.05],
      ionTemperature: [0.5, 5, 0.1],
      auxiliaryHeatingMW: [0.5, 50, 0.5],
      fieldTilt: [-18, 18, 1],
      transportSpeed: [0, 2, 0.05],
      quantumPressure: [0, 3, 0.05],
      transportDilatancy: [0, 8, 0.05],
      transportSpeedLimit: [0.1, 3, 0.05],
      piezoDriveFrequencyKHz: [1, 100, 1],
      piezoStrainPpm: [0, 1000, 10],
      longitudinalDriveFrequencyKHz: [0.1, 100, 0.1],
      longitudinalDriveAmplitude: [0, 1, 0.01],
      wavePacketWidth: [0.05, 1, 0.05],
      driveCoupling: [0, 1, 0.01],
      vesselScale: [0.8, 1.2, 0.01],
      vesselOpacity: [0.06, 0.34, 0.01],
      fieldVolumeOpacity: [0, 0.3, 0.01],
      toroidalPlasmaOpacity: [0, 0.9, 0.05],
      plasmaOpacity: [0.15, 1, 0.05],
      gasFlowSpeed: [0, 2, 0.05],
      chargeFlowSpeed: [0, 2, 0.05],
      heliumFlowSpeed: [0, 2, 0.05],
      neutronFlowSpeed: [0, 2, 0.05],
      inputParticleSpeed: [0, 2, 0.05],
      harnessHeight: [0.4, 2.5, 0.05],
      harnessCollectorCount: [3, 11, 1],
      outputSpread: [0.8, 3.2, 0.1],
      outputTubeRadius: [0.04, 0.18, 0.005],
      devicePitch: [-180, 180, 1],
      deviceYaw: [-180, 180, 1],
      deviceRoll: [-180, 180, 1],
      'recoveryConfigurations.inductiveDirect.drivePowerMW': [0, 100, 0.5],
      'recoveryConfigurations.chargedDirect.drivePowerMW': [0, 100, 0.5],
      'recoveryConfigurations.thermalCycle.drivePowerMW': [0, 100, 0.5],
      'recoveryConfigurations.hybrid.drivePowerMW': [0, 100, 0.5],
      'recoveryConfigurations.inductiveDirect.facilityPowerMW': [0, 50, 0.5],
      'recoveryConfigurations.chargedDirect.facilityPowerMW': [0, 50, 0.5],
      'recoveryConfigurations.thermalCycle.facilityPowerMW': [0, 50, 0.5],
      'recoveryConfigurations.hybrid.facilityPowerMW': [0, 50, 0.5]
    },
    integers: ['harnessCollectorCount'],
    enums: {
      shape: Object.keys(FRC_SHAPES),
      configuration: Object.keys(FRC_CONFIGURATIONS),
      input: Object.keys(FRC_INPUTS),
      excitationConfiguration: Object.keys(FRC_EXCITATION_CONFIGURATIONS),
      recoveryConfiguration: Object.keys(FRC_RECOVERY_CONFIGURATIONS),
      transportModel: ['classical', 'gpe', 'ddf']
    }
  });
}

function createAmplitudeGravityProfile() {
  return profile({
    ...DEFAULT_AMPLITUDE_GRAVITY,
    ...COMMON_3D_DEFAULTS,
    mode: 'newtonian',
    attractorModel: 'solar-system',
    flightMode: 'explore',
    ephemerisDate: new Date().toISOString().slice(0, 10),
    selectedBodyId: 'Earth',
    planetDiameterMode: 'illustrative',
    illustrativePlanetScale: 1,
    showPlanetaryOrbits: true,
    historicMissionId: 'none',
    launchOriginId: 'Earth',
    launchSpeedKmPerSecond: 12,
    launchHeadingDeg: 0,
    launchInclinationDeg: 0,
    showModelDifferences: true,
    showValidationTracks: false,
    showPairDistanceContributions: false,
    particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance },
    timeScale: 0.42
  }, {
    common3d: true,
    ranges: {
      'cellGaps[]': [0.000001, undefined, 0.01],
      coupling: [0, 4, 0.01],
      fieldCoreRadius: [0.05, 20, 0.01],
      quantumPressure: [0, 20, 0.01],
      compressibility: [0, 4, 0.01],
      geometryCoupling: [0, 0.25, 0.005],
      grassmannianPoleWeight: [0, 1, 0.01],
      spinPhaseCoupling: [0, 1, 0.01],
      geometrySpinCoupling: [0, 0.25, 0.005],
      fieldSpinStrength: [0, 1, 0.01],
      ddfStrength: [0, 20, 0.01],
      ddfSpeedLimitMS: [0.1, 1000000, 0.1],
      ddfBaseViscosity: [0, 1, 0.01],
      softening: [0.000000001, 10, 0.000000001],
      gravitationalConstant: [0, 100, 0.01],
      speedOfLight: [1, 1000000, 1],
      grSpeedOfLight: [1, 1000000000, 1],
      streamlineLength: [1, 24, 1],
      streamlineOpacity: [0, 1, 0.01],
      attractorPathLength: [1, 12, 1],
      launchSpeedKmPerSecond: [1, 40, 0.1],
      launchHeadingDeg: [-180, 180, 1],
      launchInclinationDeg: [-90, 90, 1],
      illustrativePlanetScale: [0.25, 4, 0.05],
      timeScale: [0, 1.5, 0.01]
    },
    enums: {
      mode: AMPLITUDE_GRAVITY_MODES.map(({ value }) => value),
      attractorModel: SOLAR_SYSTEM_ATTRACTOR_MODELS.map(({ value }) => value),
      flightMode: ['explore', 'launch'],
      planetDiameterMode: PLANET_DIAMETER_MODES.map(({ value }) => value),
      historicMissionId: ['none', ...HISTORIC_MISSIONS.map(({ id }) => id)]
    },
    arrayBounds: { cellGaps: [3, 3] }
  });
}

function profile(defaults, { ranges = {}, enums = {}, integers = [], arrayBounds = {}, arrayItems = {}, nullable = [], descriptions = {}, common3d = false } = {}) {
  const resolvedDefaults = common3d
    ? {
      ...COMMON_3D_DEFAULTS,
      ...defaults,
      particleAppearance: {
        ...COMMON_3D_DEFAULTS.particleAppearance,
        ...(defaults.particleAppearance ?? {})
      }
    }
    : defaults;
  const meta = createParameterMetaFromDefaults(resolvedDefaults, { ranges, enums, integers, arrayBounds, arrayItems, nullable, descriptions });
  if (common3d) {
    for (const [key, definition] of Object.entries(COMMON_SIMULATOR_PARAMETER_META)) {
      if (definition.type !== 'object') {
        meta[key] = { ...definition, default: resolvedDefaults[key], ...(descriptions[key] ? { description: descriptions[key] } : {}) };
        continue;
      }
      const properties = { ...meta[key].properties };
      for (const [propertyKey, propertyDefinition] of Object.entries(definition.properties)) {
        const path = `${key}.${propertyKey}`;
        properties[propertyKey] = { ...propertyDefinition, default: resolvedDefaults[key][propertyKey], ...(descriptions[path] ? { description: descriptions[path] } : {}) };
      }
      meta[key] = { ...meta[key], properties };
    }
  }
  return { defaults: resolvedDefaults, meta };
}

export const SIMULATOR_PARAMETER_PROFILES = Object.freeze({
  subwaysim2: {
    defaults: createParameterDefaults(SUBWAY_SIMULATOR_PARAMETER_META),
    meta: SUBWAY_SIMULATOR_PARAMETER_META
  },
  waveinterferencesim: createWaveProfile(),
  simpleattractorsim: createAttractorProfile('simple'),
  sqgblackholesim: createAttractorProfile('blackhole'),
  ddfblackholesim: createAttractorProfile('ddf'),
  frcfusionsim: createFrcProfile(),
  amplitudegravitysim: createAmplitudeGravityProfile(),
  ftlelabsim: profile({
    flow: 'double-gyre',
    direction: 'forward',
    metric: 'ftle',
    horizon: 2.5,
    rate: 0.65,
    resolution: 28,
    seedX: 0.6,
    seedY: 0.5
  }, {
    common3d: true,
    ranges: {
      horizon: [0.25, 6, 0.05],
      rate: [0.05, 1.5, 0.01],
      resolution: [12, 42, 1],
      seedX: [0, 1, 0.01],
      seedY: [0, 1, 0.01]
    },
    integers: ['resolution'],
    enums: {
      flow: FTLE_FLOW_PRESETS.map(({ value }) => value),
      direction: ['forward', 'backward'],
      metric: ['ftle', 'volume', 'ridge']
    }
  }),
  phasesignalsim: profile({
    preset: 'coupled',
    carrierHz: 37,
    noise: 0.02,
    slipThreshold: 2.4,
    fractureThreshold: 0.35,
    analogyEnabled: false,
    analogyOffset: 0.018
  }, {
    ranges: {
      carrierHz: [5, 120, 1],
      noise: [0, 0.2, 0.005],
      slipThreshold: [0.5, 3.14, 0.01],
      fractureThreshold: [0.05, 1, 0.01],
      analogyOffset: [-0.1, 0.1, 0.001]
    },
    integers: ['carrierHz'],
    enums: { preset: SIGNAL_EVENT_PRESETS.map(({ value }) => value) }
  }),
  thermalloopsim: profile({
    fluidId: 'water',
    itLoadMW: 1,
    temperatureRiseC: 10,
    pipeLengthM: 120,
    pipeDiameterM: 0.15,
    pumpEfficiency: 0.72,
    chillerCop: 5.5,
    ambientC: 20,
    supplyC: 30,
    economizerApproachC: 5,
    economizerHoursFraction: 0.55,
    facilityBasePue: 1.08
  }, {
    common3d: true,
    ranges: {
      itLoadMW: [0.1, 20, 0.1],
      temperatureRiseC: [2, 30, 0.5],
      pipeDiameterM: [0.04, 0.4, 0.005],
      pipeLengthM: [10, 1000, 5],
      pumpEfficiency: [0.2, 0.95, 0.01],
      chillerCop: [1.5, 10, 0.1],
      ambientC: [-20, 50, 0.5],
      supplyC: [10, 55, 0.5]
    },
    enums: { fluidId: THERMAL_FLUID_OPTIONS.map(({ value }) => value) }
  }),
  quantumfluidsim: profile({
    size: 32,
    gridShape: 'square',
    torusMajorRadius: 1.55,
    torusTubeRadius: 0.6,
    torusClosed: true,
    vortexCharge: 1,
    vortexCoreRadius: 0.75,
    vortexCenterX: 0,
    vortexCenterY: 0,
    particleCount: 1024,
    domainSize: 12,
    preset: 'vortex',
    view: 'side-by-side',
    field: 'density',
    interaction: 0.8,
    potentialStrength: 0,
    stepSize: 0.002,
    timeScale: 1,
    running: true,
    fieldMechanics: { ...DEFAULT_FIELD_MECHANICS, enabled: true, model: 'sqg', comparisonModel: 'ddf' }
  }, {
    common3d: true,
    descriptions: {
      ...FIELD_MECHANICS_DESCRIPTIONS,
      vortexCoreRadius: 'Radial distance over which density rises from zero at the vortex core.',
      vortexCenterX: 'Horizontal displacement of the vortex center from the grid center, in domain units.',
      vortexCenterY: 'Vertical displacement of the vortex center from the grid center, in domain units.',
      interaction: 'Nonlinear self-interaction coefficient; larger values increase phase accumulation in dense regions.',
      potentialStrength: 'Harmonic trap coefficient k in V(r) = 1/2 k r², centered on the grid origin.',
      'particleAppearance.derivativeOrder': 'Order used to estimate vector direction: 0 uses local current when available; 1-4 use periodic derivatives of the active scalar field.'
    },
    ranges: {
      torusMajorRadius: [0.75, 4, 0.05],
      torusTubeRadius: [0.1, 1.5, 0.05],
      vortexCoreRadius: [0.1, 3, 0.05],
      vortexCenterX: [-3, 3, 0.1],
      vortexCenterY: [-3, 3, 0.1],
      interaction: [0, 3, 0.05],
      potentialStrength: [0, 0.2, 0.005],
      timeScale: [0.1, 2, 0.05],
      'fieldMechanics.coreRadius': [0.1, 10, 0.1],
      'fieldMechanics.quantumPressure': [0, 10, 0.1],
      'fieldMechanics.compressibility': [0, 10, 0.1],
      'fieldMechanics.dilatancy': [0, 20, 0.1],
      'fieldMechanics.speedLimit': [0.1, 100000, 0.1]
    },
    integers: ['size', 'particleCount'],
    enums: {
      size: [16, 32, 64, 128, 256],
      gridShape: ['square', 'circle', 'torus'],
      vortexCharge: [-3, -2, -1, 1, 2, 3],
      preset: QUANTUM_FLUID_PRESETS.map(({ value }) => value),
      view: ['side-by-side', 'difference', 'hypothesis', 'gpe', 'euler-korteweg'],
      field: ['density', 'phase', 'current', 'quantum-pressure'],
      'fieldMechanics.model': FIELD_MODEL_OPTIONS.filter(({ value }) => ['sqg', 'sqg-tensor-gaussian', 'ddf', 'ddf-tensor-gaussian'].includes(value)).map(({ value }) => value),
      'fieldMechanics.comparisonModel': FIELD_MODEL_OPTIONS.map(({ value }) => value)
    },
    arrayBounds: {}
  }),
  quantumcircuitsim: profile({
    qubitCount: 2,
    initialState: '00',
    gates: [{ type: 'H', target: 0 }, { type: 'CNOT', control: 0, target: 1 }],
    simulationModel: 'ideal',
    comparisonEnabled: false,
    comparisonReference: 'ideal',
    detectorSettings: { ...DEFAULT_CLASSICAL_INTENSITY_SETTINGS }
  }, {
    ranges: {
      'detectorSettings.wavelength': [0.25, 6, 0.05],
      'detectorSettings.railSpacing': [0.4, 4, 0.05],
      'detectorSettings.detectorDistance': [0.5, 10, 0.1],
      'detectorSettings.portWidth': [0.1, 4, 0.05],
      'detectorSettings.beamPhaseShift': [-Math.PI, Math.PI, 0.05],
      'detectorSettings.coreIndex': [1.01, 4, 0.01],
      'detectorSettings.effectiveIndex': [1, 4, 0.01],
      'detectorSettings.plasmaFrequencyRatio': [0.05, 2, 0.01],
      'detectorSettings.thermalSpeedRatio': [0, 0.3, 0.005],
      'detectorSettings.screenSamples': [32, 512, 1]
    },
    enums: {
      simulationModel: QUANTUM_CIRCUIT_MODELS.map(({ value }) => value),
      comparisonReference: QUANTUM_CIRCUIT_MODELS.map(({ value }) => value),
      'detectorSettings.fieldMode': LONGITUDINAL_FIELD_MODE_OPTIONS.map(({ value }) => value)
    },
    integers: ['qubitCount', 'detectorSettings.screenSamples', 'gates[].control', 'gates[].target'],
    arrayBounds: { gates: [0, 64] },
    arrayItems: {
      gates: {
        type: 'object',
        properties: {
          type: { type: 'enum', default: 'H', values: ['H', 'X', 'Z', 'S', 'CNOT'] },
          target: { type: 'integer', default: 0 },
          control: { type: 'integer', default: 0 }
        },
        required: ['type', 'target'],
        additionalProperties: false
      }
    }
  }),
  twistorspinortrainer: profile({
    lesson: 'twistors',
    view: 'expression',
    ...DEFAULT_TWISTOR_PARAMETERS
  }, {
    ranges: {
      scale: [0.25, 2, 0.01],
      polar: [0, Math.PI, 0.01],
      azimuth: [-Math.PI, Math.PI, 0.01],
      phase: [-Math.PI, Math.PI, 0.01]
    },
    enums: {
      lesson: ['twistors', 'spinors', 'yang-mills', 'amplituhedron'],
      view: ['expression', 'tensor', 'plane', 'space']
    }
  }),
  longitudinallasersim: profile({
    layout: 'block',
    circuitId: 'interconnect',
    wavelength: 515,
    numericalAperture: 0.62,
    scanSpeed: 3.2,
    modules: Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      enabled: true,
      power: 86,
      phase: (index * 53) % 360,
      focusX: 0,
      focusZ: 0,
      polarization: ['H', 'V', 'D', 'R', 'L', 'H'][index]
    }))
  }, {
    ranges: {
      wavelength: [447, 637, 1],
      numericalAperture: [0.3, 0.9, 0.01],
      scanSpeed: [0.5, 8, 0.1],
      'modules[].power': [0, 100, 1],
      'modules[].phase': [0, 360, 1],
      'modules[].focusX': [-3, 3, 0.01],
      'modules[].focusZ': [-3, 3, 0.01]
    },
    integers: ['wavelength', 'modules[].id', 'modules[].phase'],
    enums: {
      layout: ['block', 'wafer', 'roll-to-roll'],
      circuitId: ['interconnect', 'sensor', 'photonic'],
      'modules[].polarization': ['H', 'V', 'D', 'R', 'L']
    },
    arrayBounds: { modules: [4, 8] }
  }),
  oamsolitonsim: profile({
    amplitudeA: 1,
    amplitudeB: 0.7,
    phaseA: 0,
    phaseB: 90,
    modeA: 1,
    modeB: -1,
    operator: 'beam-splitter',
    angleDegrees: 45,
    quditDimension: OAM_MODES.length,
    simulationSpeed: 1,
    signalOpacity: 0.3,
    signalLineWidth: 2.5,
    amplitudeSizeVariation: 1,
    viewMode: '3d',
    viewSettings: {
      ...COMMON_3D_DEFAULTS,
      showWaveRepresentation: true,
      waveOpacity: 0.3,
      outputRepresentationMode: 'separate',
      continuousSplatters: false,
      mechanicsRegime: 'classical',
      mechanicsTensorGaussianWaistM: 6,
      mechanicsDdfStrength: 1,
      mechanicsDdfSpeedLimitMS: 15000,
      mechanicsDdfBaseViscosity: 0.02,
      mechanicsGrassmannianWeight: 0.72,
      mechanicsGeometryCoupling: 0.1,
      wavePalette: 'native',
      splatterPalette: 'native',
      modePalette: 'native',
      particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance, splatterEnabled: true }
    }
  }, {
    common3d: false,
    ranges: {
      amplitudeA: [0, 1, 0.01],
      amplitudeB: [0, 1, 0.01],
      phaseA: [-180, 180, 1],
      phaseB: [-180, 180, 1],
      angleDegrees: [0, 180, 1],
      simulationSpeed: [0, 10, 0.01],
      signalOpacity: [0, 1, 0.01],
      signalLineWidth: [0.5, 8, 0.1],
      amplitudeSizeVariation: [0, 5, 0.01],
      'viewSettings.waveOpacity': [0, 1, 0.01],
      'viewSettings.mechanicsTensorGaussianWaistM': [0.1, 100, 0.1],
      'viewSettings.mechanicsDdfStrength': [0, 20, 0.1],
      'viewSettings.mechanicsDdfSpeedLimitMS': [100, 100000, 100],
      'viewSettings.mechanicsDdfBaseViscosity': [0, 1, 0.01],
      'viewSettings.mechanicsGrassmannianWeight': [0, 1, 0.01],
      'viewSettings.mechanicsGeometryCoupling': [0, 0.25, 0.005]
    },
    integers: ['phaseA', 'phaseB', 'angleDegrees'],
    enums: {
      modeA: OAM_MODES,
      modeB: OAM_MODES,
      operator: OAM_OPERATOR_OPTIONS.map(({ value }) => value),
      quditDimension: QUDIT_DIMENSIONS,
      viewMode: ['3d', 'bus', 'spectrum'],
      'viewSettings.outputRepresentationMode': ['separate', 'combined'],
      'viewSettings.mechanicsRegime': ['classical', 'tensor-gaussian', 'ddf', 'grassmannian-amplituhedron']
    }
  }),
  railheatsim: profile({
    cameraViewMode: 'ortho1',
    ambientTemperature: 20,
    heatPower: 500,
    sourcePosition: 0,
    sourceWidth: 0.16,
    diffusivityScale: 1,
    relaxationTime: 2,
    ddfStrength: 0.8,
    convection: 0.0003,
    timeScale: 60,
    particleCount: 1536,
    displayModel: 'comparison',
    showModelDifferences: true,
    gaussianSplatters: true,
    tensorGaussianWaist: 0.36,
    splatterDeformationScale: 1,
    particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance, sizeScale: 1.25, opacity: 0.8, splatterEnabled: true }
  }, {
    common3d: true,
    ranges: {
      ambientTemperature: [-20, 45, 1],
      heatPower: [0, 12000, 100],
      sourcePosition: [-3, 3, 0.05],
      sourceWidth: [0.04, 0.55, 0.01],
      diffusivityScale: [0.25, 5, 0.05],
      relaxationTime: [0.1, 8, 0.1],
      ddfStrength: [0, 4, 0.05],
      convection: [0, 0.003, 0.00005],
      timeScale: [60, 1800, 30],
      particleCount: [384, 6144, 384],
      tensorGaussianWaist: [0.1, 1.5, 0.02]
    },
    integers: ['particleCount', 'timeScale'],
    enums: { displayModel: ['comparison', 'fourier', 'cattaneo', 'ddf'] }
  }),
  railtiesim: profile({
    cameraViewMode: 'ortho1',
    material: 'hybrid-lvh-lvcf',
    hempVolume: 60,
    carbonSkinWtPercent: 15,
    harvestingMode: 'hybrid',
    railSeatLoadKN: 30,
    bucklingLoad: 1.15,
    ligCurrent: 5,
    grapheneLoadingWtPercent: 0,
    percolationThresholdWtPercent: RAIL_TIE_SCREENING_LIMITS.grapheneLoadingWtPercent,
    dielectricBarrierIntact: true,
    measuredRailToRailResistanceOhm: 500000,
    structuralCostPerTie: 464.33,
    batteryCostPerTie: 250,
    harvesterCostPerTie: 45,
    wirelessTransferCostPerTie: 75,
    telemetryCostPerTie: 25,
    integrationCostPerTie: 60,
    batteryCapacityKWhPerTie: 5,
    batteryVolumeL: 10,
    batteryEnergyDensityWhPerL: 500,
    batteryCycleLife: 50000,
    storageCyclesPerYear: 500,
    piezoJoulesPerAxleTie: 2,
    tengJoulesPerAxleTie: 0.5,
    axlesPerTrain: 424,
    trainsPerDay: 40,
    transferEfficiencyPercent: 0,
    gridValuePerMWhYear: 0,
    annualMaintenanceSavings: 0,
    grantSharePercent: 0,
    productionCreditPerKWh: 0,
    creditTransferRatePercent: 90,
    ambientTemperatureC: 20,
    showTelemetryTable: true,
    telemetryDock: 'auto',
    telemetryOpacity: 0.88,
    telemetryHeight: 180,
    tieCount: 7,
    particleCount: 896,
    axlePassSpeed: 0.8,
    xrayMode: true,
    axlePassing: true,
    selfHealing: false,
    particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance, sizeScale: 1.2, opacity: 0.72 }
  }, {
    common3d: true,
    ranges: {
      railSeatLoadKN: [5, 120, 1],
      bucklingLoad: [1.05, 2, 0.05],
      hempVolume: [0, 100, 5],
      carbonSkinWtPercent: [0, 30, 1],
      grapheneLoadingWtPercent: [0, 0.5, 0.01],
      ligCurrent: [0, 12, 0.1],
      batteryVolumeL: [0, 20, 0.25],
      batteryEnergyDensityWhPerL: [0, 600, 10],
      batteryCycleLife: [0, 100000, 1000],
      storageCyclesPerYear: [0, 1000, 10],
      piezoJoulesPerAxleTie: [0, 40, 0.5],
      tengJoulesPerAxleTie: [0, 20, 0.5],
      axlesPerTrain: [1, 1000, 1],
      trainsPerDay: [0, 200, 1],
      transferEfficiencyPercent: [0, 90, 1],
      gridValuePerMWhYear: [0, 40000, 500],
      annualMaintenanceSavings: [0, 100000, 1000],
      grantSharePercent: [0, 80, 1],
      productionCreditPerKWh: [0, 45, 1],
      creditTransferRatePercent: [0, 100, 1],
      telemetryOpacity: [0.1, 1, 0.01],
      telemetryHeight: [120, 420, 20],
      tieCount: [3, 11, 2],
      particleCount: [128, 4096, 128],
      axlePassSpeed: [0.1, 2.5, 0.05]
    },
    integers: ['batteryCycleLife', 'storageCyclesPerYear', 'axlesPerTrain', 'trainsPerDay', 'telemetryHeight', 'tieCount', 'particleCount'],
    enums: {
      material: RAIL_TIE_FORMULATIONS.map(({ value }) => value),
      harvestingMode: RAIL_HARVEST_MODES.map(({ value }) => value),
      telemetryDock: ['auto', 'left', 'right']
    }
  }),
  halbachlinearmotor: profile({
    ...DEFAULT_HALBACH_MOTOR_SETTINGS,
    particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance, sizeScale: 0.9, opacity: 0.9 }
  }, {
    common3d: true,
    ranges: {
      magnetCount: [4, 16, 2],
      arraySpacingM: [0.1, 5, 0.05],
      coilGapM: [0.1, 5, 0.05],
      magnetFluxT: [0, 5, 0.05],
      coilPhaseDegrees: [0, 360, 1],
      coilCurrentA: [-10000, 10000, 50],
      coilFrequencyHz: [0.01, 20, 0.01],
      coilConductorLengthM: [0.05, 10, 0.05],
      armatureMassKg: [1, 10000, 1],
      ddfStrength: [0, 20, 0.1],
      ddfSpeedLimitMS: [0.1, 1000, 0.1],
      tensorGaussianWaistM: [0.1, 100, 0.1],
      grassmannianPoleWeight: [0, 1, 0.01],
      geometryCoupling: [0, 0.25, 0.005]
    },
    integers: ['magnetCount', 'coilPhaseDegrees', 'armatureMassKg'],
    enums: {
      arrangement: HALBACH_ARRANGEMENT_OPTIONS.map(({ value }) => value),
      mechanicsRegime: ['classical', 'tensor-gaussian', 'ddf', 'grassmannian-amplituhedron']
    }
  }),
  spacetieaccelerator: profile({
    ...SPACE_TIE_DEFAULTS,
    pulseSequenceSeconds: 18,
    meshPulsesPerHour: 1,
    particleAppearance: { ...COMMON_3D_DEFAULTS.particleAppearance, sizeScale: 1.5, opacity: 0.84 }
  }, {
    common3d: true,
    ranges: SPACE_TIE_RANGES,
    enums: { ...SPACE_TIE_ENUMS, operator: SPACE_TIE_OPERATOR_OPTIONS.map(({ value }) => value) },
    integers: ['strandCount', 'halbachPolePairs', 'logisticsTugFleetCount', 'logisticsTransferDays'],
    arrayBounds: { grassmannianCellGaps: [3, 3] }
  })
});

export const SIMULATOR_PARAMETER_META = Object.freeze(Object.fromEntries(
  Object.entries(SIMULATOR_PARAMETER_PROFILES).map(([id, entry]) => [id, entry.meta])
));

export const SIMULATOR_PARAMETER_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(SIMULATOR_PARAMETER_PROFILES).map(([id, entry]) => [id, entry.defaults])
));

export function generateSimulatorParameterSchemaRegistry() {
  const definitions = Object.fromEntries(Object.entries(SIMULATOR_PARAMETER_META).map(([id, meta]) => [
    id,
    generateJsonSchema(meta, { title: `${id} parameters` })
  ]));
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Particle Waves Fluids simulator parameter registry',
    description: 'Select the parameter schema under $defs using the simulator route ID.',
    $defs: definitions,
    oneOf: Object.keys(definitions).map((id) => ({
      type: 'object',
      properties: {
        simulationId: { const: id },
        parameters: { $ref: `#/$defs/${id}` }
      },
      required: ['simulationId', 'parameters'],
      additionalProperties: false
    }))
  };
}