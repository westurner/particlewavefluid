import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three';
import {
  compareQuantumHydrodynamicDensity,
  createEulerKortewegState,
  createQuantumState,
  quantumDiagnostics,
  quantumObservables,
  QUANTUM_FLUID_PRESETS,
  stepEulerKorteweg,
  stepGrossPitaevskii
} from './quantumFluidModel.js';
import { BooleanParamControl, NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { CameraPerspectiveToolbar, OrbitCameraSettings, ParticleAppearanceSettings, PerspectiveOrbitControls, SimulatorBase } from './lib/SimulatorBase.jsx';
import { DEFAULT_CAMERA_VIEWS, DEFAULT_SIMULATOR_3D_PARAMETERS, DEFAULT_SIMULATOR_CAMERA_CONFIGURATION } from './lib/simulator-base.js';
import { DEFAULT_FIELD_MECHANICS, evaluateFieldModel, FIELD_MECHANICS_PARAMETER_FIELDS, FIELD_MODEL_DETAILS, FIELD_MODEL_PARAMETER_DEPENDENCIES, FIELD_MODEL_OPTIONS } from './mechanicsModels.js';

const VIEW_OPTIONS = [
  { value: 'side-by-side', label: 'GPE / Euler-Korteweg' },
  { value: 'difference', label: 'Density difference' },
  { value: 'hypothesis', label: 'SQG / DDF response' },
  { value: 'gpe', label: 'GPE only' },
  { value: 'euler-korteweg', label: 'Euler-Korteweg only' }
];

const FIELD_OPTIONS = [
  { value: 'density', label: 'Density' },
  { value: 'phase', label: 'Phase' },
  { value: 'current', label: 'Current magnitude' },
  { value: 'quantum-pressure', label: 'Quantum pressure' }
];
const VORTEX_CHARGE_OPTIONS = [-3, -2, -1, 1, 2, 3].map((charge) => ({ value: charge, label: String(charge) }));
const HYPOTHESIS_MODEL_OPTIONS = FIELD_MODEL_OPTIONS.filter(({ value }) => ['sqg', 'sqg-tensor-gaussian', 'ddf', 'ddf-tensor-gaussian'].includes(value));

const GRID_SIZE_OPTIONS = [16, 32, 64, 128, 256].map((size) => ({ value: size, label: `${size} x ${size}` }));
const GRID_SHAPE_OPTIONS = [
  { value: 'square', label: 'Square grid' },
  { value: 'circle', label: 'Circle' },
  { value: 'torus', label: 'Torus' }
];
const TORUS_MAJOR_RADIUS = 1.55;
const TORUS_TUBE_RADIUS = 0.6;
const PARTICLE_SHAPE_IDS = { native: 0, circle: 1, square: 2, sphere: 3, vector: 4 };
const VECTOR_DERIVATIVE_DESCRIPTION = 'For Vector shape, order 0 shows local current where available; orders 1-4 use periodic derivatives of the active scalar field to set arrow direction.';

const PARTICLE_VERTEX_SHADER = `
  uniform float uParticleSize;
  uniform float uSizeScale;
  uniform float uPixelScale;
  uniform float uZoomScale;
  attribute vec3 color;
  attribute float aVectorAngle;
  varying vec3 vColor;
  varying float vVectorAngle;

  void main() {
    vColor = color;
    vVectorAngle = aVectorAngle;
    vec4 modelPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, uParticleSize * uSizeScale * uPixelScale * uZoomScale / max(-modelPosition.z, 0.001));
    gl_Position = projectionMatrix * modelPosition;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform int uShape;
  varying vec3 vColor;
  varying float vVectorAngle;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    if ((uShape == 1 || uShape == 3) && radius > 0.5) discard;
    if (uShape == 4) {
      float cosine = cos(vVectorAngle);
      float sine = sin(vVectorAngle);
      point = vec2(cosine * point.x - sine * point.y, sine * point.x + cosine * point.y);
      float shaft = step(abs(point.x), 0.08) * step(abs(point.y), 0.28);
      float head = step(0.08, point.y) * step(abs(point.x), 0.24 - point.y * 0.25);
      if (max(shaft, head) < 0.5) discard;
    }
    float opacity = uOpacity;
    if (uShape == 0) opacity *= exp(-radius * radius * 8.0);
    vec3 particleColor = vColor;
    if (uShape == 3) particleColor *= 1.15 - radius * 0.7;
    gl_FragColor = vec4(particleColor, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createGridGeometry(size, particleCount) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(particleCount * 3), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(particleCount * 3), 3));
  geometry.setAttribute('aVectorAngle', new BufferAttribute(new Float32Array(particleCount), 1));
  return geometry;
}

function radicalInverse(value, base) {
  let inverse = 1 / base;
  let result = 0;
  while (value > 0) {
    result += (value % base) * inverse;
    value = Math.floor(value / base);
    inverse /= base;
  }
  return result;
}

function getGridSampleCoordinates(index, size, columns, rows, gridShape = 'square', particleCount = columns * rows, torusClosed = true) {
  if (gridShape === 'torus') {
    const sampleIndex = index + 1;
    const majorFraction = radicalInverse(sampleIndex, 2);
    return {
      x: majorFraction * (size - 1),
      y: radicalInverse(sampleIndex, 3) * (size - 1),
      tubeFraction: Math.sqrt(radicalInverse(sampleIndex, 5)),
      majorFraction: torusClosed ? majorFraction : 0.1 + majorFraction * 0.8
    };
  }
  if (gridShape === 'circle') {
    const radius = Math.sqrt((index + 0.5) / particleCount) * (size - 1) * 0.5;
    const angle = index * 2.399963229728653;
    return {
      x: (size - 1) * 0.5 + Math.cos(angle) * radius,
      y: (size - 1) * 0.5 + Math.sin(angle) * radius
    };
  }
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: Math.min(size - 1, Math.max(0, (column + 0.5) * size / columns - 0.5)),
    y: Math.min(size - 1, Math.max(0, (row + 0.5) * size / rows - 0.5))
  };
}

function getGridWorldPosition(gridShape, size, coordinates, elevation, width, majorRadius, tubeRadius) {
  const { x, y, tubeFraction = 1, majorFraction = x / size } = coordinates;
  if (gridShape === 'torus') {
    const majorAngle = majorFraction * Math.PI * 2;
    const tubeAngle = y / size * Math.PI * 2;
    const sectionRadius = tubeRadius * tubeFraction;
    const ringRadius = majorRadius + Math.cos(tubeAngle) * sectionRadius;
    return {
      x: Math.cos(majorAngle) * ringRadius,
      y: elevation + Math.sin(tubeAngle) * sectionRadius,
      z: Math.sin(majorAngle) * ringRadius
    };
  }
  return {
    x: (x / (size - 1) - 0.5) * width,
    y: elevation,
    z: (y / (size - 1) - 0.5) * width
  };
}

function sampleGridValue(values, size, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const xFraction = x - x0;
  const yFraction = y - y0;
  const top = values[y0 * size + x0] * (1 - xFraction) + values[y0 * size + x1] * xFraction;
  const bottom = values[y1 * size + x0] * (1 - xFraction) + values[y1 * size + x1] * xFraction;
  return top * (1 - yFraction) + bottom * yFraction;
}

function wrappedPhaseDelta(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function finiteValues(values) {
  return Float64Array.from(values, (value) => Number.isFinite(value) ? value : 0);
}

function maximumAbsoluteValue(values) {
  let maximum = 1e-9;
  for (const value of values) maximum = Math.max(maximum, Math.abs(value));
  return maximum;
}

function createParticleDirections(values, size, derivativeOrder, currentX, currentY, spacing, wrapPhase = false) {
  const order = Math.max(0, Math.min(4, Math.round(derivativeOrder ?? 1)));
  if (order === 0 && currentX && currentY) return { x: currentX, y: currentY };

  let xValues = Float64Array.from(values);
  let yValues = Float64Array.from(values);
  const passes = Math.max(1, order);
  for (let pass = 0; pass < passes; pass += 1) {
    const nextX = new Float64Array(values.length);
    const nextY = new Float64Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      const x = index % size;
      const y = Math.floor(index / size);
      const left = y * size + (x + size - 1) % size;
      const right = y * size + (x + 1) % size;
      const down = ((y + size - 1) % size) * size + x;
      const up = ((y + 1) % size) * size + x;
      const differenceX = wrapPhase && pass === 0
        ? Math.atan2(Math.sin(xValues[right] - xValues[left]), Math.cos(xValues[right] - xValues[left]))
        : xValues[right] - xValues[left];
      const differenceY = wrapPhase && pass === 0
        ? Math.atan2(Math.sin(yValues[up] - yValues[down]), Math.cos(yValues[up] - yValues[down]))
        : yValues[up] - yValues[down];
      nextX[index] = differenceX / (2 * spacing);
      nextY[index] = differenceY / (2 * spacing);
    }
    xValues = nextX;
    yValues = nextY;
  }
  return { x: xValues, y: yValues };
}

function writeVectorAngles(attribute, directions, size, particleCount, columns, rows, gridShape) {
  const angles = attribute.array;
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const { x, y } = getGridSampleCoordinates(particleIndex, size, columns, rows, gridShape, particleCount);
    const directionX = sampleGridValue(directions.x, size, x, y);
    const directionY = sampleGridValue(directions.y, size, x, y);
    angles[particleIndex] = Math.atan2(directionY, directionX) - Math.PI / 2;
  }
  attribute.needsUpdate = true;
}

function updateFieldGeometry(geometry, size, observables, field, particleCount, particleAppearance, domainSize, gridShape, torusMajorRadius, torusTubeRadius, torusClosed, width = 8) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const color = new Color();
  let values;
  if (field === 'phase') values = observables.phase;
  else if (field === 'current') values = Float64Array.from(observables.currentX, (value, index) => Math.hypot(value, observables.currentY[index]));
  else if (field === 'quantum-pressure') values = observables.quantumPressure;
  else values = observables.density;
  const samples = finiteValues(values);
  const maximumMagnitude = maximumAbsoluteValue(samples);
  const columns = Math.ceil(Math.sqrt(particleCount));
  const rows = Math.ceil(particleCount / columns);
  const directions = particleAppearance.shape === 'vector'
    ? createParticleDirections(samples, size, particleAppearance.derivativeOrder, observables.currentX, observables.currentY, domainSize / size, field === 'phase')
    : null;
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const coordinates = getGridSampleCoordinates(particleIndex, size, columns, rows, gridShape, particleCount, torusClosed);
    const { x, y } = coordinates;
    const value = sampleGridValue(samples, size, x, y);
    const normalized = field === 'phase'
      ? (value + Math.PI) / (2 * Math.PI)
      : Math.min(1, Math.abs(value) / maximumMagnitude);
    const point = getGridWorldPosition(gridShape, size, coordinates, field === 'phase' ? 0.1 : normalized * 1.7, width, torusMajorRadius, torusTubeRadius);
    positions[particleIndex * 3] = point.x;
    positions[particleIndex * 3 + 1] = point.y;
    positions[particleIndex * 3 + 2] = point.z;
    if (field === 'phase') color.setHSL(normalized, 0.8, 0.52);
    else if (field === 'quantum-pressure') color.setHSL(value >= 0 ? 0.08 : 0.55, 0.82, 0.3 + normalized * 0.35);
    else color.setHSL(0.58 - normalized * 0.5, 0.82, 0.32 + normalized * 0.3);
    colors[particleIndex * 3] = color.r;
    colors[particleIndex * 3 + 1] = color.g;
    colors[particleIndex * 3 + 2] = color.b;
  }
  if (directions) writeVectorAngles(geometry.attributes.aVectorAngle, directions, size, particleCount, columns, rows, gridShape);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function updateHydrodynamicGeometry(geometry, state, particleCount, particleAppearance, gridShape, torusMajorRadius, torusTubeRadius, torusClosed, width = 8) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const density = finiteValues(state.density);
  const maximumDensity = maximumAbsoluteValue(density);
  const color = new Color();
  const columns = Math.ceil(Math.sqrt(particleCount));
  const rows = Math.ceil(particleCount / columns);
  const directions = particleAppearance.shape === 'vector'
    ? createParticleDirections(density, state.size, particleAppearance.derivativeOrder, state.velocityX, state.velocityY, state.domainSize / state.size)
    : null;
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const coordinates = getGridSampleCoordinates(particleIndex, state.size, columns, rows, gridShape, particleCount, torusClosed);
    const { x, y } = coordinates;
    const value = sampleGridValue(density, state.size, x, y);
    const normalized = Math.min(1, value / maximumDensity);
    const point = getGridWorldPosition(gridShape, state.size, coordinates, normalized * 1.7, width, torusMajorRadius, torusTubeRadius);
    positions[particleIndex * 3] = point.x;
    positions[particleIndex * 3 + 1] = point.y;
    positions[particleIndex * 3 + 2] = point.z;
    color.setHSL(0.32 - normalized * 0.24, 0.72, 0.3 + normalized * 0.32);
    colors[particleIndex * 3] = color.r;
    colors[particleIndex * 3 + 1] = color.g;
    colors[particleIndex * 3 + 2] = color.b;
  }
  if (directions) writeVectorAngles(geometry.attributes.aVectorAngle, directions, state.size, particleCount, columns, rows, gridShape);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function updateDifferenceGeometry(geometry, size, comparison, particleCount, particleAppearance, domainSize, gridShape, torusMajorRadius, torusTubeRadius, torusClosed, width = 9) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const scale = Math.max(comparison.maximumDifference, 1e-9);
  const difference = finiteValues(comparison.difference);
  const color = new Color();
  const columns = Math.ceil(Math.sqrt(particleCount));
  const rows = Math.ceil(particleCount / columns);
  const directions = particleAppearance.shape === 'vector'
    ? createParticleDirections(difference, size, particleAppearance.derivativeOrder, null, null, domainSize / size)
    : null;
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const coordinates = getGridSampleCoordinates(particleIndex, size, columns, rows, gridShape, particleCount, torusClosed);
    const { x, y } = coordinates;
    const normalized = sampleGridValue(difference, size, x, y) / scale;
    const point = getGridWorldPosition(gridShape, size, coordinates, Math.abs(normalized) * 1.8, width, torusMajorRadius, torusTubeRadius);
    positions[particleIndex * 3] = point.x;
    positions[particleIndex * 3 + 1] = point.y;
    positions[particleIndex * 3 + 2] = point.z;
    color.setHSL(normalized >= 0 ? 0.08 : 0.57, 0.88, 0.34 + Math.abs(normalized) * 0.3);
    colors[particleIndex * 3] = color.r;
    colors[particleIndex * 3 + 1] = color.g;
    colors[particleIndex * 3 + 2] = color.b;
  }
  if (directions) writeVectorAngles(geometry.attributes.aVectorAngle, directions, size, particleCount, columns, rows, gridShape);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function updateHypothesisGeometry(geometry, size, observables, field, particleCount, particleAppearance, domainSize, gridShape, torusMajorRadius, torusTubeRadius, torusClosed, vortexCenterX, vortexCenterY, fieldMechanics, width = 8) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const density = finiteValues(observables.density);
  const maximumDensity = maximumAbsoluteValue(density);
  const values = field === 'phase'
    ? finiteValues(observables.phase)
    : field === 'current'
      ? finiteValues(Float64Array.from(observables.currentX, (value, index) => Math.hypot(value, observables.currentY[index])))
      : field === 'quantum-pressure'
        ? finiteValues(observables.quantumPressure)
        : density;
    const phaseGradientX = new Float64Array(density.length);
    const phaseGradientY = new Float64Array(density.length);
    const phaseGradientMagnitude = new Float64Array(density.length);
    const spacing = domainSize / size;
    let maximumPhaseGradient = 1e-9;
    for (let gridY = 0; gridY < size; gridY += 1) {
      for (let gridX = 0; gridX < size; gridX += 1) {
        const sampleIndex = gridY * size + gridX;
        const left = gridY * size + (gridX + size - 1) % size;
        const right = gridY * size + (gridX + 1) % size;
        const down = ((gridY + size - 1) % size) * size + gridX;
        const up = ((gridY + 1) % size) * size + gridX;
        phaseGradientX[sampleIndex] = wrappedPhaseDelta(observables.phase[right] - observables.phase[left]) / (2 * spacing);
        phaseGradientY[sampleIndex] = wrappedPhaseDelta(observables.phase[up] - observables.phase[down]) / (2 * spacing);
        phaseGradientMagnitude[sampleIndex] = Math.hypot(phaseGradientX[sampleIndex], phaseGradientY[sampleIndex]);
        maximumPhaseGradient = Math.max(maximumPhaseGradient, phaseGradientMagnitude[sampleIndex]);
      }
    }
    const maximumSelectedField = maximumAbsoluteValue(values);
  const directions = particleAppearance.shape === 'vector'
    ? createParticleDirections(values, size, particleAppearance.derivativeOrder, observables.currentX, observables.currentY, domainSize / size, field === 'phase')
    : null;
  const columns = Math.ceil(Math.sqrt(particleCount));
  const rows = Math.ceil(particleCount / columns);
  const responses = new Float64Array(particleCount);
  let maximumResponse = 1e-9;
  const velocityAt = (index, component) => {
    const floorDensity = Math.max(density[index], 1e-8);
    return (component === 'x' ? observables.currentX[index] : observables.currentY[index]) / floorDensity;
  };

  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const { x, y } = getGridSampleCoordinates(particleIndex, size, columns, rows, gridShape, particleCount, torusClosed);
    const gridX = Math.max(0, Math.min(size - 1, Math.round(x)));
    const gridY = Math.max(0, Math.min(size - 1, Math.round(y)));
    const sampleIndex = gridY * size + gridX;
    const left = gridY * size + (gridX + size - 1) % size;
    const right = gridY * size + (gridX + 1) % size;
    const down = ((gridY + size - 1) % size) * size + gridX;
    const up = ((gridY + 1) % size) * size + gridX;
    const velocityX = velocityAt(sampleIndex, 'x');
    const velocityY = velocityAt(sampleIndex, 'y');
    const selectedPhaseGradientX = field === 'phase' ? phaseGradientX[sampleIndex] : velocityX;
    const selectedPhaseGradientY = field === 'phase' ? phaseGradientY[sampleIndex] : velocityY;
    const vorticity = (velocityAt(right, 'y') - velocityAt(left, 'y') - velocityAt(up, 'x') + velocityAt(down, 'x')) / (2 * spacing);
    const coordinateX = (gridX - size / 2) * spacing - (Number.isFinite(vortexCenterX) ? vortexCenterX : 0);
    const coordinateY = (gridY - size / 2) * spacing - (Number.isFinite(vortexCenterY) ? vortexCenterY : 0);
    const modelResponse = evaluateFieldModel(fieldMechanics.model, {
      radius: Math.max(0.05, Math.hypot(coordinateX, coordinateY)),
      speed: Math.hypot(velocityX, velocityY),
      magnitude: field === 'phase'
        ? Math.min(1, phaseGradientMagnitude[sampleIndex] / maximumPhaseGradient)
        : Math.min(1, Math.abs(values[sampleIndex]) / maximumSelectedField),
      rotation: vorticity * 0.5,
      spinAxis: [0, 0, 1],
      phaseGradient: [selectedPhaseGradientX, selectedPhaseGradientY, 0],
      phaseVorticity: [0, 0, vorticity]
    }, fieldMechanics);
    const response = modelResponse.radialAcceleration + (modelResponse.tangentialAcceleration ?? 0) + (modelResponse.rotationalResponse ?? 0);
    responses[particleIndex] = Number.isFinite(response) ? response : 0;
    maximumResponse = Math.max(maximumResponse, Math.abs(responses[particleIndex]));
  }

  const color = new Color();
  for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
    const coordinates = getGridSampleCoordinates(particleIndex, size, columns, rows, gridShape, particleCount, torusClosed);
    const normalized = responses[particleIndex] / maximumResponse;
    const point = getGridWorldPosition(gridShape, size, coordinates, normalized * 1.8, width, torusMajorRadius, torusTubeRadius);
    positions[particleIndex * 3] = point.x;
    positions[particleIndex * 3 + 1] = point.y;
    positions[particleIndex * 3 + 2] = point.z;
    color.setHSL(normalized >= 0 ? 0.08 : 0.58, 0.86, 0.34 + Math.abs(normalized) * 0.34);
    colors[particleIndex * 3] = color.r;
    colors[particleIndex * 3 + 1] = color.g;
    colors[particleIndex * 3 + 2] = color.b;
  }
  if (directions) writeVectorAngles(geometry.attributes.aVectorAngle, directions, size, particleCount, columns, rows, gridShape);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function FieldPoints({ geometry, position, visible, particleAppearance, controlsRef }) {
  const { gl, size } = useThree();
  const baseZoomRef = useRef(null);
  const uniforms = useMemo(() => ({
    uParticleSize: { value: 0.13 },
    uSizeScale: { value: 1 },
    uPixelScale: { value: 1 },
    uZoomScale: { value: 1 },
    uOpacity: { value: 0.94 },
    uShape: { value: 0 }
  }), []);
  const material = useMemo(() => new ShaderMaterial({
    uniforms,
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false
  }), [uniforms]);

  useEffect(() => {
    uniforms.uSizeScale.value = particleAppearance.sizeScale ?? 1;
    uniforms.uPixelScale.value = size.height * gl.getPixelRatio() / 2;
    uniforms.uOpacity.value = 0.94 * (particleAppearance.opacity ?? 1);
    uniforms.uShape.value = PARTICLE_SHAPE_IDS[particleAppearance.shape] ?? PARTICLE_SHAPE_IDS.native;
  }, [gl, particleAppearance.opacity, particleAppearance.shape, particleAppearance.sizeScale, size.height, uniforms]);

  useFrame(({ camera }) => {
    const controlTarget = controlsRef?.current?.target;
    const distance = controlTarget ? camera.position.distanceTo(controlTarget) : camera.position.length();
    if (!baseZoomRef.current) baseZoomRef.current = { distance, zoom: camera.zoom };
    const zoomFactor = camera.zoom / baseZoomRef.current.zoom * baseZoomRef.current.distance / Math.max(distance, 1e-6);
    const sensitivity = particleAppearance.zoomSizeSensitivity ?? 1;
    uniforms.uZoomScale.value = particleAppearance.zoomSizeEnabled
      ? Math.pow(Math.max(zoomFactor, 1e-6), sensitivity)
      : 1;
  });

  useEffect(() => () => material.dispose(), [material]);

  return <points geometry={geometry} material={material} position={position} visible={visible} />;
}

function QuantumEvolution({ settings, running, resetToken, onTelemetry, particleAppearance, controlsRef }) {
  const gpeGeometry = useMemo(() => createGridGeometry(settings.size, settings.particleCount), [settings.particleCount, settings.size]);
  const hydrodynamicGeometry = useMemo(() => createGridGeometry(settings.size, settings.particleCount), [settings.particleCount, settings.size]);
  const differenceGeometry = useMemo(() => createGridGeometry(settings.size, settings.particleCount), [settings.particleCount, settings.size]);
  const hypothesisGeometry = useMemo(() => createGridGeometry(settings.size, settings.particleCount), [settings.particleCount, settings.size]);
  const stateRef = useRef(null);
  const initialDiagnosticsRef = useRef(null);
  const previousVortexCountRef = useRef(0);
  const phaseSlipsRef = useRef(0);
  const telemetryTimeRef = useRef(0);

  useEffect(() => {
    const quantum = createQuantumState({ size: settings.size, domainSize: settings.domainSize, preset: settings.preset, interaction: settings.interaction, vortexCharge: settings.vortexCharge, vortexCoreRadius: settings.vortexCoreRadius, vortexCenterX: settings.vortexCenterX, vortexCenterY: settings.vortexCenterY });
    const hydrodynamic = createEulerKortewegState(quantum);
    const initial = quantumDiagnostics(quantum);
    stateRef.current = { quantum, hydrodynamic };
    initialDiagnosticsRef.current = initial;
    previousVortexCountRef.current = initial.vortices.length;
    phaseSlipsRef.current = 0;
  }, [resetToken, settings.domainSize, settings.interaction, settings.preset, settings.size, settings.vortexCharge, settings.vortexCoreRadius, settings.vortexCenterX, settings.vortexCenterY]);

  useEffect(() => () => {
    gpeGeometry.dispose();
    hydrodynamicGeometry.dispose();
    differenceGeometry.dispose();
    hypothesisGeometry.dispose();
  }, [differenceGeometry, gpeGeometry, hypothesisGeometry, hydrodynamicGeometry]);

  useFrame((_, frameDelta) => {
    const state = stateRef.current;
    if (!state) return;
    if (running) {
      const substeps = Math.max(1, Math.min(5, Math.round(settings.timeScale * 2)));
      const deltaTime = settings.stepSize * settings.timeScale / substeps;
      for (let step = 0; step < substeps; step += 1) {
        stepGrossPitaevskii(state.quantum, deltaTime, { potentialStrength: settings.potentialStrength });
        stepEulerKorteweg(state.hydrodynamic, deltaTime);
      }
    }
    const diagnostics = quantumDiagnostics(state.quantum, initialDiagnosticsRef.current);
    const comparison = compareQuantumHydrodynamicDensity(state.quantum, state.hydrodynamic);
    updateFieldGeometry(gpeGeometry, settings.size, diagnostics.observables, settings.field, settings.particleCount, particleAppearance, settings.domainSize, settings.gridShape, settings.torusMajorRadius, settings.torusTubeRadius, settings.torusClosed);
    updateHydrodynamicGeometry(hydrodynamicGeometry, state.hydrodynamic, settings.particleCount, particleAppearance, settings.gridShape, settings.torusMajorRadius, settings.torusTubeRadius, settings.torusClosed);
    updateDifferenceGeometry(differenceGeometry, settings.size, comparison, settings.particleCount, particleAppearance, settings.domainSize, settings.gridShape, settings.torusMajorRadius, settings.torusTubeRadius, settings.torusClosed);
    if (settings.view === 'hypothesis') {
      updateHypothesisGeometry(hypothesisGeometry, settings.size, diagnostics.observables, settings.field, settings.particleCount, particleAppearance, settings.domainSize, settings.gridShape, settings.torusMajorRadius, settings.torusTubeRadius, settings.torusClosed, settings.vortexCenterX, settings.vortexCenterY, settings.fieldMechanics);
    }
    telemetryTimeRef.current += frameDelta;
    if (telemetryTimeRef.current >= 0.2) {
      telemetryTimeRef.current = 0;
      if (diagnostics.vortices.length !== previousVortexCountRef.current) {
        phaseSlipsRef.current += Math.abs(diagnostics.vortices.length - previousVortexCountRef.current);
        previousVortexCountRef.current = diagnostics.vortices.length;
      }
      onTelemetry({
        time: state.quantum.time,
        norm: diagnostics.norm,
        energy: diagnostics.energy,
        normDrift: diagnostics.normDrift,
        energyDrift: diagnostics.energyDrift,
        vortexCount: diagnostics.vortices.length,
        totalCharge: diagnostics.vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
        phaseSlips: phaseSlipsRef.current,
        rmsDifference: comparison.rmsDifference,
        maximumDifference: comparison.maximumDifference
      });
    }
  });

  const sideBySide = settings.view === 'side-by-side';
  return <group>
    <FieldPoints geometry={gpeGeometry} position={sideBySide ? [-4.6, 0, 0] : [0, 0, 0]} visible={sideBySide || settings.view === 'gpe'} particleAppearance={particleAppearance} controlsRef={controlsRef} />
    <FieldPoints geometry={hydrodynamicGeometry} position={sideBySide ? [4.6, 0, 0] : [0, 0, 0]} visible={sideBySide || settings.view === 'euler-korteweg'} particleAppearance={particleAppearance} controlsRef={controlsRef} />
    <FieldPoints geometry={differenceGeometry} position={[0, 0, 0]} visible={settings.view === 'difference'} particleAppearance={particleAppearance} controlsRef={controlsRef} />
    <FieldPoints geometry={hypothesisGeometry} position={[0, 0, 0]} visible={settings.view === 'hypothesis'} particleAppearance={particleAppearance} controlsRef={controlsRef} />
  </group>;
}

function QuantumScene({ viewMode, orbitPlaying, orbitSettings, particleAppearance, onUserInteraction, ...props }) {
  const { camera } = useThree();
  const cameraControlsRef = useRef(null);

  useEffect(() => {
    const target = [orbitSettings.cameraTargetX, orbitSettings.cameraTargetY, orbitSettings.cameraTargetZ];
    camera.position.set(orbitSettings.cameraPosX, orbitSettings.cameraPosY, orbitSettings.cameraPosZ);
    cameraControlsRef.current?.target.set(...target);
    camera.lookAt(...target);
    cameraControlsRef.current?.update();
  }, [camera, orbitSettings.cameraPosX, orbitSettings.cameraPosY, orbitSettings.cameraPosZ, orbitSettings.cameraTargetX, orbitSettings.cameraTargetY, orbitSettings.cameraTargetZ]);

  return <>
    <color attach="background" args={['#071117']} />
    {/* <fog attach="fog" args={['#071117', 16, 34]} /> */}
    <ambientLight intensity={0.65} color="#b8dcd5" />
    <directionalLight intensity={1.3} position={[5, 10, 5]} color="#ffe8b5" />
    <gridHelper args={[20, 40, '#244d55', '#112b31']} position={[0, -0.08, 0]} />
    <QuantumEvolution {...props} particleAppearance={particleAppearance} controlsRef={cameraControlsRef} />
    <PerspectiveOrbitControls controlsRef={cameraControlsRef} viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={orbitSettings} cameraParams={{ minDistance: 8, maxDistance: 34, target: [orbitSettings.cameraTargetX, orbitSettings.cameraTargetY, orbitSettings.cameraTargetZ] }} onUserInteraction={onUserInteraction} />
  </>;
}

function Slider({ label, value, min, max, step, onChange, path, description }) {
  return <NumericParamControl className="quantum-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} path={path} description={description} showDescription={Boolean(description)} />;
}

export default function QuantumFluidSim({ onBack }) {
  const [presetSettings] = useState({ size: 32, gridShape: 'square', torusMajorRadius: TORUS_MAJOR_RADIUS, torusTubeRadius: TORUS_TUBE_RADIUS, torusClosed: true, vortexCharge: 1, vortexCoreRadius: 0.75, vortexCenterX: 0, vortexCenterY: 0, particleCount: 1024, domainSize: 12, preset: 'vortex', view: 'side-by-side', field: 'density', interaction: 0.8, potentialStrength: 0, stepSize: 0.002, timeScale: 1, running: true, fieldMechanics: { ...DEFAULT_FIELD_MECHANICS, enabled: true, model: 'sqg', comparisonModel: 'ddf' }, ...DEFAULT_SIMULATOR_CAMERA_CONFIGURATION, ...DEFAULT_SIMULATOR_3D_PARAMETERS, cameraPosX: 14, cameraPosY: 14, cameraPosZ: 20, cameraTargetX: 0, cameraTargetY: 0.5, cameraTargetZ: 0, cameraZoom: 1, cameraFov: 43, cameraNear: 0.1, cameraFar: 90 });
  const [settings, setSettings] = useState({
    size: 32,
    gridShape: 'square',
    torusMajorRadius: TORUS_MAJOR_RADIUS,
    torusTubeRadius: TORUS_TUBE_RADIUS,
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
    fieldMechanics: { ...DEFAULT_FIELD_MECHANICS, enabled: true, model: 'sqg', comparisonModel: 'ddf' }
  });
  const [running, setRunning] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [viewSettings, setViewSettings] = useState(() => ({ ...DEFAULT_SIMULATOR_CAMERA_CONFIGURATION, ...DEFAULT_SIMULATOR_3D_PARAMETERS, cameraPosX: 14, cameraPosY: 14, cameraPosZ: 20, cameraTargetX: 0, cameraTargetY: 0.5, cameraTargetZ: 0, cameraZoom: 1, cameraFov: 43, cameraNear: 0.1, cameraFar: 90 }));
  const [resetToken, setResetToken] = useState(0);
  const [telemetry, setTelemetry] = useState({ time: 0, norm: 0, energy: 0, normDrift: 0, energyDrift: 0, vortexCount: 0, totalCharge: 0, phaseSlips: 0, rmsDifference: 0, maximumDifference: 0 });
  const update = (patch) => setSettings((current) => ({ ...current, ...patch }));
  const parameterValue = { ...settings, ...viewSettings, running };
  const updateParameterValue = (next) => {
    setSettings((current) => Object.fromEntries(Object.keys(current).map((key) => [key, next[key]])));
    setRunning(next.running);
    setViewSettings((current) => Object.fromEntries(Object.keys(current).map((key) => [key, next[key]])));
  };
  const updateViewParameter = (next, path) => {
    const changedPaths = Array.isArray(path) ? path : [path];
    if (changedPaths.length > 0 && changedPaths.every((changedPath) => typeof changedPath === 'string' && changedPath.startsWith('particleAppearance.'))) {
      setViewSettings((current) => ({ ...current, particleAppearance: next.particleAppearance }));
      return;
    }
    if (path === 'size') next = { ...next, particleCount: Math.min(next.particleCount, next.size ** 2) };
    if (path === 'torusMajorRadius') next = { ...next, torusTubeRadius: Math.min(next.torusTubeRadius, next.torusMajorRadius - 0.05) };
    updateParameterValue(next);
    if (typeof path === 'string' && (path.startsWith('cameraPos') || path.startsWith('cameraTarget'))) setViewMode(null);
  };

  return <SimulatorBase className="quantum-app" headerClassName="quantum-topbar" mark="QFL" markClassName="quantum-mark" title="QUANTUM FLUID LAB" subtitle="Gross-Pitaevskii / Euler-Korteweg" parameterValue={parameterValue} presetValue={presetSettings} onParameterChange={updateViewParameter} actions={<><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button><button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></>} onHome={onBack}>
    <div className="quantum-scene"><Canvas camera={{ position: [11, 9, 13], fov: 43, near: 0.1, far: 90 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><QuantumScene settings={settings} running={running} resetToken={resetToken} onTelemetry={setTelemetry} viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={viewSettings} particleAppearance={viewSettings.particleAppearance} onUserInteraction={() => setViewMode(null)} /></Canvas></div>
    <CameraPerspectiveToolbar className="simulator-perspective-toolbar" modesClassName="simulator-perspective-modes" views={DEFAULT_CAMERA_VIEWS} viewMode={viewMode} orbitPlaying={orbitPlaying} onViewChange={setViewMode} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
    <section className="quantum-title"><span>ACTIVE FIELD / COMPLEX ORDER PARAMETER</span><h1>Evolve phase.<br />Measure conservation.</h1><p>Split-step Fourier GPE and finite-difference Euler-Korteweg states advance from identical initial conditions.</p></section>
    <aside className={`quantum-panel ${panelVisible ? '' : 'is-hidden'}`}>
      <div className="quantum-panel-heading"><div><span>PERIODIC GRID / ℏ = m = 1</span><h2>Quantum fluid</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
      <div className="quantum-control-group">
        <ParamSelect className="quantum-select" label="Grid size" path="size" value={settings.size} options={GRID_SIZE_OPTIONS} onChange={(size) => update({ size })} />
        <ParamSelect className="quantum-select" label="Grid shape" path="gridShape" value={settings.gridShape} options={GRID_SHAPE_OPTIONS} onChange={(gridShape) => update({ gridShape })} />
        {settings.gridShape === 'torus' && <>
          <BooleanParamControl className="" label="Connect torus ends" checked={settings.torusClosed} path="torusClosed" onChange={(torusClosed) => update({ torusClosed })} />
          <Slider label="Torus major radius" value={settings.torusMajorRadius} min={0.75} max={4} step={0.05} path="torusMajorRadius" onChange={(torusMajorRadius) => update({ torusMajorRadius })} />
          <Slider label="Torus tube radius" value={settings.torusTubeRadius} min={0.1} max={Math.min(1.5, settings.torusMajorRadius - 0.05)} step={0.05} path="torusTubeRadius" onChange={(torusTubeRadius) => update({ torusTubeRadius })} />
        </>}
        <Slider label="Particle count" value={settings.particleCount} min={64} max={settings.size ** 2} step={64} path="particleCount" onChange={(particleCount) => update({ particleCount })} />
        <p className="quantum-warning">The hydrodynamic map is singular at vacuum nodes; this implementation uses a declared density floor for finite diagnostics.</p>
        <ParamSelect className="quantum-select" label="Initial state" value={settings.preset} options={QUANTUM_FLUID_PRESETS} onChange={(preset) => update({ preset })} />
        <details className="quantum-control-group" open>
          <summary>GPE parameters</summary>
          {settings.preset === 'vortex' && <>
            <ParamSelect className="quantum-select" label="Vortex charge" path="vortexCharge" value={settings.vortexCharge} options={VORTEX_CHARGE_OPTIONS} onChange={(vortexCharge) => update({ vortexCharge })} />
            <small className="parameter-description">Integer phase winding around the core; sign sets circulation direction and magnitude sets winding order.</small>
            <Slider label="Vortex core radius" value={settings.vortexCoreRadius} min={0.1} max={3} step={0.05} path="vortexCoreRadius" onChange={(vortexCoreRadius) => update({ vortexCoreRadius })} description="Sets the radial scale over which density recovers from zero at the vortex core." />
            <Slider label="Vortex center X" value={settings.vortexCenterX} min={-3} max={3} step={0.1} path="vortexCenterX" onChange={(vortexCenterX) => update({ vortexCenterX })} description="Offsets the vortex center horizontally from the grid center, in domain units." />
            <Slider label="Vortex center Y" value={settings.vortexCenterY} min={-3} max={3} step={0.1} path="vortexCenterY" onChange={(vortexCenterY) => update({ vortexCenterY })} description="Offsets the vortex center vertically from the grid center, in domain units." />
          </>}
          <Slider label="Interaction g" value={settings.interaction} min={0} max={3} step={0.05} onChange={(interaction) => update({ interaction })} description="Nonlinear self-interaction strength; higher values make dense regions accumulate phase faster." />
          <Slider label="Harmonic potential" value={settings.potentialStrength} min={0} max={0.2} step={0.005} onChange={(potentialStrength) => update({ potentialStrength })} description="Trap strength for the potential V(r) = 1/2 k r², centered on the grid origin." />
        </details>
        <ParamSelect className="quantum-select" label="View" value={settings.view} options={VIEW_OPTIONS} onChange={(view) => update({ view })} />
        <ParamSelect className="quantum-select" label="GPE field" value={settings.field} options={FIELD_OPTIONS} onChange={(field) => update({ field })} />
        <Slider label="Time scale" value={settings.timeScale} min={0.1} max={2} step={0.05} onChange={(timeScale) => update({ timeScale })} />
        <div className="quantum-actions"><button type="button" onClick={() => setResetToken((value) => value + 1)}>Reset identical states</button></div>
      </div>
      <details className="quantum-control-group">
        <summary>SQG / DDF hypothesis</summary>
        <ParamSelect className="quantum-select" label="Hypothesis model" path="fieldMechanics.model" value={settings.fieldMechanics.model} options={HYPOTHESIS_MODEL_OPTIONS} onChange={(model) => update({ fieldMechanics: { ...settings.fieldMechanics, model } })} />
        <p className="quantum-warning">This response is evaluated over the live quantum observables as a hypothesis overlay; it does not replace the GPE or Euler-Korteweg solvers.</p>
        <p className="quantum-warning">{FIELD_MODEL_DETAILS[settings.fieldMechanics.model].description} {FIELD_MODEL_DETAILS[settings.fieldMechanics.model].solver}</p>
        {FIELD_MODEL_PARAMETER_DEPENDENCIES[settings.fieldMechanics.model].map((key) => {
          const field = FIELD_MECHANICS_PARAMETER_FIELDS[key];
          return <Slider key={key} label={field.label} value={settings.fieldMechanics[key]} min={field.min} max={field.max} step={field.step} path={`fieldMechanics.${key}`} description={field.description} onChange={(value) => update({ fieldMechanics: { ...settings.fieldMechanics, [key]: value } })} />;
        })}
      </details>
      <details open><summary>Conservation</summary>
        <div className="quantum-readout"><span>Simulation time</span><strong>{telemetry.time.toFixed(3)}</strong></div>
        <div className="quantum-readout"><span>Norm</span><strong>{telemetry.norm.toFixed(6)}</strong></div>
        <div className="quantum-readout"><span>Norm drift</span><strong>{telemetry.normDrift.toExponential(2)}</strong></div>
        <div className="quantum-readout"><span>Energy</span><strong>{telemetry.energy.toFixed(5)}</strong></div>
        <div className="quantum-readout"><span>Energy drift</span><strong>{telemetry.energyDrift.toExponential(2)}</strong></div>
      </details>
      <details open><summary>Topology and comparison</summary>
        <div className="quantum-readout"><span>Vortices</span><strong>{telemetry.vortexCount}</strong></div>
        <div className="quantum-readout"><span>Total winding</span><strong>{telemetry.totalCharge}</strong></div>
        <div className="quantum-readout"><span>Phase-slip events</span><strong>{telemetry.phaseSlips}</strong></div>
        <div className="quantum-readout"><span>Density RMS delta</span><strong>{telemetry.rmsDifference.toExponential(2)}</strong></div>
        <div className="quantum-readout"><span>Maximum delta</span><strong>{telemetry.maximumDifference.toExponential(2)}</strong></div>
      </details>
      <OrbitCameraSettings configuration={parameterValue} onChange={updateViewParameter} className="quantum-control-group" />
      <ParticleAppearanceSettings configuration={parameterValue} onChange={updateViewParameter} className="quantum-control-group" capabilities={{ zoomSizeEnabled: true, zoomSizeSensitivity: true, shape: true, derivativeOrder: true, colorMode: false, color: false }} descriptions={{ derivativeOrder: VECTOR_DERIVATIVE_DESCRIPTION }} />
    </aside>
  </SimulatorBase>;
}