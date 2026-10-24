import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, FrontSide, Mesh, NearestFilter, NoBlending, OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector3, WebGLRenderTarget } from 'three';
import { advanceDetectorResponse, calculateOcclusionTransmission, calculateWaveDerivative, calculateWaveDisplacementAndTensorGaussian, calculateWaveFrame, calculateWaveOrbitalPhase, calculateWaveTensorGaussian, cloneWaveState, combineWaves, DEFAULT_APERTURE_SETTINGS, DEFAULT_BEAM_WAIST, DEFAULT_SIGNAL_DIRECTION, DEFAULT_SIGNAL_ORIGIN, DEFAULT_SIGNAL_ROTATION, DEFAULT_WAVE_STATES, DOUBLE_SLIT_CENTERS, DOUBLE_SLIT_DETECTOR_X, DOUBLE_SLIT_SCREEN_THICKNESS, DOUBLE_SLIT_SCREEN_X, DOUBLE_SLIT_WIDTH, APERTURE_SCREEN_DEPTH, APERTURE_SCREEN_HEIGHT, DETECTOR_TRANSVERSE_SPAN, detectorDistanceForSlitScreenPosition, filterWavesByPhase, getOrbitalAngularMomentum, getSlitGeometry, getSlitScreenPlane, GRATING_SLIT_CENTERS, GRATING_SLIT_SPACING, GRATING_SLIT_WIDTH, HELICAL_TOPOLOGICAL_CHARGE, INTERFERENCE_MODES, MAX_WAVES, normalizeApertureSettings, OCCLUSION_PRESETS, OAM_CHARGE_MAX, OAM_CHARGE_MIN, PHASE_MODES, PINHOLE_RADIUS, POLARIZATION_MODES, prepareApertureField, readSavedWaveStates, sampleApertureField, samplePilotWaveCurrent, sampleTransverseWignerFunction, sampleWignerMechanics, SIGNAL_SOURCE_PRESETS, SINGLE_SLIT_WIDTH, slitScreenPlaneDepth, TWO_SOURCE_CENTERS, WIGNER_MECHANICS_QUANTITIES, writeSavedWaveStates } from './waveModel.js';
import { createSolitonSolverState, DEFAULT_SOLITON_CONFIG, deriveSolitonPhysicsParameters, evaluateBathymetryAt, evaluateSolitonCheckFigures, evaluateTubularCrestAt, getBathymetryProfileDetails, getSolitonEquationDetails, getWaterHdlLdlPathwayDetails, normalizeSolitonConfig, sampleSolitonFieldAt, SOLITON_BATHYMETRY_OPTIONS, SOLITON_BOUNDARY_OPTIONS, SOLITON_DOMAIN_OPTIONS, SOLITON_DOMAIN_SPAN, SOLITON_EMISSION_SIDE_OPTIONS, SOLITON_EQUATION_DETAILS, SOLITON_EQUATION_OPTIONS, SOLITON_FLUID_OPTIONS, SOLITON_FLUIDS, stepSolitonSolver, triggerSolitonLauncherImpulse, WATER_HDL_LDL_PATHWAY_OPTIONS } from './solitonWaveModel.js';
import { HistoryControls, NumericParamControl, ParamEditingToggle, ParamSelect } from './lib/ParamControls.jsx';
import { useSimulationEditor, useUndoRedoShortcuts } from './lib/simulation-state.js';
import { CameraPerspectiveToolbar, OrbitalTrackingParameters, ParticleAppearanceSettings, PerspectiveOrbitControls, SimulatorBase, SimulatorExportModal, SimulatorIOJournal, SimulatorPresetControls, useSimulatorJournal } from './lib/SimulatorBase.jsx';
import { buildParameterReplayJournal, DEFAULT_CAMERA_VIEWS, DEFAULT_SIMULATOR_3D_PARAMETERS, deletePresetLibrary, parseParameterEditLogYaml, parseSimulatorJson, readPresetLibrary, serializeParameterEditLog, writePresetLibrary } from './lib/simulator-base.js';
import { evaluateGpeResponse, WAVE_EVOLUTION_OPTIONS } from './mechanicsModels.js';
import { calculateDdfMobility, evaluateMechanicsResponse, SIMULATION_MECHANICS_REGIMES } from './lib/simulationMechanics.js';
import { COLOR_PALETTES, sampleColorPalette } from './lib/color-palettes.js';
import { rankModelOutputs, summarizeModelDifference } from './lib/model-comparison.js';
import { createWignerGpuProcessor, WIGNER_GPU_RESOLUTION } from './wignerGpu.js';
import PaletteParamControl from './lib/PaletteParamControl.jsx';

const FIELD_SIZE = 18;
const DEFAULT_PARTICLE_COUNT = 2 ** 10;
const E2E_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');
const E2E_PARTICLE_COUNT = E2E_MODE ? 2048 : null;
const E2E_DETECTOR_MAX_DIMENSION = 128;
const MIN_PARTICLE_COUNT = 1024;
//const MAX_PARTICLE_COUNT = 9216;
const MAX_PARTICLE_COUNT = 2 ** 14;
const WAVE_PRESET_STORAGE_KEY = 'sqgsim-wave-snapshots';
const DEFAULT_WAVE_MECHANICS = { model: 'linear', nonlinearCoupling: 0.08, dispersion: 0.05, showDifference: false, mechanicsRegime: 'classical', tensorGaussianWaistM: 6, ddfStrength: 0.5, ddfSpeedLimitMS: 15000, ddfBaseViscosity: 0.02, grassmannianPoleWeight: 0.72, geometryCoupling: 0.1 };
const DETECTOR_UPDATE_INTERVAL = 1 / 12;
const CLASSIC_DETECTOR_BINS_PER_AXIS = 48;
const DETECTOR_MAX_EMITTERS = 1400;
const DETECTOR_SCORE_GRID_RESOLUTION = 24;
const DetectorVisibilityContext = createContext(true);
const DetectorOamReadoutContext = createContext({ enabled: false, states: [] });
const DetectorMechanicsContext = createContext('classical');
const SimulationSpeedContext = createContext(1);
const DetectorPhaseFilterContext = createContext({ mode: 'all', value: 0 });
const DetectorClearContext = createContext({ token: 0, clear: () => {} });
const SolitonSimulatorContext = createContext({
  config: DEFAULT_SOLITON_CONFIG,
  solverRef: null,
  telemetry: null,
  setTelemetry: () => {},
  updateConfig: () => {},
  emitPulse: () => {},
  resetSolver: () => {}
});
const PerspectiveCameraContext = createContext({ viewMode: null, orbitPlaying: true, orbitControlsVisible: true, orbitSettings: DEFAULT_SIMULATOR_3D_PARAMETERS, particleAppearance: DEFAULT_SIMULATOR_3D_PARAMETERS.particleAppearance, onManualInteraction: () => {} });
const DETECTOR_IMPLEMENTATION_OPTIONS = [
  { value: 'classic', label: 'Classic pixels' },
  { value: 'native', label: 'Native resolution (GPU)' }
];
const DETECTOR_MECHANICS_OPTIONS = [
  { value: 'classical', label: 'Classical intensity' },
  { value: 'pilot-wave', label: 'Pilot-wave probability current' },
  { value: 'wigner-function', label: 'Wigner function' },
  { value: 'wigner-gpu', label: 'Wigner (GPU)' }
];
const DETECTOR_COMPARISON_MODEL_OPTIONS = DETECTOR_MECHANICS_OPTIONS.filter(({ value }) => value !== 'wigner-function');
const DETECTOR_MODEL_LABELS = { classical: 'Classical intensity', 'pilot-wave': 'Pilot-wave current', 'wigner-gpu': 'Wigner (GPU)' };
const DETECTOR_COMPARISON_MODELS = ['classical', 'pilot-wave', 'wigner-gpu'];
const WIGNER_MECHANICS_LABELS = { position: 'Position', momentum: 'Momentum', rotation: 'Rotation', shear: 'Shear' };
const DEFAULT_DETECTOR_MODEL_COMPARISON = {
  enabled: false,
  showDifference: false,
  referenceModel: 'classical',
  candidateModel: 'pilot-wave',
  classical: { detectionTime: 1, glowTime: 100, brightness: 1.8 },
  pilotWave: { detectionTime: 1, glowTime: 3, brightness: 1 },
  wignerGpu: { detectionTime: 1, glowTime: 3, brightness: 1 }
};
const DEFAULT_WIGNER_MECHANICS = { showOnDetector: false, showOnWaveField: false, showNegativeValues: true, quantities: [...WIGNER_MECHANICS_QUANTITIES] };
const DetectorModelComparisonContext = createContext(DEFAULT_DETECTOR_MODEL_COMPARISON);
const DetectorComparisonScoreContext = createContext({ scores: null, setScores: () => {} });
const WignerMechanicsContext = createContext(DEFAULT_WIGNER_MECHANICS);
const DETECTOR_PALETTES = COLOR_PALETTES;
const DETECTOR_PALETTE_COLORS = Object.fromEntries(DETECTOR_PALETTES.map(({ value, stops }) => [value, stops.map((stop) => new Color(stop))]));

function normalizeDetectorModelSettings(settings = {}, defaults) {
  const finiteValue = (value, fallback, minimum, maximum) => {
    const number = Number(value);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
  };
  return {
    detectionTime: finiteValue(settings.detectionTime, defaults.detectionTime, 0.1, 100),
    glowTime: finiteValue(settings.glowTime, defaults.glowTime, 0.1, 100),
    brightness: finiteValue(settings.brightness, defaults.brightness, 0.25, 2.5)
  };
}

function normalizeWaveSnapshot(snapshot, defaults) {
  if (!Array.isArray(snapshot.waves) || snapshot.waves.length !== MAX_WAVES) {
    throw new TypeError(`A wave preset must contain exactly ${MAX_WAVES} wave slots.`);
  }
  const waveCount = Number(snapshot.waveCount ?? defaults.waveCount);
  const simulationSpeed = Number(snapshot.simulationSpeed ?? defaults.simulationSpeed);
  const detectorPhaseValue = Number(snapshot.detectorPhaseValue ?? defaults.detectorPhaseValue);
  const detectorMechanicsMode = DETECTOR_MECHANICS_OPTIONS.some((option) => option.value === snapshot.detectorMechanicsMode)
    ? snapshot.detectorMechanicsMode
    : defaults.detectorMechanicsMode;
  const comparison = { ...defaults.detectorModelComparison, ...snapshot.detectorModelComparison };
  const wignerMechanics = { ...defaults.wignerMechanics, ...snapshot.wignerMechanics };
  const referenceModel = DETECTOR_COMPARISON_MODELS.includes(comparison.referenceModel) ? comparison.referenceModel : 'classical';
  const candidateModel = DETECTOR_COMPARISON_MODELS.includes(comparison.candidateModel) && comparison.candidateModel !== referenceModel
    ? comparison.candidateModel
    : DETECTOR_COMPARISON_MODELS.find((model) => model !== referenceModel);
  return {
    ...defaults,
    ...snapshot,
    waves: snapshot.waves,
    running: Boolean(snapshot.running ?? defaults.running),
    showCurrentHertz: Boolean(snapshot.showCurrentHertz ?? defaults.showCurrentHertz),
    waveCount: Number.isFinite(waveCount) ? Math.min(MAX_WAVES, Math.max(1, Math.round(waveCount))) : defaults.waveCount,
    simulationSpeed: Number.isFinite(simulationSpeed) ? Math.min(4, Math.max(0.1, simulationSpeed)) : defaults.simulationSpeed,
    detectorMechanicsMode,
    detectorModelComparison: {
      enabled: Boolean(comparison.enabled),
      showDifference: Boolean(comparison.showDifference && detectorMechanicsMode !== 'wigner-function'),
      referenceModel,
      candidateModel,
      classical: normalizeDetectorModelSettings(comparison.classical, defaults.detectorModelComparison.classical),
      pilotWave: normalizeDetectorModelSettings(comparison.pilotWave, defaults.detectorModelComparison.pilotWave),
      wignerGpu: normalizeDetectorModelSettings(comparison.wignerGpu, defaults.detectorModelComparison.wignerGpu)
    },
    wignerMechanics: {
      showOnDetector: Boolean(wignerMechanics.showOnDetector),
      showOnWaveField: Boolean(wignerMechanics.showOnWaveField),
      showNegativeValues: wignerMechanics.showNegativeValues !== false,
      quantities: [...new Set((Array.isArray(wignerMechanics.quantities) ? wignerMechanics.quantities : WIGNER_MECHANICS_QUANTITIES).filter((quantity) => WIGNER_MECHANICS_QUANTITIES.includes(quantity)))]
    },
    detectorPhaseMode: snapshot.detectorPhaseMode === 'all' || PHASE_MODES.includes(snapshot.detectorPhaseMode) ? snapshot.detectorPhaseMode : defaults.detectorPhaseMode,
    detectorPhaseValue: Number.isFinite(detectorPhaseValue) ? Math.min(Math.PI, Math.max(-Math.PI, detectorPhaseValue)) : defaults.detectorPhaseValue,
    interferenceModes: { ...defaults.interferenceModes, ...snapshot.interferenceModes },
    apertureSettings: normalizeApertureSettings({ ...defaults.apertureSettings, ...snapshot.apertureSettings }),
    waveMechanics: { ...defaults.waveMechanics, ...snapshot.waveMechanics },
    solitonConfig: normalizeSolitonConfig(snapshot.solitonConfig ?? defaults.solitonConfig, defaults.solitonConfig)
  };
}

const DETECTOR_RESPONSE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const DETECTOR_RESPONSE_FRAGMENT_SHADER = `
  uniform sampler2D uPreviousResponse;
  uniform sampler2D uEmitterPhase;
  uniform sampler2D uEmitterAmplitude;
  uniform sampler2D uEmitterPolarization;
  uniform sampler2D uEmitterSide;
  uniform float uEmitterCount;
  uniform float uIntensityScale;
  uniform float uPilotWave;
  uniform float uPilotReferenceWaveNumber;
  uniform bool uComparisonEnabled;
  uniform bool uWignerFunction;
  uniform bool uShowWignerNegatives;
  uniform float uClassicalDetectionTime;
  uniform float uClassicalGlowTime;
  uniform float uPilotDetectionTime;
  uniform float uPilotGlowTime;
  uniform float uTime;
  uniform float uElapsed;
  uniform float uDetectionTime;
  uniform float uGlowTime;
  uniform float uDetectorX;
  uniform float uDetectorSpan;
  uniform float uEmitterTextureWidth;
  varying vec2 vUv;

  const int MAX_EMITTERS = 1400;

  vec2 sampleWignerWave(float sampleY, float sampleZ) {
    float realPart = 0.0;
    float imaginaryPart = 0.0;
    for (int index = 0; index < MAX_EMITTERS; index += 1) {
      if (float(index) >= uEmitterCount) break;
      vec2 emitterUv = vec2((float(index) + 0.5) / uEmitterTextureWidth, 0.5);
      vec4 phaseData = texture2D(uEmitterPhase, emitterUv);
      vec4 amplitudeData = texture2D(uEmitterAmplitude, emitterUv);
      vec4 polarizationData = texture2D(uEmitterPolarization, emitterUv);
      vec4 sideData = texture2D(uEmitterSide, emitterUv);
      vec3 offset = vec3(uDetectorX, sampleY, sampleZ) - phaseData.xyz;
      float distanceToEmitter = max(length(offset), 0.000001);
      vec3 propagation = offset / distanceToEmitter;
      vec3 transverse = polarizationData.xyz;
      vec3 polarization = transverse - dot(transverse, propagation) * propagation;
      if (length(polarization) < 0.000001) {
        vec3 side = sideData.xyz;
        polarization = side - dot(side, propagation) * propagation;
      }
      float amplitude = amplitudeData.z * length(polarization) / distanceToEmitter;
      float phase = phaseData.w * distanceToEmitter + amplitudeData.x - amplitudeData.y * uTime;
      realPart += amplitude * cos(phase);
      imaginaryPart += amplitude * sin(phase);
    }
    return vec2(realPart, imaginaryPart);
  }

  void main() {
    float y = (vUv.y - 0.5) * uDetectorSpan;
    float z = (vUv.x - 0.5) * uDetectorSpan;
    vec3 electric = vec3(0.0);
    float waveReal = 0.0;
    float waveImaginary = 0.0;
    float derivativeReal = 0.0;
    float derivativeImaginary = 0.0;
    float wignerValue = 0.0;
    for (int index = 0; index < MAX_EMITTERS; index += 1) {
      if (float(index) >= uEmitterCount) break;
      vec2 emitterUv = vec2((float(index) + 0.5) / uEmitterTextureWidth, 0.5);
      vec4 phaseData = texture2D(uEmitterPhase, emitterUv);
      vec4 amplitudeData = texture2D(uEmitterAmplitude, emitterUv);
      vec4 polarizationData = texture2D(uEmitterPolarization, emitterUv);
      vec4 sideData = texture2D(uEmitterSide, emitterUv);
      vec3 offset = vec3(uDetectorX, y, z) - phaseData.xyz;
      float distanceToEmitter = max(length(offset), 0.000001);
      vec3 propagation = offset / distanceToEmitter;
      vec3 transverse = polarizationData.xyz;
      vec3 polarization = transverse - dot(transverse, propagation) * propagation;
      if (length(polarization) < 0.000001) {
        vec3 side = sideData.xyz;
        polarization = side - dot(side, propagation) * propagation;
      }
      float phase = phaseData.w * distanceToEmitter + amplitudeData.x - amplitudeData.y * uTime;
      float fieldAmplitude = amplitudeData.z * sin(phase) / distanceToEmitter;
      electric += polarization * fieldAmplitude;
      if (uPilotWave > 0.5 || uComparisonEnabled) {
        float scalarAmplitude = amplitudeData.z * length(polarization) / distanceToEmitter;
        float amplitudeDerivative = -scalarAmplitude * propagation.x / distanceToEmitter;
        float phaseDerivative = phaseData.w * propagation.x;
        float cosine = cos(phase);
        float sine = cos(phase - 1.57079632679);
        waveReal += scalarAmplitude * cosine;
        waveImaginary += scalarAmplitude * sine;
        derivativeReal += amplitudeDerivative * cosine - scalarAmplitude * sine * phaseDerivative;
        derivativeImaginary += amplitudeDerivative * sine + scalarAmplitude * cosine * phaseDerivative;
      }
    }
    if (uWignerFunction) {
      vec2 centerWave = sampleWignerWave(y, z);
      vec2 plusOne = sampleWignerWave(y + 1.0, z);
      vec2 minusOne = sampleWignerWave(y - 1.0, z);
      vec2 plusTwo = sampleWignerWave(y + 2.0, z);
      vec2 minusTwo = sampleWignerWave(y - 2.0, z);
      float centerProduct = dot(centerWave, centerWave);
      float firstProduct = dot(plusOne, minusOne);
      float secondProduct = dot(plusTwo, minusTwo);
      wignerValue = 2.0 * (centerProduct + 4.0 * firstProduct + secondProduct) / (3.0 * 3.14159265359);
    }
    float classicalIntensity = dot(electric, electric);
    float pilotCurrent = max(0.0, waveReal * derivativeImaginary - waveImaginary * derivativeReal) / max(uPilotReferenceWaveNumber, 0.000001);
    vec4 previous = texture2D(uPreviousResponse, vUv);
    float classicalAverage = previous.r + (classicalIntensity / uIntensityScale - previous.r) * (1.0 - exp(-uElapsed / uClassicalDetectionTime));
    float classicalGlow = max(classicalAverage, previous.g * exp(-uElapsed / uClassicalGlowTime));
    float pilotAverage = previous.b + (pilotCurrent / uIntensityScale - previous.b) * (1.0 - exp(-uElapsed / uPilotDetectionTime));
    float pilotGlow = max(pilotAverage, previous.a * exp(-uElapsed / uPilotGlowTime));
    if (uWignerFunction) {
      float signedValue = clamp(wignerValue / uIntensityScale, -1.0, 1.0);
      if (!uShowWignerNegatives) signedValue = max(0.0, signedValue);
      float average = previous.r + (abs(signedValue) - previous.r) * (1.0 - exp(-uElapsed / uDetectionTime));
      float glow = max(average, previous.g * exp(-uElapsed / uGlowTime));
      gl_FragColor = vec4(clamp(average, 0.0, 1.0), clamp(glow, 0.0, 1.0), signedValue < 0.0 ? 0.0 : 1.0, 1.0);
    } else {
      gl_FragColor = vec4(clamp(classicalAverage, 0.0, 1.0), clamp(classicalGlow, 0.0, 1.0), clamp(pilotAverage, 0.0, 1.0), clamp(pilotGlow, 0.0, 1.0));
    }
  }
`;
const DETECTOR_DISPLAY_VERTEX_SHADER = `
  uniform float uDetectorSpan;
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    vUv = uv;
    vWorldY = (uv.y - 0.5) * uDetectorSpan;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DETECTOR_DISPLAY_FRAGMENT_SHADER = `
  uniform sampler2D uResponse;
  uniform vec3 uPaletteStops[4];
  uniform bool uMaskEnabled;
  uniform float uMaskHeight;
  uniform float uDetectorBrightness;
  uniform float uClassicalBrightness;
  uniform float uPilotBrightness;
  uniform bool uPilotWave;
  uniform bool uWignerFunction;
  uniform bool uComparisonEnabled;
  uniform bool uDifferenceView;
  uniform bool uReferencePilot;
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    vec3 color;
    if (uMaskEnabled && abs(vWorldY) > uMaskHeight * 0.5) {
      color = vec3(0.012, 0.016, 0.023);
    } else {
      vec4 response = texture2D(uResponse, vUv);
      float classicalValue = clamp(pow(response.g, 0.65) * uClassicalBrightness, 0.0, 1.0);
      float pilotValue = clamp(pow(response.a, 0.65) * uPilotBrightness, 0.0, 1.0);
      if (uWignerFunction) {
        float magnitude = clamp(pow(texture2D(uResponse, vUv).g, 0.65) * uDetectorBrightness, 0.0, 1.0);
        float signValue = response.b;
        vec3 signColor = signValue >= 0.5 ? vec3(0.91, 0.31, 0.24) : vec3(0.22, 0.72, 0.77);
        color = mix(vec3(0.012, 0.016, 0.023), signColor, magnitude);
      } else if (uComparisonEnabled && uDifferenceView) {
        float difference = uReferencePilot ? classicalValue - pilotValue : pilotValue - classicalValue;
        vec3 differenceColor = difference >= 0.0 ? vec3(0.91, 0.31, 0.24) : vec3(0.22, 0.72, 0.77);
        color = mix(vec3(0.012, 0.016, 0.023), differenceColor, clamp(abs(difference), 0.0, 1.0));
      } else {
        float value = (uPilotWave ? pilotValue : classicalValue) * 3.0;
        if (value < 1.0) color = mix(uPaletteStops[0], uPaletteStops[1], value);
        else if (value < 2.0) color = mix(uPaletteStops[1], uPaletteStops[2], value - 1.0);
        else color = mix(uPaletteStops[2], uPaletteStops[3], value - 2.0);
      }
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const APERTURE_EXPERIMENT_MODES = ['single-slit', 'double-slit', 'pinhole', 'grating', 'two-source'];
const SLIT_EXPERIMENT_MODES = ['single-slit', 'double-slit', 'grating'];
const EXPERIMENT_STATE_NAMES = {
  'single-slit': 'Single-slit experiment',
  'double-slit': 'Double-slit experiment',
  pinhole: 'Pinhole experiment',
  grating: 'Diffraction grating',
  'two-source': 'Two coherent sources'
};
const EXPERIMENT_MODE_BY_STATE = Object.fromEntries(Object.entries(EXPERIMENT_STATE_NAMES).map(([mode, name]) => [name, mode]));
const EXPERIMENT_PRESET_IDS = { 'single-slit': 'single-slit', 'double-slit': 'double-slit', pinhole: 'pinhole', grating: 'diffraction-grating', 'two-source': 'none' };
const EXPERIMENT_MODE_BY_PRESET = Object.fromEntries(Object.entries(EXPERIMENT_PRESET_IDS).filter(([, preset]) => preset !== 'none').map(([mode, preset]) => [preset, mode]));
const WAVE_COLORS = ['#f4bf66', '#66d5d1', '#df7d8d', '#a899ed', '#d7e681', '#7da8ec', '#f28e5d', '#86d3a5'];

function paletteWaveColor(palette, index, count = WAVE_COLORS.length) {
  if (palette === 'native') return WAVE_COLORS[index % WAVE_COLORS.length];
  return sampleColorPalette(palette, count < 2 ? 0.5 : index / (count - 1)).getStyle();
}
const PARTICLE_SHAPES = ['square', 'circle', 'vector'];

const WAVE_VERTEX_SHADER = `
  uniform float uParticleSize;
  uniform bool uTensorSplatters;
  attribute float aVectorAngle;
  attribute float aTensorGaussian;
  varying vec3 vColor;
  varying float vVectorAngle;
  varying float vTensorGaussian;
  attribute float aOcclusion;
  varying float vOcclusion;

  void main() {
    vColor = color;
    vVectorAngle = aVectorAngle;
    vTensorGaussian = aTensorGaussian;
    vOcclusion = aOcclusion;
    vec4 modelPosition = modelViewMatrix * vec4(position, 1.0);
    float tensorScale = uTensorSplatters ? mix(0.35, 1.8, aTensorGaussian) : 1.0;
    gl_PointSize = uParticleSize * tensorScale * 800.0 / max(-modelPosition.z, 1.0);
    gl_Position = projectionMatrix * modelPosition;
  }
`;

const WAVE_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform int uShape;
  uniform vec3 uTint;
  uniform bool uTintEnabled;
  uniform bool uTensorSplatters;
  varying vec3 vColor;
  varying float vVectorAngle;
  varying float vTensorGaussian;
  varying float vOcclusion;

  void main() {
    if (vOcclusion < 0.01) discard;
    vec2 point = gl_PointCoord - 0.5;
    float cosine = cos(vVectorAngle);
    float sine = sin(vVectorAngle);
    point = vec2(cosine * point.x - sine * point.y, sine * point.x + cosine * point.y);
    if (uShape == 1 && length(point) > 0.5) discard;
    if (uShape == 2) {
      point *= 0.74;
      float shaft = step(abs(point.x), 0.1) * step(abs(point.y), 0.3);
      float head = step(0.14, point.y) * step(abs(point.x), 0.23 - point.y * 0.24);
      if (max(shaft, head) < 0.5) discard;
    }
    float splatterAlpha = uTensorSplatters ? mix(0.35, 1.0, vTensorGaussian) : 1.0;
    gl_FragColor = vec4(vColor * mix(vec3(1.0), uTint, float(uTintEnabled)), uOpacity * splatterAlpha);
  }
`;

function createFieldGeometry(particleCount) {
  const columns = Math.ceil(Math.sqrt(particleCount * 1.4));
  const rows = Math.ceil(particleCount / columns);
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      positions[index * 3] = (column / Math.max(columns - 1, 1) - 0.5) * FIELD_SIZE;
      positions[index * 3 + 1] = 0;
      positions[index * 3 + 2] = (row / Math.max(rows - 1, 1) - 0.5) * FIELD_SIZE;
      colors[index * 3] = 0.25;
      colors[index * 3 + 1] = 0.6;
      colors[index * 3 + 2] = 0.62;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('aVectorAngle', new BufferAttribute(new Float32Array(particleCount), 1));
  geometry.setAttribute('aTensorGaussian', new BufferAttribute(new Float32Array(particleCount), 1));
  geometry.setAttribute('aOcclusion', new BufferAttribute(new Float32Array(particleCount).fill(1), 1));
  geometry.userData.basePositions = positions.slice();
  return geometry;
}

function createDetectorRenderResources(width, height) {
  const emitterTextures = Array.from({ length: 4 }, () => {
    const texture = new DataTexture(new Float32Array(DETECTOR_MAX_EMITTERS * 4), DETECTOR_MAX_EMITTERS, 1, RGBAFormat, FloatType);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  });
  const responseTargets = Array.from({ length: 2 }, () => new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false
  }));
  responseTargets.forEach((target) => {
    target.texture.generateMipmaps = false;
    target.texture.colorSpace = '';
  });
  const responseMaterial = new ShaderMaterial({
    uniforms: {
      uPreviousResponse: { value: responseTargets[0].texture },
      uEmitterPhase: { value: emitterTextures[0] },
      uEmitterAmplitude: { value: emitterTextures[1] },
      uEmitterPolarization: { value: emitterTextures[2] },
      uEmitterSide: { value: emitterTextures[3] },
      uEmitterCount: { value: 0 },
      uIntensityScale: { value: 1 },
      uPilotWave: { value: 0 },
      uPilotReferenceWaveNumber: { value: 1 },
      uComparisonEnabled: { value: false },
      uWignerFunction: { value: false },
      uShowWignerNegatives: { value: true },
      uClassicalDetectionTime: { value: 1 },
      uClassicalGlowTime: { value: 3 },
      uPilotDetectionTime: { value: 1 },
      uPilotGlowTime: { value: 3 },
      uTime: { value: 0 },
      uElapsed: { value: 0 },
      uDetectionTime: { value: 1 },
      uGlowTime: { value: 3 },
      uDetectorX: { value: DOUBLE_SLIT_DETECTOR_X },
      uDetectorSpan: { value: DETECTOR_TRANSVERSE_SPAN },
      uEmitterTextureWidth: { value: DETECTOR_MAX_EMITTERS }
    },
    vertexShader: DETECTOR_RESPONSE_VERTEX_SHADER,
    fragmentShader: DETECTOR_RESPONSE_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false
  });
  const displayMaterial = new ShaderMaterial({
    uniforms: {
      uResponse: { value: responseTargets[0].texture },
      uPaletteStops: { value: DETECTOR_PALETTE_COLORS.thermal },
      uMaskEnabled: { value: false },
      uMaskHeight: { value: APERTURE_SCREEN_HEIGHT },
      uDetectorSpan: { value: DETECTOR_TRANSVERSE_SPAN },
      uDetectorBrightness: { value: 1 },
      uClassicalBrightness: { value: 1 },
      uPilotBrightness: { value: 1 },
      uPilotWave: { value: false },
      uWignerFunction: { value: false },
      uComparisonEnabled: { value: false },
      uDifferenceView: { value: false },
      uReferencePilot: { value: false }
    },
    vertexShader: DETECTOR_DISPLAY_VERTEX_SHADER,
    fragmentShader: DETECTOR_DISPLAY_FRAGMENT_SHADER,
    side: DoubleSide,
    depthWrite: true,
    toneMapped: false
  });
  const computeGeometry = new BufferGeometry();
  computeGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const computeScene = new Scene();
  computeScene.add(new Mesh(computeGeometry, responseMaterial));
  const computeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    emitterTextures,
    responseTargets,
    responseMaterial,
    displayMaterial,
    computeGeometry,
    computeScene,
    computeCamera,
    historyIndex: 0,
    dispose() {
      emitterTextures.forEach((texture) => texture.dispose());
      responseTargets.forEach((target) => target.dispose());
      responseMaterial.dispose();
      displayMaterial.dispose();
      computeGeometry.dispose();
    }
  };
}

function createClassicDetectorGeometry(resolution) {
  const binCount = resolution ** 2;
  const positions = new Float32Array(binCount * 18);
  const colors = new Float32Array(binCount * 18);
  const binWidth = DETECTOR_TRANSVERSE_SPAN / resolution;
  const baseColor = DETECTOR_PALETTE_COLORS.thermal[0];
  for (let yBin = 0; yBin < resolution; yBin += 1) {
    const bottom = -DETECTOR_TRANSVERSE_SPAN / 2 + yBin * binWidth;
    const top = bottom + binWidth;
    for (let zBin = 0; zBin < resolution; zBin += 1) {
      const left = -DETECTOR_TRANSVERSE_SPAN / 2 + zBin * binWidth;
      const right = left + binWidth;
      const bin = yBin * resolution + zBin;
      positions.set([
        0.075, bottom, left,
        0.075, top, right,
        0.075, top, left,
        0.075, bottom, left,
        0.075, bottom, right,
        0.075, top, right
      ], bin * 18);
      for (let vertex = 0; vertex < 6; vertex += 1) {
        const colorOffset = (bin * 6 + vertex) * 3;
        colors[colorOffset] = baseColor.r;
        colors[colorOffset + 1] = baseColor.g;
        colors[colorOffset + 2] = baseColor.b;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.userData.responses = Array.from({ length: binCount }, () => ({
    average: 0,
    glow: 0,
    wignerSign: 0.5,
    classical: { average: 0, glow: 0 },
    pilotWave: { average: 0, glow: 0 },
    wignerGpu: { average: 0, glow: 0 }
  }));
  return geometry;
}

function sampleDetectorModelIntensities({ waves, waveCount, interferenceModes, experimentMode, apertureField, x, y, z, time, includeWignerGpu = false }) {
  const activeWaves = waves.slice(0, waveCount);
  const directFieldMode = experimentMode === 'field';
  const classicalIntensity = directFieldMode
    ? (() => {
      const field = calculateWaveDisplacementAndTensorGaussian(activeWaves, x, z, time, interferenceModes, y).displacement;
      return field.x ** 2 + field.y ** 2 + field.z ** 2;
    })()
    : sampleApertureField(apertureField, x, y, z, time).intensity;
  const pilotWaveCurrent = samplePilotWaveCurrent(activeWaves, x, y, z, time, apertureField).forwardFlux;
  const totalAmplitude = directFieldMode
    ? activeWaves.reduce((total, wave) => total + (wave.enabled === false ? 0 : Math.abs(Number(wave.amplitude) || 0)), 0)
    : apertureField?.emitters.reduce((total, emitter) => total + Math.abs(emitter.amplitude), 0) ?? 0;
  const intensityScale = Math.max(0.001, 4 * totalAmplitude ** 2 / (directFieldMode ? 1 : DOUBLE_SLIT_DETECTOR_X ** 2));
  const wignerGpu = includeWignerGpu
    ? Math.max(-1, Math.min(1, sampleTransverseWignerFunction(activeWaves, x, y, z, time, apertureField) / intensityScale))
    : 0;
  return { classical: classicalIntensity / intensityScale, pilotWave: pilotWaveCurrent / intensityScale, wignerGpu };
}

function scaleDetectorBrightness(glow, brightness) {
  return Math.min(1, Math.pow(Math.min(1, glow), 0.65) * brightness);
}

function scaleSignedDetectorBrightness(value, brightness) {
  return Math.sign(value) * scaleDetectorBrightness(Math.abs(value), brightness);
}

function sampleGpuWignerValue(values, y, z, resolution = WIGNER_GPU_RESOLUTION) {
  if (!values) return null;
  const row = Math.min(resolution - 1, Math.max(0, Math.floor((y / DETECTOR_TRANSVERSE_SPAN + 0.5) * resolution)));
  const column = Math.min(resolution - 1, Math.max(0, Math.floor((z / DETECTOR_TRANSVERSE_SPAN + 0.5) * resolution)));
  return values[(row * resolution + column) * 4];
}

function createCpuWignerFallbackGrid({ waves, waveCount, apertureField, time, intensityScale, resolution }) {
  const values = new Float32Array(resolution ** 2 * 4);
  for (let row = 0; row < resolution; row += 1) {
    const y = ((row + 0.5) / resolution - 0.5) * DETECTOR_TRANSVERSE_SPAN;
    for (let column = 0; column < resolution; column += 1) {
      const z = ((column + 0.5) / resolution - 0.5) * DETECTOR_TRANSVERSE_SPAN;
      const offset = (row * resolution + column) * 4;
      values[offset] = Math.max(-1, Math.min(1, sampleTransverseWignerFunction(waves.slice(0, waveCount), DOUBLE_SLIT_DETECTOR_X, y, z, time, apertureField) / intensityScale));
    }
  }
  return values;
}

function updateDetectorComparisonScores({ scoreResponses, waves, waveCount, interferenceModes, experimentMode, apertureField, time, elapsed, comparison, onScores, wignerGpuValues = null, wignerGpuResolution = WIGNER_GPU_RESOLUTION }) {
  const referenceModel = comparison.referenceModel;
  const candidateModel = comparison.candidateModel;
  const includeWignerGpu = true;
  const referenceValues = [];
  const candidateValues = [];
  const modelValues = Object.fromEntries(DETECTOR_COMPARISON_MODELS.map((model) => [model, []]));
  for (let yIndex = 0; yIndex < DETECTOR_SCORE_GRID_RESOLUTION; yIndex += 1) {
    const y = ((yIndex + 0.5) / DETECTOR_SCORE_GRID_RESOLUTION - 0.5) * DETECTOR_TRANSVERSE_SPAN;
    for (let zIndex = 0; zIndex < DETECTOR_SCORE_GRID_RESOLUTION; zIndex += 1) {
      const z = ((zIndex + 0.5) / DETECTOR_SCORE_GRID_RESOLUTION - 0.5) * DETECTOR_TRANSVERSE_SPAN;
      const index = yIndex * DETECTOR_SCORE_GRID_RESOLUTION + zIndex;
      const intensities = sampleDetectorModelIntensities({ waves, waveCount, interferenceModes, experimentMode, apertureField, x: DOUBLE_SLIT_DETECTOR_X, y, z, time, includeWignerGpu });
      const gpuWignerValue = sampleGpuWignerValue(wignerGpuValues, y, z, wignerGpuResolution);
      if (gpuWignerValue !== null) intensities.wignerGpu = gpuWignerValue;
      const response = scoreResponses[index];
      response.classical = advanceDetectorResponse(response.classical, intensities.classical, elapsed, comparison.classical.detectionTime, comparison.classical.glowTime);
      response.pilotWave = advanceDetectorResponse(response.pilotWave, intensities.pilotWave, elapsed, comparison.pilotWave.detectionTime, comparison.pilotWave.glowTime);
      response.wignerGpu = advanceDetectorResponse(response.wignerGpu, Math.abs(intensities.wignerGpu), elapsed, comparison.wignerGpu.detectionTime, comparison.wignerGpu.glowTime);
      response.wignerGpuSign = Math.sign(intensities.wignerGpu);
      const classicalValue = scaleDetectorBrightness(response.classical.glow, comparison.classical.brightness);
      const pilotWaveValue = scaleDetectorBrightness(response.pilotWave.glow, comparison.pilotWave.brightness);
      const values = {
        classical: classicalValue,
        'pilot-wave': pilotWaveValue,
        'wigner-gpu': scaleSignedDetectorBrightness(response.wignerGpuSign * response.wignerGpu.glow, comparison.wignerGpu.brightness)
      };
      DETECTOR_COMPARISON_MODELS.forEach((model) => modelValues[model].push(values[model]));
      referenceValues.push(values[referenceModel]);
      candidateValues.push(values[candidateModel]);
    }
  }
  onScores({
    ...summarizeModelDifference(referenceValues, candidateValues),
    referenceModel,
    candidateModel,
    rankings: rankModelOutputs(modelValues, referenceModel)
  });
}

function clearDetectorResponses(gl, resources) {
  const currentTarget = gl.getRenderTarget();
  const previousClearColor = gl.getClearColor(new Color());
  const previousClearAlpha = gl.getClearAlpha();
  gl.setClearColor(0x000000, 0);
  resources.responseTargets.forEach((target) => {
    gl.setRenderTarget(target);
    gl.clear(true, false, false);
  });
  gl.setRenderTarget(currentTarget);
  gl.setClearColor(previousClearColor, previousClearAlpha);
  resources.historyIndex = 0;
}

function createPinholeScreenGeometry() {
  const divisions = 128;
  const positions = [];
  const cellSize = DETECTOR_TRANSVERSE_SPAN / divisions;
  for (let yIndex = 0; yIndex < divisions; yIndex += 1) {
    const bottom = -DETECTOR_TRANSVERSE_SPAN / 2 + yIndex * cellSize;
    const top = bottom + cellSize;
    for (let zIndex = 0; zIndex < divisions; zIndex += 1) {
      const left = -DETECTOR_TRANSVERSE_SPAN / 2 + zIndex * cellSize;
      const right = left + cellSize;
      const closestY = Math.max(bottom, Math.min(0, top));
      const closestZ = Math.max(left, Math.min(0, right));
      if (closestY ** 2 + closestZ ** 2 < PINHOLE_RADIUS ** 2) continue;
      positions.push(
        DOUBLE_SLIT_SCREEN_X, bottom, left,
        DOUBLE_SLIT_SCREEN_X, top, left,
        DOUBLE_SLIT_SCREEN_X, top, right,
        DOUBLE_SLIT_SCREEN_X, bottom, left,
        DOUBLE_SLIT_SCREEN_X, top, right,
        DOUBLE_SLIT_SCREEN_X, bottom, right
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function SlitScreen({ experimentMode, apertureSettings }) {
  const wallSegments = useMemo(() => {
    const { centers, widths, wallMargin, screenPosition, screenRotation } = getSlitGeometry(experimentMode, apertureSettings);
    const openings = centers.map((center, index) => ({ center, start: center - widths[index] / 2, end: center + widths[index] / 2 }))
      .sort((left, right) => left.start - right.start);
    const result = [];
    let cursor = -FIELD_SIZE / 2;
    openings.forEach(({ center, start, end }, index) => {
      if (start > cursor) result.push({ key: `side-${index}`, start: cursor, end: start, height: APERTURE_SCREEN_HEIGHT, y: 0 });
      if (wallMargin > 0) {
        result.push({ key: `top-${index}`, start, end, height: wallMargin, y: APERTURE_SCREEN_HEIGHT / 2 - wallMargin / 2 });
        result.push({ key: `bottom-${index}`, start, end, height: wallMargin, y: -APERTURE_SCREEN_HEIGHT / 2 + wallMargin / 2 });
      }
      cursor = Math.max(cursor, end);
    });
    if (cursor < FIELD_SIZE / 2) result.push({ key: 'side-end', start: cursor, end: FIELD_SIZE / 2, height: APERTURE_SCREEN_HEIGHT, y: 0 });
    return { segments: result, screenPosition, screenRotation };
  }, [apertureSettings, experimentMode]);
  const { segments, screenPosition, screenRotation } = wallSegments;
  return (
    <group position={[screenPosition.x, screenPosition.y, screenPosition.z]} rotation={[screenRotation.x, screenRotation.y, screenRotation.z, 'ZYX']}>
      {segments.map(({ key, start, end, height, y }) => <mesh key={key} position={[0, y, (start + end) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[end - start, height, APERTURE_SCREEN_DEPTH]} />
        <meshBasicMaterial color="#203640" transparent={apertureSettings.slitOpacity < 1} opacity={apertureSettings.slitOpacity} depthWrite={apertureSettings.slitOpacity >= 1} side={DoubleSide} />
      </mesh>)}
    </group>
  );
}

function TwoSourceMarkers() {
  return <group>
    {TWO_SOURCE_CENTERS.map((z) => <mesh key={z} position={[0, 0, z]}>
      <sphereGeometry args={[0.18, 16, 12]} />
      <meshBasicMaterial color="#f4bf66" toneMapped={false} />
    </mesh>)}
  </group>;
}

function PinholeScreen() {
  const geometry = useMemo(createPinholeScreenGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}>
    <meshBasicMaterial color="#203640" transparent opacity={0.2} side={DoubleSide} />
  </mesh>;
}

function NativeResolutionDetector({ apertureField, waves, waveCount, interferenceModes, experimentMode, running, timeRef, detectionTime, glowTime, detectorBrightness, detectorPalette, detectorMechanicsMode, detectorModelComparison, clearToken, maskEnabled, pixelDensity, onResolutionChange, onComparisonScores }) {
  const simulationSpeed = useContext(SimulationSpeedContext);
  const wignerMechanics = useContext(WignerMechanicsContext);
  const { gl, size } = useThree();
  const baseWidth = E2E_MODE ? Math.min(size.width, E2E_DETECTOR_MAX_DIMENSION) : size.width;
  const baseHeight = E2E_MODE ? Math.min(size.height, E2E_DETECTOR_MAX_DIMENSION) : size.height;
  const resolutionWidth = Math.min(gl.capabilities.maxTextureSize, Math.max(1, Math.round(baseWidth * gl.getPixelRatio() * pixelDensity)));
  const resolutionHeight = Math.min(gl.capabilities.maxTextureSize, Math.max(1, Math.round(baseHeight * gl.getPixelRatio() * pixelDensity)));
  const resources = useMemo(() => createDetectorRenderResources(resolutionWidth, resolutionHeight), [resolutionHeight, resolutionWidth]);
  const updateTime = useRef(0);
  const needsRefresh = useRef(true);
  const comparisonScoreTimer = useRef(0);
  const previousDifferenceView = useRef(false);
  const scoreResponses = useRef(Array.from({ length: DETECTOR_SCORE_GRID_RESOLUTION ** 2 }, () => ({
    classical: { average: 0, glow: 0 },
    pilotWave: { average: 0, glow: 0 },
    wignerGpu: { average: 0, glow: 0 },
    wignerGpuSign: 0
  })));
  useEffect(() => {
    needsRefresh.current = true;
  }, [apertureField, detectionTime, detectorMechanicsMode, glowTime, resources]);

  useEffect(() => {
    const differenceView = detectorModelComparison.enabled && detectorModelComparison.showDifference;
    if (differenceView || previousDifferenceView.current) needsRefresh.current = true;
    previousDifferenceView.current = differenceView;
    if (!detectorModelComparison.enabled) {
      onComparisonScores(null);
    } else if (!detectorModelComparison.showDifference) {
      updateDetectorComparisonScores({
        scoreResponses: scoreResponses.current,
        waves,
        waveCount,
        interferenceModes,
        experimentMode,
        apertureField,
        time: timeRef.current,
        elapsed: Math.max(detectorModelComparison.classical.detectionTime, detectorModelComparison.pilotWave.detectionTime, detectorModelComparison.wignerGpu.detectionTime) * 8,
        comparison: detectorModelComparison,
        onScores: onComparisonScores
      });
      comparisonScoreTimer.current = 0;
    }
  }, [apertureField, detectorModelComparison, experimentMode, interferenceModes, onComparisonScores, waveCount, waves]);

  useEffect(() => {
    onResolutionChange(`${resolutionWidth}x${resolutionHeight}`);
  }, [onResolutionChange, resolutionHeight, resolutionWidth]);

  useEffect(() => {
    clearDetectorResponses(gl, resources);
    updateTime.current = 0;
    needsRefresh.current = true;
    return () => resources.dispose();
  }, [gl, resources]);

  useEffect(() => {
    if (clearToken === 0) return;
    clearDetectorResponses(gl, resources);
    resources.displayMaterial.uniforms.uResponse.value = resources.responseTargets[0].texture;
    scoreResponses.current.forEach((response) => {
      response.classical = { average: 0, glow: 0 };
      response.pilotWave = { average: 0, glow: 0 };
      response.wignerGpu = { average: 0, glow: 0 };
      response.wignerGpuSign = 0;
    });
    updateTime.current = 0;
    comparisonScoreTimer.current = 0;
    needsRefresh.current = false;
    onComparisonScores(null);
  }, [clearToken, gl, onComparisonScores, resources]);

  useEffect(() => {
    const emitters = apertureField?.emitters ?? [];
    const emitterCount = Math.min(emitters.length, DETECTOR_MAX_EMITTERS);
    const [phaseTexture, amplitudeTexture, polarizationTexture, sideTexture] = resources.emitterTextures;
    phaseTexture.image.data.fill(0);
    amplitudeTexture.image.data.fill(0);
    polarizationTexture.image.data.fill(0);
    sideTexture.image.data.fill(0);
    for (let index = 0; index < emitterCount; index += 1) {
      const emitter = emitters[index];
      const offset = index * 4;
      phaseTexture.image.data[offset] = emitter.x;
      phaseTexture.image.data[offset + 1] = emitter.y;
      phaseTexture.image.data[offset + 2] = emitter.z;
      phaseTexture.image.data[offset + 3] = emitter.waveNumber;
      amplitudeTexture.image.data[offset] = emitter.phase;
      amplitudeTexture.image.data[offset + 1] = emitter.phaseRate;
      amplitudeTexture.image.data[offset + 2] = emitter.amplitude;
      polarizationTexture.image.data[offset] = emitter.transverse.x;
      polarizationTexture.image.data[offset + 1] = emitter.transverse.y;
      polarizationTexture.image.data[offset + 2] = emitter.transverse.z;
      sideTexture.image.data[offset] = emitter.side.x;
      sideTexture.image.data[offset + 1] = emitter.side.y;
      sideTexture.image.data[offset + 2] = emitter.side.z;
    }
    const referenceWeight = emitters.slice(0, emitterCount).reduce((total, emitter) => total + Math.abs(emitter.amplitude), 0);
    const referenceWaveNumber = referenceWeight > 0
      ? emitters.slice(0, emitterCount).reduce((total, emitter) => total + Math.abs(emitter.amplitude) * emitter.waveNumber, 0) / referenceWeight
      : 1;
    phaseTexture.needsUpdate = true;
    amplitudeTexture.needsUpdate = true;
    polarizationTexture.needsUpdate = true;
    sideTexture.needsUpdate = true;
    resources.responseMaterial.uniforms.uEmitterCount.value = emitterCount;
    resources.responseMaterial.uniforms.uPilotReferenceWaveNumber.value = referenceWaveNumber;
    needsRefresh.current = true;
  }, [apertureField, resources]);

  useEffect(() => {
    resources.responseMaterial.uniforms.uPilotWave.value = detectorMechanicsMode === 'pilot-wave' ? 1 : 0;
    resources.responseMaterial.uniforms.uComparisonEnabled.value = detectorModelComparison.enabled && detectorModelComparison.showDifference;
    resources.responseMaterial.uniforms.uWignerFunction.value = detectorMechanicsMode === 'wigner-function';
    resources.responseMaterial.uniforms.uShowWignerNegatives.value = wignerMechanics.showNegativeValues;
    needsRefresh.current = true;
  }, [detectorMechanicsMode, detectorModelComparison.enabled, resources, wignerMechanics.showNegativeValues]);

  useEffect(() => {
    const uniforms = resources.displayMaterial.uniforms;
    const comparisonValuesActive = detectorModelComparison.enabled && detectorModelComparison.showDifference;
    uniforms.uPaletteStops.value = DETECTOR_PALETTE_COLORS[detectorPalette] ?? DETECTOR_PALETTE_COLORS.thermal;
    uniforms.uMaskEnabled.value = maskEnabled;
    uniforms.uDetectorBrightness.value = detectorBrightness;
    uniforms.uClassicalBrightness.value = comparisonValuesActive ? detectorModelComparison.classical.brightness : detectorBrightness;
    uniforms.uPilotBrightness.value = comparisonValuesActive ? detectorModelComparison.pilotWave.brightness : detectorBrightness;
    uniforms.uPilotWave.value = detectorMechanicsMode === 'pilot-wave';
    uniforms.uWignerFunction.value = detectorMechanicsMode === 'wigner-function';
    uniforms.uComparisonEnabled.value = detectorModelComparison.enabled;
    uniforms.uDifferenceView.value = detectorModelComparison.enabled && detectorModelComparison.showDifference;
    uniforms.uReferencePilot.value = detectorModelComparison.referenceModel === 'pilot-wave';
  }, [detectorBrightness, detectorMechanicsMode, detectorModelComparison, detectorPalette, maskEnabled, resources]);

  useFrame((_, delta) => {
    comparisonScoreTimer.current += delta;
    const configurationRefresh = needsRefresh.current;
    let elapsed = 0;
    if (running) {
      updateTime.current += Math.min(delta, 0.1);
      if (!needsRefresh.current && updateTime.current < DETECTOR_UPDATE_INTERVAL) return;
      elapsed = updateTime.current * simulationSpeed;
      updateTime.current = 0;
    } else if (!needsRefresh.current) return;
    else elapsed = Math.max(0.01, detectorModelComparison.enabled && detectorModelComparison.showDifference
      ? Math.max(detectorModelComparison.classical.detectionTime, detectorModelComparison.pilotWave.detectionTime)
      : detectionTime) * 8;
    needsRefresh.current = false;
    const totalAmplitude = apertureField?.emitters.reduce((total, emitter) => total + Math.abs(emitter.amplitude), 0) ?? 0;
    const uniforms = resources.responseMaterial.uniforms;
    uniforms.uPreviousResponse.value = resources.responseTargets[resources.historyIndex].texture;
    uniforms.uIntensityScale.value = Math.max(0.001, 4 * totalAmplitude ** 2 / DOUBLE_SLIT_DETECTOR_X ** 2);
    uniforms.uTime.value = timeRef.current;
    uniforms.uElapsed.value = elapsed;
    uniforms.uDetectionTime.value = Math.max(0.01, detectionTime);
    uniforms.uGlowTime.value = Math.max(0.01, glowTime);
    const comparisonValuesActive = detectorModelComparison.enabled && detectorModelComparison.showDifference;
    uniforms.uClassicalDetectionTime.value = comparisonValuesActive ? detectorModelComparison.classical.detectionTime : detectionTime;
    uniforms.uClassicalGlowTime.value = comparisonValuesActive ? detectorModelComparison.classical.glowTime : glowTime;
    uniforms.uPilotDetectionTime.value = comparisonValuesActive ? detectorModelComparison.pilotWave.detectionTime : detectionTime;
    uniforms.uPilotGlowTime.value = comparisonValuesActive ? detectorModelComparison.pilotWave.glowTime : glowTime;
    const destinationIndex = 1 - resources.historyIndex;
    const currentTarget = gl.getRenderTarget();
    const previousClearColor = gl.getClearColor(new Color());
    const previousClearAlpha = gl.getClearAlpha();
    try {
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(resources.responseTargets[destinationIndex]);
      gl.clear(true, false, false);
      gl.render(resources.computeScene, resources.computeCamera);
    } finally {
      gl.setRenderTarget(currentTarget);
      gl.setClearColor(previousClearColor, previousClearAlpha);
    }
    resources.historyIndex = destinationIndex;
    resources.displayMaterial.uniforms.uResponse.value = resources.responseTargets[destinationIndex].texture;
    if (detectorModelComparison.enabled && (configurationRefresh || comparisonScoreTimer.current >= 0.5)) {
      updateDetectorComparisonScores({ scoreResponses: scoreResponses.current, waves, waveCount, interferenceModes, experimentMode, apertureField, time: timeRef.current, elapsed, comparison: detectorModelComparison, onScores: onComparisonScores });
      comparisonScoreTimer.current = 0;
    }
  });

  return <mesh position={[DOUBLE_SLIT_DETECTOR_X - 0.025, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
    <planeGeometry args={[DETECTOR_TRANSVERSE_SPAN, DETECTOR_TRANSVERSE_SPAN]} />
    <primitive object={resources.displayMaterial} attach="material" />
  </mesh>;
}

function ClassicExperimentDetector({ apertureField, waves, waveCount, interferenceModes, experimentMode, running, timeRef, detectionTime, glowTime, detectorBrightness, detectorPalette, detectorMechanicsMode, detectorModelComparison, clearToken, maskEnabled, pixelDensity, onResolutionChange, onComparisonScores }) {
  const simulationSpeed = useContext(SimulationSpeedContext);
  const wignerMechanics = useContext(WignerMechanicsContext);
  const resolutionScale = ['wigner-function', 'wigner-gpu'].includes(detectorMechanicsMode) ? 1.5 : 1;
  const resolution = Math.max(1, Math.round(CLASSIC_DETECTOR_BINS_PER_AXIS * pixelDensity * resolutionScale));
  const geometry = useMemo(() => createClassicDetectorGeometry(resolution), [resolution]);
  const color = useMemo(() => new Color(), []);
  const updateTime = useRef(0);
  const needsRefresh = useRef(true);
  const comparisonScoreTimer = useRef(0);
  const previousDifferenceView = useRef(false);
  const comparisonScoreResponses = useRef(Array.from({ length: DETECTOR_SCORE_GRID_RESOLUTION ** 2 }, () => ({
    classical: { average: 0, glow: 0 },
    pilotWave: { average: 0, glow: 0 },
    wignerGpu: { average: 0, glow: 0 },
    wignerGpuSign: 0
  })));
  const wignerGpuProcessor = useRef({ status: 'inactive', processor: null });
  const wignerGpuSamples = useRef(null);
  const wignerGpuBusy = useRef(false);
  const wignerGpuSamplesReady = useRef(false);
  const comparisonUsesWignerGpu = detectorModelComparison.enabled
    && [detectorModelComparison.referenceModel, detectorModelComparison.candidateModel].includes('wigner-gpu');
  const needsWignerGpu = detectorMechanicsMode === 'wigner-gpu' || comparisonUsesWignerGpu;
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    if (!needsWignerGpu) {
      wignerGpuProcessor.current = { status: 'inactive', processor: null };
      wignerGpuSamples.current = null;
      wignerGpuBusy.current = false;
      wignerGpuSamplesReady.current = false;
      return undefined;
    }
    const state = { status: 'loading', processor: null };
    wignerGpuProcessor.current = state;
    wignerGpuSamples.current = null;
    wignerGpuBusy.current = false;
    wignerGpuSamplesReady.current = false;
    let active = true;
    createWignerGpuProcessor(undefined, resolution, resolution).then((processor) => {
      if (!active) {
        processor?.dispose();
        return;
      }
      state.processor = processor;
      state.status = processor ? 'ready' : 'unavailable';
      needsRefresh.current = true;
    }).catch(() => {
      if (!active) return;
      state.status = 'unavailable';
      needsRefresh.current = true;
    });
    return () => {
      active = false;
      state.processor?.dispose();
      if (wignerGpuProcessor.current === state) wignerGpuProcessor.current = { status: 'inactive', processor: null };
    };
  }, [needsWignerGpu, resolution]);
  useEffect(() => {
    needsRefresh.current = true;
    updateTime.current = 0;
    onResolutionChange(`${resolution}x${resolution}`);
  }, [geometry, onResolutionChange, resolution]);
  useEffect(() => {
    needsRefresh.current = true;
  }, [apertureField, detectorBrightness, detectorMechanicsMode, detectorPalette, detectionTime, experimentMode, glowTime, interferenceModes, maskEnabled, waveCount, waves, wignerMechanics.showNegativeValues]);

  useEffect(() => {
    const differenceView = detectorModelComparison.enabled && detectorModelComparison.showDifference;
    if (differenceView || previousDifferenceView.current) needsRefresh.current = true;
    previousDifferenceView.current = differenceView;
    if (!detectorModelComparison.enabled) {
      onComparisonScores(null);
    } else if (!detectorModelComparison.showDifference) {
      updateDetectorComparisonScores({
        scoreResponses: comparisonScoreResponses.current,
        waves,
        waveCount,
        interferenceModes,
        experimentMode,
        apertureField,
        time: timeRef.current,
        elapsed: Math.max(detectorModelComparison.classical.detectionTime, detectorModelComparison.pilotWave.detectionTime, detectorModelComparison.wignerGpu.detectionTime) * 8,
        comparison: detectorModelComparison,
        onScores: onComparisonScores
      });
      comparisonScoreTimer.current = 0;
    }
  }, [apertureField, detectorModelComparison, experimentMode, geometry, interferenceModes, onComparisonScores, waveCount, waves]);

  useEffect(() => {
    if (clearToken === 0) return;
    geometry.userData.responses.forEach((response) => {
      response.average = 0;
      response.glow = 0;
      response.classical.average = 0;
      response.classical.glow = 0;
      response.pilotWave.average = 0;
      response.pilotWave.glow = 0;
      response.wignerSign = 0.5;
      response.wignerGpu = { average: 0, glow: 0 };
      response.wignerGpuSign = 0;
    });
    comparisonScoreResponses.current.forEach((response) => {
      response.classical = { average: 0, glow: 0 };
      response.pilotWave = { average: 0, glow: 0 };
      response.wignerGpu = { average: 0, glow: 0 };
      response.wignerGpuSign = 0;
    });
    const baseColor = DETECTOR_PALETTE_COLORS[detectorPalette]?.[0] ?? DETECTOR_PALETTE_COLORS.thermal[0];
    const colors = geometry.attributes.color.array;
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = baseColor.r;
      colors[index + 1] = baseColor.g;
      colors[index + 2] = baseColor.b;
    }
    geometry.attributes.color.needsUpdate = true;
    updateTime.current = 0;
    needsRefresh.current = false;
    onComparisonScores(null);
  }, [clearToken, detectorPalette, geometry, onComparisonScores]);

  useFrame((_, delta) => {
    comparisonScoreTimer.current += delta;
    const configurationRefresh = needsRefresh.current;
    let elapsed = 0;
    if (running) {
      updateTime.current += Math.min(delta, 0.1);
      if (!needsRefresh.current && updateTime.current < DETECTOR_UPDATE_INTERVAL) return;
      elapsed = updateTime.current * simulationSpeed;
      updateTime.current = 0;
    } else if (!needsRefresh.current) return;
    else elapsed = Math.max(0.01, detectorModelComparison.enabled && detectorModelComparison.showDifference
      ? Math.max(detectorModelComparison.classical.detectionTime, detectorModelComparison.pilotWave.detectionTime, detectorModelComparison.wignerGpu.detectionTime)
      : detectionTime) * 8;
    needsRefresh.current = false;
    const comparisonReference = detectorModelComparison.referenceModel;
    const comparisonCandidate = detectorModelComparison.candidateModel;
    const directFieldMode = experimentMode === 'field';
    const totalAmplitude = directFieldMode
      ? waves.slice(0, waveCount).reduce((total, wave) => total + (wave.enabled === false ? 0 : Math.abs(Number(wave.amplitude) || 0)), 0)
      : apertureField?.emitters.reduce((total, emitter) => total + Math.abs(emitter.amplitude), 0) ?? 0;
    const intensityScale = Math.max(0.001, 4 * totalAmplitude ** 2 / (directFieldMode ? 1 : DOUBLE_SLIT_DETECTOR_X ** 2));
    const gpuState = wignerGpuProcessor.current;
    if (needsWignerGpu && gpuState.status === 'ready' && apertureField?.emitters?.length && !wignerGpuSamplesReady.current) {
      if (!wignerGpuBusy.current) {
        wignerGpuBusy.current = true;
        gpuState.processor.compute({
          emitters: apertureField.emitters,
          detectorX: DOUBLE_SLIT_DETECTOR_X,
          detectorSpan: DETECTOR_TRANSVERSE_SPAN,
          time: timeRef.current,
          intensityScale
        }).then((values) => {
          if (wignerGpuProcessor.current !== gpuState) return;
          wignerGpuSamples.current = values;
          wignerGpuSamplesReady.current = values !== null;
          wignerGpuBusy.current = false;
          needsRefresh.current = true;
        }).catch(() => {
          if (wignerGpuProcessor.current !== gpuState) return;
          gpuState.status = 'unavailable';
          wignerGpuBusy.current = false;
          needsRefresh.current = true;
        });
        return;
      }
      return;
    }
    const gpuSamplesReady = wignerGpuSamplesReady.current ? wignerGpuSamples.current : null;
    wignerGpuSamplesReady.current = false;
    const useCpuWignerFallback = needsWignerGpu && (!gpuState.processor || !apertureField?.emitters?.length);
    const gpuSampleResolution = resolution;
    const gpuSamplesForFrame = gpuSamplesReady ?? (useCpuWignerFallback
      ? createCpuWignerFallbackGrid({ waves, waveCount, apertureField, time: timeRef.current, intensityScale, resolution })
      : null);
    const stops = DETECTOR_PALETTE_COLORS[detectorPalette] ?? DETECTOR_PALETTE_COLORS.thermal;
    const colors = geometry.attributes.color.array;
    const responses = geometry.userData.responses;
    for (let yBin = 0; yBin < resolution; yBin += 1) {
      const y = ((yBin + 0.5) / resolution - 0.5) * DETECTOR_TRANSVERSE_SPAN;
      for (let zBin = 0; zBin < resolution; zBin += 1) {
        const z = ((zBin + 0.5) / resolution - 0.5) * DETECTOR_TRANSVERSE_SPAN;
        const bin = yBin * resolution + zBin;
        const response = responses[bin];
        if (detectorModelComparison.enabled && detectorModelComparison.showDifference) {
          const intensities = sampleDetectorModelIntensities({ waves, waveCount, interferenceModes, experimentMode, apertureField, x: DOUBLE_SLIT_DETECTOR_X, y, z, time: timeRef.current, includeWignerGpu: comparisonUsesWignerGpu });
          const gpuWignerValue = sampleGpuWignerValue(gpuSamplesForFrame, y, z, gpuSampleResolution);
          if (gpuWignerValue !== null) intensities.wignerGpu = gpuWignerValue;
          response.classical = advanceDetectorResponse(response.classical, intensities.classical, elapsed, detectorModelComparison.classical.detectionTime, detectorModelComparison.classical.glowTime);
          response.pilotWave = advanceDetectorResponse(response.pilotWave, intensities.pilotWave, elapsed, detectorModelComparison.pilotWave.detectionTime, detectorModelComparison.pilotWave.glowTime);
          response.wignerGpu = advanceDetectorResponse(response.wignerGpu, Math.abs(intensities.wignerGpu), elapsed, detectorModelComparison.wignerGpu.detectionTime, detectorModelComparison.wignerGpu.glowTime);
          response.wignerGpuSign = Math.sign(intensities.wignerGpu);
          const selectedResponse = detectorMechanicsMode === 'pilot-wave' ? response.pilotWave : detectorMechanicsMode === 'wigner-gpu' ? response.wignerGpu : response.classical;
          response.average = selectedResponse.average;
          response.glow = selectedResponse.glow;
          const values = {
            classical: scaleDetectorBrightness(response.classical.glow, detectorModelComparison.classical.brightness),
            'pilot-wave': scaleDetectorBrightness(response.pilotWave.glow, detectorModelComparison.pilotWave.brightness),
            'wigner-gpu': scaleSignedDetectorBrightness(response.wignerGpuSign * response.wignerGpu.glow, detectorModelComparison.wignerGpu.brightness)
          };
          if (maskEnabled && Math.abs(y) > APERTURE_SCREEN_HEIGHT / 2) {
            color.set('#030509');
          } else {
            const referenceValue = values[comparisonReference];
            const candidateValue = values[comparisonCandidate];
            const difference = candidateValue - referenceValue;
            color.set(difference >= 0 ? '#e95042' : '#38b8c0').lerp(stops[0], 1 - Math.min(1, Math.abs(difference)));
          }
        } else {
          const gpuWignerValue = detectorMechanicsMode === 'wigner-gpu' ? sampleGpuWignerValue(gpuSamplesForFrame, y, z, gpuSampleResolution) : null;
          const rawWignerValue = detectorMechanicsMode === 'wigner-function' || detectorMechanicsMode === 'wigner-gpu'
            ? (gpuWignerValue ?? sampleTransverseWignerFunction(waves.slice(0, waveCount), DOUBLE_SLIT_DETECTOR_X, y, z, timeRef.current, apertureField)) * (gpuWignerValue === null ? 1 : intensityScale)
            : null;
          const wignerValue = rawWignerValue !== null && !wignerMechanics.showNegativeValues ? Math.max(0, rawWignerValue) : rawWignerValue;
          const intensity = wignerValue !== null
            ? Math.abs(wignerValue)
            : detectorMechanicsMode === 'pilot-wave'
              ? samplePilotWaveCurrent(waves.slice(0, waveCount), DOUBLE_SLIT_DETECTOR_X, y, z, timeRef.current, apertureField).forwardFlux
              : directFieldMode
                ? (() => {
                  const field = calculateWaveDisplacementAndTensorGaussian(waves.slice(0, waveCount), DOUBLE_SLIT_DETECTOR_X, z, timeRef.current, interferenceModes, y).displacement;
                  return field.x ** 2 + field.y ** 2 + field.z ** 2;
                })()
                : sampleApertureField(apertureField, DOUBLE_SLIT_DETECTOR_X, y, z, timeRef.current).intensity;
          const nextResponse = advanceDetectorResponse(response, intensity / intensityScale, elapsed, detectionTime, glowTime);
          response.average = nextResponse.average;
          response.glow = nextResponse.glow;
          if (wignerValue !== null) response.wignerSign = wignerValue < 0 ? 0 : 1;
          if (maskEnabled && Math.abs(y) > APERTURE_SCREEN_HEIGHT / 2) {
            color.set('#030509');
          } else if (detectorMechanicsMode === 'wigner-function' || detectorMechanicsMode === 'wigner-gpu') {
            const magnitude = scaleDetectorBrightness(response.glow, detectorBrightness);
            const signColor = response.wignerSign >= 0.5 ? '#e95042' : '#38b8c0';
            color.set('#080d17').lerp(new Color(signColor), magnitude);
          } else {
            const brightness = scaleDetectorBrightness(response.glow, detectorBrightness);
            const palettePosition = brightness * (stops.length - 1);
            const lowerStop = Math.floor(palettePosition);
            color.copy(stops[lowerStop]).lerp(stops[Math.min(lowerStop + 1, stops.length - 1)], palettePosition - lowerStop);
          }
        }
        for (let vertex = 0; vertex < 6; vertex += 1) {
          const colorOffset = (bin * 6 + vertex) * 3;
          colors[colorOffset] = color.r;
          colors[colorOffset + 1] = color.g;
          colors[colorOffset + 2] = color.b;
        }
      }
    }
    geometry.attributes.color.needsUpdate = true;
    if (detectorModelComparison.enabled && (configurationRefresh || comparisonScoreTimer.current >= 0.5)) {
      updateDetectorComparisonScores({ scoreResponses: comparisonScoreResponses.current, waves, waveCount, interferenceModes, experimentMode, apertureField, time: timeRef.current, elapsed, comparison: detectorModelComparison, onScores: onComparisonScores, wignerGpuValues: gpuSamplesForFrame, wignerGpuResolution: gpuSampleResolution });
      comparisonScoreTimer.current = 0;
    }
  });

  return <group position={[DOUBLE_SLIT_DETECTOR_X, 0, 0]}>
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors transparent opacity={0.98} side={DoubleSide} toneMapped={false} />
    </mesh>
  </group>;
}

function ExperimentDetector({ implementation, experimentMode, ...props }) {
  const detectorModelComparison = useContext(DetectorModelComparisonContext);
  const { setScores } = useContext(DetectorComparisonScoreContext);
  const detectorProps = { ...props, detectorModelComparison, onComparisonScores: setScores };
  const comparisonUsesWignerGpu = detectorModelComparison.enabled
    && [detectorModelComparison.referenceModel, detectorModelComparison.candidateModel].includes('wigner-gpu');
  return implementation === 'native' && experimentMode !== 'field' && detectorProps.detectorMechanicsMode !== 'wigner-gpu' && !comparisonUsesWignerGpu
    ? <NativeResolutionDetector {...detectorProps} />
    : <ClassicExperimentDetector {...detectorProps} experimentMode={experimentMode} />;
}

function DetectorOamReadout({ states }) {
  return <Html position={[DOUBLE_SLIT_DETECTOR_X + 0.03, DETECTOR_TRANSVERSE_SPAN / 2 - 0.45, -DETECTOR_TRANSVERSE_SPAN / 2 + 0.45]}>
    <div className="wave-detector-oam-label" aria-label="OAM states on detector">
      <span className="wave-oam-kicker">OAM</span>
      {states.map(({ index, charge }) => <span className="wave-oam-state" key={index}>W{index + 1} ℓ={charge > 0 ? `+${charge}` : charge}</span>)}
    </div>
  </Html>;
}

function formatWignerVector(vector) {
  return `(${vector.x.toFixed(3)}, ${vector.y.toFixed(3)}, ${vector.z.toFixed(3)})`;
}

function WignerMechanicsReadout({ label, position, waves, waveCount, timeRef, apertureField = null, quantities }) {
  const outputRef = useRef(null);
  const updateTimer = useRef(0);
  useFrame((_, delta) => {
    updateTimer.current += delta;
    if (updateTimer.current < 0.25 || !outputRef.current) return;
    updateTimer.current = 0;
    const sample = sampleWignerMechanics(waves.slice(0, waveCount), position[0], position[1], position[2], timeRef.current, apertureField, quantities);
    const lines = [];
    if (sample.position) lines.push(`r ${formatWignerVector(sample.position)}`);
    if (sample.momentum) lines.push(`p ${formatWignerVector(sample.momentum)}`);
    if (sample.rotation) lines.push(`L ${formatWignerVector(sample.rotation)}`);
    if (sample.shear) lines.push(`S [${sample.shear.xx.toFixed(3)} ${sample.shear.xy.toFixed(3)} ${sample.shear.xz.toFixed(3)}; ${sample.shear.xy.toFixed(3)} ${sample.shear.yy.toFixed(3)} ${sample.shear.yz.toFixed(3)}; ${sample.shear.xz.toFixed(3)} ${sample.shear.yz.toFixed(3)} ${sample.shear.zz.toFixed(3)}]`);
    const receivedOam = sample.oamStates.length
      ? sample.oamStates.map(({ index, charge }) => `W${index} ℓ=${charge > 0 ? `+${charge}` : charge}`).join(', ')
      : 'none';
    lines.push(`OAM received: ${receivedOam}`);
    outputRef.current.textContent = lines.join('\n');
  });
  return <Html position={position}>
    <div className="wave-wigner-readout" aria-label={`${label} Wigner mechanics`}>
      <strong>{label}</strong>
      <pre ref={outputRef}>Sampling phase-space moments…</pre>
    </div>
  </Html>;
}

function SolitonChamberRig({ solitonConfig, solverStateRef }) {
  const ribbonGeometry = useMemo(() => {
    const count = 160;
    const positions = new Float32Array(count * 6);
    const colors = new Float32Array(count * 6);
    const indices = [];
    for (let i = 0; i < count; i += 1) {
      const x = -SOLITON_DOMAIN_SPAN / 2 + (i / (count - 1)) * SOLITON_DOMAIN_SPAN;
      positions[i * 6] = x;
      positions[i * 6 + 1] = 0;
      positions[i * 6 + 2] = -0.35;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = 0;
      positions[i * 6 + 5] = 0.35;
      if (i < count - 1) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }, []);

  const cfdCurtainGeometry = useMemo(() => {
    const nx = 64;
    const nz = 16;
    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 3);
    const indices = [];
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const idx = iz * nx + ix;
        positions[idx * 3] = -SOLITON_DOMAIN_SPAN / 2 + (ix / (nx - 1)) * SOLITON_DOMAIN_SPAN;
        positions[idx * 3 + 1] = -1.3 + (iz / (nz - 1)) * 1.25;
        positions[idx * 3 + 2] = 0;
        if (ix < nx - 1 && iz < nz - 1) {
          const a = idx;
          const b = idx + 1;
          const c = idx + nx;
          const d = idx + nx + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }, []);

  const bathymetryFloorGeometry = useMemo(() => {
    const nx = 64;
    const nz = 20;
    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 3);
    const indices = [];
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const idx = iz * nx + ix;
        positions[idx * 3] = -SOLITON_DOMAIN_SPAN / 2 + (ix / (nx - 1)) * SOLITON_DOMAIN_SPAN;
        positions[idx * 3 + 1] = -1.35;
        positions[idx * 3 + 2] = -7.0 + (iz / (nz - 1)) * 14.0;
        if (ix < nx - 1 && iz < nz - 1) {
          const a = idx;
          const b = idx + 1;
          const c = idx + nx;
          const d = idx + nx + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }, []);

  const tubularCurlGeometry = useMemo(() => {
    const nx = 64;
    const nTheta = 10;
    const positions = new Float32Array(nx * nTheta * 3);
    const colors = new Float32Array(nx * nTheta * 3);
    const indices = [];
    for (let it = 0; it < nTheta; it += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const idx = it * nx + ix;
        positions[idx * 3] = -SOLITON_DOMAIN_SPAN / 2 + (ix / (nx - 1)) * SOLITON_DOMAIN_SPAN;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = (it / (nTheta - 1) - 0.5) * 4.2;
        if (ix < nx - 1 && it < nTheta - 1) {
          const a = idx;
          const b = idx + 1;
          const c = idx + nx;
          const d = idx + nx + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }, []);

  const primaryColor = useMemo(() => new Color(), []);
  const secondaryColor = useMemo(() => new Color(), []);
  const workColor = useMemo(() => new Color(), []);

  useEffect(() => () => ribbonGeometry.dispose(), [ribbonGeometry]);
  useEffect(() => () => cfdCurtainGeometry.dispose(), [cfdCurtainGeometry]);
  useEffect(() => () => bathymetryFloorGeometry.dispose(), [bathymetryFloorGeometry]);
  useEffect(() => () => tubularCurlGeometry.dispose(), [tubularCurlGeometry]);

  useEffect(() => {
    if (!solitonConfig?.enabled) return;
    const nx = 64;
    const nz = 20;
    const visualDepthSpan = Math.min(2.4, Math.max(0.55, (solitonConfig.poolDepthM ?? 1.8) * 0.75));
    const pos = bathymetryFloorGeometry.attributes.position.array;
    const col = bathymetryFloorGeometry.attributes.color.array;
    const deepColor = new Color('#0d2638');
    const reefColor = new Color('#d79a52');
    for (let iz = 0; iz < nz; iz += 1) {
      const z = -7.0 + (iz / (nz - 1)) * 14.0;
      for (let ix = 0; ix < nx; ix += 1) {
        const x = -SOLITON_DOMAIN_SPAN / 2 + (ix / (nx - 1)) * SOLITON_DOMAIN_SPAN;
        const idx = iz * nx + ix;
        const bathy = evaluateBathymetryAt(x, z, solitonConfig);
        const floorY = -visualDepthSpan * bathy.depthRatio;
        pos[idx * 3 + 1] = floorY;
        workColor.copy(deepColor).lerp(reefColor, 1 - bathy.depthRatio);
        col[idx * 3] = workColor.r;
        col[idx * 3 + 1] = workColor.g;
        col[idx * 3 + 2] = workColor.b;
      }
    }
    bathymetryFloorGeometry.attributes.position.needsUpdate = true;
    bathymetryFloorGeometry.attributes.color.needsUpdate = true;
  }, [
    bathymetryFloorGeometry,
    solitonConfig,
    solitonConfig?.enabled,
    solitonConfig?.poolDepthM,
    solitonConfig?.bathymetryProfile,
    solitonConfig?.bathymetryRelief,
    solitonConfig?.bathymetryCenterX,
    workColor
  ]);

  useFrame(() => {
    const state = solverStateRef.current;
    if (!state || !solitonConfig?.enabled) return;
    const fluid = SOLITON_FLUIDS[solitonConfig.fluidId] ?? SOLITON_FLUIDS.water;
    primaryColor.set(fluid.colorHex);
    secondaryColor.set(fluid.secondaryColorHex);

    const ribbonPos = ribbonGeometry.attributes.position.array;
    const ribbonCol = ribbonGeometry.attributes.color.array;
    for (let i = 0; i < state.size; i += 1) {
      const u1 = state.u1[i];
      const u2 = state.u2[i];
      const ldl = state.ldlFraction[i];
      const y = u1 * 1.35;
      const zShift = solitonConfig.equation === 'vector-coupled' ? u2 * 0.65 : 0;
      ribbonPos[i * 6 + 1] = y;
      ribbonPos[i * 6 + 2] = -0.38 + zShift;
      ribbonPos[i * 6 + 4] = y;
      ribbonPos[i * 6 + 5] = 0.38 + zShift;

      if (solitonConfig.fluidId === 'water-hdl-ldl' && solitonConfig.showHdlLdlOverlay) {
        workColor.set('#2ee6a8').lerp(secondaryColor.set('#3b82f6'), ldl);
      } else {
        const t = Math.min(1, Math.abs(u1));
        workColor.copy(primaryColor).lerp(secondaryColor, t);
      }
      ribbonCol[i * 6] = workColor.r;
      ribbonCol[i * 6 + 1] = workColor.g;
      ribbonCol[i * 6 + 2] = workColor.b;
      ribbonCol[i * 6 + 3] = workColor.r;
      ribbonCol[i * 6 + 4] = workColor.g;
      ribbonCol[i * 6 + 5] = workColor.b;
    }
    ribbonGeometry.attributes.position.needsUpdate = true;
    ribbonGeometry.attributes.color.needsUpdate = true;

    if (solitonConfig.tubularBreakerEnabled) {
      const nx = 64;
      const nTheta = 10;
      const tPos = tubularCurlGeometry.attributes.position.array;
      const tCol = tubularCurlGeometry.attributes.color.array;
      for (let it = 0; it < nTheta; it += 1) {
        const lipPhase = it / (nTheta - 1);
        for (let ix = 0; ix < nx; ix += 1) {
          const idx = it * nx + ix;
          const baseX = -SOLITON_DOMAIN_SPAN / 2 + (ix / (nx - 1)) * SOLITON_DOMAIN_SPAN;
          const crest = evaluateTubularCrestAt(state, solitonConfig, baseX, 0, lipPhase);
          tPos[idx * 3] = baseX + crest.curlOffsetX * 1.35;
          tPos[idx * 3 + 1] = crest.height * 1.35 + crest.curlOffsetY * 1.35;
          tPos[idx * 3 + 2] = (lipPhase - 0.5) * 3.2;
          workColor.copy(primaryColor).lerp(new Color('#e8fbff'), lipPhase * Math.min(1, crest.plungeIntensity));
          tCol[idx * 3] = workColor.r;
          tCol[idx * 3 + 1] = workColor.g;
          tCol[idx * 3 + 2] = workColor.b;
        }
      }
      tubularCurlGeometry.attributes.position.needsUpdate = true;
      tubularCurlGeometry.attributes.color.needsUpdate = true;
    }

    if (solitonConfig.equation === 'cfd-2d' || solitonConfig.showCfdVelocityOverlay) {
      const { nx, nz, u, w, vorticity } = state.cfd;
      const cfdPos = cfdCurtainGeometry.attributes.position.array;
      const cfdCol = cfdCurtainGeometry.attributes.color.array;
      const visualDepthSpan = Math.min(2.4, Math.max(0.55, (solitonConfig.poolDepthM ?? 1.8) * 0.75));
      for (let iz = 0; iz < nz; iz += 1) {
        const zFrac = iz / (nz - 1);
        for (let ix = 0; ix < nx; ix += 1) {
          const idx = iz * nx + ix;
          const i1d = Math.min(state.size - 1, Math.round((ix / (nx - 1)) * (state.size - 1)));
          const topY = state.u1[i1d] * 1.25;
          const localFloorY = -visualDepthSpan * (state.depthRatio ? state.depthRatio[i1d] : 1);
          cfdPos[idx * 3 + 1] = localFloorY + zFrac * (topY - localFloorY);
          const speed = Math.hypot(u[idx], w[idx]);
          const vort = Math.min(1, Math.abs(vorticity[idx]) * 0.45);
          const normSpeed = Math.min(1, speed * 0.55);
          workColor.set('#0a1b2a').lerp(primaryColor, normSpeed).lerp(new Color('#ff8552'), vort * 0.45);
          cfdCol[idx * 3] = workColor.r;
          cfdCol[idx * 3 + 1] = workColor.g;
          cfdCol[idx * 3 + 2] = workColor.b;
        }
      }
      cfdCurtainGeometry.attributes.position.needsUpdate = true;
      cfdCurtainGeometry.attributes.color.needsUpdate = true;
    }
  });

  if (!solitonConfig?.enabled) return null;
  const leftActive = solitonConfig.emissionSide === 'left' || solitonConfig.emissionSide === 'both';
  const rightActive = solitonConfig.emissionSide === 'right' || solitonConfig.emissionSide === 'both';
  const isPlasma = solitonConfig.domain === 'plasma-wave';
  const launcherColorActive = isPlasma ? '#ff8b5e' : '#4ad6e8';
  const launcherColorIdle = '#1b3140';
  const visualDepthSpan = Math.min(2.4, Math.max(0.55, (solitonConfig.poolDepthM ?? 1.8) * 0.75));

  return (
    <group aria-label="Soliton wave pool and plasma chamber rig">
      <mesh position={[-8.85, -0.25, 0]}>
        <boxGeometry args={[0.32, 2.2, 14.4]} />
        <meshBasicMaterial color={leftActive ? launcherColorActive : launcherColorIdle} transparent opacity={leftActive ? 0.42 : 0.18} />
      </mesh>
      <mesh position={[8.85, -0.25, 0]}>
        <boxGeometry args={[0.32, 2.2, 14.4]} />
        <meshBasicMaterial color={rightActive ? launcherColorActive : launcherColorIdle} transparent opacity={rightActive ? 0.42 : 0.18} />
      </mesh>
      {solitonConfig.showStillWaterDepth && (
        <group aria-label="Pool still-water depth volume">
          <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[SOLITON_DOMAIN_SPAN, 14.0]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.14} side={DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[0, -visualDepthSpan / 2, 0]}>
            <boxGeometry args={[SOLITON_DOMAIN_SPAN, visualDepthSpan, 14.0]} />
            <meshBasicMaterial color="#0c4a6e" transparent opacity={0.12} side={DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      )}
      {solitonConfig.showFloorBathymetry && (
        <mesh geometry={bathymetryFloorGeometry} aria-label="Floor bathymetry mesh">
          <meshBasicMaterial vertexColors transparent opacity={0.62} side={DoubleSide} toneMapped={false} />
        </mesh>
      )}
      <mesh geometry={ribbonGeometry}>
        <meshBasicMaterial vertexColors transparent opacity={0.88} side={DoubleSide} toneMapped={false} />
      </mesh>
      {solitonConfig.tubularBreakerEnabled && (
        <mesh geometry={tubularCurlGeometry} aria-label="Tubular wave barrel curl mesh">
          <meshBasicMaterial vertexColors transparent opacity={0.76} side={DoubleSide} toneMapped={false} />
        </mesh>
      )}
      {(solitonConfig.equation === 'cfd-2d' || solitonConfig.showCfdVelocityOverlay) && (
        <mesh geometry={cfdCurtainGeometry}>
          <meshBasicMaterial vertexColors transparent opacity={0.42} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function WaveField({ waves, waveCount, interferenceModes, running, timeRef, experimentMode, apertureField, apertureSettings, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, particleAppearance, occlusionPreset, waveMechanics, solitonConfig, solitonSolverRef, onSolitonTelemetry, showWaveRepresentation, showTensorGaussianSplatters, classicalWavePalette, superpositionPalette, oamSplatterPalette }) {
  const simulationSpeed = useContext(SimulationSpeedContext);
  const geometry = useMemo(() => createFieldGeometry(particleCount), [particleCount]);
  const slitScreenPlane = useMemo(() => getSlitScreenPlane(apertureSettings), [apertureSettings]);
  const usesApertureExperiment = APERTURE_EXPERIMENT_MODES.includes(experimentMode);
  const fieldUpdateTime = useRef(0);
  const solitonTelemetryTimer = useRef(0);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uParticleSize: { value: 0.075 },
      uOpacity: { value: 0.9 },
      uShape: { value: 1 },
      uTint: { value: new Color('#ffffff') },
      uTintEnabled: { value: false },
      uTensorSplatters: { value: false }
    },
    vertexColors: true,
    vertexShader: WAVE_VERTEX_SHADER,
    fragmentShader: WAVE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  }), []);
  const color = useMemo(() => new Color(), []);
  const secondaryColor = useMemo(() => new Color(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.side = doubleSided ? DoubleSide : FrontSide;
    material.needsUpdate = true;
  }, [doubleSided, material]);
  useEffect(() => {
    material.uniforms.uParticleSize.value = particleSize;
    material.uniforms.uOpacity.value = particleOpacity;
    material.uniforms.uShape.value = PARTICLE_SHAPES.indexOf(particleShape);
  }, [material, particleOpacity, particleShape, particleSize]);
  useEffect(() => {
    material.uniforms.uTint.value.set(particleAppearance.color);
    material.uniforms.uTintEnabled.value = particleAppearance.colorMode === 'custom';
  }, [material, particleAppearance.color, particleAppearance.colorMode]);
  useEffect(() => {
    material.uniforms.uTensorSplatters.value = showTensorGaussianSplatters && waves.slice(0, waveCount).some((wave) => wave.enabled !== false && wave.polarization === 'EM-Tensor-Gaussian');
  }, [material, showTensorGaussianSplatters, waveCount, waves]);

  useFrame((_, delta) => {
    if (running) timeRef.current += Math.min(delta, 0.05) * simulationSpeed;
    if (solitonConfig?.enabled && solitonSolverRef?.current) {
      if (running) {
        stepSolitonSolver(solitonSolverRef.current, solitonConfig, Math.min(delta, 0.04) * simulationSpeed);
      }
      solitonTelemetryTimer.current += delta;
      if (solitonTelemetryTimer.current >= 0.15) {
        solitonTelemetryTimer.current = 0;
        onSolitonTelemetry?.({ ...solitonSolverRef.current.telemetry });
      }
    }
    if (!showWaveRepresentation) return;
    if (usesApertureExperiment && !solitonConfig?.enabled) {
      fieldUpdateTime.current += delta;
      if (fieldUpdateTime.current < 1 / 20) return;
      fieldUpdateTime.current = 0;
    }
    const positions = geometry.attributes.position.array;
    const basePositions = geometry.userData.basePositions;
    const colors = geometry.attributes.color.array;
    const vectorAngles = geometry.attributes.aVectorAngle.array;
    const tensorGaussians = geometry.attributes.aTensorGaussian.array;
    const occlusions = geometry.attributes.aOcclusion.array;

    if (solitonConfig?.enabled && solitonSolverRef?.current) {
      const state = solitonSolverRef.current;
      const fluid = SOLITON_FLUIDS[solitonConfig.fluidId] ?? SOLITON_FLUIDS.water;
      for (let index = 0; index < particleCount; index += 1) {
        const x = basePositions[index * 3];
        const y = basePositions[index * 3 + 1];
        const z = basePositions[index * 3 + 2];
        const lipPhase = ((index % 9) + 0.5) / 9;
        const sample = solitonConfig.tubularBreakerEnabled
          ? evaluateTubularCrestAt(state, solitonConfig, x, z, lipPhase)
          : sampleSolitonFieldAt(state, solitonConfig, x, z);
        const curlX = sample.curlOffsetX ? sample.curlOffsetX * 1.25 : 0;
        const curlY = sample.curlOffsetY ? sample.curlOffsetY * 1.25 : 0;
        positions[index * 3] = x + sample.u1 * 0.25 + curlX;
        positions[index * 3 + 1] = y + sample.height * 1.35 + curlY;
        positions[index * 3 + 2] = z + sample.u2 * 0.45;
        occlusions[index] = 1;
        vectorAngles[index] = solitonConfig.equation === 'vector-coupled'
          ? sample.vectorAngle
          : Math.atan(sample.slope * 0.55);
        tensorGaussians[index] = Math.min(1, Math.hypot(sample.u1, sample.u2));
        const normalized = Math.min(1, Math.abs(sample.height) / 1.1);
        if (solitonConfig.fluidId === 'water-hdl-ldl' && solitonConfig.showHdlLdlOverlay) {
          color.set('#2ee6a8').lerp(secondaryColor.set('#3b82f6'), sample.ldlFraction);
          color.offsetHSL(0, 0, normalized * 0.14);
        } else if (solitonConfig.equation === 'vector-coupled') {
          const hue = ((sample.vectorAngle / (Math.PI * 2)) + 1) % 1;
          color.setHSL(hue, 0.85, 0.44 + normalized * 0.22);
        } else {
          color.set(fluid.colorHex).lerp(secondaryColor.set(fluid.secondaryColorHex), normalized);
        }
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.attributes.aVectorAngle.needsUpdate = true;
      geometry.attributes.aTensorGaussian.needsUpdate = true;
      geometry.attributes.aOcclusion.needsUpdate = true;
      return;
    }

    const activeWaves = waves.slice(0, waveCount);
    const activeWaveCount = activeWaves.filter((wave) => wave.enabled !== false).length;
    const hasOrbitalWaves = activeWaves.some((wave) => wave.enabled !== false
      && wave.polarization === 'EM-Tensor-Gaussian'
      && (wave.phaseMode === 'Helical-Left' || wave.phaseMode === 'Helical-Right'));
    const tensorWaves = usesApertureExperiment
      ? activeWaves.filter((wave) => wave.enabled !== false && wave.polarization === 'EM-Tensor-Gaussian')
      : null;
    const tensorGaussianWave = activeWaves.find((wave) => wave.enabled !== false && wave.polarization === 'EM-Tensor-Gaussian');
    for (let index = 0; index < particleCount; index += 1) {
      const x = basePositions[index * 3];
      const y = basePositions[index * 3 + 1];
      const z = basePositions[index * 3 + 2];
      const transmission = usesApertureExperiment && x > DOUBLE_SLIT_DETECTOR_X
        ? 0
        : calculateOcclusionTransmission(occlusionPreset, x, z, 0, apertureSettings);
      const beyondAperture = SLIT_EXPERIMENT_MODES.includes(experimentMode)
        ? slitScreenPlaneDepth(slitScreenPlane, x, y, z) > DOUBLE_SLIT_SCREEN_THICKNESS / 2
        : x > DOUBLE_SLIT_SCREEN_THICKNESS / 2;
      const apertureFieldSample = usesApertureExperiment && beyondAperture
        ? sampleApertureField(apertureField, x, 0, z, timeRef.current)
        : null;
      const apertureDisplacement = apertureFieldSample && {
        x: apertureFieldSample.electric.x * Number(interferenceModes.superposition) + apertureFieldSample.constructiveElectric.x * Number(interferenceModes.constructive),
        y: apertureFieldSample.electric.y * Number(interferenceModes.superposition) + apertureFieldSample.constructiveElectric.y * Number(interferenceModes.constructive),
        z: apertureFieldSample.electric.z * Number(interferenceModes.superposition) + apertureFieldSample.constructiveElectric.z * Number(interferenceModes.constructive)
      };
      const linearHeight = apertureDisplacement
        ? apertureDisplacement.y
        : combineWaves(activeWaves, x, z, timeRef.current, interferenceModes) * transmission;
      const useGpeResponse = waveMechanics.model === 'gpe' && !usesApertureExperiment;
      const directionalCurvature = useGpeResponse
        ? calculateWaveDerivative(activeWaves, x, z, timeRef.current, 2, interferenceModes) * transmission
        : 0;
      const height = useGpeResponse
        ? evaluateGpeResponse(linearHeight, directionalCurvature, waveMechanics)
        : linearHeight;
      const waveResponse = apertureDisplacement
        ? null
        : calculateWaveDisplacementAndTensorGaussian(activeWaves, x, z, timeRef.current, interferenceModes);
      const displacement = apertureDisplacement ?? waveResponse.displacement;
      const rawTensorGaussian = apertureDisplacement
        ? tensorWaves.length > 0 ? calculateWaveTensorGaussian(tensorWaves, x, z, timeRef.current, interferenceModes) * transmission : 0
        : waveResponse.tensorGaussian * transmission;
      const beamWaist = Math.max(0.1, Number(tensorGaussianWave?.beamWaist) || DEFAULT_BEAM_WAIST);
      const transverseRadius = rawTensorGaussian > 0
        ? beamWaist * Math.sqrt(-2 * Math.log(Math.min(1, rawTensorGaussian)))
        : beamWaist * 8;
      const ddfMobility = waveMechanics.mechanicsRegime === 'ddf-tensor-gaussian'
        ? calculateDdfMobility({ radiusM: Math.max(0.05, transverseRadius), speedMS: Math.abs(linearHeight) * 100, coreRadiusM: waveMechanics.tensorGaussianWaistM, speedLimitMS: waveMechanics.ddfSpeedLimitMS, dilatancy: waveMechanics.ddfStrength, baseViscosity: waveMechanics.ddfBaseViscosity })
        : 1;
      const mechanicsResponse = evaluateMechanicsResponse({ regime: waveMechanics.mechanicsRegime, gaussianWeight: rawTensorGaussian, ddfMobility, grassmannianWeight: waveMechanics.grassmannianPoleWeight, geometryCoupling: waveMechanics.geometryCoupling });
      const tensorGaussian = mechanicsResponse.splatWeight;
      const derivative = particleShape === 'vector'
        ? calculateWaveDerivative(activeWaves, x, z, timeRef.current, particleDerivativeOrder, interferenceModes)
        : 0;
      const normalized = Math.min(1, Math.abs(height) / Math.max(1, activeWaves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0)));
      const orbitalPhase = hasOrbitalWaves ? calculateWaveOrbitalPhase(activeWaves, x, z, timeRef.current) : null;
      positions[index * 3] = x + displacement.x * transmission * 0.9 * mechanicsResponse.accelerationScale;
      positions[index * 3 + 1] = basePositions[index * 3 + 1] + displacement.y * transmission * 0.9 * mechanicsResponse.accelerationScale;
      positions[index * 3 + 2] = z + displacement.z * transmission * 0.9 * mechanicsResponse.accelerationScale;
      occlusions[index] = transmission;
      vectorAngles[index] = Math.atan(derivative * 0.35);
      tensorGaussians[index] = tensorGaussian;
      const modelDifference = Math.min(1, Math.abs(height - linearHeight));
      const palette = orbitalPhase !== null
        ? oamSplatterPalette
        : activeWaveCount > 1 ? superpositionPalette : classicalWavePalette;
      if (waveMechanics.showDifference || palette === 'native') {
        const hue = waveMechanics.showDifference
          ? 0.55 - modelDifference * 0.43
          : orbitalPhase !== null
            ? (orbitalPhase / (Math.PI * 2) + 1) % 1
            : height >= 0 ? 0.12 - normalized * 0.06 : 0.52 + normalized * 0.08;
        color.setHSL(hue, orbitalPhase === null ? 0.72 : 0.88, 0.42 + normalized * 0.18);
      } else {
        const palettePosition = orbitalPhase !== null
          ? (orbitalPhase / (Math.PI * 2) + 1) % 1
          : Math.max(0, Math.min(1, 0.5 + (height >= 0 ? normalized : -normalized) * 0.5));
        sampleColorPalette(palette, palettePosition, color);
      }
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aVectorAngle.needsUpdate = true;
    geometry.attributes.aTensorGaussian.needsUpdate = true;
    geometry.attributes.aOcclusion.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} visible={showWaveRepresentation} />;
}

function SignalSourceArrows({ waves, waveCount, visible, palette }) {
  const sources = useMemo(() => waves.slice(0, waveCount).map((wave, index) => {
    if (wave.enabled === false) return null;
    const frame = calculateWaveFrame(wave);
    return { index, origin: frame.origin, direction: frame.direction };
  }).filter(Boolean), [waveCount, waves]);
  if (!visible) return null;
  return (
    <group>
      {sources.map(({ index, origin, direction }) => <arrowHelper key={index} args={[new Vector3(direction.x, direction.y, direction.z), new Vector3(origin.x, origin.y, origin.z), 2.4, paletteWaveColor(palette, index, waveCount), 0.38, 0.22]} />)}
    </group>
  );
}

function WaveScene({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, occlusionPreset, orbitControlsVisible, sourceVectorsVisible, waveMechanics, solitonConfig, solitonSolverRef, onSolitonTelemetry, experimentMode, detectionTime, glowTime, apertureSettings, detectorVisible, detectorBrightness, detectorPalette, detectorMaskEnabled, detectorPixelDensity, detectorImplementation, onDetectorResolutionChange, showWaveRepresentation, showTensorGaussianSplatters, classicalWavePalette, superpositionPalette, oamSplatterPalette }) {
  const { viewMode, orbitPlaying, orbitSettings, particleAppearance, onManualInteraction } = useContext(PerspectiveCameraContext);
  const solitonContext = useContext(SolitonSimulatorContext);
  const activeSolitonConfig = solitonConfig ?? solitonContext.config;
  const activeSolitonSolverRef = solitonSolverRef ?? solitonContext.solverRef;
  const activeOnSolitonTelemetry = onSolitonTelemetry ?? solitonContext.setTelemetry;
  const contextDetectorVisible = useContext(DetectorVisibilityContext);
  const detectorOamReadout = useContext(DetectorOamReadoutContext);
  const detectorMechanicsMode = useContext(DetectorMechanicsContext);
  const wignerMechanics = useContext(WignerMechanicsContext);
  const detectorPhaseFilter = useContext(DetectorPhaseFilterContext);
  const detectorClear = useContext(DetectorClearContext);
  const showDetector = detectorVisible ?? contextDetectorVisible;
  const timeRef = useRef(0);
  const activeWaveSignature = JSON.stringify(waves.slice(0, waveCount));
  const apertureSettingsSignature = JSON.stringify(apertureSettings);
  const interferenceModesSignature = JSON.stringify(interferenceModes);
  const detectorInterferenceModes = useMemo(() => interferenceModes, [interferenceModesSignature]);
  const detectorWaves = useMemo(() => filterWavesByPhase(waves.slice(0, waveCount), detectorPhaseFilter.mode, detectorPhaseFilter.value), [activeWaveSignature, detectorPhaseFilter.mode, detectorPhaseFilter.value, waveCount]);
  const apertureField = useMemo(() => APERTURE_EXPERIMENT_MODES.includes(experimentMode)
    ? prepareApertureField(waves.slice(0, waveCount), experimentMode, apertureSettings)
    : null, [activeWaveSignature, apertureSettingsSignature, experimentMode, waveCount]);
  const detectorApertureField = useMemo(() => !APERTURE_EXPERIMENT_MODES.includes(experimentMode)
    ? null
    : detectorPhaseFilter.mode === 'all'
      ? apertureField
      : prepareApertureField(detectorWaves, experimentMode, apertureSettings), [apertureField, apertureSettingsSignature, detectorPhaseFilter.mode, detectorWaves, experimentMode]);
  return (
    <>
      <color attach="background" args={['#080d17']} />
      {/* <fog attach="fog" args={['#080d17', 17, 34]} /> */}
      <ambientLight intensity={0.7} color="#b5d8d1" />
      <gridHelper args={[FIELD_SIZE, 18, '#294555', '#142631']} position={[0, -1.35, 0]} />
      {!activeSolitonConfig?.enabled && <SignalSourceArrows waves={waves} waveCount={waveCount} visible={sourceVectorsVisible} palette={classicalWavePalette} />}
      <SolitonChamberRig solitonConfig={activeSolitonConfig} solverStateRef={activeSolitonSolverRef} />
      {['single-slit', 'double-slit', 'grating'].includes(experimentMode) && <SlitScreen experimentMode={experimentMode} apertureSettings={apertureSettings} />}
      {experimentMode === 'pinhole' && <PinholeScreen />}
      {experimentMode === 'two-source' && <TwoSourceMarkers />}
      <WaveField waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} timeRef={timeRef} experimentMode={experimentMode} apertureField={apertureField} apertureSettings={apertureSettings} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} particleAppearance={particleAppearance} occlusionPreset={occlusionPreset} waveMechanics={waveMechanics} solitonConfig={activeSolitonConfig} solitonSolverRef={activeSolitonSolverRef} onSolitonTelemetry={activeOnSolitonTelemetry} showWaveRepresentation={showWaveRepresentation} showTensorGaussianSplatters={showTensorGaussianSplatters} classicalWavePalette={classicalWavePalette} superpositionPalette={superpositionPalette} oamSplatterPalette={oamSplatterPalette} />
      {showDetector && (experimentMode === 'field' || APERTURE_EXPERIMENT_MODES.includes(experimentMode)) && <ExperimentDetector key={`${experimentMode}:${detectorImplementation}`} implementation={detectorImplementation} experimentMode={experimentMode} waves={detectorWaves} waveCount={detectorWaves.length} interferenceModes={detectorInterferenceModes} apertureField={detectorApertureField} running={running} timeRef={timeRef} detectionTime={detectionTime} glowTime={glowTime} detectorBrightness={detectorBrightness} detectorPalette={detectorPalette} detectorMechanicsMode={detectorMechanicsMode} clearToken={detectorClear.token} maskEnabled={detectorMaskEnabled} pixelDensity={detectorPixelDensity} onResolutionChange={onDetectorResolutionChange} />}
      {showDetector && wignerMechanics.showOnDetector && <WignerMechanicsReadout label="DETECTOR WIGNER MOMENTS" position={[DOUBLE_SLIT_DETECTOR_X - 0.03, DETECTOR_TRANSVERSE_SPAN / 2 - 0.7, -DETECTOR_TRANSVERSE_SPAN / 2 + 0.8]} waves={detectorWaves} waveCount={detectorWaves.length} timeRef={timeRef} apertureField={detectorApertureField} quantities={wignerMechanics.quantities} />}
      {showWaveRepresentation && wignerMechanics.showOnWaveField && <WignerMechanicsReadout label="WAVE-FIELD WIGNER MOMENTS" position={[-8, 4.2, -8]} waves={waves} waveCount={waveCount} timeRef={timeRef} apertureField={apertureField} quantities={wignerMechanics.quantities} />}
      {showDetector && (experimentMode === 'field' || APERTURE_EXPERIMENT_MODES.includes(experimentMode)) && detectorOamReadout.enabled && detectorOamReadout.states.length > 0 && <DetectorOamReadout states={detectorOamReadout.states} />}
      <PerspectiveOrbitControls viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={orbitSettings} cameraParams={{ minDistance: 7, maxDistance: 32, enabled: orbitControlsVisible }} onUserInteraction={onManualInteraction} />
    </>
  );
}

function RangeControl({ label, value, min, max, step, onChange, suffix = '', editing = false, isDefault = true, onReset }) {
  return <NumericParamControl className="wave-range-control" label={label} value={value} min={min} max={max} step={step} suffix={suffix} editing={editing} isDefault={isDefault} onReset={onReset} onChange={onChange} />;
}

function WaveMechanicsOverlay({ value, onChange }) {
  return (
    <section className="wave-mechanics-overlay" aria-label="Optional wave mechanics">
      <span className="wave-section-label">OPTIONAL MECHANICS</span>
      <ParamSelect className="wave-select" label="Evolution" value={value.model} options={WAVE_EVOLUTION_OPTIONS} onChange={(model) => onChange({ ...value, model })} />
      <ParamSelect className="wave-select" label="EM splat mechanics" value={value.mechanicsRegime ?? 'classical'} options={SIMULATION_MECHANICS_REGIMES} onChange={(mechanicsRegime) => onChange({ ...value, mechanicsRegime })} />
      {value.mechanicsRegime === 'ddf-tensor-gaussian' && <>
        <RangeControl label="Tensor-Gaussian waist" value={value.tensorGaussianWaistM} min={0.1} max={100} step={0.1} onChange={(tensorGaussianWaistM) => onChange({ ...value, tensorGaussianWaistM })} />
        <RangeControl label="DDF dilatancy" value={value.ddfStrength} min={0} max={20} step={0.1} onChange={(ddfStrength) => onChange({ ...value, ddfStrength })} />
        <RangeControl label="DDF speed limit" value={value.ddfSpeedLimitMS} min={100} max={100000} step={100} suffix="m/s" onChange={(ddfSpeedLimitMS) => onChange({ ...value, ddfSpeedLimitMS })} />
        <RangeControl label="DDF base viscosity" value={value.ddfBaseViscosity} min={0} max={1} step={0.01} onChange={(ddfBaseViscosity) => onChange({ ...value, ddfBaseViscosity })} />
      </>}
      {value.mechanicsRegime === 'grassmannian-amplituhedron' && <>
        <RangeControl label="Positive-cell pole weight" value={value.grassmannianPoleWeight} min={0} max={1} step={0.01} onChange={(grassmannianPoleWeight) => onChange({ ...value, grassmannianPoleWeight })} />
        <RangeControl label="Amplituhedron acceleration coupling" value={value.geometryCoupling} min={0} max={0.25} step={0.005} onChange={(geometryCoupling) => onChange({ ...value, geometryCoupling })} />
      </>}
      {value.model === 'gpe' && <>
        <RangeControl label="Nonlinear coupling" value={value.nonlinearCoupling} min={0} max={1} step={0.01} onChange={(nonlinearCoupling) => onChange({ ...value, nonlinearCoupling })} />
        <RangeControl label="Directional dispersion" value={value.dispersion} min={0} max={1} step={0.01} onChange={(dispersion) => onChange({ ...value, dispersion })} />
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={value.showDifference} onChange={(event) => onChange({ ...value, showDifference: event.target.checked })} /><span>Color difference from linear</span></label>
        <p className="wave-description">Response overlay only; not a time-integrated GPE solver.</p>
      </>}
    </section>
  );
}

function VectorControl({ label, value, min, max, step, onChange, editing = false, isDefault = () => true, onReset = () => {} }) {
  return (
    <div className="wave-vector-control">
      <span className="wave-vector-label">{label}</span>
      <div className="wave-vector-axes">
        {['x', 'y', 'z'].map((axis) => (
          <RangeControl key={axis} label={axis.toUpperCase()} value={value?.[axis] ?? 0} min={min} max={max} step={step} editing={editing} isDefault={isDefault(axis)} onReset={() => onReset(axis)} onChange={(next) => onChange(axis, next)} />
        ))}
      </div>
    </div>
  );
}

const SOURCE_ORBIT_MODES = [
  { id: 'origin', label: 'Origin' },
  { id: 'direction', label: 'Direction' },
  { id: 'rotation', label: 'Rotation' }
];

const PARAMETER_PLACEMENTS = [
  { id: 'auto', label: 'Radial auto' },
  { id: 'above', label: 'Above' },
  { id: 'below', label: 'Below' },
  { id: 'outward', label: 'Radial outward' },
  { id: 'inward', label: 'Radial inward' }
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sourceOrbitValue(mode, wave) {
  if (mode === 'origin') {
    return {
      x: clamp((Number(wave.origin?.x) + 9) / 18, 0, 1),
      y: clamp((Number(wave.origin?.z) + 9) / 18, 0, 1)
    };
  }
  if (mode === 'direction') {
    const direction = wave.direction || DEFAULT_SIGNAL_DIRECTION;
    const azimuth = Math.atan2(Number(direction.z) || 0, Number(direction.x) || 1);
    const elevation = Math.atan2(Number(direction.y) || 0, Math.hypot(Number(direction.x) || 0, Number(direction.z) || 0));
    return { x: (azimuth + Math.PI) / (Math.PI * 2), y: 0.5 - elevation / Math.PI };
  }
  return {
    x: clamp((Number(wave.rotation?.y) + Math.PI) / (Math.PI * 2), 0, 1),
    y: clamp(0.5 - (Number(wave.rotation?.x) || 0) / (Math.PI * 2), 0, 1)
  };
}

function SourceOrbitControl({ wave, index, onChange, editing = false }) {
  const [mode, setMode] = useState('direction');
  const padRef = useRef(null);
  const draggingRef = useRef(false);
  const updateFromPointer = (event) => {
    const bounds = padRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const horizontal = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const vertical = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    if (mode === 'origin') {
      onChange('origin', { ...(wave.origin || DEFAULT_SIGNAL_ORIGIN), x: horizontal * 18 - 9, z: vertical * 18 - 9 });
      return;
    }
    if (mode === 'direction') {
      const azimuth = horizontal * Math.PI * 2 - Math.PI;
      const elevation = (0.5 - vertical) * Math.PI;
      const cosine = Math.cos(elevation);
      onChange('direction', { x: cosine * Math.cos(azimuth), y: Math.sin(elevation), z: cosine * Math.sin(azimuth) });
      return;
    }
    onChange('rotation', { ...(wave.rotation || DEFAULT_SIGNAL_ROTATION), x: (0.5 - vertical) * Math.PI * 2, y: (horizontal - 0.5) * Math.PI * 2 });
  };
  const handlePointerDown = (event) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };
  const handlePointerMove = (event) => {
    if (draggingRef.current) updateFromPointer(event);
  };
  const value = sourceOrbitValue(mode, wave);
  return (
    <div className="wave-source-orbit" data-source-orbit-mode={mode} aria-label={`Wave ${index + 1} source orbit controls`}>
      <div className="wave-source-orbit-heading"><span>Source orbit</span><strong>{mode}</strong></div>
      <div className="wave-source-orbit-modes" role="group" aria-label={`Wave ${index + 1} source orbit mode`}>
        {SOURCE_ORBIT_MODES.map((option) => <button key={option.id} type="button" className={mode === option.id ? 'active' : ''} aria-pressed={mode === option.id} onClick={() => setMode(option.id)}>{option.label}</button>)}
      </div>
      <div ref={padRef} className="wave-source-orbit-pad" role="application" aria-label={`${mode} source orbit pad`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={(event) => { draggingRef.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { draggingRef.current = false; }}>
        <span className="wave-source-orbit-crosshair" />
        <span className="wave-source-orbit-handle" style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />
      </div>
      {mode === 'origin' && <RangeControl label="Origin Y" value={wave.origin?.y ?? 0} min={-9} max={9} step={0.1} editing={editing} onChange={(next) => onChange('origin', { ...(wave.origin || DEFAULT_SIGNAL_ORIGIN), y: next })} />}
      {mode === 'rotation' && <RangeControl label="Rotation Z" value={wave.rotation?.z ?? 0} min={-3.15} max={3.15} step={0.05} suffix=" rad" editing={editing} onChange={(next) => onChange('rotation', { ...(wave.rotation || DEFAULT_SIGNAL_ROTATION), z: next })} />}
      <p className="wave-description">Drag the pad with a mouse or touch to edit this wave's {mode}.</p>
    </div>
  );
}

const SOLITON_SCENARIO_PRESETS = [
  {
    id: 'pool-kdv',
    label: 'Wave Pool KdV',
    patch: { enabled: true, domain: 'wave-pool', equation: 'kdv', fluidId: 'water', emissionSide: 'left', solitonCount: 2, bathymetryProfile: 'flat', tubularBreakerEnabled: false }
  },
  {
    id: 'pool-bilateral',
    label: 'Bilateral Pool Collision',
    patch: { enabled: true, domain: 'wave-pool', equation: 'boussinesq', fluidId: 'water', emissionSide: 'both', solitonCount: 2, bathymetryProfile: 'flat', tubularBreakerEnabled: false }
  },
  {
    id: 'tubular-surfing-reef',
    label: 'Tubular Surfing Reef',
    patch: { enabled: true, domain: 'wave-pool', equation: 'boussinesq', fluidId: 'water', emissionSide: 'left', solitonCount: 1, bathymetryProfile: 'surf-reef', bathymetryRelief: 0.62, bathymetryCenterX: 1.0, tubularBreakerEnabled: true, tubularCurlStrength: 0.95, showStillWaterDepth: true, showFloorBathymetry: true }
  },
  {
    id: 'vector-pair',
    label: 'Vector Soliton Pair',
    patch: { enabled: true, domain: 'wave-pool', equation: 'vector-coupled', fluidId: 'water', emissionSide: 'left', solitonCount: 2, vectorCoupling: 0.75, tubularBreakerEnabled: false }
  },
  {
    id: 'water-hdl-ldl-3-saddle',
    label: 'Water (HDL+LDL) 3-Saddle',
    patch: { enabled: true, domain: 'wave-pool', equation: 'boussinesq', fluidId: 'water-hdl-ldl', hdlLdlPathway: 'near-boundary-3-saddle', emissionSide: 'both', solitonCount: 2 }
  },
  {
    id: 'argon-plasma',
    label: 'Argon Ion-Acoustic Plasma',
    patch: { enabled: true, domain: 'plasma-wave', equation: 'kdv', fluidId: 'argon', emissionSide: 'left', solitonCount: 2, electronTempEv: 2.8, tubularBreakerEnabled: false }
  },
  {
    id: 'hydrogen-plasma',
    label: 'Hydrogen Magnetized Plasma',
    patch: { enabled: true, domain: 'plasma-wave', equation: 'boussinesq', fluidId: 'hydrogen', emissionSide: 'both', solitonCount: 2, magneticFieldT: 1.2, electronTempEv: 4.5, tubularBreakerEnabled: false }
  },
  {
    id: 'pool-cfd-2d',
    label: '2D Free-Surface CFD',
    patch: { enabled: true, domain: 'wave-pool', equation: 'cfd-2d', fluidId: 'water', emissionSide: 'both', solitonCount: 2, showCfdVelocityOverlay: true }
  }
];

function SolitonWaveControlsSection({ solitonConfig, solitonTelemetry, onSolitonConfigChange, onEmitPulse, onResetSoliton, editing = false }) {
  const config = normalizeSolitonConfig(solitonConfig);
  const physics = useMemo(() => deriveSolitonPhysicsParameters(config), [config]);
  const [checkRunCount, setCheckRunCount] = useState(0);
  const checkFiguresReport = useMemo(() => evaluateSolitonCheckFigures(config), [config, checkRunCount]);
  const telemetry = solitonTelemetry ?? {
    characteristicWaveSpeedMS: config.domain === 'plasma-wave' ? physics.ionSoundSpeedMS : physics.shallowWaterSpeedMS,
    machOrFroudeNumber: 1.18,
    peakAmplitude: config.solitons[0]?.amplitude ?? 0.72,
    viscousEnergyLossFraction: 0,
    debyeLengthM: physics.debyeLengthM,
    ionPlasmaFrequencyHz: physics.ionPlasmaFrequencyHz,
    alfvenSpeedMS: physics.alfvenSpeedMS,
    meanHdlFraction: physics.equilibriumHdlFraction,
    meanLdlFraction: physics.equilibriumLdlFraction,
    hdlLdlSaddlePoints: physics.pathway.saddlePoints,
    hdlLdlLoopTopology: physics.pathway.loopTopology,
    cfdGridLabel: '64x16',
    cfdMaxDivergence: 0,
    poolDepthM: config.poolDepthM,
    minLocalDepthM: config.poolDepthM * (1 - (config.bathymetryProfile === 'flat' ? 0 : config.bathymetryRelief)),
    maxBathymetryElevationM: config.poolDepthM * (config.bathymetryProfile === 'flat' ? 0 : config.bathymetryRelief),
    bathymetryProfile: config.bathymetryProfile,
    breakerIndexGamma: 0.42,
    iribarrenNumber: 0.85,
    breakerRegime: config.tubularBreakerEnabled ? 'Plunging / Tubular barrel' : 'Non-breaking solitary',
    stateSummary: config.domain === 'plasma-wave' ? physics.fluid.plasmaSummary : physics.fluid.stateSummary,
    caveat: physics.fluid.caveat
  };

  const updateConfig = (patch) => {
    onSolitonConfigChange(normalizeSolitonConfig({ ...config, ...patch }));
  };

  const updatePulse = (index, patch) => {
    const nextSolitons = config.solitons.map((item, idx) => idx === index ? { ...item, ...patch } : item);
    updateConfig({ solitons: nextSolitons });
  };

  return (
    <section
      className="wave-control-section wave-state-section wave-soliton-section"
      aria-label="Soliton and plasma wave controls"
      data-soliton-enabled={String(config.enabled)}
      data-soliton-domain={config.domain}
      data-soliton-equation={config.equation}
      data-soliton-fluid={config.fluidId}
      data-soliton-side={config.emissionSide}
      data-show-still-water-depth={String(config.showStillWaterDepth)}
      data-show-floor-bathymetry={String(config.showFloorBathymetry)}
      data-bathymetry-profile={config.bathymetryProfile}
      data-tubular-breaker={String(config.tubularBreakerEnabled)}
      data-check-figures-passed={`${checkFiguresReport.passedCount}/${checkFiguresReport.totalCount}`}
    >
      <span className="wave-section-label">SOLITON &amp; PLASMA WAVE LAB</span>
      <label className="wave-toggle wave-visualization-toggle">
        <input type="checkbox" checked={config.enabled} onChange={(event) => updateConfig({ enabled: event.target.checked })} />
        <span>Enable soliton / plasma wave solver</span>
      </label>
      <p className="wave-description">
        Simulate nonlinear KdV, bidirectional Boussinesq, coupled vector solitons, and optional 2D cross-section CFD across wave-pool fluids and ionized plasmas.
      </p>
      <div className="wave-actions wave-soliton-presets" role="group" aria-label="Soliton scenario presets">
        {SOLITON_SCENARIO_PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => updateConfig(preset.patch)}>
            {preset.label}
          </button>
        ))}
      </div>
      <ParamSelect className="wave-select" label="Soliton domain" value={config.domain} options={SOLITON_DOMAIN_OPTIONS} onChange={(domain) => updateConfig({ enabled: true, domain })} />
      <ParamSelect className="wave-select" label="Soliton equation" value={config.equation} options={SOLITON_EQUATION_OPTIONS} onChange={(equation) => updateConfig({ enabled: true, equation })} />
      {(() => {
        const solverInfo = getSolitonEquationDetails(config.equation);
        return (
          <div className="wave-description wave-soliton-solver-description" role="note" aria-label="Selected solver module description">
            <strong>{solverInfo.label}:</strong> {solverInfo.summary} <code>{solverInfo.formula}</code>{' '}
            <span>{config.domain === 'plasma-wave' ? solverInfo.plasmaUse : solverInfo.poolUse}</span>
          </div>
        );
      })()}
      <details className="wave-detector-notes wave-soliton-solver-catalog">
        <summary>Solver module descriptions</summary>
        {Object.values(SOLITON_EQUATION_DETAILS).map((moduleInfo) => (
          <div key={moduleInfo.id} className="wave-soliton-module-item" data-solver-module={moduleInfo.id}>
            <h3>{moduleInfo.label}</h3>
            <p><code>{moduleInfo.formula}</code></p>
            <p>{moduleInfo.summary}</p>
            <p><strong>Wave pool:</strong> {moduleInfo.poolUse}</p>
            <p><strong>Plasma wave:</strong> {moduleInfo.plasmaUse}</p>
          </div>
        ))}
      </details>
      <ParamSelect className="wave-select" label="Soliton fluid" value={config.fluidId} options={SOLITON_FLUID_OPTIONS} onChange={(fluidId) => updateConfig({ enabled: true, fluidId })} />
      <ParamSelect className="wave-select" label="Soliton emission side" value={config.emissionSide} options={SOLITON_EMISSION_SIDE_OPTIONS} onChange={(emissionSide) => updateConfig({ enabled: true, emissionSide })} />
      <ParamSelect className="wave-select" label="Soliton boundary" value={config.boundaryCondition} options={SOLITON_BOUNDARY_OPTIONS} onChange={(boundaryCondition) => updateConfig({ boundaryCondition })} />
      {config.equation === 'kdv' && config.emissionSide === 'both' && (
        <p className="wave-description" role="note">
          Standard KdV evolves in a single directional frame (two co-propagating solitons). Switch equation to Bidirectional Boussinesq or 2D CFD for head-on bilateral collisions.
        </p>
      )}
      <div className="wave-actions">
        <button type="button" onClick={() => { updateConfig({ enabled: true }); onEmitPulse(config.emissionSide); }}>Emit soliton pulse(s)</button>
        <button type="button" onClick={() => { updateConfig({ enabled: true }); onEmitPulse('left'); }}>Emit left</button>
        <button type="button" onClick={() => { updateConfig({ enabled: true }); onEmitPulse('right'); }}>Emit right</button>
        <button type="button" onClick={onResetSoliton}>Reset soliton solver</button>
      </div>
      {config.enabled && <>
        <RangeControl label="Soliton count" value={config.solitonCount} min={1} max={2} step={1} editing={editing} onChange={(solitonCount) => updateConfig({ solitonCount })} />
        <RangeControl label="Fluid viscosity scale" value={config.viscosityScale} min={0} max={5} step={0.05} suffix="x" editing={editing} onChange={(viscosityScale) => updateConfig({ viscosityScale })} />
        <RangeControl label="Nonlinear coupling scale" value={config.nonlinearScale} min={0.1} max={3} step={0.05} suffix="x" editing={editing} onChange={(nonlinearScale) => updateConfig({ nonlinearScale })} />
        <RangeControl label="Dispersion scale" value={config.dispersionScale} min={0.1} max={3} step={0.05} suffix="x" editing={editing} onChange={(dispersionScale) => updateConfig({ dispersionScale })} />
        {config.domain === 'wave-pool' ? <>
          <RangeControl label="Pool still-water depth" value={config.poolDepthM} min={0.4} max={5} step={0.1} suffix=" m" editing={editing} onChange={(poolDepthM) => updateConfig({ poolDepthM })} />
          <label className="wave-toggle wave-visualization-toggle">
            <input type="checkbox" checked={config.showStillWaterDepth} onChange={(event) => updateConfig({ showStillWaterDepth: event.target.checked })} />
            <span>Show pool still-water depth</span>
          </label>
          <RangeControl label="Pneumatic chamber pressure" value={config.pneumaticPressureKPa} min={5} max={120} step={1} suffix=" kPa" editing={editing} onChange={(pneumaticPressureKPa) => updateConfig({ pneumaticPressureKPa })} />
          <ParamSelect className="wave-select" label="Floor bathymetry profile" value={config.bathymetryProfile} options={SOLITON_BATHYMETRY_OPTIONS.map(({ value, label }) => ({ value, label }))} onChange={(bathymetryProfile) => updateConfig({ bathymetryProfile })} />
          <p className="wave-description">{getBathymetryProfileDetails(config.bathymetryProfile).description}</p>
          {config.bathymetryProfile !== 'flat' && <>
            <RangeControl label="Bathymetry reef / slope relief" value={config.bathymetryRelief} min={0} max={0.78} step={0.02} editing={editing} onChange={(bathymetryRelief) => updateConfig({ bathymetryRelief })} />
            <RangeControl label="Bathymetry reef center X" value={config.bathymetryCenterX} min={-6} max={6} step={0.2} suffix=" u" editing={editing} onChange={(bathymetryCenterX) => updateConfig({ bathymetryCenterX })} />
          </>}
          <label className="wave-toggle wave-visualization-toggle">
            <input type="checkbox" checked={config.showFloorBathymetry} onChange={(event) => updateConfig({ showFloorBathymetry: event.target.checked })} />
            <span>Show floor bathymetry mesh</span>
          </label>
          <label className="wave-toggle wave-visualization-toggle">
            <input type="checkbox" checked={config.tubularBreakerEnabled} onChange={(event) => updateConfig({ tubularBreakerEnabled: event.target.checked })} />
            <span>Enable tubular plunging wave curl</span>
          </label>
          {config.tubularBreakerEnabled && (
            <RangeControl label="Tubular barrel curl strength" value={config.tubularCurlStrength} min={0} max={1.5} step={0.05} suffix="x" editing={editing} onChange={(tubularCurlStrength) => updateConfig({ tubularCurlStrength })} />
          )}
          <details className="wave-detector-notes wave-tubular-surfing-guide">
            <summary>How to make tubular surfing waves</summary>
            <p><strong>1. Variable-depth shoaling bathymetry:</strong> Select <em>Submerged surfing reef</em> or <em>Sloping beach ramp</em>. As local depth h(x) decreases over the reef, linear phase speed c(x) = √(g h(x)) slows the wave base while Green’s law (η ∝ h⁻¹/⁴ to h⁻¹) amplifies crest height.</p>
            <p><strong>2. Nonlinear steepening vs. dispersion:</strong> Shallow water boosts quadratic steepening α(x) ∝ h(x)⁻³/² while reducing dispersive spreading β(x) ∝ h(x)⁵/², pitching the forward wave face vertical when the breaker index γ = H / h(x) approaches the McCowan limit (~0.78).</p>
            <p><strong>3. Plunging Iribarren regime &amp; multi-valued lip curl:</strong> Ocean barrels form when the Iribarren number ξ₀ = tan(β_reef) / √(H / L₀) lies in the plunging window (0.5 &lt; ξ₀ &lt; 3.3) so horizontal crest orbital velocity exceeds phase speed (u_crest &gt; c). Because 1D single-valued PDEs η(x,t) cannot overturn on their own, enabling <em>Tubular plunging wave curl</em> projects the steepened crest along a Lagrangian overturning lip arc around the hollow barrel core.</p>
          </details>
        </> : <>
          <RangeControl label="Electron temperature Te" value={config.electronTempEv} min={0.2} max={25} step={0.1} suffix=" eV" editing={editing} onChange={(electronTempEv) => updateConfig({ electronTempEv })} />
          <RangeControl label="Ion temperature Ti" value={config.ionTempEv} min={0.02} max={10} step={0.02} suffix=" eV" editing={editing} onChange={(ionTempEv) => updateConfig({ ionTempEv })} />
          <RangeControl label="Plasma density n0" value={config.plasmaDensity1e16M3} min={0.2} max={50} step={0.2} suffix=" e16/m³" editing={editing} onChange={(plasmaDensity1e16M3) => updateConfig({ plasmaDensity1e16M3 })} />
          <RangeControl label="Magnetic field B0" value={config.magneticFieldT} min={0} max={5} step={0.05} suffix=" T" editing={editing} onChange={(magneticFieldT) => updateConfig({ magneticFieldT })} />
          <RangeControl label="Magnetic wave angle" value={config.magneticAngleDeg} min={0} max={89} step={1} suffix=" deg" editing={editing} onChange={(magneticAngleDeg) => updateConfig({ magneticAngleDeg })} />
          <RangeControl label="Landau / collisional damping" value={config.landauDamping} min={0} max={0.25} step={0.005} suffix=" /s" editing={editing} onChange={(landauDamping) => updateConfig({ landauDamping })} />
        </>}
        {config.equation === 'vector-coupled' && <>
          <RangeControl label="Vector cross-coupling" value={config.vectorCoupling} min={-1.5} max={1.5} step={0.05} editing={editing} onChange={(vectorCoupling) => updateConfig({ vectorCoupling })} />
          <RangeControl label="Vector group mismatch" value={config.vectorGroupMismatch} min={-0.8} max={0.8} step={0.02} editing={editing} onChange={(vectorGroupMismatch) => updateConfig({ vectorGroupMismatch })} />
        </>}
        {config.equation === 'gardner-mkdv' && (
          <RangeControl label="Cubic nonlinearity" value={config.cubicNonlinearity} min={-2} max={2} step={0.05} editing={editing} onChange={(cubicNonlinearity) => updateConfig({ cubicNonlinearity })} />
        )}
        {config.fluidId === 'water-hdl-ldl' && <>
          <ParamSelect className="wave-select" label="HDL/LDL reaction pathway" value={config.hdlLdlPathway} options={WATER_HDL_LDL_PATHWAY_OPTIONS.map(({ value, label }) => ({ value, label }))} onChange={(hdlLdlPathway) => updateConfig({ hdlLdlPathway })} />
          <RangeControl label="HDL/LDL structural coupling" value={config.hdlLdlCoupling} min={0} max={1.5} step={0.05} editing={editing} onChange={(hdlLdlCoupling) => updateConfig({ hdlLdlCoupling })} />
          <RangeControl label="Supercooled temperature" value={config.hdlLdlTemperatureK} min={175} max={310} step={1} suffix=" K" editing={editing} onChange={(hdlLdlTemperatureK) => updateConfig({ hdlLdlTemperatureK })} />
          <RangeControl label="Hydrostatic pressure" value={config.hdlLdlPressureBar} min={1} max={2500} step={25} suffix=" bar" editing={editing} onChange={(hdlLdlPressureBar) => updateConfig({ hdlLdlPressureBar })} />
          <label className="wave-toggle wave-visualization-toggle">
            <input type="checkbox" checked={config.showHdlLdlOverlay} onChange={(event) => updateConfig({ showHdlLdlOverlay: event.target.checked })} />
            <span>Color field by HDL/LDL fraction</span>
          </label>
          <p className="wave-description">{getWaterHdlLdlPathwayDetails(config.hdlLdlPathway).citation}</p>
        </>}
        <label className="wave-toggle wave-visualization-toggle">
          <input type="checkbox" checked={config.showCfdVelocityOverlay} onChange={(event) => updateConfig({ showCfdVelocityOverlay: event.target.checked })} />
          <span>Show 2D CFD cross-section curtain</span>
        </label>
        {config.solitons.slice(0, config.solitonCount).map((pulse, index) => (
          <details key={index} className="wave-detector-model-params wave-soliton-pulse-editor" open={index === 0}>
            <summary>Soliton {index + 1} ({pulse.polarity > 0 ? 'Compressive / crest' : 'Rarefactive / trough'})</summary>
            <RangeControl label={`Soliton ${index + 1} amplitude`} value={pulse.amplitude} min={0.05} max={1.5} step={0.02} suffix=" u" editing={editing} onChange={(amplitude) => updatePulse(index, { amplitude })} />
            <RangeControl label={`Soliton ${index + 1} width`} value={pulse.width} min={0.45} max={4.5} step={0.05} suffix=" u" editing={editing} onChange={(width) => updatePulse(index, { width })} />
            <RangeControl label={`Soliton ${index + 1} offset`} value={pulse.positionOffset} min={-7.5} max={7.5} step={0.1} suffix=" u" editing={editing} onChange={(positionOffset) => updatePulse(index, { positionOffset })} />
            <RangeControl label={`Soliton ${index + 1} vector angle`} value={pulse.vectorAngleDeg} min={-90} max={90} step={1} suffix=" deg" editing={editing} onChange={(vectorAngleDeg) => updatePulse(index, { vectorAngleDeg })} />
            <ParamSelect className="wave-select" label={`Soliton ${index + 1} polarity`} value={String(pulse.polarity)} options={[{ value: '1', label: 'Compressive / elevation (+1)' }, { value: '-1', label: 'Rarefactive / depression (-1)' }]} onChange={(val) => updatePulse(index, { polarity: Number(val) })} />
          </details>
        ))}
        <div className="wave-soliton-telemetry" role="region" aria-label="Soliton and plasma telemetry">
          <div><span>Medium state</span><strong>{telemetry.stateSummary}</strong></div>
          <div>
            <span>{config.domain === 'plasma-wave' ? 'Ion sound speed cs' : 'Shallow-water speed c0'}</span>
            <strong>{telemetry.characteristicWaveSpeedMS.toFixed(1)} m/s</strong>
          </div>
          <div>
            <span>{config.domain === 'plasma-wave' ? 'Soliton Mach M' : 'Froude number Fr'}</span>
            <strong>{telemetry.machOrFroudeNumber.toFixed(2)}</strong>
          </div>
          <div><span>Peak amplitude</span><strong>{telemetry.peakAmplitude.toFixed(3)} u</strong></div>
          <div><span>Viscous loss</span><strong>{(telemetry.viscousEnergyLossFraction * 100).toFixed(1)}%</strong></div>
          {config.domain === 'wave-pool' && <>
            <div><span>Still-water / min reef depth</span><strong>{(telemetry.poolDepthM ?? config.poolDepthM).toFixed(2)} m · {(telemetry.minLocalDepthM ?? config.poolDepthM).toFixed(2)} m</strong></div>
            <div><span>Breaker index γ = H/h · ξ0</span><strong>{(telemetry.breakerIndexGamma ?? 0).toFixed(2)} · ξ0={(telemetry.iribarrenNumber ?? 0).toFixed(2)} ({telemetry.breakerRegime ?? 'Non-breaking solitary'})</strong></div>
          </>}
          {config.domain === 'plasma-wave' && <>
            <div><span>Debye length λDe</span><strong>{(telemetry.debyeLengthM * 1e6).toFixed(1)} μm</strong></div>
            <div><span>Ion plasma freq fpi</span><strong>{(telemetry.ionPlasmaFrequencyHz / 1e6).toFixed(2)} MHz</strong></div>
            <div><span>Alfvén speed vA</span><strong>{telemetry.alfvenSpeedMS.toFixed(0)} m/s</strong></div>
          </>}
          {config.fluidId === 'water-hdl-ldl' && <>
            <div><span>HDL / LDL fractions</span><strong>HDL {(telemetry.meanHdlFraction * 100).toFixed(1)}% · LDL {(telemetry.meanLdlFraction * 100).toFixed(1)}%</strong></div>
            <div><span>Reaction pathway</span><strong>{telemetry.hdlLdlLoopTopology} ({telemetry.hdlLdlSaddlePoints} {telemetry.hdlLdlSaddlePoints === 1 ? 'saddle point' : 'saddle points'})</strong></div>
          </>}
          {(config.equation === 'cfd-2d' || config.showCfdVelocityOverlay) && (
            <div><span>2D CFD ({telemetry.cfdGridLabel}) max |∇·u|</span><strong>{telemetry.cfdMaxDivergence.toFixed(3)}</strong></div>
          )}
          <div>
            <span>Validation check figures</span>
            <strong>{checkFiguresReport.passedCount} / {checkFiguresReport.totalCount} passed ({checkFiguresReport.allPassed ? 'VALIDATED' : 'CHECK'})</strong>
          </div>
        </div>
        <details className="wave-detector-notes wave-soliton-check-figures" aria-label="Soliton validation check figures">
          <summary>Validation check figures ({checkFiguresReport.passedCount}/{checkFiguresReport.totalCount} passed)</summary>
          <div className="wave-actions">
            <button type="button" onClick={() => setCheckRunCount((count) => count + 1)}>Re-verify check figures</button>
          </div>
          <div className="wave-detector-score-table-wrap">
            <table className="wave-detector-score-table wave-soliton-check-table">
              <caption>Canonical hydrodynamic, plasma, HDL+LDL, and 2D CFD check figures</caption>
              <thead>
                <tr>
                  <th>Benchmark</th>
                  <th>Reference</th>
                  <th>Model</th>
                  <th>|Δ| ≤ Tol</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {checkFiguresReport.results.map((item) => (
                  <tr key={item.id} data-check-figure={item.id} data-check-passed={String(item.passed)}>
                    <th>
                      <div>{item.title}</div>
                      <small>{item.equation}</small>
                    </th>
                    <td>{item.referenceValue.toFixed(4)} {item.unit}</td>
                    <td>{item.modelValue.toFixed(4)} {item.unit}</td>
                    <td>{item.error.toExponential(2)} ≤ {item.tolerance}</td>
                    <td>{item.passed ? 'PASS' : 'FAIL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {checkFiguresReport.results.map((item) => (
            <p key={item.id} className="wave-description">
              <strong>{item.title}:</strong> {item.description} <em>({item.liveNote})</em> [{item.citation}]
            </p>
          ))}
        </details>
        <p className="wave-description">{telemetry.caveat}</p>
      </>}
    </section>
  );
}

function WaveEditor({ wave, index, onChange, onDuplicate, onRemove, canDuplicate, canRemove, editing = false, isDefault = () => true, onResetPath = () => {}, classicalWavePalette = 'native', waveCount = MAX_WAVES }) {
  const [parameterPlacement, setParameterPlacement] = useState('auto');
  const update = (field, value) => onChange(index, { ...wave, [field]: value });
  const updateVector = (field, axis, value, fallback) => update(field, { ...(wave[field] || fallback), [axis]: value });
  const isHelical = (phaseMode) => phaseMode === 'Helical-Left' || phaseMode === 'Helical-Right';
  const changePhaseMode = (phaseMode) => onChange(index, {
    ...wave,
    phaseMode,
    ...(!isHelical(wave.phaseMode) && isHelical(phaseMode)
      ? { orbitalAngularMomentum: phaseMode === 'Helical-Right' ? -HELICAL_TOPOLOGICAL_CHARGE : HELICAL_TOPOLOGICAL_CHARGE }
      : {})
  });
  return (
    <details className="wave-editor" open={index < 3}>
      <summary><span className="wave-swatch" style={{ backgroundColor: paletteWaveColor(classicalWavePalette, index, waveCount) }} />Wave {index + 1}<strong>{wave.enabled ? 'ON' : 'OFF'} / {wave.phaseMode}{isHelical(wave.phaseMode) ? ` / OAM ℓ=${getOrbitalAngularMomentum(wave)}` : ''}</strong></summary>
      <div className="wave-editor-actions">
        <label className="wave-toggle"><input type="checkbox" checked={wave.enabled} onChange={(event) => update('enabled', event.target.checked)} /><span>{wave.enabled ? 'Enabled' : 'Disabled'}</span></label>
        <div className="wave-editor-buttons"><button type="button" onClick={() => onDuplicate(index)} disabled={!canDuplicate}>Duplicate</button><button type="button" className="wave-remove-button" onClick={() => onRemove(index)} disabled={!canRemove}>Remove</button></div>
      </div>
      <ParamSelect className="wave-select wave-parameter-placement" label="Parameter placement" ariaLabel={`Wave ${index + 1} parameter placement`} value={parameterPlacement} options={PARAMETER_PLACEMENTS.map((placement) => ({ value: placement.id, label: placement.label }))} onChange={setParameterPlacement} />
      <div className={`wave-editor-workbench placement-${parameterPlacement}`}>
        <SourceOrbitControl wave={wave} index={index} onChange={update} editing={editing} />
        <div className="wave-parameter-dock">
          <RangeControl label="Wavelength" value={wave.wavelength} min={0.01} max={12} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['waves', index, 'wavelength'])} onReset={() => onResetPath(['waves', index, 'wavelength'])} onChange={(value) => update('wavelength', value)} />
          <RangeControl label="Amplitude" value={wave.amplitude} min={0} max={1.5} step={0.01} editing={editing} isDefault={isDefault(['waves', index, 'amplitude'])} onReset={() => onResetPath(['waves', index, 'amplitude'])} onChange={(value) => update('amplitude', value)} />
          <RangeControl label="Decay rate" value={wave.decayRate ?? 0} min={0} max={1} step={0.01} suffix=" /u" editing={editing} isDefault={isDefault(['waves', index, 'decayRate'])} onReset={() => onResetPath(['waves', index, 'decayRate'])} onChange={(value) => update('decayRate', value)} />
          <RangeControl label="Phase offset" value={wave.phaseOffset} min={-Math.PI} max={Math.PI} step={0.01} suffix=" rad" editing={editing} isDefault={isDefault(['waves', index, 'phaseOffset'])} onReset={() => onResetPath(['waves', index, 'phaseOffset'])} onChange={(value) => update('phaseOffset', value)} />
          <RangeControl label="Phase rate" value={wave.phaseRate} min={-3} max={3} step={0.01} suffix=" /s" editing={editing} isDefault={isDefault(['waves', index, 'phaseRate'])} onReset={() => onResetPath(['waves', index, 'phaseRate'])} onChange={(value) => update('phaseRate', value)} />
          <ParamSelect className="wave-select" label="Phase mode" value={wave.phaseMode} options={PHASE_MODES} onChange={changePhaseMode} />
          {isHelical(wave.phaseMode) && <RangeControl label="OAM charge (ℓ)" value={getOrbitalAngularMomentum(wave)} min={OAM_CHARGE_MIN} max={OAM_CHARGE_MAX} step={1} editing={editing} isDefault={isDefault(['waves', index, 'orbitalAngularMomentum'])} onReset={() => onResetPath(['waves', index, 'orbitalAngularMomentum'])} onChange={(value) => update('orbitalAngularMomentum', value)} />}
          <ParamSelect className="wave-select" label="Polarization" value={wave.polarization ?? 'Scalar'} options={POLARIZATION_MODES} onChange={(value) => update('polarization', value)} />
          {(['Electromagnetic', 'EM-Tensor-Gaussian'].includes(wave.polarization)) && <RangeControl label="Beam waist" value={wave.beamWaist ?? DEFAULT_BEAM_WAIST} min={0.5} max={9} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['waves', index, 'beamWaist'])} onReset={() => onResetPath(['waves', index, 'beamWaist'])} onChange={(value) => update('beamWaist', value)} />}
          <VectorControl label="Signal origin" value={wave.origin} min={-9} max={9} step={0.1} editing={editing} isDefault={(axis) => isDefault(['waves', index, 'origin', axis])} onReset={(axis) => onResetPath(['waves', index, 'origin', axis])} onChange={(axis, value) => updateVector('origin', axis, value, DEFAULT_SIGNAL_ORIGIN)} />
          <VectorControl label="Signal direction" value={wave.direction} min={-1} max={1} step={0.05} editing={editing} isDefault={(axis) => isDefault(['waves', index, 'direction', axis])} onReset={(axis) => onResetPath(['waves', index, 'direction', axis])} onChange={(axis, value) => updateVector('direction', axis, value, DEFAULT_SIGNAL_DIRECTION)} />
          <VectorControl label="Signal rotation (XYZ)" value={wave.rotation} min={-3.15} max={3.15} step={0.05} editing={editing} isDefault={(axis) => isDefault(['waves', index, 'rotation', axis])} onReset={(axis) => onResetPath(['waves', index, 'rotation', axis])} onChange={(axis, value) => updateVector('rotation', axis, value, DEFAULT_SIGNAL_ROTATION)} />
        </div>
      </div>
    </details>
  );
}

function WavePanel({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, orbitControlsVisible, sourceVectorsVisible, sourcePreset, occlusionPreset, stateOptions, selectedState, stateDescription, stateName, stateMessage, paramsVisible, experimentMode, detectionTime, glowTime, apertureSettings, detectorVisible, detectorBrightness, detectorPalette, detectorMaskEnabled, detectorPixelDensity, detectorImplementation, onExperimentModeChange, onDetectionTime, onGlowTime, onApertureSettingsChange, onDetectorVisible, onDetectorBrightness, onDetectorPalette, onDetectorMaskEnabled, onDetectorPixelDensity, onDetectorImplementation, onSourcePreset, onOcclusionPreset, onStateChange, onStateName, onSaveState, onChange, onWaveCountChange, onInterferenceChange, onRunning, onReset, onDuplicate, onRemove, onDoubleSided, onParticleCount, onParticleSize, onParticleOpacity, onParticleShape, onParticleDerivativeOrder, onOrbitControls, onSourceVectors, showWaveRepresentation = true, showTensorGaussianSplatters = true, classicalWavePalette = 'native', superpositionPalette = 'native', oamSplatterPalette = 'native', onVisualizationChange = () => {}, editing = false, onEditing = () => {}, canUndo = false, canRedo = false, onUndo = () => {}, onRedo = () => {}, isDefault = () => true, onResetPath = () => {}, simulatorPresets = {}, currentSimulatorPreset = 'Default', simulatorPresetName = '', onSimulatorPresetName = () => {}, onApplySimulatorPreset = () => {}, onSaveSimulatorPreset = () => {}, currentValue = {}, jsonText = '', onJsonText = () => {}, onLoadJson = () => {}, onExport = () => {}, onDeleteSimulatorPresets = () => {}, showEditLog = false, onShowEditLog = () => {}, editLogYaml = '[]\n', onReplayLog = () => {}, replayMessage = '', replaying = false, journal = [], recording = false, onRecording = () => {}, playing = false, onTogglePlayback = () => {}, onStop = () => {}, playbackTime = 0, onPlaybackTime = () => {}, playbackSpeed = 1, onPlaybackSpeed = () => {} }) {
  const detectorClear = useContext(DetectorClearContext);
  const solitonContext = useContext(SolitonSimulatorContext);
  const detectorModelComparison = useContext(DetectorModelComparisonContext);
  const { scores: detectorComparisonScores } = useContext(DetectorComparisonScoreContext);
  const enabledCount = waves.slice(0, waveCount).filter((wave) => wave.enabled).length;
  const activeModeLabels = Object.entries(INTERFERENCE_MODES).filter(([mode]) => interferenceModes[mode]).map(([, details]) => details.label);
  const defaultSlitCount = experimentMode === 'single-slit' ? 1 : experimentMode === 'grating' ? GRATING_SLIT_CENTERS.length : DOUBLE_SLIT_CENTERS.length;
  const defaultSlitSpacing = experimentMode === 'grating' ? GRATING_SLIT_SPACING : Math.abs(DOUBLE_SLIT_CENTERS[1] - DOUBLE_SLIT_CENTERS[0]);
  const updateModelComparison = (patch) => onVisualizationChange('detectorModelComparison', { ...detectorModelComparison, ...patch });
  const updateModelSettings = (model, patch) => updateModelComparison({ [model]: { ...detectorModelComparison[model], ...patch } });
  const updateSlitScreenPosition = (axis, value) => {
    const field = `slitScreenPosition${axis.toUpperCase()}`;
    const position = {
      x: axis === 'x' ? value : apertureSettings.slitScreenPositionX,
      y: axis === 'y' ? value : apertureSettings.slitScreenPositionY,
      z: axis === 'z' ? value : apertureSettings.slitScreenPositionZ
    };
    onApertureSettingsChange({ ...apertureSettings, [field]: value, detectorDistance: detectorDistanceForSlitScreenPosition(position) });
  };
  const updateDetectorDistance = (distance) => {
    const position = { x: apertureSettings.slitScreenPositionX, y: apertureSettings.slitScreenPositionY, z: apertureSettings.slitScreenPositionZ };
    const offset = { x: position.x - DOUBLE_SLIT_DETECTOR_X, y: position.y, z: position.z };
    const currentDistance = Math.hypot(offset.x, offset.y, offset.z);
    const direction = currentDistance > 1e-8
      ? { x: offset.x / currentDistance, y: offset.y / currentDistance, z: offset.z / currentDistance }
      : { x: -1, y: 0, z: 0 };
    const nextPosition = {
      x: clamp(DOUBLE_SLIT_DETECTOR_X + direction.x * distance, -9, 9),
      y: clamp(direction.y * distance, -9, 9),
      z: clamp(direction.z * distance, -9, 9)
    };
    onApertureSettingsChange({
      ...apertureSettings,
      slitScreenPositionX: nextPosition.x,
      slitScreenPositionY: nextPosition.y,
      slitScreenPositionZ: nextPosition.z,
      detectorDistance: detectorDistanceForSlitScreenPosition(nextPosition)
    });
  };
  return (
    <aside className={`wave-panel ${paramsVisible ? '' : 'is-hidden'}`} aria-hidden={!paramsVisible} onPointerDown={(event) => event.stopPropagation()}>
      <div className="wave-panel-topline"><span className="wave-panel-kicker"><i /> WAVE FIELD / PHASE 01</span></div>
      <h2>Wave interference</h2>
      <p className="wave-intro">Compose one or more travelling, circular, and helical waves across a live field.</p>
      <div className="wave-status"><span><i /> {enabledCount} enabled / {waveCount} {waveCount === 1 ? 'wave slot' : 'wave slots'}</span><strong>{running ? 'RUNNING' : 'PAUSED'}</strong></div><div className="wave-editor-toolbar"><ParamEditingToggle checked={editing} onChange={onEditing} /><HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} /></div>
      <OrbitalTrackingParameters configuration={currentValue} className="wave-control-section wave-state-section" />
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">FIELD REPRESENTATION</span>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={showWaveRepresentation} onChange={(event) => onVisualizationChange('showWaveRepresentation', event.target.checked)} /><span>Show wave representation</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).showOnWaveField} onChange={(event) => onVisualizationChange('wignerMechanics', { ...(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS), showOnWaveField: event.target.checked })} /><span>Show Wigner mechanics on wave field</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={showTensorGaussianSplatters} onChange={(event) => onVisualizationChange('showTensorGaussianSplatters', event.target.checked)} /><span>Show EM tensor-Gaussian splatters</span></label>
        <PaletteParamControl label="Classical wave colors" value={classicalWavePalette} onChange={(value) => onVisualizationChange('classicalWavePalette', value)} />
        <PaletteParamControl label="Superposition particle colors" value={superpositionPalette} onChange={(value) => onVisualizationChange('superpositionPalette', value)} />
        <PaletteParamControl label="OAM splatter colors" value={oamSplatterPalette} onChange={(value) => onVisualizationChange('oamSplatterPalette', value)} />
      </section>
      <ParticleAppearanceSettings configuration={currentValue} className="wave-control-section wave-state-section" capabilities={{ shape: true, derivativeOrder: true, colorMode: true, color: true }} fields={[
        { key: 'sizeScale', path: 'particleSize', type: 'range', label: 'Particle size', min: 0.02, max: 0.4, step: 0.005, suffix: ' u' },
        { key: 'shape', path: 'particleShape', type: 'select', label: 'Particle shape', options: PARTICLE_SHAPES },
        { key: 'derivativeOrder', path: 'particleDerivativeOrder', type: 'range', label: 'Vector derivative order', min: 0, max: 4, step: 1 },
        { key: 'colorMode', path: 'particleAppearance.colorMode', type: 'select', label: 'Particle color mode', options: [{ value: 'native', label: 'Native / encoded' }, { value: 'custom', label: 'Custom tint' }] },
        { key: 'color', path: 'particleAppearance.color', type: 'color', label: 'Particle tint', disabled: currentValue.particleAppearance?.colorMode !== 'custom' },
        { key: 'opacity', path: 'particleOpacity', type: 'range', label: 'Particle opacity', min: 0.05, max: 1, step: 0.01 }
      ]} />
      <SimulatorPresetControls className="wave-control-section wave-state-section" selectClassName="wave-select wave-state-select" name={simulatorPresetName} onNameChange={onSimulatorPresetName} presets={simulatorPresets} currentPreset={currentSimulatorPreset} onApply={onApplySimulatorPreset} onSave={onSaveSimulatorPreset} />
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">WAVE STATES</span>
        <ParamSelect className="wave-select wave-state-select" label="Named state" value={selectedState} options={[...(selectedState === '' ? [{ value: '', label: 'Current field / unsaved' }] : []), ...stateOptions.map((state) => ({ value: state.name, label: state.name }))]} onChange={onStateChange} />
        {stateDescription && <p className="wave-description wave-state-description">{stateDescription}</p>}
        <div className="wave-state-save"><input value={stateName} onChange={(event) => onStateName(event.target.value)} placeholder="Name this wave state" aria-label="Name this wave state" /><button type="button" onClick={onSaveState} disabled={!stateName.trim()}>Save state</button></div>
        {stateMessage && <p className="wave-state-message" role="status">{stateMessage}</p>}
      </section>
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">SIGNAL SOURCE PRESETS</span>
        <ParamSelect className="wave-select wave-state-select" label="Source preset" value={sourcePreset} options={[{ value: '', label: 'Current field' }, ...SIGNAL_SOURCE_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))]} onChange={onSourcePreset} />
        {sourcePreset && <p className="wave-description wave-state-description">{SIGNAL_SOURCE_PRESETS.find((preset) => preset.id === sourcePreset)?.description}</p>}
      </section>
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">EXPERIMENT MODE</span>
        <ParamSelect className="wave-select wave-state-select" label="Experiment mode" value={experimentMode} options={[{ value: 'field', label: 'Wave field' }, { value: 'soliton-pool', label: 'Pneumatic wave pool solitons' }, { value: 'plasma-soliton', label: 'Plasma wave solitons' }, { value: 'single-slit', label: 'Single-slit diffraction' }, { value: 'double-slit', label: 'Double-slit experiment' }, { value: 'pinhole', label: 'Pinhole diffraction' }, { value: 'grating', label: 'Diffraction grating' }, { value: 'two-source', label: 'Two coherent sources' }]} onChange={onExperimentModeChange} />
        {APERTURE_EXPERIMENT_MODES.includes(experimentMode) && <>
          <p className="wave-description">{experimentMode === 'single-slit'
            ? 'A finite slit illuminates the full two-dimensional detector.'
            : experimentMode === 'double-slit'
              ? 'Coherent fields pass through two finite slits before the detector averages intensity.'
              : experimentMode === 'pinhole'
                ? 'A circular aperture is sampled across both transverse axes; the detector records its radial pattern.'
                : experimentMode === 'grating'
                  ? 'Five coherent slits produce narrow principal maxima on the detector.'
                  : 'Two in-phase sources interfere across the detector without a barrier.'}</p>
          {['single-slit', 'double-slit', 'grating'].includes(experimentMode) && <>
            <RangeControl label="Number of slits" value={apertureSettings.slitCount ?? defaultSlitCount} min={1} max={12} step={1} suffix=" slits" editing={editing} isDefault={isDefault(['apertureSettings', 'slitCount'])} onReset={() => onResetPath(['apertureSettings', 'slitCount'])} onChange={(slitCount) => onApertureSettingsChange({ ...apertureSettings, slitCount })} />
            <RangeControl label="Slit center spacing" value={apertureSettings.slitSpacing ?? defaultSlitSpacing} min={0.5} max={8} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitSpacing'])} onReset={() => onResetPath(['apertureSettings', 'slitSpacing'])} onChange={(slitSpacing) => onApertureSettingsChange({ ...apertureSettings, slitSpacing })} />
            <RangeControl label="Top/bottom wall margin" value={apertureSettings.slitWallMargin} min={0} max={APERTURE_SCREEN_HEIGHT / 2 - 0.05} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWallMargin'])} onReset={() => onResetPath(['apertureSettings', 'slitWallMargin'])} onChange={(slitWallMargin) => onApertureSettingsChange({ ...apertureSettings, slitWallMargin })} />
            <RangeControl label="Slit screen opacity" value={apertureSettings.slitOpacity} min={0} max={1} step={0.01} editing={editing} isDefault={isDefault(['apertureSettings', 'slitOpacity'])} onReset={() => onResetPath(['apertureSettings', 'slitOpacity'])} onChange={(slitOpacity) => onApertureSettingsChange({ ...apertureSettings, slitOpacity })} />
            <span className="wave-section-label">SLIT SCREEN POSITION</span>
            {['x', 'y', 'z'].map((axis) => {
              const field = `slitScreenPosition${axis.toUpperCase()}`;
              return <RangeControl key={field} label={`Screen ${axis.toUpperCase()} position`} value={apertureSettings[field]} min={-9} max={9} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', field])} onReset={() => onResetPath(['apertureSettings', field])} onChange={(value) => updateSlitScreenPosition(axis, value)} />;
            })}
            <RangeControl label="Slit-to-detector distance" value={apertureSettings.detectorDistance} min={0} max={21} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'detectorDistance'])} onReset={() => onResetPath(['apertureSettings', 'detectorDistance'])} onChange={updateDetectorDistance} />
            <span className="wave-section-label">SLIT SCREEN ROTATION</span>
            {['x', 'y', 'z'].map((axis) => {
              const field = `slitScreenRotation${axis.toUpperCase()}`;
              return <RangeControl key={field} label={`Screen rotation ${axis.toUpperCase()}`} value={apertureSettings[field]} min={-3.15} max={3.15} step={0.05} suffix=" rad" editing={editing} isDefault={isDefault(['apertureSettings', field])} onReset={() => onResetPath(['apertureSettings', field])} onChange={(value) => onApertureSettingsChange({ ...apertureSettings, [field]: value })} />;
            })}
          </>}
          {['single-slit', 'double-slit', 'grating'].includes(experimentMode) && <>
            <RangeControl label="Slit position" value={apertureSettings.slitPosition} min={-3} max={3} step={0.05} suffix=" z u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitPosition'])} onReset={() => onResetPath(['apertureSettings', 'slitPosition'])} onChange={(slitPosition) => onApertureSettingsChange({ ...apertureSettings, slitPosition })} />
            {experimentMode === 'double-slit' && <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={apertureSettings.slitWidthsLinked} onChange={(event) => onApertureSettingsChange({ ...apertureSettings, slitWidthsLinked: event.target.checked, ...(event.target.checked ? { slitWidthB: apertureSettings.slitWidthA } : {}) })} /><span>Link slit widths</span></label>}
            {experimentMode === 'double-slit' && !apertureSettings.slitWidthsLinked ? <>
              <RangeControl label="Left slit width" value={apertureSettings.slitWidthA} min={0} max={5} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWidthA'])} onReset={() => onResetPath(['apertureSettings', 'slitWidthA'])} onChange={(slitWidthA) => onApertureSettingsChange({ ...apertureSettings, slitWidthA })} />
              <RangeControl label="Right slit width" value={apertureSettings.slitWidthB} min={0} max={5} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWidthB'])} onReset={() => onResetPath(['apertureSettings', 'slitWidthB'])} onChange={(slitWidthB) => onApertureSettingsChange({ ...apertureSettings, slitWidthB })} />
            </> : <RangeControl label={experimentMode === 'grating' ? 'Grating slit width' : 'Slit width'} value={apertureSettings.slitWidthA} min={0.2} max={experimentMode === 'grating' ? 1.4 : experimentMode === 'double-slit' ? 2.4 : 3.6} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWidthA'])} onReset={() => onResetPath(['apertureSettings', 'slitWidthA'])} onChange={(slitWidthA) => onApertureSettingsChange({ ...apertureSettings, slitWidthA, ...(experimentMode === 'double-slit' ? { slitWidthB: slitWidthA } : {}) })} />}
          </>}
        </>}
        <span className="wave-section-label">DETECTOR SCREEN</span>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={detectorVisible} onChange={(event) => onDetectorVisible(event.target.checked)} /><span>Show detection screen</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).showOnDetector} onChange={(event) => onVisualizationChange('wignerMechanics', { ...(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS), showOnDetector: event.target.checked })} /><span>Show Wigner mechanics on detector</span></label>
        {((currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).showOnDetector || (currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).showOnWaveField) && <div className="wave-wigner-quantity-settings">
          <span className="wave-palette-label">Wigner quantities</span>
          <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).quantities.length === WIGNER_MECHANICS_QUANTITIES.length} onChange={(event) => onVisualizationChange('wignerMechanics', { ...(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS), quantities: event.target.checked ? [...WIGNER_MECHANICS_QUANTITIES] : [] })} /><span>All quantities</span></label>
          {WIGNER_MECHANICS_QUANTITIES.map((quantity) => <label className="wave-toggle wave-visualization-toggle" key={quantity}><input type="checkbox" checked={(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).quantities.includes(quantity)} onChange={(event) => {
            const settings = currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS;
            const quantities = event.target.checked
              ? [...new Set([...settings.quantities, quantity])]
              : settings.quantities.filter((selected) => selected !== quantity);
            onVisualizationChange('wignerMechanics', { ...settings, quantities });
          }} /><span>{WIGNER_MECHANICS_LABELS[quantity]}</span></label>)}
        </div>}
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={currentValue.showOamStatesOnDetector ?? false} onChange={(event) => onVisualizationChange('showOamStatesOnDetector', event.target.checked)} /><span>Show OAM states on detector</span></label>
        <div data-detector-mechanics={currentValue.detectorMechanicsMode ?? 'classical'}><ParamSelect className="wave-select" label="Detector mechanics" value={currentValue.detectorMechanicsMode ?? 'classical'} options={DETECTOR_MECHANICS_OPTIONS} onChange={(detectorMechanicsMode) => {
          onVisualizationChange('detectorMechanicsMode', detectorMechanicsMode);
          if (detectorMechanicsMode === 'wigner-function' && detectorModelComparison.showDifference) updateModelComparison({ showDifference: false });
        }} /></div>
        {['wigner-function', 'wigner-gpu'].includes(currentValue.detectorMechanicsMode) && <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS).showNegativeValues} onChange={(event) => onVisualizationChange('wignerMechanics', { ...(currentValue.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS), showNegativeValues: event.target.checked })} /><span>Show negative Wigner values</span></label>}
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={detectorModelComparison.enabled} onChange={(event) => updateModelComparison({ enabled: event.target.checked })} /><span>Compare detector models</span></label>
        {detectorModelComparison.enabled && <>
          <ParamSelect className="wave-select" label="Comparison reference model" value={detectorModelComparison.referenceModel} options={DETECTOR_COMPARISON_MODEL_OPTIONS} onChange={(referenceModel) => updateModelComparison({ referenceModel, ...(referenceModel === detectorModelComparison.candidateModel ? { candidateModel: DETECTOR_COMPARISON_MODELS.find((model) => model !== referenceModel) } : {}) })} />
          <ParamSelect className="wave-select" label="Comparison candidate model" value={detectorModelComparison.candidateModel} options={DETECTOR_COMPARISON_MODEL_OPTIONS} onChange={(candidateModel) => updateModelComparison({ candidateModel, ...(candidateModel === detectorModelComparison.referenceModel ? { referenceModel: DETECTOR_COMPARISON_MODELS.find((model) => model !== candidateModel) } : {}) })} />
          <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={detectorModelComparison.showDifference} disabled={currentValue.detectorMechanicsMode === 'wigner-function'} onChange={(event) => updateModelComparison({ showDifference: event.target.checked })} /><span>Show model difference on detector</span></label>
          <details className="wave-detector-model-params" open>
            <summary>Classical intensity parameters</summary>
            <RangeControl label="Classical detection time" value={detectorModelComparison.classical.detectionTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} onChange={(detectionTime) => updateModelSettings('classical', { detectionTime })} />
            <RangeControl label="Classical glow time" value={detectorModelComparison.classical.glowTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} onChange={(glowTime) => updateModelSettings('classical', { glowTime })} />
            <RangeControl label="Classical brightness" value={detectorModelComparison.classical.brightness} min={0.25} max={2.5} step={0.05} editing={editing} onChange={(brightness) => updateModelSettings('classical', { brightness })} />
          </details>
          <details className="wave-detector-model-params">
            <summary>Pilot-wave probability current parameters</summary>
            <RangeControl label="Pilot-wave detection time" value={detectorModelComparison.pilotWave.detectionTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} onChange={(detectionTime) => updateModelSettings('pilotWave', { detectionTime })} />
            <RangeControl label="Pilot-wave glow time" value={detectorModelComparison.pilotWave.glowTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} onChange={(glowTime) => updateModelSettings('pilotWave', { glowTime })} />
            <RangeControl label="Pilot-wave brightness" value={detectorModelComparison.pilotWave.brightness} min={0.25} max={2.5} step={0.05} editing={editing} onChange={(brightness) => updateModelSettings('pilotWave', { brightness })} />
          </details>
          <details className="wave-detector-model-params">
            <summary>Wigner (GPU) parameters</summary>
            <RangeControl label="Wigner (GPU) detection time" value={detectorModelComparison.wignerGpu.detectionTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} onChange={(detectionTime) => updateModelSettings('wignerGpu', { detectionTime })} />
            <RangeControl label="Wigner (GPU) glow time" value={detectorModelComparison.wignerGpu.glowTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} onChange={(glowTime) => updateModelSettings('wignerGpu', { glowTime })} />
            <RangeControl label="Wigner (GPU) brightness" value={detectorModelComparison.wignerGpu.brightness} min={0.25} max={2.5} step={0.05} editing={editing} onChange={(brightness) => updateModelSettings('wignerGpu', { brightness })} />
          </details>
          {detectorComparisonScores && <div className="wave-detector-score-table-wrap">
            <table className="wave-detector-ranking-table">
              <caption>Detector models ranked against {DETECTOR_MODEL_LABELS[detectorComparisonScores.referenceModel]} · lower is closer</caption>
              <thead><tr><th>Rank</th><th>Model</th><th>Relative difference</th><th>RMS difference</th></tr></thead>
              <tbody>{detectorComparisonScores.rankings.map(({ rank, model, scorePoints, rmsDifference }) => <tr key={model}>
                <th>{rank}</th><td>{DETECTOR_MODEL_LABELS[model]}</td><td>{scorePoints.toFixed(1)}%</td><td>{rmsDifference.toFixed(4)}</td>
              </tr>)}</tbody>
            </table>
            <table className="wave-detector-score-table">
              <caption>Reference: {DETECTOR_MODEL_LABELS[detectorComparisonScores.referenceModel]} · Compare: {DETECTOR_MODEL_LABELS[detectorComparisonScores.candidateModel]}</caption>
              <thead><tr><th>Difference score</th><th>Value</th></tr></thead>
              <tbody>
                <tr><th>RMS difference</th><td>{detectorComparisonScores.rmsDifference.toFixed(4)}</td></tr>
                <tr><th>Mean absolute difference</th><td>{detectorComparisonScores.meanAbsoluteDifference.toFixed(4)}</td></tr>
                <tr><th>Maximum absolute difference</th><td>{detectorComparisonScores.maximumAbsoluteDifference.toFixed(4)}</td></tr>
                <tr><th>Relative difference score</th><td>{detectorComparisonScores.scorePoints.toFixed(1)}%</td></tr>
                <tr><th>Detector samples</th><td>{detectorComparisonScores.sampleCount}</td></tr>
              </tbody>
            </table>
          </div>}
        </>}
        <ParamSelect className="wave-select" label="Detector phase mode" value={currentValue.detectorPhaseMode ?? 'all'} options={[{ value: 'all', label: 'All phase modes' }, ...PHASE_MODES]} onChange={(detectorPhaseMode) => onVisualizationChange('detectorPhaseMode', detectorPhaseMode)} />
        <RangeControl label="Detector phase value (offset)" value={currentValue.detectorPhaseValue ?? 0} min={-3.14} max={3.14} step={0.01} suffix=" rad" editing={editing} isDefault={isDefault('detectorPhaseValue')} onReset={() => onResetPath('detectorPhaseValue')} onChange={(detectorPhaseValue) => onVisualizationChange('detectorPhaseValue', detectorPhaseValue)} />
        <div className="wave-actions"><button type="button" onClick={detectorClear.clear}>Clear detector</button></div>
        {!detectorModelComparison.enabled && <>
          <RangeControl label="Detection time" value={detectionTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} isDefault={isDefault('detectionTime')} onReset={() => onResetPath('detectionTime')} onChange={onDetectionTime} />
          <RangeControl label="Glow time" value={glowTime} min={0.1} max={100} step={0.1} suffix=" s" editing={editing} isDefault={isDefault('glowTime')} onReset={() => onResetPath('glowTime')} onChange={onGlowTime} />
        </>}
        <ParamSelect className="wave-select" label="Detector implementation" value={experimentMode === 'field' ? 'classic' : detectorImplementation} options={experimentMode === 'field' ? [DETECTOR_IMPLEMENTATION_OPTIONS[0]] : DETECTOR_IMPLEMENTATION_OPTIONS} onChange={onDetectorImplementation} />
        {!detectorModelComparison.enabled && <RangeControl label="Detector brightness" value={detectorBrightness} min={0.25} max={2.5} step={0.05} editing={editing} isDefault={isDefault('detectorBrightness')} onReset={() => onResetPath('detectorBrightness')} onChange={onDetectorBrightness} />}
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={detectorMaskEnabled} onChange={(event) => onDetectorMaskEnabled(event.target.checked)} /><span>Mask outside wall-height band</span></label>
        <RangeControl label="Detector pixel density" value={detectorPixelDensity} min={0.5} max={4} step={0.25} suffix="x" editing={editing} isDefault={isDefault('detectorPixelDensity')} onReset={() => onResetPath('detectorPixelDensity')} onChange={onDetectorPixelDensity} />
        <div className="wave-palette-control">
          <span className="wave-palette-label">Detector palette</span>
          <div className="wave-palette-options" role="group" aria-label="Detector palette">
            {DETECTOR_PALETTES.map((palette) => <button key={palette.value} type="button" aria-label={palette.label} aria-pressed={detectorPalette === palette.value} className={detectorPalette === palette.value ? 'active' : ''} onClick={() => onDetectorPalette(palette.value)}>
              <span aria-hidden="true" className="wave-palette-swatch" style={{ background: `linear-gradient(90deg, ${palette.stops.join(', ')})` }} />
              <span>{palette.label}</span>
            </button>)}
          </div>
        </div>
      </section>
      <details className="wave-detector-notes">
        <summary>Detector model notes</summary>
        <h3>Mechanics</h3>
        <p>Aperture experiments sample finite opening points and add their propagated, polarization-projected electric fields coherently at each detector pixel. Wave field mode instead evaluates the configured wave field directly at the detector plane; it uses the Classic pixels implementation. In both paths, the displayed signal is squared field magnitude with exponential exposure averaging and a separate glow-persistence response.</p>
        <p>Pilot-wave probability-current mode colors the detector by positive forward flow, Im(ψ* ∂xψ), normalized by the amplitude-weighted reference wave number. It is a scalar guidance-current visualization, not calibrated particle-count data.</p>
        <p>Wigner mechanics reports local phase-space moments in ħ=1 units: position, phase-gradient momentum, orbital rotation r×p, and symmetric momentum shear. It is a local moment readout, not a reconstruction of the full signed Wigner quasidistribution. Detector OAM receipt lists enabled helical waves after the detector phase filter.</p>
        <p>Classic pixels evaluates a 48x48 base grid on the CPU. Native resolution (GPU) evaluates one texel per canvas drawing-buffer pixel and is available for aperture experiments. Pixel density scales both axes, so 2x density uses 4x as many pixels. The visibility toggle only hides the display; it does not disable wave propagation. The optional detector mask darkens pixels outside the 3.2-unit wall-height band.</p>
        <p>Slit screens support 1 to 12 centered openings. Their automatic layouts are one slit, two slits 4.2 units apart, or five grating slits 1.6 units apart; count and center spacing can override those layouts. Width is constrained to fit between neighboring slits. The top/bottom wall-margin control shortens every opening equally and adds matching occluding bars; slit position shifts the full array. Side walls, margin bars, and opening geometry share one visual opacity, default 0.2. Opacity changes appearance only; the propagation mask remains fully blocking outside the clear apertures.</p>
        <p>Screen translation (X/Y/Z) and rotation (X/Y/Z, radians) affect the visible wall, aperture-source locations, and propagation mask using the same ZYX Euler transform. The detector center remains fixed at (7.2, 0, 0). Its distance control moves the screen along its current direction from the detector; editing any screen position coordinate recalculates the center-to-center distance.</p>
        <p>Slit-screen XYZ position and Euler rotation are shared by the visible mask, world-space aperture sources, and propagation occlusion. The detector stays anchored at (7.2, 0, 0); its distance is the center-to-center distance. Moving the screen updates that distance, while editing distance moves the screen along its current radial direction.</p>
        <h3>Limitations</h3>
        <p>This is a Huygens-style point-source approximation, not a full Maxwell boundary-value solver. Wave field mode squares its configured displacement vector as a visualization signal; it is not a calibrated detector energy-flux measurement. The finite aperture grid, idealized screen, normalized display intensity, and nonphysical glow do not model calibrated power, a material sensor, photon shot noise, or dark counts.</p>
        <h3>Opportunities</h3>
        <p>Increase and converge aperture sampling; compare against analytic Fresnel/Fraunhofer solutions; validate against a vector electromagnetic solver; and add a selectable sensor response with calibrated units and optional photon-count statistics.</p>
        <h3>Tensor-Gaussian splatters</h3>
        <p>For a unit propagation direction n and B = n x E in the model's c=1 units, the spatial plane-wave stress tensor reduces to T = -|E|^2 n n^T. Its lab-frame Frobenius norm is |E|^2, so the splatter weight is clamp(|E|^2, 0, 1) times the beam Gaussian. This is not a Lorentz-invariant amplitude measure. The plane wave's Lorentz invariants E dot B and B^2 - E^2 vanish; unit tests check those null-field identities offline, not per particle during rendering.</p>
        <p>The particle hot path avoids constructing and normalizing all nine tensor components, shares one electromagnetic field evaluation between displacement and splatter strength, and skips splatter accumulation for non-tensor waves. A local 16,384-particle microbenchmark measured about 3x speedup versus separate field evaluations; results depend on hardware and wave mix. A future GPU particle pass could move per-particle phase, frame, beam, and splatter evaluation off the CPU.</p>
      </details>
      <section className="wave-control-section">
        <span className="wave-section-label">WAVE INTERFERENCE MODE</span>
        <p className="wave-description">{APERTURE_EXPERIMENT_MODES.includes(experimentMode) ? 'Field layers affect the particle display; the detector always measures coherent intensity.' : activeModeLabels.length > 0 ? activeModeLabels.join(' + ') : 'No interference layers are active; the field is flat.'}</p>
        <div className="wave-interference-modes">{Object.entries(INTERFERENCE_MODES).map(([mode, details]) => <label className="wave-toggle wave-interference-mode" key={mode}><input type="checkbox" checked={interferenceModes[mode]} onChange={(event) => onInterferenceChange(mode, event.target.checked)} /><span>{details.label}</span></label>)}</div>
      </section>
      <section className="wave-control-section" data-simulation-speed={currentValue.simulationSpeed ?? 1}>
        <span className="wave-section-label">FIELD RESPONSE</span>
        <div className="wave-frequency-controls">
          <RangeControl label="Simulation speed" value={currentValue.simulationSpeed ?? 1} min={0.1} max={4} step={0.1} suffix="x" editing={editing} isDefault={isDefault('simulationSpeed')} onReset={() => onResetPath('simulationSpeed')} onChange={(value) => onVisualizationChange('simulationSpeed', value)} />
          <label className="wave-toggle wave-current-hertz-toggle"><input type="checkbox" checked={currentValue.showCurrentHertz ?? false} onChange={(event) => onVisualizationChange('showCurrentHertz', event.target.checked)} /><span>Show current hertz</span></label>
        </div>
        {currentValue.showCurrentHertz && <div className="wave-current-hertz-readout" role="status" aria-label="Current wave frequencies">
          {waves.slice(0, waveCount).map((wave, index) => ({ wave, index })).filter(({ wave }) => wave.enabled !== false).map(({ wave, index }) => {
            const phaseRate = Number(wave.phaseRate) || 0;
            const frequencyHz = Math.abs(phaseRate * (currentValue.simulationSpeed ?? 1)) / (2 * Math.PI);
            return <div key={index}><span>Wave {index + 1}</span><strong>{frequencyHz.toFixed(3)} Hz{phaseRate < 0 ? ' · reverse phase' : ''}</strong></div>;
          })}
        </div>}
        <div className="wave-actions"><button type="button" onClick={onRunning}>{running ? 'Pause field' : 'Run field'}</button><button type="button" onClick={onReset}>Reset waves</button></div>
        <RangeControl label="Wave slots" value={waveCount} min={1} max={MAX_WAVES} step={1} editing={editing} isDefault={isDefault('waveCount')} onReset={() => onResetPath('waveCount')} onChange={onWaveCountChange} />
      </section>
      <section className="wave-control-section">
        <span className="wave-section-label">WAVE PARAMETERS</span>
        {waves.slice(0, waveCount).map((wave, index) => <WaveEditor key={index} wave={wave} index={index} onChange={onChange} onDuplicate={onDuplicate} onRemove={onRemove} canDuplicate={waveCount < MAX_WAVES} canRemove={waveCount > 1} editing={editing} isDefault={isDefault} onResetPath={onResetPath} classicalWavePalette={classicalWavePalette} waveCount={waveCount} />)}
      </section>
      <section className="wave-control-section">
        <span className="wave-section-label">VISUALIZATION</span>
        <RangeControl label="Particle count" value={particleCount} min={MIN_PARTICLE_COUNT} max={MAX_PARTICLE_COUNT} step={512} editing={editing} isDefault={isDefault('particleCount')} onReset={() => onResetPath('particleCount')} onChange={onParticleCount} />
        <RangeControl label="Particle size" value={particleSize} min={0.02} max={0.4} step={0.005} suffix=" u" editing={editing} isDefault={isDefault('particleSize')} onReset={() => onResetPath('particleSize')} onChange={onParticleSize} />
        <RangeControl label="Particle opacity" value={particleOpacity} min={0.05} max={1} step={0.01} editing={editing} isDefault={isDefault('particleOpacity')} onReset={() => onResetPath('particleOpacity')} onChange={onParticleOpacity} />
        <ParamSelect className="wave-select" label="Particle shape" value={particleShape} options={PARTICLE_SHAPES} onChange={onParticleShape} />
        {particleShape === 'vector' && <><RangeControl label="Vector derivative n" value={particleDerivativeOrder} min={0} max={4} step={1} editing={editing} isDefault={isDefault('particleDerivativeOrder')} onReset={() => onResetPath('particleDerivativeOrder')} onChange={onParticleDerivativeOrder} /><p className="wave-description">Vector direction follows the n-th spatial derivative of particle motion.</p></>}
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={doubleSided} onChange={(event) => onDoubleSided(event.target.checked)} /><span>Double-sided field</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={orbitControlsVisible} onChange={(event) => onOrbitControls(event.target.checked)} /><span>Allow moving camera</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={sourceVectorsVisible} onChange={(event) => onSourceVectors(event.target.checked)} /><span>Source vectors visible</span></label>
      </section>
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">OCCLUSION MAP PRESETS</span>
        <ParamSelect className="wave-select wave-state-select" label="Occlusion map" value={occlusionPreset} options={OCCLUSION_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))} onChange={onOcclusionPreset} />
        <p className="wave-description wave-state-description">{OCCLUSION_PRESETS.find((preset) => preset.id === occlusionPreset)?.description}</p>
      </section>
      <SolitonWaveControlsSection
        solitonConfig={currentValue.solitonConfig ?? solitonContext.config}
        solitonTelemetry={solitonContext.telemetry}
        onSolitonConfigChange={solitonContext.updateConfig}
        onEmitPulse={solitonContext.emitPulse}
        onResetSoliton={solitonContext.resetSolver}
        editing={editing}
      />
      <SimulatorIOJournal className="wave-io-journal" currentValue={currentValue} presets={simulatorPresets} jsonText={jsonText} onJsonText={onJsonText} onLoad={onLoadJson} onExport={onExport} onDeletePresets={onDeleteSimulatorPresets} showEditLog={showEditLog} onShowEditLog={onShowEditLog} editLogYaml={editLogYaml} onReplayLog={onReplayLog} replayMessage={replayMessage} replaying={replaying} journal={journal} recording={recording} onRecording={onRecording} playing={playing} onTogglePlayback={onTogglePlayback} onStop={onStop} playbackTime={playbackTime} onPlaybackTime={onPlaybackTime} playbackSpeed={playbackSpeed} onPlaybackSpeed={onPlaybackSpeed} />
    </aside>
  );
}

export default function WaveInterferenceSim({ onBack }) {
  const initialState = DEFAULT_WAVE_STATES.at(-1);
  const initialWaveState = cloneWaveState(initialState);
  const initialSnapshot = {
    waves: initialWaveState.waves,
    waveCount: initialWaveState.waveCount,
    interferenceModes: initialWaveState.interferenceModes,
    particleCount: E2E_PARTICLE_COUNT ?? DEFAULT_PARTICLE_COUNT,
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
    detectorModelComparison: {
      ...DEFAULT_DETECTOR_MODEL_COMPARISON,
      classical: { ...DEFAULT_DETECTOR_MODEL_COMPARISON.classical },
      pilotWave: { ...DEFAULT_DETECTOR_MODEL_COMPARISON.pilotWave },
      wignerGpu: { ...DEFAULT_DETECTOR_MODEL_COMPARISON.wignerGpu }
    },
    wignerMechanics: { ...DEFAULT_WIGNER_MECHANICS, quantities: [...DEFAULT_WIGNER_MECHANICS.quantities] },
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
    waveMechanics: { ...DEFAULT_WAVE_MECHANICS },
    solitonConfig: normalizeSolitonConfig(DEFAULT_SOLITON_CONFIG),
    ...DEFAULT_SIMULATOR_3D_PARAMETERS
  };
  const [simulatorPresets, setSimulatorPresets] = useState(() => readPresetLibrary(localStorage, WAVE_PRESET_STORAGE_KEY, { Default: initialSnapshot }));
  const [currentSimulatorPreset, setCurrentSimulatorPreset] = useState('Default');
  const [simulatorPresetName, setSimulatorPresetName] = useState('');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initialSnapshot, null, 2));
  const [showEditLog, setShowEditLog] = useState(false);
  const [replayMessage, setReplayMessage] = useState('');
  const [exportModal, setExportModal] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [waves, setWaves] = useState(() => initialWaveState.waves);
  const [waveCount, setWaveCount] = useState(initialWaveState.waveCount);
  const [interferenceModes, setInterferenceModes] = useState(initialWaveState.interferenceModes);
  const [sourcePreset, setSourcePreset] = useState('');
  const [occlusionPreset, setOcclusionPresetState] = useState('none');
  const [experimentMode, setExperimentModeState] = useState('field');
  const [detectionTime, setDetectionTime] = useState(1);
  const [glowTime, setGlowTime] = useState(3);
  const [apertureSettings, setApertureSettings] = useState(() => ({ ...DEFAULT_APERTURE_SETTINGS }));
  const [detectorVisible, setDetectorVisible] = useState(initialSnapshot.detectorVisible);
  const [detectorClearToken, setDetectorClearToken] = useState(0);
  const [detectorComparisonScores, setDetectorComparisonScores] = useState(null);
  const [detectorBrightness, setDetectorBrightness] = useState(1);
  const [detectorPalette, setDetectorPalette] = useState(initialSnapshot.detectorPalette);
  const [detectorMaskEnabled, setDetectorMaskEnabled] = useState(initialSnapshot.detectorMaskEnabled);
  const [detectorPixelDensity, setDetectorPixelDensity] = useState(initialSnapshot.detectorPixelDensity);
  const [detectorImplementation, setDetectorImplementation] = useState(initialSnapshot.detectorImplementation);
  const [detectorResolution, setDetectorResolution] = useState('');
  const [particleCount, setParticleCount] = useState(E2E_PARTICLE_COUNT ?? DEFAULT_PARTICLE_COUNT);
  const [savedStates, setSavedStates] = useState(() => readSavedWaveStates());
  const [selectedState, setSelectedState] = useState(initialState.name);
  const [stateModified, setStateModified] = useState(false);
  const [stateName, setStateName] = useState('');
  const [stateMessage, setStateMessage] = useState('');
  const [running, setRunningState] = useState(initialSnapshot.running);
  const [doubleSided, setDoubleSided] = useState(true);
  const [particleSize, setParticleSize] = useState(0.075);
  const [particleOpacity, setParticleOpacity] = useState(0.9);
  const [particleShape, setParticleShape] = useState('circle');
  const [particleDerivativeOrder, setParticleDerivativeOrder] = useState(1);
  const [orbitControlsVisible, setOrbitControlsVisible] = useState(true);
  const [sourceVectorsVisible, setSourceVectorsVisible] = useState(true);
  const [waveMechanics, setWaveMechanicsState] = useState(() => ({ ...initialSnapshot.waveMechanics }));
  const [solitonConfig, setSolitonConfigState] = useState(() => normalizeSolitonConfig(initialSnapshot.solitonConfig));
  const solitonSolverRef = useRef(null);
  if (!solitonSolverRef.current) {
    solitonSolverRef.current = createSolitonSolverState(initialSnapshot.solitonConfig);
  }
  const [solitonTelemetry, setSolitonTelemetry] = useState(() => solitonSolverRef.current.telemetry);
  const [paramsVisible, setParamsVisible] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [editing, setEditing] = useState(false);
  const waveEditor = useSimulationEditor({ ...initialSnapshot, waves, waveCount, interferenceModes, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, orbitControlsVisible, sourceVectorsVisible, occlusionPreset, experimentMode, detectionTime, glowTime, apertureSettings, detectorVisible, detectorBrightness, detectorPalette, detectorMaskEnabled, detectorPixelDensity, detectorImplementation, running, waveMechanics, solitonConfig }, { recordParameterEdits: true });
  const setRunning = (nextValue) => {
    const next = typeof nextValue === 'function' ? nextValue(running) : nextValue;
    setRunningState(next);
    waveEditor.commit((current) => ({ ...current, running: next }));
  };
  const setWaveMechanics = (next) => {
    setWaveMechanicsState(next);
    waveEditor.commit((current) => ({ ...current, waveMechanics: next }));
  };
  const updateSolitonConfig = (nextRaw) => {
    const next = normalizeSolitonConfig(nextRaw);
    setSolitonConfigState(next);
    solitonSolverRef.current = createSolitonSolverState(next);
    setSolitonTelemetry(solitonSolverRef.current.telemetry);
    waveEditor.commit((current) => ({
      ...current,
      solitonConfig: next,
      experimentMode: next.enabled
        ? (next.domain === 'plasma-wave' ? 'plasma-soliton' : 'soliton-pool')
        : (['soliton-pool', 'plasma-soliton'].includes(current.experimentMode) ? 'field' : current.experimentMode)
    }));
  };
  const emitSolitonPulse = (side) => {
    if (!solitonSolverRef.current) {
      solitonSolverRef.current = createSolitonSolverState(solitonConfig);
    }
    triggerSolitonLauncherImpulse(solitonSolverRef.current, solitonConfig, side);
    setSolitonTelemetry({ ...solitonSolverRef.current.telemetry });
  };
  const resetSolitonSolver = () => {
    solitonSolverRef.current = createSolitonSolverState(solitonConfig);
    setSolitonTelemetry({ ...solitonSolverRef.current.telemetry });
  };
  const { canUndo, canRedo, undo, redo, log } = waveEditor;
  const journal = useSimulatorJournal({ initialSnapshot, playbackSpeed, onApplySnapshot: (snapshot) => waveEditor.replace(normalizeWaveSnapshot(snapshot, initialSnapshot)) });
  const previousSnapshotRef = useRef(waveEditor.value);
  const previousLogSequenceRef = useRef(log.at(-1)?.sequence ?? 0);
  useUndoRedoShortcuts({ undo, redo, canUndo, canRedo, isTextEditing: (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) });
  useEffect(() => {
    const next = waveEditor.value;
    setJsonText(JSON.stringify(next, null, 2));
    if (previousSnapshotRef.current !== next) {
      previousSnapshotRef.current = next;
      const latestEvent = log.at(-1);
      const replayResult = journal.record(next, latestEvent?.path || latestEvent?.type || 'configuration', latestEvent?.value);
      if (replayResult !== 'replay') {
        const sequence = latestEvent?.sequence ?? 0;
        if (sequence <= previousLogSequenceRef.current) waveEditor.record({ type: 'parameter-edit', path: 'configuration' });
        else previousLogSequenceRef.current = sequence;
      }
    }
    setWaves(next.waves);
    setWaveCount(next.waveCount);
    setInterferenceModes(next.interferenceModes);
    setParticleCount(next.particleCount);
    setDoubleSided(next.doubleSided);
    setParticleSize(next.particleSize);
    setParticleOpacity(next.particleOpacity);
    setParticleShape(next.particleShape);
    setParticleDerivativeOrder(next.particleDerivativeOrder);
    setOrbitControlsVisible(next.orbitControlsVisible);
    setSourceVectorsVisible(next.sourceVectorsVisible);
    setOcclusionPresetState(next.occlusionPreset);
    setExperimentModeState(next.experimentMode);
    setDetectionTime(next.detectionTime);
    setGlowTime(next.glowTime);
    setApertureSettings(next.apertureSettings);
    setDetectorVisible(next.detectorVisible ?? true);
    setDetectorBrightness(next.detectorBrightness);
    setDetectorPalette(next.detectorPalette ?? 'thermal');
    setDetectorMaskEnabled(next.detectorMaskEnabled ?? false);
    setDetectorPixelDensity(next.detectorPixelDensity ?? 1);
    setDetectorImplementation(next.detectorImplementation ?? 'classic');
    setRunningState(next.running ?? true);
    setWaveMechanicsState({ ...DEFAULT_WAVE_MECHANICS, ...next.waveMechanics });
    const nextSoliton = normalizeSolitonConfig(next.solitonConfig ?? DEFAULT_SOLITON_CONFIG);
    setSolitonConfigState((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(nextSoliton)) {
        solitonSolverRef.current = createSolitonSolverState(nextSoliton);
        setSolitonTelemetry(solitonSolverRef.current.telemetry);
      }
      return nextSoliton;
    });
  }, [waveEditor.value]);
  const setOcclusionPreset = (value) => {
    const experimentMode = EXPERIMENT_MODE_BY_PRESET[value];
    if (experimentMode) {
      waveEditor.commit((current) => ({ ...current, occlusionPreset: value, experimentMode, solitonConfig: { ...normalizeSolitonConfig(current.solitonConfig), enabled: false } }));
      markStateModified();
      return;
    }
    waveEditor.commit((current) => ({ ...current, occlusionPreset: value, experimentMode: 'field', detectorImplementation: 'classic', solitonConfig: { ...normalizeSolitonConfig(current.solitonConfig), enabled: false } }));
    markStateModified();
  };
  const sourceFrame = calculateWaveFrame(waves.slice(0, waveCount).find((wave) => wave.enabled !== false) || waves[0]);

  const markStateModified = () => {
    setSourcePreset('');
    setStateModified(true);
    setStateMessage('Current field has unsaved changes.');
  };
  const setExperimentMode = (mode) => {
    if (mode === 'soliton-pool' || mode === 'plasma-soliton') {
      const nextSoliton = normalizeSolitonConfig({
        ...solitonConfig,
        enabled: true,
        domain: mode === 'plasma-soliton' ? 'plasma-wave' : 'wave-pool'
      });
      solitonSolverRef.current = createSolitonSolverState(nextSoliton);
      setSolitonTelemetry(solitonSolverRef.current.telemetry);
      waveEditor.commit((current) => ({
        ...current,
        experimentMode: mode,
        occlusionPreset: 'none',
        solitonConfig: nextSoliton
      }));
      setSourcePreset('');
      setSelectedState('');
      setStateModified(false);
      setStateMessage(mode === 'plasma-soliton' ? 'Loaded Plasma wave solitons.' : 'Loaded Pneumatic wave pool solitons.');
      return;
    }
    const experimentStateName = EXPERIMENT_STATE_NAMES[mode];
    if (experimentStateName) {
      const state = DEFAULT_WAVE_STATES.find((item) => item.name === experimentStateName);
      if (!state) return;
      const next = cloneWaveState(state);
      waveEditor.load((current) => ({ ...current, waves: next.waves, waveCount: next.waveCount, interferenceModes: next.interferenceModes, occlusionPreset: EXPERIMENT_PRESET_IDS[mode] ?? 'none', experimentMode: mode, solitonConfig: { ...normalizeSolitonConfig(current.solitonConfig), enabled: false } }));
      setSourcePreset('');
      setSelectedState(state.name);
      setStateModified(false);
      setStateMessage(`Loaded ${state.name}.`);
      return;
    }
    waveEditor.commit((current) => ({ ...current, occlusionPreset: 'none', experimentMode: 'field', detectorImplementation: 'classic', solitonConfig: { ...normalizeSolitonConfig(current.solitonConfig), enabled: false } }));
    setSourcePreset('');
    setSelectedState('');
    setStateModified(true);
    setStateMessage('Current field has unsaved changes.');
  };
  const updateWave = (index, wave) => {
    waveEditor.commit((current) => ({ ...current, waves: current.waves.map((item, itemIndex) => itemIndex === index ? wave : item) }));
    markStateModified();
  };
  const updateWaveCount = (nextCount) => {
    waveEditor.commit((current) => ({ ...current, waveCount: nextCount }));
    markStateModified();
  };
  const updateSetting = (key, value) => {
    waveEditor.commit((current) => ({ ...current, [key]: value }));
    markStateModified();
  };
  const updateApertureSettings = (value) => {
    waveEditor.commit((current) => ({ ...current, apertureSettings: normalizeApertureSettings(value) }));
    markStateModified();
  };
  const updateInterference = (mode, value) => {
    waveEditor.commit((current) => ({ ...current, interferenceModes: { ...current.interferenceModes, [mode]: value } }));
    markStateModified();
  };
  const duplicateWave = (index) => {
    if (waveCount >= MAX_WAVES) return;
    waveEditor.commit((current) => ({
      ...current,
      waves: [...current.waves.slice(0, index + 1), { ...current.waves[index] }, ...current.waves.slice(index + 1, MAX_WAVES - 1)],
      waveCount: current.waveCount + 1
    }));
    markStateModified();
  };
  const removeWave = (index) => {
    if (waveCount <= 1) return;
    if (!window.confirm(`Remove Wave ${index + 1}? This cannot be undone.`)) return;
    waveEditor.commit((current) => ({
      ...current,
      waves: [...current.waves.slice(0, index), ...current.waves.slice(index + 1, current.waveCount), { ...current.waves[index], enabled: false }, ...current.waves.slice(current.waveCount, MAX_WAVES)],
      waveCount: current.waveCount - 1
    }));
    markStateModified();
  };
  const applyState = (state) => {
    const next = cloneWaveState(state);
    const experimentMode = EXPERIMENT_MODE_BY_STATE[state.name];
    waveEditor.load((current) => ({
      ...current,
      waves: next.waves,
      waveCount: next.waveCount,
      interferenceModes: next.interferenceModes,
      solitonConfig: { ...normalizeSolitonConfig(current.solitonConfig), enabled: false },
      ...(experimentMode ? { occlusionPreset: EXPERIMENT_PRESET_IDS[experimentMode] ?? 'none', experimentMode } : { experimentMode: 'field' })
    }));
  };
  const onSourcePreset = (id) => {
    if (!id) {
      setSourcePreset('');
      return;
    }
    const next = SIGNAL_SOURCE_PRESETS.find((preset) => preset.id === id);
    if (!next) return;
    applyState(next);
    setSourcePreset(id);
    setSelectedState('');
    setStateModified(false);
    setStateMessage(`Loaded ${next.name}.`);
  };
  const stateOptions = [...DEFAULT_WAVE_STATES, ...Object.values(savedStates)];
  const selectedStateValue = stateModified ? '' : selectedState;
  const selectedStateDetails = stateOptions.find((state) => state.name === selectedState);
  const paramEditLogYaml = useMemo(() => serializeParameterEditLog(log), [log]);
  const onStateChange = (name) => {
    const next = stateOptions.find((state) => state.name === name);
    if (!next) return;
    applyState(next);
    setSourcePreset('');
    setSelectedState(name);
    setStateModified(false);
    setStateMessage(`Loaded ${name}.`);
  };
  const onSaveState = () => {
    const name = stateName.trim();
    if (!name) return;
    if (DEFAULT_WAVE_STATES.some((state) => state.name === name)) {
      setStateMessage('Choose a name that is not a built-in state.');
      return;
    }
    const current = waveEditor.value;
    const nextState = cloneWaveState({ name, description: '', waves: current.waves, waveCount: current.waveCount, interferenceModes: current.interferenceModes });
    const nextSavedStates = { ...savedStates, [name]: nextState };
    setSavedStates(nextSavedStates);
    setSelectedState(name);
    setStateModified(false);
    setStateName('');
    setStateMessage(`Saved ${name}.`);
    try {
      writeSavedWaveStates(nextSavedStates);
    } catch {
      setStateMessage('State is available for this session but could not be saved locally.');
    }
  };
  const reset = () => {
    waveEditor.load(initialSnapshot);
    journal.reset(initialSnapshot);
    setSourcePreset('');
    setSelectedState(initialState.name);
    setStateModified(false);
    setStateMessage(`Loaded ${initialState.name}.`);
    setParamsVisible(true);
  };
  const applySimulatorPreset = (name) => {
    try {
      const next = normalizeWaveSnapshot(simulatorPresets[name], initialSnapshot);
      waveEditor.load(next, next, { type: 'preset-load', name });
      setCurrentSimulatorPreset(name);
      setSourcePreset('');
      setSelectedState('');
      setStateModified(true);
      setStateMessage(`Loaded ${name}.`);
    } catch (error) {
      setStateMessage(`Could not load snapshot: ${error.message}`);
    }
  };
  const saveSimulatorPreset = () => {
    const name = simulatorPresetName.trim();
    if (!name) return;
    const nextPresets = { ...simulatorPresets, [name]: waveEditor.value };
    setSimulatorPresets(nextPresets);
    setCurrentSimulatorPreset(name);
    setSimulatorPresetName('');
    waveEditor.record({ type: 'preset-save', name });
    setStateMessage(writePresetLibrary(localStorage, WAVE_PRESET_STORAGE_KEY, nextPresets) ? `Saved ${name}.` : 'Snapshot could not be saved locally.');
  };
  const loadSimulatorJson = () => {
    try {
      const next = normalizeWaveSnapshot(parseSimulatorJson(jsonText), initialSnapshot);
      waveEditor.load(next, next, { type: 'preset-load', name: 'JSON import' });
      setCurrentSimulatorPreset('JSON draft');
      setSourcePreset('');
      setSelectedState('');
      setStateModified(true);
      setStateMessage('Loaded JSON snapshot.');
    } catch (error) {
      setStateMessage(`Could not load JSON snapshot: ${error.message}`);
    }
  };
  const deleteSimulatorPresets = () => {
    deletePresetLibrary(localStorage, WAVE_PRESET_STORAGE_KEY);
    setSimulatorPresets({ Default: initialSnapshot });
    setCurrentSimulatorPreset('Default');
    setStateMessage('Local snapshots deleted.');
  };
  const replayParameterLog = (text, options) => {
    try {
      const entries = buildParameterReplayJournal(initialSnapshot, parseParameterEditLogYaml(text), options);
      if (!journal.replayJournal(entries)) throw new Error('No replayable parameter edits were found.');
      setReplayMessage(`Replaying ${entries.length - 1} parameter edits.`);
    } catch (error) {
      setReplayMessage(`Could not replay parameter log: ${error.message}`);
    }
  };
  const exportSimulatorData = (type, value) => {
    setExportModal({
      title: type === 'all' ? 'All snapshots' : type === 'saved' ? 'Saved snapshots' : 'Current parameters',
      value: type === 'current' ? waveEditor.value : value
    });
  };
  const orbitalStates = waves.slice(0, waveCount)
    .map((wave, index) => ({ wave, index, charge: getOrbitalAngularMomentum(wave) }))
    .filter(({ wave }) => wave.enabled !== false && (wave.phaseMode === 'Helical-Left' || wave.phaseMode === 'Helical-Right'));

  return (
    <SolitonSimulatorContext.Provider value={{
      config: solitonConfig,
      solverRef: solitonSolverRef,
      telemetry: solitonTelemetry,
      setTelemetry: setSolitonTelemetry,
      updateConfig: updateSolitonConfig,
      emitPulse: emitSolitonPulse,
      resetSolver: resetSolitonSolver
    }}>
    <DetectorClearContext.Provider value={{ token: detectorClearToken, clear: () => setDetectorClearToken((token) => token + 1) }}>
    <WignerMechanicsContext.Provider value={waveEditor.value.wignerMechanics ?? DEFAULT_WIGNER_MECHANICS}>
    <DetectorModelComparisonContext.Provider value={waveEditor.value.detectorModelComparison ?? DEFAULT_DETECTOR_MODEL_COMPARISON}>
    <DetectorComparisonScoreContext.Provider value={{ scores: detectorComparisonScores, setScores: setDetectorComparisonScores }}>
    <DetectorMechanicsContext.Provider value={waveEditor.value.detectorMechanicsMode ?? 'classical'}>
    <DetectorPhaseFilterContext.Provider value={{ mode: waveEditor.value.detectorPhaseMode ?? 'all', value: waveEditor.value.detectorPhaseValue ?? 0 }}>
    <SimulationSpeedContext.Provider value={waveEditor.value.simulationSpeed ?? 1}>
    <DetectorVisibilityContext.Provider value={detectorVisible}>
    <PerspectiveCameraContext.Provider value={{ viewMode, orbitPlaying, orbitControlsVisible, orbitSettings: waveEditor.value, particleAppearance: waveEditor.value.particleAppearance, onManualInteraction: () => setViewMode(null) }}>
    <DetectorOamReadoutContext.Provider value={{ enabled: waveEditor.value.showOamStatesOnDetector, states: orbitalStates }}>
    <SimulatorBase className="wave-app" headerClassName="wave-topbar" brandClassName="wave-brand" markClassName="wave-mark" mark="WAV" title="WAVE FIELD LAB" subtitle="Phase geometry / interference study" meta="WEBGL / FIELD SYNTHESIS" metaClassName="wave-top-meta" homeUrl="/" onHome={onBack} homeClassName="wave-hide-button" parameterValue={waveEditor.value} presetValue={waveEditor.baseline} onParameterChange={(next) => waveEditor.commit(next)} actions={<><button type="button" className="wave-params-toggle" aria-pressed={paramsVisible} onClick={() => setParamsVisible((value) => !value)}>{paramsVisible ? 'Hide params' : 'Show params'}</button><button type="button" className="wave-run-toggle" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></>}>
      <div className="wave-scene" data-particle-count={particleCount} data-occlusion-preset={occlusionPreset} data-experiment-mode={experimentMode} data-detection-time={detectionTime} data-glow-time={glowTime} data-slit-position={apertureSettings.slitPosition} data-slit-width-a={apertureSettings.slitWidthA} data-slit-width-b={apertureSettings.slitWidthB} data-slit-widths-linked={apertureSettings.slitWidthsLinked} data-detector-brightness={detectorBrightness} data-detector-palette={detectorPalette} data-detector-mask={detectorMaskEnabled} data-detector-pixel-density={detectorPixelDensity} data-detector-implementation={detectorImplementation} data-detector-resolution={detectorResolution} data-orbit-controls={orbitControlsVisible} data-source-vectors={sourceVectorsVisible} data-source-frame={JSON.stringify({ origin: sourceFrame.origin, direction: sourceFrame.direction })}><Canvas camera={{ position: [11, 8, 12], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><WaveScene waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} occlusionPreset={occlusionPreset} orbitControlsVisible={orbitControlsVisible} sourceVectorsVisible={sourceVectorsVisible} waveMechanics={waveMechanics} experimentMode={experimentMode} detectionTime={detectionTime} glowTime={glowTime} apertureSettings={apertureSettings} detectorBrightness={detectorBrightness} detectorPalette={detectorPalette} detectorMaskEnabled={detectorMaskEnabled} detectorPixelDensity={detectorPixelDensity} detectorImplementation={detectorImplementation} onDetectorResolutionChange={setDetectorResolution} showWaveRepresentation={waveEditor.value.showWaveRepresentation} showTensorGaussianSplatters={waveEditor.value.showTensorGaussianSplatters} classicalWavePalette={waveEditor.value.classicalWavePalette} superpositionPalette={waveEditor.value.superpositionPalette} oamSplatterPalette={waveEditor.value.oamSplatterPalette} /></Canvas></div>
      <CameraPerspectiveToolbar className="simulator-perspective-toolbar" modesClassName="simulator-perspective-modes" viewMode={viewMode} orbitPlaying={orbitPlaying} onViewChange={setViewMode} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
      {orbitalStates.length > 0 && <aside className="wave-oam-readout" aria-label="Active orbital angular momentum states">
        <span className="wave-oam-kicker">ORBITAL STATES</span>
        <div className="wave-oam-state-list">{orbitalStates.map(({ index, charge }) => <span className="wave-oam-state" key={index}>W{index + 1} ℓ={charge > 0 ? `+${charge}` : charge}</span>)}</div>
        {orbitalStates.some(({ wave }) => wave.polarization === 'EM-Tensor-Gaussian') && !waveEditor.value.waveMechanics?.showDifference && <small>Hue: local helical phase / opacity: tensor weight</small>}
      </aside>}
      <section className="wave-title"><p>Animated phase experiment</p><h1>Shape the interference.</h1><span>Independent wavelength, amplitude, phase mode, and phase parameters for every active wave.</span></section>
      <WavePanel
        waves={waves}
        waveCount={waveCount}
        interferenceModes={interferenceModes}
        running={running}
        showWaveRepresentation={waveEditor.value.showWaveRepresentation}
        showTensorGaussianSplatters={waveEditor.value.showTensorGaussianSplatters}
        classicalWavePalette={waveEditor.value.classicalWavePalette}
        superpositionPalette={waveEditor.value.superpositionPalette}
        oamSplatterPalette={waveEditor.value.oamSplatterPalette}
        onVisualizationChange={(field, value) => waveEditor.commit((current) => ({ ...current, [field]: value }))}
        particleCount={particleCount}
        doubleSided={doubleSided}
        particleSize={particleSize}
        particleOpacity={particleOpacity}
        particleShape={particleShape}
        particleDerivativeOrder={particleDerivativeOrder}
        orbitControlsVisible={orbitControlsVisible}
        sourceVectorsVisible={sourceVectorsVisible}
        sourcePreset={sourcePreset}
        occlusionPreset={occlusionPreset}
        stateOptions={stateOptions}
        selectedState={selectedStateValue}
        stateDescription={stateModified ? '' : selectedStateDetails?.description}
        simulatorPresets={simulatorPresets}
        currentSimulatorPreset={currentSimulatorPreset}
        simulatorPresetName={simulatorPresetName}
        onSimulatorPresetName={setSimulatorPresetName}
        onApplySimulatorPreset={applySimulatorPreset}
        onSaveSimulatorPreset={saveSimulatorPreset}
        currentValue={waveEditor.value}
        jsonText={jsonText}
        onJsonText={setJsonText}
        onLoadJson={loadSimulatorJson}
        onExport={exportSimulatorData}
        onDeleteSimulatorPresets={deleteSimulatorPresets}
        showEditLog={showEditLog}
        onShowEditLog={setShowEditLog}
        editLogYaml={paramEditLogYaml}
        onReplayLog={replayParameterLog}
        replayMessage={replayMessage}
        replaying={journal.playing}
        journal={journal.journal}
        recording={journal.recording}
        onRecording={journal.setRecording}
        playing={journal.playing}
        onTogglePlayback={() => journal.setPlaying((value) => !value)}
        onStop={journal.stop}
        playbackTime={journal.playbackTime}
        onPlaybackTime={journal.seek}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeed={setPlaybackSpeed}
        stateName={stateName}
        stateMessage={stateMessage}
        paramsVisible={paramsVisible}
        experimentMode={experimentMode}
        detectorVisible={detectorVisible}
        detectionTime={detectionTime}
        glowTime={glowTime}
        apertureSettings={apertureSettings}
        detectorBrightness={detectorBrightness}
        detectorPalette={detectorPalette}
        detectorMaskEnabled={detectorMaskEnabled}
        detectorPixelDensity={detectorPixelDensity}
        detectorImplementation={detectorImplementation}
        onExperimentModeChange={setExperimentMode}
        onDetectorVisible={(value) => updateSetting('detectorVisible', value)}
        onDetectionTime={(value) => updateSetting('detectionTime', value)}
        onGlowTime={(value) => updateSetting('glowTime', value)}
        onApertureSettingsChange={updateApertureSettings}
        onDetectorBrightness={(value) => updateSetting('detectorBrightness', value)}
        onDetectorPalette={(value) => updateSetting('detectorPalette', value)}
        onDetectorMaskEnabled={(value) => updateSetting('detectorMaskEnabled', value)}
        onDetectorPixelDensity={(value) => updateSetting('detectorPixelDensity', value)}
        onDetectorImplementation={(value) => updateSetting('detectorImplementation', value)}
        onSourcePreset={onSourcePreset}
        onOcclusionPreset={setOcclusionPreset}
        onStateChange={onStateChange}
        onStateName={setStateName}
        onSaveState={onSaveState}
        onChange={updateWave}
        onWaveCountChange={updateWaveCount}
        onInterferenceChange={(mode, value) => {
          setInterferenceModes((current) => ({ ...current, [mode]: value }));
          waveEditor.commit((current) => ({ ...current, interferenceModes: { ...current.interferenceModes, [mode]: value } }));
          markStateModified();
        }}
        onRunning={() => setRunning((value) => !value)}
        onReset={reset}
        onDuplicate={duplicateWave}
        onRemove={removeWave}
        onDoubleSided={(value) => { setDoubleSided(value); waveEditor.commit((current) => ({ ...current, doubleSided: value })); }}
        onParticleCount={(value) => { setParticleCount(value); waveEditor.commit((current) => ({ ...current, particleCount: value })); }}
        onParticleSize={(value) => { setParticleSize(value); waveEditor.commit((current) => ({ ...current, particleSize: value })); }}
        onParticleOpacity={(value) => { setParticleOpacity(value); waveEditor.commit((current) => ({ ...current, particleOpacity: value })); }}
        onParticleShape={(value) => { setParticleShape(value); waveEditor.commit((current) => ({ ...current, particleShape: value })); }}
        onParticleDerivativeOrder={(value) => { setParticleDerivativeOrder(value); waveEditor.commit((current) => ({ ...current, particleDerivativeOrder: value })); }}
        onOrbitControls={(value) => { setOrbitControlsVisible(value); waveEditor.commit((current) => ({ ...current, orbitControlsVisible: value })); }}
        onSourceVectors={(value) => { setSourceVectorsVisible(value); waveEditor.commit((current) => ({ ...current, sourceVectorsVisible: value })); }}
        editing={editing}
        onEditing={setEditing}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />
      {!paramsVisible && !APERTURE_EXPERIMENT_MODES.includes(experimentMode) && <WaveMechanicsOverlay value={waveMechanics} onChange={setWaveMechanics} />}
      <footer className="wave-footer"><span>n WAVES / {Object.entries(INTERFERENCE_MODES).filter(([mode]) => interferenceModes[mode]).map(([, details]) => details.label.toUpperCase()).join(' + ') || 'NO INTERFERENCE'}</span><span>DRAG TO ORBIT / SCROLL TO ZOOM</span></footer>
      {exportModal && <SimulatorExportModal title={exportModal.title} value={exportModal.value} onClose={() => setExportModal(null)} />}
    </SimulatorBase>
    </DetectorOamReadoutContext.Provider>
    </PerspectiveCameraContext.Provider>
    </DetectorVisibilityContext.Provider>
    </SimulationSpeedContext.Provider>
    </DetectorPhaseFilterContext.Provider>
    </DetectorMechanicsContext.Provider>
    </DetectorComparisonScoreContext.Provider>
    </DetectorModelComparisonContext.Provider>
    </WignerMechanicsContext.Provider>
    </DetectorClearContext.Provider>
    </SolitonSimulatorContext.Provider>
  );
}
