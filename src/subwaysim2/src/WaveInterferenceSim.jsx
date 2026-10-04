import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, FrontSide, Mesh, NearestFilter, NoBlending, OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector3, WebGLRenderTarget } from 'three';
import { advanceDetectorResponse, calculateOcclusionTransmission, calculateWaveDerivative, calculateWaveDisplacementAndTensorGaussian, calculateWaveFrame, calculateWaveTensorGaussian, cloneWaveState, combineWaves, DEFAULT_APERTURE_SETTINGS, DEFAULT_BEAM_WAIST, DEFAULT_SIGNAL_DIRECTION, DEFAULT_SIGNAL_ORIGIN, DEFAULT_SIGNAL_ROTATION, DEFAULT_WAVE_STATES, DOUBLE_SLIT_CENTERS, DOUBLE_SLIT_DETECTOR_X, DOUBLE_SLIT_SCREEN_THICKNESS, DOUBLE_SLIT_SCREEN_X, DOUBLE_SLIT_WIDTH, APERTURE_SCREEN_DEPTH, APERTURE_SCREEN_HEIGHT, DETECTOR_TRANSVERSE_SPAN, detectorDistanceForSlitScreenPosition, getSlitGeometry, GRATING_SLIT_CENTERS, GRATING_SLIT_SPACING, GRATING_SLIT_WIDTH, INTERFERENCE_MODES, MAX_WAVES, normalizeApertureSettings, OCCLUSION_PRESETS, PHASE_MODES, PINHOLE_RADIUS, POLARIZATION_MODES, prepareApertureField, readSavedWaveStates, sampleApertureField, SIGNAL_SOURCE_PRESETS, SINGLE_SLIT_WIDTH, TWO_SOURCE_CENTERS, writeSavedWaveStates } from './waveModel.js';
import { HistoryControls, NumericParamControl, ParamEditingToggle, ParamSelect } from './lib/ParamControls.jsx';
import { useSimulationEditor, useUndoRedoShortcuts } from './lib/simulation-state.js';
import { CameraPerspectiveToolbar, OrbitalTrackingParameters, ParticleAppearanceSettings, PerspectiveOrbitControls, SimulatorBase, SimulatorExportModal, SimulatorIOJournal, SimulatorPresetControls, useSimulatorJournal } from './lib/SimulatorBase.jsx';
import { buildParameterReplayJournal, DEFAULT_CAMERA_VIEWS, DEFAULT_SIMULATOR_3D_PARAMETERS, deletePresetLibrary, parseParameterEditLogYaml, parseSimulatorJson, readPresetLibrary, serializeParameterEditLog, writePresetLibrary } from './lib/simulator-base.js';
import { evaluateGpeResponse, WAVE_EVOLUTION_OPTIONS } from './mechanicsModels.js';

const FIELD_SIZE = 18;
const DEFAULT_PARTICLE_COUNT = 2 ** 10;
const E2E_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');
const E2E_PARTICLE_COUNT = E2E_MODE ? 2048 : null;
const E2E_DETECTOR_MAX_DIMENSION = 128;
const MIN_PARTICLE_COUNT = 1024;
//const MAX_PARTICLE_COUNT = 9216;
const MAX_PARTICLE_COUNT = 2 ** 14;
const WAVE_PRESET_STORAGE_KEY = 'sqgsim-wave-snapshots';
const DEFAULT_WAVE_MECHANICS = { model: 'linear', nonlinearCoupling: 0.08, dispersion: 0.05, showDifference: false };
const DETECTOR_UPDATE_INTERVAL = 1 / 12;
const CLASSIC_DETECTOR_BINS_PER_AXIS = 48;
const DETECTOR_MAX_EMITTERS = 1400;
const DetectorVisibilityContext = createContext(true);
const PerspectiveCameraContext = createContext({ viewMode: null, orbitPlaying: true, orbitControlsVisible: true, orbitSettings: DEFAULT_SIMULATOR_3D_PARAMETERS, particleAppearance: DEFAULT_SIMULATOR_3D_PARAMETERS.particleAppearance, onManualInteraction: () => {} });
const DETECTOR_IMPLEMENTATION_OPTIONS = [
  { value: 'classic', label: 'Classic pixels' },
  { value: 'native', label: 'Native resolution (GPU)' }
];
const DETECTOR_PALETTES = [
  { value: 'thermal', label: 'Thermal', stops: ['#10242d', '#37c4c8', '#f4bf66', '#fff4dc'] },
  { value: 'phosphor', label: 'Phosphor', stops: ['#071b19', '#187b59', '#a6df75', '#f3ffd1'] },
  { value: 'monochrome', label: 'Monochrome', stops: ['#101820', '#63737a', '#c5d3d2', '#ffffff'] },
  { value: 'plasma', label: 'Plasma', stops: ['#15132c', '#285ab5', '#e84e86', '#ffd77b'] },
  { value: 'black-red', label: 'Black & red', stops: ['#030405', '#26050a', '#a10e1c', '#ff3948'] }
];
const DETECTOR_PALETTE_COLORS = Object.fromEntries(DETECTOR_PALETTES.map(({ value, stops }) => [value, stops.map((stop) => new Color(stop))]));

function normalizeWaveSnapshot(snapshot, defaults) {
  if (!Array.isArray(snapshot.waves) || snapshot.waves.length !== MAX_WAVES) {
    throw new TypeError(`A wave preset must contain exactly ${MAX_WAVES} wave slots.`);
  }
  const waveCount = Number(snapshot.waveCount ?? defaults.waveCount);
  return {
    ...defaults,
    ...snapshot,
    waves: snapshot.waves,
    running: Boolean(snapshot.running ?? defaults.running),
    waveCount: Number.isFinite(waveCount) ? Math.min(MAX_WAVES, Math.max(1, Math.round(waveCount))) : defaults.waveCount,
    interferenceModes: { ...defaults.interferenceModes, ...snapshot.interferenceModes },
    apertureSettings: normalizeApertureSettings({ ...defaults.apertureSettings, ...snapshot.apertureSettings }),
    waveMechanics: { ...defaults.waveMechanics, ...snapshot.waveMechanics }
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
  uniform float uTime;
  uniform float uElapsed;
  uniform float uDetectionTime;
  uniform float uGlowTime;
  uniform float uDetectorX;
  uniform float uDetectorSpan;
  uniform float uEmitterTextureWidth;
  varying vec2 vUv;

  const int MAX_EMITTERS = 1400;

  void main() {
    float y = (vUv.y - 0.5) * uDetectorSpan;
    float z = (vUv.x - 0.5) * uDetectorSpan;
    vec3 electric = vec3(0.0);
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
    }
    float intensity = dot(electric, electric) / uIntensityScale;
    vec4 previous = texture2D(uPreviousResponse, vUv);
    float average = previous.r + (intensity - previous.r) * (1.0 - exp(-uElapsed / uDetectionTime));
    float glow = max(average, previous.g * exp(-uElapsed / uGlowTime));
    gl_FragColor = vec4(clamp(average, 0.0, 1.0), clamp(glow, 0.0, 1.0), 0.0, 1.0);
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
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    vec3 color;
    if (uMaskEnabled && abs(vWorldY) > uMaskHeight * 0.5) {
      color = vec3(0.012, 0.016, 0.023);
    } else {
      float glow = texture2D(uResponse, vUv).g;
      float value = clamp(pow(glow, 0.65) * uDetectorBrightness, 0.0, 1.0) * 3.0;
      if (value < 1.0) color = mix(uPaletteStops[0], uPaletteStops[1], value);
      else if (value < 2.0) color = mix(uPaletteStops[1], uPaletteStops[2], value - 1.0);
      else color = mix(uPaletteStops[2], uPaletteStops[3], value - 2.0);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const APERTURE_EXPERIMENT_MODES = ['single-slit', 'double-slit', 'pinhole', 'grating', 'two-source'];
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
      uDetectorBrightness: { value: 1 }
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
        -0.075, bottom, left,
        -0.075, top, right,
        -0.075, top, left,
        -0.075, bottom, left,
        -0.075, bottom, right,
        -0.075, top, right
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
  geometry.userData.responses = Array.from({ length: binCount }, () => ({ average: 0, glow: 0 }));
  return geometry;
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

function NativeResolutionDetector({ apertureField, running, timeRef, detectionTime, glowTime, detectorBrightness, detectorPalette, maskEnabled, pixelDensity, onResolutionChange }) {
  const { gl, size } = useThree();
  const baseWidth = E2E_MODE ? Math.min(size.width, E2E_DETECTOR_MAX_DIMENSION) : size.width;
  const baseHeight = E2E_MODE ? Math.min(size.height, E2E_DETECTOR_MAX_DIMENSION) : size.height;
  const resolutionWidth = Math.min(gl.capabilities.maxTextureSize, Math.max(1, Math.round(baseWidth * gl.getPixelRatio() * pixelDensity)));
  const resolutionHeight = Math.min(gl.capabilities.maxTextureSize, Math.max(1, Math.round(baseHeight * gl.getPixelRatio() * pixelDensity)));
  const resources = useMemo(() => createDetectorRenderResources(resolutionWidth, resolutionHeight), [resolutionHeight, resolutionWidth]);
  const updateTime = useRef(0);
  const needsRefresh = useRef(true);
  useEffect(() => {
    needsRefresh.current = true;
  }, [apertureField, detectionTime, glowTime, resources]);

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
    phaseTexture.needsUpdate = true;
    amplitudeTexture.needsUpdate = true;
    polarizationTexture.needsUpdate = true;
    sideTexture.needsUpdate = true;
    resources.responseMaterial.uniforms.uEmitterCount.value = emitterCount;
    needsRefresh.current = true;
  }, [apertureField, resources]);

  useEffect(() => {
    const uniforms = resources.displayMaterial.uniforms;
    uniforms.uPaletteStops.value = DETECTOR_PALETTE_COLORS[detectorPalette] ?? DETECTOR_PALETTE_COLORS.thermal;
    uniforms.uMaskEnabled.value = maskEnabled;
    uniforms.uDetectorBrightness.value = detectorBrightness;
  }, [detectorBrightness, detectorPalette, maskEnabled, resources]);

  useFrame((_, delta) => {
    let elapsed = 0;
    if (running) {
      updateTime.current += Math.min(delta, 0.1);
      if (!needsRefresh.current && updateTime.current < DETECTOR_UPDATE_INTERVAL) return;
      elapsed = updateTime.current;
      updateTime.current = 0;
    } else if (!needsRefresh.current) return;
    needsRefresh.current = false;
    const totalAmplitude = apertureField?.emitters.reduce((total, emitter) => total + Math.abs(emitter.amplitude), 0) ?? 0;
    const uniforms = resources.responseMaterial.uniforms;
    uniforms.uPreviousResponse.value = resources.responseTargets[resources.historyIndex].texture;
    uniforms.uIntensityScale.value = Math.max(0.001, 4 * totalAmplitude ** 2 / DOUBLE_SLIT_DETECTOR_X ** 2);
    uniforms.uTime.value = timeRef.current;
    uniforms.uElapsed.value = elapsed;
    uniforms.uDetectionTime.value = Math.max(0.01, detectionTime);
    uniforms.uGlowTime.value = Math.max(0.01, glowTime);
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
  });

  return <mesh position={[DOUBLE_SLIT_DETECTOR_X - 0.025, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
    <planeGeometry args={[DETECTOR_TRANSVERSE_SPAN, DETECTOR_TRANSVERSE_SPAN]} />
    <primitive object={resources.displayMaterial} attach="material" />
  </mesh>;
}

function ClassicExperimentDetector({ apertureField, waves, waveCount, interferenceModes, experimentMode, running, timeRef, detectionTime, glowTime, detectorBrightness, detectorPalette, maskEnabled, pixelDensity, onResolutionChange }) {
  const resolution = Math.max(1, Math.round(CLASSIC_DETECTOR_BINS_PER_AXIS * pixelDensity));
  const geometry = useMemo(() => createClassicDetectorGeometry(resolution), [resolution]);
  const color = useMemo(() => new Color(), []);
  const updateTime = useRef(0);
  const needsRefresh = useRef(true);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    needsRefresh.current = true;
    updateTime.current = 0;
    onResolutionChange(`${resolution}x${resolution}`);
  }, [geometry, onResolutionChange, resolution]);
  useEffect(() => {
    needsRefresh.current = true;
  }, [apertureField, detectorBrightness, detectorPalette, detectionTime, glowTime, maskEnabled]);

  useFrame((_, delta) => {
    let elapsed = 0;
    if (running) {
      updateTime.current += Math.min(delta, 0.1);
      if (!needsRefresh.current && updateTime.current < DETECTOR_UPDATE_INTERVAL) return;
      elapsed = updateTime.current;
      updateTime.current = 0;
    } else if (!needsRefresh.current) return;
    needsRefresh.current = false;
    const directFieldMode = experimentMode === 'field';
    const totalAmplitude = directFieldMode
      ? waves.slice(0, waveCount).reduce((total, wave) => total + (wave.enabled === false ? 0 : Math.abs(Number(wave.amplitude) || 0)), 0)
      : apertureField?.emitters.reduce((total, emitter) => total + Math.abs(emitter.amplitude), 0) ?? 0;
    const intensityScale = Math.max(0.001, 4 * totalAmplitude ** 2 / (directFieldMode ? 1 : DOUBLE_SLIT_DETECTOR_X ** 2));
    const stops = DETECTOR_PALETTE_COLORS[detectorPalette] ?? DETECTOR_PALETTE_COLORS.thermal;
    const colors = geometry.attributes.color.array;
    const responses = geometry.userData.responses;
    for (let yBin = 0; yBin < resolution; yBin += 1) {
      const y = ((yBin + 0.5) / resolution - 0.5) * DETECTOR_TRANSVERSE_SPAN;
      for (let zBin = 0; zBin < resolution; zBin += 1) {
        const z = ((zBin + 0.5) / resolution - 0.5) * DETECTOR_TRANSVERSE_SPAN;
        const bin = yBin * resolution + zBin;
        const intensity = directFieldMode
          ? (() => {
            const field = calculateWaveDisplacementAndTensorGaussian(waves.slice(0, waveCount), DOUBLE_SLIT_DETECTOR_X, z, timeRef.current, interferenceModes, y).displacement;
            return field.x ** 2 + field.y ** 2 + field.z ** 2;
          })()
          : sampleApertureField(apertureField, DOUBLE_SLIT_DETECTOR_X, y, z, timeRef.current).intensity;
        responses[bin] = advanceDetectorResponse(responses[bin], intensity / intensityScale, elapsed, detectionTime, glowTime);
        if (maskEnabled && Math.abs(y) > APERTURE_SCREEN_HEIGHT / 2) {
          color.set('#030509');
        } else {
          const brightness = Math.min(1, Math.pow(Math.min(1, responses[bin].glow), 0.65) * detectorBrightness);
          const palettePosition = brightness * (stops.length - 1);
          const lowerStop = Math.floor(palettePosition);
          color.copy(stops[lowerStop]).lerp(stops[Math.min(lowerStop + 1, stops.length - 1)], palettePosition - lowerStop);
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
  });

  return <group position={[DOUBLE_SLIT_DETECTOR_X, 0, 0]}>
    <mesh position={[-0.05, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[DETECTOR_TRANSVERSE_SPAN, DETECTOR_TRANSVERSE_SPAN]} />
      <meshBasicMaterial color="#10242d" transparent opacity={0.88} side={DoubleSide} depthWrite={false} />
    </mesh>
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors transparent opacity={0.98} side={DoubleSide} toneMapped={false} />
    </mesh>
  </group>;
}

function ExperimentDetector({ implementation, experimentMode, ...props }) {
  return implementation === 'native' && experimentMode !== 'field'
    ? <NativeResolutionDetector {...props} />
    : <ClassicExperimentDetector {...props} experimentMode={experimentMode} />;
}

function WaveField({ waves, waveCount, interferenceModes, running, timeRef, experimentMode, apertureField, apertureSettings, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, particleAppearance, occlusionPreset, waveMechanics }) {
  const geometry = useMemo(() => createFieldGeometry(particleCount), [particleCount]);
  const usesApertureExperiment = APERTURE_EXPERIMENT_MODES.includes(experimentMode);
  const fieldUpdateTime = useRef(0);
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
    material.uniforms.uTensorSplatters.value = waves.slice(0, waveCount).some((wave) => wave.polarization === 'EM-Tensor-Gaussian');
  }, [material, waveCount, waves]);

  useFrame((_, delta) => {
    if (running) timeRef.current += Math.min(delta, 0.05);
    if (usesApertureExperiment) {
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
    const activeWaves = waves.slice(0, waveCount);
    const tensorWaves = usesApertureExperiment
      ? activeWaves.filter((wave) => wave.enabled !== false && wave.polarization === 'EM-Tensor-Gaussian')
      : null;
    for (let index = 0; index < particleCount; index += 1) {
      const x = basePositions[index * 3];
      const z = basePositions[index * 3 + 2];
      const transmission = usesApertureExperiment && x > DOUBLE_SLIT_DETECTOR_X
        ? 0
        : calculateOcclusionTransmission(occlusionPreset, x, z, 0, apertureSettings);
      const apertureFieldSample = usesApertureExperiment && x > DOUBLE_SLIT_SCREEN_THICKNESS / 2
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
      const tensorGaussian = apertureDisplacement
        ? tensorWaves.length > 0 ? calculateWaveTensorGaussian(tensorWaves, x, z, timeRef.current, interferenceModes) * transmission : 0
        : waveResponse.tensorGaussian * transmission;
      const derivative = particleShape === 'vector'
        ? calculateWaveDerivative(activeWaves, x, z, timeRef.current, particleDerivativeOrder, interferenceModes)
        : 0;
      const normalized = Math.min(1, Math.abs(height) / Math.max(1, activeWaves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0)));
      positions[index * 3] = x + displacement.x * transmission * 0.9;
      positions[index * 3 + 1] = basePositions[index * 3 + 1] + displacement.y * transmission * 0.9;
      positions[index * 3 + 2] = z + displacement.z * transmission * 0.9;
      occlusions[index] = transmission;
      vectorAngles[index] = Math.atan(derivative * 0.35);
      tensorGaussians[index] = tensorGaussian;
      const modelDifference = Math.min(1, Math.abs(height - linearHeight));
      const hue = waveMechanics.showDifference
        ? 0.55 - modelDifference * 0.43
        : height >= 0 ? 0.12 - normalized * 0.06 : 0.52 + normalized * 0.08;
      color.setHSL(hue, 0.72, 0.42 + normalized * 0.18);
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

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function SignalSourceArrows({ waves, waveCount, visible }) {
  const sources = useMemo(() => waves.slice(0, waveCount).map((wave, index) => {
    if (wave.enabled === false) return null;
    const frame = calculateWaveFrame(wave);
    return { index, origin: frame.origin, direction: frame.direction };
  }).filter(Boolean), [waveCount, waves]);
  if (!visible) return null;
  return (
    <group>
      {sources.map(({ index, origin, direction }) => <arrowHelper key={index} args={[new Vector3(direction.x, direction.y, direction.z), new Vector3(origin.x, origin.y, origin.z), 2.4, WAVE_COLORS[index], 0.38, 0.22]} />)}
    </group>
  );
}

function WaveScene({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, occlusionPreset, orbitControlsVisible, sourceVectorsVisible, waveMechanics, experimentMode, detectionTime, glowTime, apertureSettings, detectorVisible, detectorBrightness, detectorPalette, detectorMaskEnabled, detectorPixelDensity, detectorImplementation, onDetectorResolutionChange }) {
  const { viewMode, orbitPlaying, orbitSettings, particleAppearance, onManualInteraction } = useContext(PerspectiveCameraContext);
  const contextDetectorVisible = useContext(DetectorVisibilityContext);
  const showDetector = detectorVisible ?? contextDetectorVisible;
  const timeRef = useRef(0);
  const apertureField = useMemo(() => APERTURE_EXPERIMENT_MODES.includes(experimentMode)
    ? prepareApertureField(waves.slice(0, waveCount), experimentMode, apertureSettings)
    : null, [apertureSettings, experimentMode, waveCount, waves]);
  return (
    <>
      <color attach="background" args={['#080d17']} />
      <fog attach="fog" args={['#080d17', 17, 34]} />
      <ambientLight intensity={0.7} color="#b5d8d1" />
      <gridHelper args={[FIELD_SIZE, 18, '#294555', '#142631']} position={[0, -1.35, 0]} />
      <SignalSourceArrows waves={waves} waveCount={waveCount} visible={sourceVectorsVisible} />
      {['single-slit', 'double-slit', 'grating'].includes(experimentMode) && <SlitScreen experimentMode={experimentMode} apertureSettings={apertureSettings} />}
      {experimentMode === 'pinhole' && <PinholeScreen />}
      {experimentMode === 'two-source' && <TwoSourceMarkers />}
      <WaveField waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} timeRef={timeRef} experimentMode={experimentMode} apertureField={apertureField} apertureSettings={apertureSettings} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} particleAppearance={particleAppearance} occlusionPreset={occlusionPreset} waveMechanics={waveMechanics} />
      {showDetector && (experimentMode === 'field' || APERTURE_EXPERIMENT_MODES.includes(experimentMode)) && <ExperimentDetector key={`${experimentMode}:${detectorImplementation}`} implementation={detectorImplementation} experimentMode={experimentMode} waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} apertureField={apertureField} running={running} timeRef={timeRef} detectionTime={detectionTime} glowTime={glowTime} detectorBrightness={detectorBrightness} detectorPalette={detectorPalette} maskEnabled={detectorMaskEnabled} pixelDensity={detectorPixelDensity} onResolutionChange={onDetectorResolutionChange} />}
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

function WaveEditor({ wave, index, onChange, onDuplicate, onRemove, canDuplicate, canRemove, editing = false, isDefault = () => true, onResetPath = () => {} }) {
  const [parameterPlacement, setParameterPlacement] = useState('auto');
  const update = (field, value) => onChange(index, { ...wave, [field]: value });
  const updateVector = (field, axis, value, fallback) => update(field, { ...(wave[field] || fallback), [axis]: value });
  return (
    <details className="wave-editor" open={index < 3}>
      <summary><span className="wave-swatch" style={{ backgroundColor: WAVE_COLORS[index] }} />Wave {index + 1}<strong>{wave.enabled ? 'ON' : 'OFF'} / {wave.phaseMode}</strong></summary>
      <div className="wave-editor-actions">
        <label className="wave-toggle"><input type="checkbox" checked={wave.enabled} onChange={(event) => update('enabled', event.target.checked)} /><span>{wave.enabled ? 'Enabled' : 'Disabled'}</span></label>
        <div className="wave-editor-buttons"><button type="button" onClick={() => onDuplicate(index)} disabled={!canDuplicate}>Duplicate</button><button type="button" className="wave-remove-button" onClick={() => onRemove(index)} disabled={!canRemove}>Remove</button></div>
      </div>
      <ParamSelect className="wave-select wave-parameter-placement" label="Parameter placement" ariaLabel={`Wave ${index + 1} parameter placement`} value={parameterPlacement} options={PARAMETER_PLACEMENTS.map((placement) => ({ value: placement.id, label: placement.label }))} onChange={setParameterPlacement} />
      <div className={`wave-editor-workbench placement-${parameterPlacement}`}>
        <SourceOrbitControl wave={wave} index={index} onChange={update} editing={editing} />
        <div className="wave-parameter-dock">
          <RangeControl label="Wavelength" value={wave.wavelength} min={1} max={12} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['waves', index, 'wavelength'])} onReset={() => onResetPath(['waves', index, 'wavelength'])} onChange={(value) => update('wavelength', value)} />
          <RangeControl label="Amplitude" value={wave.amplitude} min={0} max={1.5} step={0.01} editing={editing} isDefault={isDefault(['waves', index, 'amplitude'])} onReset={() => onResetPath(['waves', index, 'amplitude'])} onChange={(value) => update('amplitude', value)} />
          <RangeControl label="Decay rate" value={wave.decayRate ?? 0} min={0} max={1} step={0.01} suffix=" /u" editing={editing} isDefault={isDefault(['waves', index, 'decayRate'])} onReset={() => onResetPath(['waves', index, 'decayRate'])} onChange={(value) => update('decayRate', value)} />
          <RangeControl label="Phase offset" value={wave.phaseOffset} min={-Math.PI} max={Math.PI} step={0.01} suffix=" rad" editing={editing} isDefault={isDefault(['waves', index, 'phaseOffset'])} onReset={() => onResetPath(['waves', index, 'phaseOffset'])} onChange={(value) => update('phaseOffset', value)} />
          <RangeControl label="Phase rate" value={wave.phaseRate} min={-2} max={2} step={0.01} suffix=" /s" editing={editing} isDefault={isDefault(['waves', index, 'phaseRate'])} onReset={() => onResetPath(['waves', index, 'phaseRate'])} onChange={(value) => update('phaseRate', value)} />
          <ParamSelect className="wave-select" label="Phase mode" value={wave.phaseMode} options={PHASE_MODES} onChange={(value) => update('phaseMode', value)} />
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

function WavePanel({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, orbitControlsVisible, sourceVectorsVisible, sourcePreset, occlusionPreset, stateOptions, selectedState, stateDescription, stateName, stateMessage, paramsVisible, experimentMode, detectionTime, glowTime, apertureSettings, detectorVisible, detectorBrightness, detectorPalette, detectorMaskEnabled, detectorPixelDensity, detectorImplementation, onExperimentModeChange, onDetectionTime, onGlowTime, onApertureSettingsChange, onDetectorVisible, onDetectorBrightness, onDetectorPalette, onDetectorMaskEnabled, onDetectorPixelDensity, onDetectorImplementation, onSourcePreset, onOcclusionPreset, onStateChange, onStateName, onSaveState, onChange, onWaveCountChange, onInterferenceChange, onRunning, onReset, onDuplicate, onRemove, onDoubleSided, onParticleCount, onParticleSize, onParticleOpacity, onParticleShape, onParticleDerivativeOrder, onOrbitControls, onSourceVectors, editing = false, onEditing = () => {}, canUndo = false, canRedo = false, onUndo = () => {}, onRedo = () => {}, isDefault = () => true, onResetPath = () => {}, simulatorPresets = {}, currentSimulatorPreset = 'Default', simulatorPresetName = '', onSimulatorPresetName = () => {}, onApplySimulatorPreset = () => {}, onSaveSimulatorPreset = () => {}, currentValue = {}, jsonText = '', onJsonText = () => {}, onLoadJson = () => {}, onExport = () => {}, onDeleteSimulatorPresets = () => {}, showEditLog = false, onShowEditLog = () => {}, editLogYaml = '[]\n', onReplayLog = () => {}, replayMessage = '', replaying = false, journal = [], recording = false, onRecording = () => {}, playing = false, onTogglePlayback = () => {}, onStop = () => {}, playbackTime = 0, onPlaybackTime = () => {}, playbackSpeed = 1, onPlaybackSpeed = () => {} }) {
  const enabledCount = waves.slice(0, waveCount).filter((wave) => wave.enabled).length;
  const activeModeLabels = Object.entries(INTERFERENCE_MODES).filter(([mode]) => interferenceModes[mode]).map(([, details]) => details.label);
  const defaultSlitCount = experimentMode === 'single-slit' ? 1 : experimentMode === 'grating' ? GRATING_SLIT_CENTERS.length : DOUBLE_SLIT_CENTERS.length;
  const defaultSlitSpacing = experimentMode === 'grating' ? GRATING_SLIT_SPACING : Math.abs(DOUBLE_SLIT_CENTERS[1] - DOUBLE_SLIT_CENTERS[0]);
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
        <ParamSelect className="wave-select wave-state-select" label="Experiment mode" value={experimentMode} options={[{ value: 'field', label: 'Wave field' }, { value: 'single-slit', label: 'Single-slit diffraction' }, { value: 'double-slit', label: 'Double-slit experiment' }, { value: 'pinhole', label: 'Pinhole diffraction' }, { value: 'grating', label: 'Diffraction grating' }, { value: 'two-source', label: 'Two coherent sources' }]} onChange={onExperimentModeChange} />
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
            <RangeControl label="Slit-to-detector distance" value={apertureSettings.detectorDistance} min={0.5} max={21} step={0.1} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'detectorDistance'])} onReset={() => onResetPath(['apertureSettings', 'detectorDistance'])} onChange={updateDetectorDistance} />
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
              <RangeControl label="Left slit width" value={apertureSettings.slitWidthA} min={0.2} max={2.4} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWidthA'])} onReset={() => onResetPath(['apertureSettings', 'slitWidthA'])} onChange={(slitWidthA) => onApertureSettingsChange({ ...apertureSettings, slitWidthA })} />
              <RangeControl label="Right slit width" value={apertureSettings.slitWidthB} min={0.2} max={2.4} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWidthB'])} onReset={() => onResetPath(['apertureSettings', 'slitWidthB'])} onChange={(slitWidthB) => onApertureSettingsChange({ ...apertureSettings, slitWidthB })} />
            </> : <RangeControl label={experimentMode === 'grating' ? 'Grating slit width' : 'Slit width'} value={apertureSettings.slitWidthA} min={0.2} max={experimentMode === 'grating' ? 1.4 : experimentMode === 'double-slit' ? 2.4 : 3.6} step={0.05} suffix=" u" editing={editing} isDefault={isDefault(['apertureSettings', 'slitWidthA'])} onReset={() => onResetPath(['apertureSettings', 'slitWidthA'])} onChange={(slitWidthA) => onApertureSettingsChange({ ...apertureSettings, slitWidthA, ...(experimentMode === 'double-slit' ? { slitWidthB: slitWidthA } : {}) })} />}
          </>}
        </>}
        <span className="wave-section-label">DETECTOR SCREEN</span>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={detectorVisible} onChange={(event) => onDetectorVisible(event.target.checked)} /><span>Show detection screen</span></label>
        <RangeControl label="Detection time" value={detectionTime} min={0.1} max={5} step={0.1} suffix=" s" editing={editing} isDefault={isDefault('detectionTime')} onReset={() => onResetPath('detectionTime')} onChange={onDetectionTime} />
        <RangeControl label="Glow time" value={glowTime} min={0.2} max={10} step={0.1} suffix=" s" editing={editing} isDefault={isDefault('glowTime')} onReset={() => onResetPath('glowTime')} onChange={onGlowTime} />
        <ParamSelect className="wave-select" label="Detector implementation" value={experimentMode === 'field' ? 'classic' : detectorImplementation} options={experimentMode === 'field' ? [DETECTOR_IMPLEMENTATION_OPTIONS[0]] : DETECTOR_IMPLEMENTATION_OPTIONS} onChange={onDetectorImplementation} />
        <RangeControl label="Detector brightness" value={detectorBrightness} min={0.25} max={2.5} step={0.05} editing={editing} isDefault={isDefault('detectorBrightness')} onReset={() => onResetPath('detectorBrightness')} onChange={onDetectorBrightness} />
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={detectorMaskEnabled} onChange={(event) => onDetectorMaskEnabled(event.target.checked)} /><span>Mask outside wall-height band</span></label>
        <RangeControl label="Detector pixel density" value={detectorPixelDensity} min={0.5} max={2} step={0.25} suffix="x" editing={editing} isDefault={isDefault('detectorPixelDensity')} onReset={() => onResetPath('detectorPixelDensity')} onChange={onDetectorPixelDensity} />
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
      <section className="wave-control-section">
        <span className="wave-section-label">FIELD RESPONSE</span>
        <div className="wave-actions"><button type="button" onClick={onRunning}>{running ? 'Pause field' : 'Run field'}</button><button type="button" onClick={onReset}>Reset waves</button></div>
        <RangeControl label="Wave slots" value={waveCount} min={1} max={MAX_WAVES} step={1} editing={editing} isDefault={isDefault('waveCount')} onReset={() => onResetPath('waveCount')} onChange={onWaveCountChange} />
      </section>
      <section className="wave-control-section">
        <span className="wave-section-label">WAVE PARAMETERS</span>
        {waves.slice(0, waveCount).map((wave, index) => <WaveEditor key={index} wave={wave} index={index} onChange={onChange} onDuplicate={onDuplicate} onRemove={onRemove} canDuplicate={waveCount < MAX_WAVES} canRemove={waveCount > 1} editing={editing} isDefault={isDefault} onResetPath={onResetPath} />)}
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
    orbitControlsVisible: true,
    sourceVectorsVisible: true,
    occlusionPreset: 'none',
    experimentMode: 'field',
    detectionTime: 1,
    glowTime: 3,
    apertureSettings: { ...DEFAULT_APERTURE_SETTINGS },
    detectorVisible: true,
    detectorBrightness: 1,
    detectorPalette: 'thermal',
    detectorMaskEnabled: false,
    detectorPixelDensity: 1,
    detectorImplementation: 'classic',
    running: true,
    waveMechanics: { ...DEFAULT_WAVE_MECHANICS },
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
  const [paramsVisible, setParamsVisible] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [editing, setEditing] = useState(false);
  const waveEditor = useSimulationEditor({ ...initialSnapshot, waves, waveCount, interferenceModes, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, orbitControlsVisible, sourceVectorsVisible, occlusionPreset, experimentMode, detectionTime, glowTime, apertureSettings, detectorVisible, detectorBrightness, detectorPalette, detectorMaskEnabled, detectorPixelDensity, detectorImplementation, running, waveMechanics }, { recordParameterEdits: true });
  const setRunning = (nextValue) => {
    const next = typeof nextValue === 'function' ? nextValue(running) : nextValue;
    setRunningState(next);
    waveEditor.commit((current) => ({ ...current, running: next }));
  };
  const setWaveMechanics = (next) => {
    setWaveMechanicsState(next);
    waveEditor.commit((current) => ({ ...current, waveMechanics: next }));
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
  }, [waveEditor.value]);
  const setOcclusionPreset = (value) => {
    const experimentMode = EXPERIMENT_MODE_BY_PRESET[value];
    if (experimentMode) {
      waveEditor.commit((current) => ({ ...current, occlusionPreset: value, experimentMode }));
      markStateModified();
      return;
    }
    waveEditor.commit((current) => ({ ...current, occlusionPreset: value, experimentMode: 'field', detectorImplementation: 'classic' }));
    markStateModified();
  };
  const sourceFrame = calculateWaveFrame(waves.slice(0, waveCount).find((wave) => wave.enabled !== false) || waves[0]);

  const markStateModified = () => {
    setSourcePreset('');
    setStateModified(true);
    setStateMessage('Current field has unsaved changes.');
  };
  const setExperimentMode = (mode) => {
    const experimentStateName = EXPERIMENT_STATE_NAMES[mode];
    if (experimentStateName) {
      const state = DEFAULT_WAVE_STATES.find((item) => item.name === experimentStateName);
      if (!state) return;
      const next = cloneWaveState(state);
      waveEditor.load((current) => ({ ...current, waves: next.waves, waveCount: next.waveCount, interferenceModes: next.interferenceModes, occlusionPreset: EXPERIMENT_PRESET_IDS[mode] ?? 'none', experimentMode: mode }));
      setSourcePreset('');
      setSelectedState(state.name);
      setStateModified(false);
      setStateMessage(`Loaded ${state.name}.`);
      return;
    }
    waveEditor.commit((current) => ({ ...current, occlusionPreset: 'none', experimentMode: 'field', detectorImplementation: 'classic' }));
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
      ...(experimentMode ? { occlusionPreset: EXPERIMENT_PRESET_IDS[experimentMode] ?? 'none', experimentMode } : {})
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

  return (
    <DetectorVisibilityContext.Provider value={detectorVisible}>
    <PerspectiveCameraContext.Provider value={{ viewMode, orbitPlaying, orbitControlsVisible, orbitSettings: waveEditor.value, particleAppearance: waveEditor.value.particleAppearance, onManualInteraction: () => setViewMode(null) }}>
    <SimulatorBase className="wave-app" headerClassName="wave-topbar" brandClassName="wave-brand" markClassName="wave-mark" mark="WAV" title="WAVE FIELD LAB" subtitle="Phase geometry / interference study" meta="WEBGL / FIELD SYNTHESIS" metaClassName="wave-top-meta" homeUrl="/" onHome={onBack} homeClassName="wave-hide-button" parameterValue={waveEditor.value} presetValue={waveEditor.baseline} onParameterChange={(next) => waveEditor.commit(next)} actions={<><button type="button" className="wave-params-toggle" aria-pressed={paramsVisible} onClick={() => setParamsVisible((value) => !value)}>{paramsVisible ? 'Hide params' : 'Show params'}</button><button type="button" className="wave-run-toggle" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></>}>
      <div className="wave-scene" data-particle-count={particleCount} data-occlusion-preset={occlusionPreset} data-experiment-mode={experimentMode} data-detection-time={detectionTime} data-glow-time={glowTime} data-slit-position={apertureSettings.slitPosition} data-slit-width-a={apertureSettings.slitWidthA} data-slit-width-b={apertureSettings.slitWidthB} data-slit-widths-linked={apertureSettings.slitWidthsLinked} data-detector-brightness={detectorBrightness} data-detector-palette={detectorPalette} data-detector-mask={detectorMaskEnabled} data-detector-pixel-density={detectorPixelDensity} data-detector-implementation={detectorImplementation} data-detector-resolution={detectorResolution} data-orbit-controls={orbitControlsVisible} data-source-vectors={sourceVectorsVisible} data-source-frame={JSON.stringify({ origin: sourceFrame.origin, direction: sourceFrame.direction })}><Canvas camera={{ position: [11, 8, 12], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><WaveScene waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} occlusionPreset={occlusionPreset} orbitControlsVisible={orbitControlsVisible} sourceVectorsVisible={sourceVectorsVisible} waveMechanics={waveMechanics} experimentMode={experimentMode} detectionTime={detectionTime} glowTime={glowTime} apertureSettings={apertureSettings} detectorBrightness={detectorBrightness} detectorPalette={detectorPalette} detectorMaskEnabled={detectorMaskEnabled} detectorPixelDensity={detectorPixelDensity} detectorImplementation={detectorImplementation} onDetectorResolutionChange={setDetectorResolution} /></Canvas></div>
      <CameraPerspectiveToolbar className="simulator-perspective-toolbar" modesClassName="simulator-perspective-modes" viewMode={viewMode} orbitPlaying={orbitPlaying} onViewChange={setViewMode} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
      <section className="wave-title"><p>Animated phase experiment</p><h1>Shape the interference.</h1><span>Independent wavelength, amplitude, phase mode, and phase parameters for every active wave.</span></section>
      <WavePanel
        waves={waves}
        waveCount={waveCount}
        interferenceModes={interferenceModes}
        running={running}
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
    </PerspectiveCameraContext.Provider>
    </DetectorVisibilityContext.Provider>
  );
}
