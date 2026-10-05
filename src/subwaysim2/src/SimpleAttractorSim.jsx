import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, TransformControls } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Camera, Color, DoubleSide, Euler, FloatType, HalfFloatType, InstancedBufferAttribute, Mesh, NearestFilter, NoBlending, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, TOUCH, Vector3, WebGLRenderTarget } from 'three';
import { createGpuParticleField, createSimulationUvs } from './simulations/gpuParticleRuntime.js';
import { HistoryControls, NumericParamControl, ParamEditingProvider, ParamEditingToggle, ParamSelect } from './lib/ParamControls.jsx';
import { useSimulationEditor, useUndoRedoShortcuts } from './lib/simulation-state.js';
import { CameraPerspectiveToolbar, OrbitCameraControls, OrbitCameraSettings, ParticleAppearanceSettings, SimulatorBase, SimulatorExportModal, SimulatorIOJournal, SimulatorPresetControls, useSimulatorJournal } from './lib/SimulatorBase.jsx';
import { buildParameterReplayJournal, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, deletePresetLibrary, parseParameterEditLogYaml, parseSimulatorJson, readPresetLibrary, serializeParameterEditLog, writePresetLibrary } from './lib/simulator-base.js';
import { createCameraViews, DEFAULT_SIMULATOR_CAMERA_CONFIGURATION } from './lib/simulator-base.js';
import { compareFieldModels, DEFAULT_FIELD_MECHANICS, FIELD_MODEL_DETAILS, FIELD_MODEL_OPTIONS, fieldModelIndex, sanitizeFieldMechanics } from './mechanicsModels.js';
import { advanceBlackHoleStarField, createBlackHoleStarField } from './blackHoleStarModel.js';
import {
  ATTRACTOR_PATH_HISTORY_CAPACITY,
  ATTRACTOR_PATH_SAMPLE_RATE,
  DEFAULT_ATTRACTOR_PATH_SETTINGS,
  appendAttractorPathSample,
  createAttractorPathHistory,
  sanitizeAttractorPathSettings,
  writeAttractorPathSegments
} from './attractorPathModel.js';
import {
  DEFAULT_PARTICLE_PATH_SETTINGS,
  PARTICLE_PATH_HISTORY_CAPACITY,
  PARTICLE_PATH_SAMPLE_COUNT,
  PARTICLE_PATH_SAMPLE_RATE,
  particlePathWindow,
  sanitizeParticlePathSettings
} from './particlePathModel.js';

const MAX_ATTRACTORS = 20;
const PARTICLE_COUNT = 2 ** 18;
const E2E_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');
const E2E_PARTICLE_COUNT = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e') ? 2 ** 11 : null;
const PRESET_STORAGE_KEY = 'sqgsim-attractor-presets';
const ATTRACTOR_PANEL_LAYOUT = { breakpoint: 700, width: 350, right: 28 };
const ATTRACTOR_CAMERA_TARGET = [0, 0, 0];
const ATTRACTOR_CAMERA_VIEWS = createCameraViews();

function createBlackHoleStarRuntimeState() {
  return {
    positions: Array.from({ length: MAX_ATTRACTORS }, () => new Vector3()),
    massFractions: new Float32Array(MAX_ATTRACTORS)
  };
}
const TRANSFORM_MODE_OPTIONS = [
  { value: 'translate', label: 'Translate' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'disabled', label: 'Disabled' }
];
const BLACK_HOLE_ATTRACTOR_DEFAULTS = {
  eventHorizonShear: 10,
  fractureThreshold: 25,
  rotationSpeed: 1,
  testStarEccentricity: 0.8,
  thermalNoise: 2,
  orbitRadius: 8,
  orbitVerticalAmplitude: 0.5,
  fractureIntensity: 1
};

function createAttractor(overrides = {}, type = 'simple') {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    name: 'Attractor',
    magnitude: 1,
    type,
    ...overrides,
    simple: { massMultiplier: 1, spinMultiplier: 1, ...overrides.simple },
    blackHole: { ...BLACK_HOLE_ATTRACTOR_DEFAULTS, ...overrides.blackHole }
  };
}

const INITIAL_ATTRACTORS = [
  createAttractor({ position: [-1, 0, 0], name: 'Attractor 0' }),
  createAttractor({ position: [1, 0, -0.5], name: 'Attractor 1' }),
  createAttractor({ position: [0, 0.5, 1], rotation: [-0.51, 0.41, -1.35], name: 'Attractor 2' })
];

function cameraFrameOffset(camera, cameraPosition, target, viewport, parametersVisible) {
  if (!parametersVisible || viewport.width <= ATTRACTOR_PANEL_LAYOUT.breakpoint) return new Vector3();

  const panelFootprint = ATTRACTOR_PANEL_LAYOUT.width + ATTRACTOR_PANEL_LAYOUT.right;
  const shiftPixels = panelFootprint / 2;
  const distance = cameraPosition.distanceTo(target);
  const horizontalSpan = 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
    * viewport.width / viewport.height;
  const forward = target.clone().sub(cameraPosition).normalize();
  const right = forward.cross(new Vector3(0, 1, 0)).normalize();
  return right.multiplyScalar(shiftPixels * horizontalSpan / viewport.width);
}

const NINE_BODY_POSITIONS = [
  [0, 0, 0], [-0.364457, -0.221686, -0.080653], [-0.111425, -0.657243, -0.288691],
  [-0.000267, 0.902619, 0.391272], [0.000708, 0.900418, 0.390124], [0.1978, -1.293942, -0.598836],
  [-1.62131, 4.534772, 1.983192], [9.511834, 0.337141, -0.270341], [9.914935, 15.423234, 6.614591],
  [29.872943, 0.724464, -0.447144]
];
const NINE_BODY_NAMES = ['Sun', 'Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const NINE_BODY_MAGNITUDES = [1, 1.66e-7, 2.447e-6, 3.003e-6, 3.694e-8, 3.227e-7, 9.545e-4, 2.858e-4, 4.366e-5, 5.151e-5];

const ATTRACTOR_POSITION_SHADER = `
  uniform float uDt;
  uniform float uBoundHalfExtent;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;
    positionData.xyz = mod(positionData.xyz + uBoundHalfExtent, uBoundHalfExtent * 2.0) - uBoundHalfExtent;
    gl_FragColor = positionData;
  }
`;

const ATTRACTOR_VELOCITY_SHADER = `
  uniform float uDt;
  uniform float uAttractorMass;
  uniform float uParticleGlobalMass;
  uniform float uSpinningStrength;
  uniform float uMaxSpeed;
  uniform float uVelocityDamping;
  uniform float uAttractorCount;
  uniform vec3 uAttractorPositions[20];
  uniform vec3 uAttractorRotationAxes[20];
  uniform float uAttractorMagnitudes[20];

  const float GRAVITY_CONSTANT = 6.67e-11;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 force = vec3(0.0);
    vec3 particlePosition = positionData.xyz;
    vec3 particleVelocity = velocityData.xyz;
    float particleMass = uParticleGlobalMass * positionData.w;

    for (int index = 0; index < 20; index += 1) {
      if (float(index) >= uAttractorCount) break;
      vec3 toAttractor = uAttractorPositions[index] - particlePosition;
      float distanceToAttractor = max(length(toAttractor), 0.08);
      vec3 direction = toAttractor / distanceToAttractor;
      float gravityStrength = uAttractorMass * particleMass * GRAVITY_CONSTANT
        * uAttractorMagnitudes[index] / (distanceToAttractor * distanceToAttractor);
      force += direction * gravityStrength;
      vec3 spinningForce = uAttractorRotationAxes[index] * gravityStrength * uSpinningStrength;
      force += cross(spinningForce, toAttractor);
    }

    particleVelocity += force * uDt;
    float speed = length(particleVelocity);
    if (speed > uMaxSpeed) particleVelocity = particleVelocity / speed * uMaxSpeed;
    particleVelocity *= (1.0 - uVelocityDamping);
    gl_FragColor = vec4(particleVelocity, 0.0);
  }
`;

const MIXED_VELOCITY_SHADER = `
  uniform float uDt;
  uniform float uTime;
  uniform float uAttractorMass;
  uniform float uParticleGlobalMass;
  uniform float uSpinningStrength;
  uniform float uMaxSpeed;
  uniform float uVelocityDamping;
  uniform float uAttractorCount;
  uniform vec3 uAttractorPositions[20];
  uniform vec3 uAttractorRotationAxes[20];
  uniform float uAttractorMagnitudes[20];
  uniform float uAttractorTypes[20];
  uniform float uSimpleMassMultipliers[20];
  uniform float uSimpleSpinMultipliers[20];
  uniform float uBlackHoleEventHorizonShear[20];
  uniform float uBlackHoleFractureThreshold[20];
  uniform float uBlackHoleRotationSpeed[20];
  uniform float uBlackHoleThermalNoise[20];
  uniform float uBlackHoleFractureIntensity[20];
  uniform vec3 uBlackHoleStarPositions[20];
  uniform float uBlackHoleStarMassFractions[20];
  uniform float uFieldModel;
  uniform bool uMechanicsEnabled;
  uniform bool uComparisonEnabled;
  uniform float uComparisonModel;
  uniform float uDifferenceScale;
  uniform float uCoreRadius;
  uniform float uQuantumPressure;
  uniform float uCompressibility;
  uniform float uDilatancy;
  uniform float uSpeedLimit;
  uniform float uBaseViscosity;
  uniform float uTensorGaussianWaist;
  uniform float uGrassmannianPoleWeight;
  uniform float uGeometryCoupling;

  const float GRAVITY_CONSTANT = 6.67e-11;

  float hash21(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec4 fieldResponse(float model, float radius, float speed, float magnitude, float rotation) {
    float inverseSquare = magnitude / (radius * radius);
    if (model < 0.5) return vec4(-inverseSquare, 0.0, 0.0, 0.0);
    float coreRatio = radius / max(uCoreRadius, 0.05);
    float sink = inverseSquare * (1.0 + uCompressibility / (1.0 + coreRatio));
    float tangent = rotation * magnitude / radius;
    if (model < 1.5) return vec4(-sink, tangent, uBaseViscosity, 0.0);
    if (model < 2.5) return vec4(-inverseSquare, tangent, uBaseViscosity, 0.0);
    float pressure = uQuantumPressure * exp(-(coreRatio * coreRatio)) / max(uCoreRadius, 0.05);
    if (model < 3.5) return vec4(-sink + pressure, tangent, uBaseViscosity, pressure);
    if (model < 4.5) {
      float beta = clamp(speed / max(uSpeedLimit, 0.1), 0.0, 0.9999);
      float lorentzFactor = inversesqrt(1.0 - beta * beta);
      float strainRate = speed / radius;
      float viscosity = uBaseViscosity * (1.0 + uDilatancy * ((lorentzFactor - 1.0) + strainRate));
      float mobility = 1.0 / (1.0 + viscosity);
      float gaussianWeight = exp(-(radius * radius) / (2.0 * max(uTensorGaussianWaist, 0.1) * max(uTensorGaussianWaist, 0.1)));
      float splatMobility = 1.0 - (1.0 - mobility) * gaussianWeight;
      return vec4((-sink + pressure) * splatMobility, tangent * splatMobility, viscosity, gaussianWeight);
    }
    float gaussianWeight = exp(-(radius * radius) / (2.0 * max(uTensorGaussianWaist, 0.1) * max(uTensorGaussianWaist, 0.1)));
    float geometryCorrection = clamp(uGeometryCoupling, 0.0, 0.25) * clamp(uGrassmannianPoleWeight, 0.0, 1.0) * gaussianWeight;
    return vec4(-inverseSquare * (1.0 + geometryCorrection), tangent * (1.0 + geometryCorrection), 0.0, gaussianWeight);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 force = vec3(0.0);
    vec3 particlePosition = positionData.xyz;
    vec3 particleVelocity = velocityData.xyz;
    float particleMass = uParticleGlobalMass * positionData.w;
    float blackHoleStress = 0.0;
    float modelDifference = 0.0;
    float ddfViscosity = 0.0;

    for (int index = 0; index < 20; index += 1) {
      if (float(index) >= uAttractorCount) break;
      vec3 toAttractor = uAttractorPositions[index] - particlePosition;
      float distanceToAttractor = max(length(toAttractor), 0.08);
      vec3 direction = toAttractor / distanceToAttractor;
      if (uAttractorTypes[index] < 0.5) {
        float attractorMagnitude = uAttractorMass * uAttractorMagnitudes[index] * uSimpleMassMultipliers[index];
        float rotation = uSpinningStrength * uSimpleSpinMultipliers[index];
        if (uMechanicsEnabled && uFieldModel > 0.5) {
          vec4 response = fieldResponse(uFieldModel, distanceToAttractor, length(particleVelocity), attractorMagnitude, rotation);
          float gravityScale = particleMass * GRAVITY_CONSTANT;
          force += direction * (-response.x * gravityScale);
          vec3 tangentDirection = normalize(cross(uAttractorRotationAxes[index], direction) + vec3(0.0001, 0.0, 0.0));
          force += tangentDirection * response.y * gravityScale * 0.12;
          ddfViscosity = max(ddfViscosity, response.z);
          if (uComparisonEnabled) {
            vec4 comparison = fieldResponse(uComparisonModel, distanceToAttractor, length(particleVelocity), attractorMagnitude, rotation);
            float absoluteDifference = length(response.xy - comparison.xy);
            float referenceAcceleration = max(length(comparison.xy), 0.000001);
            modelDifference = max(modelDifference, clamp(absoluteDifference / referenceAcceleration * uDifferenceScale, 0.0, 1.0));
          }
        } else {
          float gravityStrength = particleMass * GRAVITY_CONSTANT * attractorMagnitude
            / (distanceToAttractor * distanceToAttractor);
          force += direction * gravityStrength;
          vec3 spinningForce = uAttractorRotationAxes[index] * gravityStrength * rotation;
          force += cross(spinningForce, toAttractor);
        }
      } else {
        vec3 fromCenter = particlePosition - uAttractorPositions[index];
        float radius = max(length(fromCenter), 0.12);
        vec3 radial = fromCenter / radius;
        vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), radial) + vec3(0.0001, 0.0, 0.0));
        float shear = uBlackHoleEventHorizonShear[index];
        float threshold = max(uBlackHoleFractureThreshold[index], 0.001);
        vec3 starPosition = uBlackHoleStarPositions[index];
        vec3 toStar = starPosition - particlePosition;
        float distanceToStar = max(length(toStar), 0.08);
        float starMassFraction = uBlackHoleStarMassFractions[index];
        float starGravity = uAttractorMass * particleMass * starMassFraction * GRAVITY_CONSTANT
          * uAttractorMagnitudes[index] / (distanceToStar * distanceToStar);
        if (starMassFraction > 0.0001) force += toStar / distanceToStar * starGravity;
        float remainingStarMass = clamp(starMassFraction / 96.0, 0.0, 1.0);
        float wakeStress = starMassFraction > 0.0001 && distanceToStar < 2.5
          ? (2.5 - distanceToStar) / (length(starPosition - uAttractorPositions[index]) + 0.1) * 50.0 * remainingStarMass
          : 0.0;
        float thermalStress = hash21(uv + vec2(uTime * 0.03, uTime * 0.017)) * uBlackHoleThermalNoise[index];
        float localStress = shear / radius + wakeStress + thermalStress;
        blackHoleStress = max(blackHoleStress, localStress / threshold * uBlackHoleFractureIntensity[index]);
        float selectedModel = uMechanicsEnabled ? uFieldModel : 0.0;
        vec4 response = fieldResponse(
          selectedModel,
          radius,
          length(particleVelocity),
          shear * uAttractorMagnitudes[index],
          uBlackHoleRotationSpeed[index]
        );
        force += radial * response.x * 0.035;
        force += tangent * response.y * 0.12;
        ddfViscosity = max(ddfViscosity, selectedModel > 0.5 ? response.z : 0.0);
        if (uComparisonEnabled) {
          vec4 comparison = fieldResponse(
            uComparisonModel,
            radius,
            length(particleVelocity),
            shear * uAttractorMagnitudes[index],
            uBlackHoleRotationSpeed[index]
          );
          float absoluteDifference = length(response.xy - comparison.xy);
          float referenceAcceleration = max(length(comparison.xy), 0.000001);
          modelDifference = max(modelDifference, clamp(absoluteDifference / referenceAcceleration * uDifferenceScale, 0.0, 1.0));
        }
        if (distanceToStar < 2.5) force += normalize(particlePosition - starPosition) * wakeStress * 0.008;
      }
    }

    particleVelocity += force * uDt;
    float speed = length(particleVelocity);
    if (speed > uMaxSpeed) particleVelocity = particleVelocity / speed * uMaxSpeed;
    particleVelocity *= exp(-ddfViscosity * uDt);
    particleVelocity *= (1.0 - uVelocityDamping);
    gl_FragColor = vec4(particleVelocity, uComparisonEnabled ? modelDifference : clamp(blackHoleStress, 0.0, 1.0));
  }
`;

const ATTRACTOR_VERTEX_SHADER = `
  uniform sampler2D uPositionTex;
  uniform sampler2D uVelocityTex;
  uniform float uScale;
  uniform float uMaxSpeed;
  uniform bool uCameraFacing;
  attribute vec2 aSimulationUv;
  varying float vSpeed;
  varying float vMass;

  void main() {
    vec4 positionData = texture2D(uPositionTex, aSimulationUv);
    vec3 velocity = texture2D(uVelocityTex, aSimulationUv).xyz;
    vSpeed = clamp(length(velocity) / max(uMaxSpeed, 0.001), 0.0, 1.0);
    vMass = positionData.w;
    float particleScale = uScale * (0.25 + vMass * 0.75);
    vec4 particlePosition;
    if (uCameraFacing) {
      particlePosition = modelViewMatrix * vec4(positionData.xyz, 1.0);
      particlePosition.xy += position.xy * particleScale;
    } else {
      particlePosition = modelViewMatrix * vec4(positionData.xyz + position * particleScale, 1.0);
    }
    gl_Position = projectionMatrix * particlePosition;
  }
`;

const ATTRACTOR_FRAGMENT_SHADER = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vSpeed;
  varying float vMass;

  void main() {
    vec3 color = mix(uColorA, uColorB, smoothstep(0.0, 0.65, vSpeed));
    float glow = 0.55 + vMass * 0.45;
    gl_FragColor = vec4(color * glow, 0.46);
  }
`;

const BLACK_HOLE_POSITION_SHADER = `
  uniform float uDt;
  uniform float uBoundHalfExtent;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;
    positionData.xyz = mod(positionData.xyz + uBoundHalfExtent, uBoundHalfExtent * 2.0) - uBoundHalfExtent;
    gl_FragColor = positionData;
  }
`;

const MIXED_VERTEX_SHADER = `
  uniform sampler2D uPositionTex;
  uniform sampler2D uVelocityTex;
  uniform float uScale;
  uniform float uMaxSpeed;
  uniform bool uCameraFacing;
  uniform bool uComparisonEnabled;
  attribute vec2 aSimulationUv;
  varying vec2 vPosition;
  varying float vSpeed;
  varying float vMass;
  varying float vStress;
  varying float vSnap;
  varying float vBlackHole;

  void main() {
    vec4 positionData = texture2D(uPositionTex, aSimulationUv);
    vec3 velocity = texture2D(uVelocityTex, aSimulationUv).xyz;
    float stress = texture2D(uVelocityTex, aSimulationUv).w;
    float blackHole = step(0.0001, stress);
    float snap = uComparisonEnabled ? 0.0 : step(1.0, stress);
    float angle = atan(positionData.z, positionData.x);
    vec3 tangent = vec3(-sin(angle), 0.0, cos(angle));
    float particleScale = uScale * (0.25 + positionData.w * 0.75);
    vec4 particlePosition;
    if (blackHole > 0.5) {
      vec3 localOffset;
      if (snap > 0.5) {
        localOffset = position * particleScale;
      } else {
        float stretch = 1.0 + min(stress * 0.2, 8.0);
        localOffset = tangent * position.x * particleScale * stretch + vec3(0.0, position.y * particleScale * 0.08, 0.0);
      }
      particlePosition = modelViewMatrix * vec4(positionData.xyz + localOffset, 1.0);
    } else {
      if (uCameraFacing) {
        particlePosition = modelViewMatrix * vec4(positionData.xyz, 1.0);
        particlePosition.xy += position.xy * particleScale;
      } else {
        particlePosition = modelViewMatrix * vec4(positionData.xyz + position * particleScale, 1.0);
      }
    }
    vPosition = position.xy;
    vSpeed = clamp(length(velocity) / max(uMaxSpeed, 0.001), 0.0, 1.0);
    vMass = positionData.w;
    vStress = clamp(stress, 0.0, 1.0);
    vSnap = snap;
    vBlackHole = blackHole;
    gl_Position = projectionMatrix * particlePosition;
  }
`;

const MIXED_FRAGMENT_SHADER = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform bool uComparisonEnabled;
  varying vec2 vPosition;
  varying float vSpeed;
  varying float vMass;
  varying float vStress;
  varying float vSnap;
  varying float vBlackHole;

  void main() {
    float splat = 1.0 - smoothstep(0.1, 0.5, length(vPosition));
    vec3 differenceColor = mix(vec3(0.12, 0.72, 0.95), vec3(1.0, 0.78, 0.2), vStress);
    vec3 fieldColor = mix(uColorA, uColorB, max(vSpeed, max(vStress, vSnap)));
    vec3 color = uComparisonEnabled ? differenceColor : fieldColor;
    float glow = mix(0.55 + vMass * 0.45, 0.65 + vStress * 0.8 + vSnap * 0.35, vBlackHole);
    float alpha = mix(0.46, 0.24 + vStress * 0.34, vBlackHole);
    gl_FragColor = vec4(color * glow, splat * alpha);
  }
`;

const PARTICLE_PATH_GATHER_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PARTICLE_PATH_GATHER_FRAGMENT_SHADER = `
  uniform sampler2D uPositionTex;
  uniform sampler2D uHistoryTex;
  uniform float uResolution;
  uniform float uParticleCount;
  uniform float uSampleCount;
  uniform float uWriteRow;
  varying vec2 vUv;

  void main() {
    float outputColumn = floor(gl_FragCoord.x);
    float outputRow = floor(gl_FragCoord.y);
    if (abs(outputRow - uWriteRow) < 0.5) {
      float particleIndex = min(uParticleCount - 1.0, floor((outputColumn + 0.5) * uParticleCount / uSampleCount));
      vec2 particleUv = (vec2(mod(particleIndex, uResolution), floor(particleIndex / uResolution)) + 0.5) / uResolution;
      gl_FragColor = texture2D(uPositionTex, particleUv);
    } else {
      gl_FragColor = texture2D(uHistoryTex, vUv);
    }
  }
`;

const PARTICLE_PATH_VERTEX_SHADER = `
  uniform sampler2D uPathHistory;
  uniform float uPathFirstRow;
  uniform float uPathHistoryCapacity;
  uniform float uPathSampleCount;
  attribute float aPathParticle;
  attribute float aPathStep;

  void main() {
    float historyRow = mod(uPathFirstRow + aPathStep, uPathHistoryCapacity);
    vec2 historyUv = vec2((aPathParticle + 0.5) / uPathSampleCount, (historyRow + 0.5) / uPathHistoryCapacity);
    vec3 worldPosition = texture2D(uPathHistory, historyUv).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
  }
`;

const PARTICLE_PATH_FRAGMENT_SHADER = `
  uniform vec3 uPathColor;
  uniform float uPathOpacity;
  void main() {
    gl_FragColor = vec4(uPathColor, uPathOpacity);
  }
`;

function createParticlePathRenderResources(gl) {
  const historyGeometry = new BufferGeometry();
  const maximumSegments = PARTICLE_PATH_SAMPLE_COUNT * (PARTICLE_PATH_HISTORY_CAPACITY - 1);
  const vertexCount = maximumSegments * 2;
  const positions = new Float32Array(vertexCount * 3);
  const pathParticles = new Float32Array(vertexCount);
  const pathSteps = new Float32Array(vertexCount);
  let vertexIndex = 0;
  for (let stepIndex = 0; stepIndex < PARTICLE_PATH_HISTORY_CAPACITY - 1; stepIndex += 1) {
    for (let particleIndex = 0; particleIndex < PARTICLE_PATH_SAMPLE_COUNT; particleIndex += 1) {
      pathParticles[vertexIndex] = particleIndex;
      pathSteps[vertexIndex] = stepIndex;
      vertexIndex += 1;
      pathParticles[vertexIndex] = particleIndex;
      pathSteps[vertexIndex] = stepIndex + 1;
      vertexIndex += 1;
    }
  }
  historyGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  historyGeometry.setAttribute('aPathParticle', new BufferAttribute(pathParticles, 1));
  historyGeometry.setAttribute('aPathStep', new BufferAttribute(pathSteps, 1));
  historyGeometry.setDrawRange(0, 0);

  const historyTargets = [0, 1].map(() => new WebGLRenderTarget(PARTICLE_PATH_SAMPLE_COUNT, PARTICLE_PATH_HISTORY_CAPACITY, {
    format: RGBAFormat,
    type: gl.capabilities.isWebGL2 ? FloatType : HalfFloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false
  }));
  historyTargets.forEach((target) => {
    target.texture.generateMipmaps = false;
    target.texture.colorSpace = '';
  });

  const gatherGeometry = new BufferGeometry();
  gatherGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const gatherMaterial = new ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uHistoryTex: { value: null },
      uResolution: { value: 1 },
      uParticleCount: { value: 1 },
      uSampleCount: { value: PARTICLE_PATH_SAMPLE_COUNT },
      uWriteRow: { value: 0 }
    },
    vertexShader: PARTICLE_PATH_GATHER_VERTEX_SHADER,
    fragmentShader: PARTICLE_PATH_GATHER_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false
  });
  const gatherScene = new Scene();
  gatherScene.add(new Mesh(gatherGeometry, gatherMaterial));
  const gatherCamera = new Camera();
  const pathMaterial = new ShaderMaterial({
    uniforms: {
      uPathHistory: { value: historyTargets[0].texture },
      uPathFirstRow: { value: 0 },
      uPathHistoryCapacity: { value: PARTICLE_PATH_HISTORY_CAPACITY },
      uPathSampleCount: { value: PARTICLE_PATH_SAMPLE_COUNT },
      uPathColor: { value: new Color(DEFAULT_PARTICLE_PATH_SETTINGS.particlePathColor) },
      uPathOpacity: { value: DEFAULT_PARTICLE_PATH_SETTINGS.particlePathOpacity }
    },
    vertexShader: PARTICLE_PATH_VERTEX_SHADER,
    fragmentShader: PARTICLE_PATH_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });

  return {
    historyGeometry,
    historyTargets,
    gatherGeometry,
    gatherMaterial,
    gatherScene,
    gatherCamera,
    pathMaterial,
    historyIndex: 0,
    nextRow: 0,
    sampleCount: 0,
    sampleTimer: 0,
    enabled: false,
    particleCount: 0,
    dispose() {
      historyGeometry.dispose();
      historyTargets.forEach((target) => target.dispose());
      gatherGeometry.dispose();
      gatherMaterial.dispose();
      pathMaterial.dispose();
    }
  };
}

function clearParticlePathHistory(gl, resources) {
  const currentTarget = gl.getRenderTarget();
  resources.historyTargets.forEach((target) => {
    gl.setRenderTarget(target);
    gl.clear(true, false, false);
  });
  gl.setRenderTarget(currentTarget);
  resources.historyIndex = 0;
  resources.nextRow = 0;
  resources.sampleCount = 0;
  resources.sampleTimer = 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createConfiguration(variant = 'simple') {
  const hypothesisVariant = variant === 'blackhole' || variant === 'ddf';
  return {
    attractorMassExponent: 7,
    particleGlobalMassExponent: 4,
    particleCount: PARTICLE_COUNT,
    maxSpeed: 8,
    velocityDamping: 0.1,
    spinningStrength: 2.75,
    scale: 0.06,
    boundHalfExtent: 8,
    colorA: hypothesisVariant ? '#4de8ff' : '#33905f',
    colorB: variant === 'ddf' ? '#f4c750' : hypothesisVariant ? '#e74315' : '#55e699',
    controlsColorX: '#e66b5d',
    controlsColorY: '#74d3c5',
    controlsColorZ: '#f2c14e',
    controlsMode: 'rotate',
    showTransformControls: true,
    particleFacing: 'world',
    helperVisible: true,
    helperShowName: false,
    helperNamePlacement: 'above',
    helperShowAttributes: false,
    newAttractorPlacement: 'origin',
    newAttractorRandomDist: 3.14,
    ...DEFAULT_SIMULATOR_CAMERA_CONFIGURATION,
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
    particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION },
    fieldMechanics: {
      ...DEFAULT_FIELD_MECHANICS,
      enabled: hypothesisVariant,
      model: variant === 'ddf' ? 'ddf' : variant === 'blackhole' ? 'sqg' : 'newtonian',
      comparisonModel: variant === 'ddf' ? 'sqg' : 'ddf'
    },
    attractors: clone(INITIAL_ATTRACTORS).map((attractor) => ({
      ...attractor,
      type: hypothesisVariant ? 'blackhole' : attractor.type
    }))
  };
}

function makeBodyPreset(base, magnitudes = NINE_BODY_MAGNITUDES, rotations = false) {
  return {
    ...clone(base),
    boundHalfExtent: 50,
    attractors: NINE_BODY_POSITIONS.map((position, index) => ({
      ...createAttractor({
        position,
        name: NINE_BODY_NAMES[index],
        magnitude: magnitudes[index] ?? 1,
        rotation: rotations ? [0.126536 / (index + 1), 0, 0] : [0, 0, 0]
      }, base.attractors[0]?.type ?? 'simple')
    }))
  };
}

function createPresetLibrary(variant) {
  const base = createConfiguration(variant);
  return {
    Default: clone(base),
    Chaos: { ...clone(base), spinningStrength: 8, velocityDamping: 0.02 },
    Galaxy: { ...clone(base), spinningStrength: 2, maxSpeed: 5, scale: 0.06 },
    Ring2: { ...clone(base), spinningStrength: 3.51, scale: 0.07 },
    Ring3: { ...clone(base), spinningStrength: 3.51, scale: 0.07, attractors: clone(base.attractors).map((item, index) => ({ ...item, position: index === 0 ? [-1, 2, 0] : item.position })) },
    'Nine Fixed Attractors and equal magnitude': makeBodyPreset(base, NINE_BODY_POSITIONS.map(() => 1), true),
    'Nine Fixed Attractors with equal magnitude': makeBodyPreset(base, NINE_BODY_POSITIONS.map(() => 1), true),
    'Nine Fixed Attractors': makeBodyPreset(base),
    'blackhole with orbiting body at zero radius': { ...clone(base),
      // "attractorMassExponent": 7,
      // "particleGlobalMassExponent": 4,
      // "maxSpeed": 8,
      // "velocityDamping": 0.1,
      // "spinningStrength": 2.75,
      // "scale": 0.061,
      // "boundHalfExtent": 8,
      "colorA": "#ff8b4d",
      "colorB": "#4de8ff",
      // "controlsColorX": "#e66b5d",
      // "controlsColorY": "#74d3c5",
      // "controlsColorZ": "#f2c14e",
      // "controlsMode": "rotate",
      // "particleFacing": "camera",
      // "helperVisible": true,
      // "helperShowName": false,
      // "helperNamePlacement": "above",
      // "helperShowAttributes": false,
      // "newAttractorPlacement": "origin",
      // "newAttractorRandomDist": 3.14,
      // "replayCameraTrack": "easing",
      // "replayCameraEasing": 0.1,
      // "replayCameraOrbitSpeed": 0.1,
      // "replayCameraOrbitX": 1,
      // "replayCameraOrbitY": 0,
      // "replayCameraOrbitZ": 0,
      // "cameraOrbitOn": true,
      // "cameraZoomEnabled": true,
      // "cameraPosX": 3.02152991863831,
      // "cameraPosY": 3.5455667443202126,
      // "cameraPosZ": 8.5644305761185,
      // "cameraTargetX": -0.9999994623347117,
      // "cameraTargetY": 2.6883201747792327e-7,
      // "cameraTargetZ": 5.376640349558465e-7,
      // "cameraZoom": 1,
      // "cameraFov": 25,
      // "cameraNear": 0.1,
      // "cameraFar": 100,
      // "timeScale": 1,
      // "playbackSpeed": 1,
      // "blackHoleEveVntHorizonShear": 10,
      // "blackHoleFractureThreshold": 25,
      // "blackHoleRotationSpeed": 1,
      // "blackHoleTestStarEccentricity": 0.8,
      // "blackHoleThermalNoise": 2,
      // "blackHoleOrbitRadius": 8,
      // "blackHoleOrbitVerticalAmplitude": 0.5,
      // "blackHoleFractureIntensity": 1,
      "blackHoleStreamlines": true,
      "attractors": [
        {
          "position": [
            -1,
            0,
            0
          ],
          "rotation": [
            0,
            0,
            0
          ],
          "name": "Attractor 0",
          "magnitude": 1,
          "type": "blackhole",
          "simple": {
            "massMultiplier": 1,
            "spinMultiplier": 1
          },
          "blackHole": {
            "eventHorizonShear": 10,
            "fractureThreshold": 25,
            "rotationSpeed": 1,
            "testStarEccentricity": 0.8,
            "thermalNoise": 2,
            "orbitRadius": 1,
            "orbitVerticalAmplitude": 0,
            "fractureIntensity": 4
          }
        }
      ]
    }
  };
}

function readSavedPresets(variant) {
  return readPresetLibrary(localStorage, PRESET_STORAGE_KEY, createPresetLibrary(variant));
}

function sanitizeConfiguration(data, variant) {
  const base = createConfiguration(variant);
  const next = { ...base, ...data };
  const particleCount = Number(data.particleCount ?? base.particleCount);
  next.particleCount = Number.isFinite(particleCount)
    ? Math.min(PARTICLE_COUNT, Math.max(1024, Math.round(particleCount / 1024) * 1024))
    : base.particleCount;
  next.showTransformControls = data.showTransformControls === undefined ? base.showTransformControls : Boolean(data.showTransformControls);
  next.controlsMode = data.controlsMode === 'translate' || data.controlsMode === 'rotate'
    ? data.controlsMode
    : data.controlsMode === 'none' || data.controlsMode === 'disabled'
      ? 'disabled'
      : base.controlsMode;
  const placement = data.helperNamePlacement ?? (data.helperShowNamesBelow ? 'below' : base.helperNamePlacement);
  next.helperNamePlacement = ['above', 'center', 'below'].includes(placement) ? placement : base.helperNamePlacement;
  next.particleFacing = data.particleFacing === 'camera' ? 'camera' : base.particleFacing;
  next.cameraZoomEnabled = Boolean(data.cameraZoomEnabled);
  next.cameraWheelMode = data.cameraWheelMode === 'dolly' ? 'dolly' : 'zoom';
  next.helperShowAttributes = Boolean(data.helperShowAttributes);
  next.fieldMechanics = sanitizeFieldMechanics(data.fieldMechanics, base.fieldMechanics);
  next.blackHoleStarsVisible = data.blackHoleStarsVisible === undefined ? base.blackHoleStarsVisible : Boolean(data.blackHoleStarsVisible);
  next.blackHoleStarColor = typeof data.blackHoleStarColor === 'string' && /^#[\da-f]{6}$/i.test(data.blackHoleStarColor)
    ? data.blackHoleStarColor.toLowerCase()
    : base.blackHoleStarColor;
  const starOpacity = Number(data.blackHoleStarOpacity ?? base.blackHoleStarOpacity);
  next.blackHoleStarOpacity = Number.isFinite(starOpacity) ? Math.min(1, Math.max(0, starOpacity)) : base.blackHoleStarOpacity;
  Object.assign(next, sanitizeAttractorPathSettings(data));
  Object.assign(next, sanitizeParticlePathSettings(data));
  const legacyBlackHole = {
    eventHorizonShear: data.blackHoleEventHorizonShear,
    fractureThreshold: data.blackHoleFractureThreshold,
    rotationSpeed: data.blackHoleRotationSpeed,
    testStarEccentricity: data.blackHoleTestStarEccentricity,
    thermalNoise: data.blackHoleThermalNoise,
    orbitRadius: data.blackHoleOrbitRadius,
    orbitVerticalAmplitude: data.blackHoleOrbitVerticalAmplitude,
    fractureIntensity: data.blackHoleFractureIntensity
  };
  next.attractors = Array.isArray(data.attractors) && data.attractors.length > 0
    ? data.attractors.slice(0, MAX_ATTRACTORS).map((attractor, index) => ({
      position: Array.isArray(attractor.position) ? attractor.position.slice(0, 3) : [0, 0, 0],
      rotation: Array.isArray(attractor.rotation) ? attractor.rotation.slice(0, 3) : [0, 0, 0],
      name: attractor.name || `Attractor ${index}`,
      magnitude: Math.max(0, Number(attractor.magnitude ?? 1)),
      type: attractor.type === 'blackhole' ? 'blackhole' : 'simple',
      simple: {
        massMultiplier: Math.max(0, Number(attractor.simple?.massMultiplier ?? 1)),
        spinMultiplier: Math.max(0, Number(attractor.simple?.spinMultiplier ?? 1))
      },
      blackHole: {
        eventHorizonShear: Math.max(0, Number(attractor.blackHole?.eventHorizonShear ?? legacyBlackHole.eventHorizonShear ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.eventHorizonShear)),
        fractureThreshold: Math.max(0.1, Number(attractor.blackHole?.fractureThreshold ?? legacyBlackHole.fractureThreshold ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.fractureThreshold)),
        rotationSpeed: Math.max(0, Number(attractor.blackHole?.rotationSpeed ?? legacyBlackHole.rotationSpeed ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.rotationSpeed)),
        testStarEccentricity: Math.min(0.99, Math.max(0, Number(attractor.blackHole?.testStarEccentricity ?? legacyBlackHole.testStarEccentricity ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.testStarEccentricity))),
        thermalNoise: Math.max(0, Number(attractor.blackHole?.thermalNoise ?? legacyBlackHole.thermalNoise ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.thermalNoise)),
        orbitRadius: Math.max(0, Number(attractor.blackHole?.orbitRadius ?? legacyBlackHole.orbitRadius ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.orbitRadius)),
        orbitVerticalAmplitude: Math.max(0, Number(attractor.blackHole?.orbitVerticalAmplitude ?? legacyBlackHole.orbitVerticalAmplitude ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.orbitVerticalAmplitude)),
        fractureIntensity: Math.min(4, Math.max(0, Number(attractor.blackHole?.fractureIntensity ?? legacyBlackHole.fractureIntensity ?? BLACK_HOLE_ATTRACTOR_DEFAULTS.fractureIntensity)))
      }
    }))
    : clone(base.attractors);
  return next;
}

function AttractorParticles({ configuration, onGpuError, variant, particleCount, blackHoleStarStateRef, simulationPlaying }) {
  const { gl } = useThree();
  const useBlackHoleSeed = variant === 'blackhole' || variant === 'ddf';
  const hasBlackHoles = configuration.attractors.some((attractor) => attractor.type === 'blackhole');
  const useMixedShader = useBlackHoleSeed || hasBlackHoles;
  const simulationKey = [
    configuration.timeScale,
    configuration.boundHalfExtent,
    configuration.attractorMassExponent,
    configuration.particleGlobalMassExponent,
    configuration.spinningStrength,
    configuration.maxSpeed,
    configuration.velocityDamping,
    configuration.attractors.map((attractor) => [
      attractor.type,
      attractor.position.join(','),
      attractor.rotation.join(','),
      attractor.magnitude,
      attractor.simple.massMultiplier,
      attractor.simple.spinMultiplier,
      JSON.stringify(attractor.blackHole)
    ].join(':')).join('|')
  ].join('|');
  const simulationRef = useRef({ key: simulationKey, configuration });
  if (simulationRef.current.key !== simulationKey) simulationRef.current = { key: simulationKey, configuration };
  const computeRef = useRef(null);
  const positionVariableRef = useRef(null);
  const velocityVariableRef = useRef(null);
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;
  const simulationConfigurationRef = useRef(simulationRef.current.configuration);
  simulationConfigurationRef.current = simulationRef.current.configuration;
  const resolution = Math.ceil(Math.sqrt(particleCount));
  const geometry = useMemo(() => {
    const nextGeometry = new PlaneGeometry(1, 1);
    nextGeometry.setAttribute('aSimulationUv', new InstancedBufferAttribute(createSimulationUvs(resolution, particleCount), 2));
    return nextGeometry;
  }, [particleCount, resolution]);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uVelocityTex: { value: null },
      uScale: { value: configuration.scale },
      uMaxSpeed: { value: configuration.maxSpeed },
      uCameraFacing: { value: configuration.particleFacing === 'camera' },
      uComparisonEnabled: { value: configuration.fieldMechanics.comparisonEnabled },
      uColorA: { value: new Color(configuration.colorA) },
      uColorB: { value: new Color(configuration.colorB) }
    },
    vertexShader: useMixedShader ? MIXED_VERTEX_SHADER : ATTRACTOR_VERTEX_SHADER,
    fragmentShader: useMixedShader ? MIXED_FRAGMENT_SHADER : ATTRACTOR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending
  }), [useMixedShader]);
  const particlePathResources = useMemo(() => createParticlePathRenderResources(gl), [gl]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    const currentTarget = gl.getRenderTarget();
    particlePathResources.historyTargets.forEach((target) => {
      gl.setRenderTarget(target);
      gl.clear(true, false, false);
    });
    gl.setRenderTarget(currentTarget);
    return () => particlePathResources.dispose();
  }, [gl, particlePathResources]);

  useEffect(() => {
    let gpuCompute;
    try {
      const simulation = createGpuParticleField({
        gl,
        resolution,
        positionShader: ATTRACTOR_POSITION_SHADER,
        velocityShader: useMixedShader ? MIXED_VELOCITY_SHADER : ATTRACTOR_VELOCITY_SHADER,
        initialize: ({ positionData, velocityData, offset }) => {
          const particleIndex = offset / 4;
          if (useBlackHoleSeed) {
            const radiusSeed = Math.abs(Math.sin(particleIndex * 12.9898) * 43758.5453 % 1);
            const angle = particleIndex / particleCount * Math.PI * 2 * 50;
            const radius = 1.5 + radiusSeed * radiusSeed * 15;
            positionData[offset] = Math.cos(angle) * radius;
            positionData[offset + 1] = (radiusSeed - 0.5) * 0.4;
            positionData[offset + 2] = Math.sin(angle) * radius;
            positionData[offset + 3] = 0.25 + radiusSeed * 0.75;
            velocityData[offset] = -Math.sin(angle) * 0.08;
            velocityData[offset + 1] = 0;
            velocityData[offset + 2] = Math.cos(angle) * 0.08;
          } else {
            positionData[offset] = (Math.random() - 0.5) * 5;
            positionData[offset + 1] = (Math.random() - 0.5) * 0.2;
            positionData[offset + 2] = (Math.random() - 0.5) * 5;
            positionData[offset + 3] = 0.25 + Math.random() * 0.75;
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            velocityData[offset] = Math.sin(theta) * Math.sin(phi) * 0.05;
            velocityData[offset + 1] = Math.cos(theta) * 0.05;
            velocityData[offset + 2] = Math.sin(theta) * Math.cos(phi) * 0.05;
          }
          velocityData[offset + 3] = 0;
        }
      });
      gpuCompute = simulation.gpuCompute;
      computeRef.current = gpuCompute;
      positionVariableRef.current = simulation.positionVariable;
      velocityVariableRef.current = simulation.velocityVariable;
      const positionUniforms = simulation.positionVariable.material.uniforms;
      positionUniforms.uDt = { value: 1 / 60 };
      positionUniforms.uBoundHalfExtent = { value: configurationRef.current.boundHalfExtent };
      const velocityUniforms = simulation.velocityVariable.material.uniforms;
      velocityUniforms.uDt = { value: 1 / 60 };
      velocityUniforms.uAttractorMass = { value: 10 ** configurationRef.current.attractorMassExponent };
      velocityUniforms.uParticleGlobalMass = { value: 10 ** configurationRef.current.particleGlobalMassExponent };
      velocityUniforms.uSpinningStrength = { value: configurationRef.current.spinningStrength };
      velocityUniforms.uMaxSpeed = { value: configurationRef.current.maxSpeed };
      velocityUniforms.uVelocityDamping = { value: configurationRef.current.velocityDamping };
      velocityUniforms.uAttractorCount = { value: configurationRef.current.attractors.length };
      velocityUniforms.uAttractorPositions = { value: Array.from({ length: MAX_ATTRACTORS }, () => new Vector3()) };
      velocityUniforms.uAttractorRotationAxes = { value: Array.from({ length: MAX_ATTRACTORS }, () => new Vector3(0, 1, 0)) };
      velocityUniforms.uBlackHoleStarPositions = { value: blackHoleStarStateRef.current.positions };
      velocityUniforms.uBlackHoleStarMassFractions = { value: blackHoleStarStateRef.current.massFractions };
      velocityUniforms.uAttractorMagnitudes = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      velocityUniforms.uAttractorTypes = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uSimpleMassMultipliers = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      velocityUniforms.uSimpleSpinMultipliers = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      velocityUniforms.uBlackHoleEventHorizonShear = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleFractureThreshold = { value: new Float32Array(MAX_ATTRACTORS).fill(25) };
      velocityUniforms.uBlackHoleRotationSpeed = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleThermalNoise = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleFractureIntensity = { value: new Float32Array(MAX_ATTRACTORS).fill(BLACK_HOLE_ATTRACTOR_DEFAULTS.fractureIntensity) };
      velocityUniforms.uFieldModel = { value: fieldModelIndex(configurationRef.current.fieldMechanics.model) };
      velocityUniforms.uMechanicsEnabled = { value: configurationRef.current.fieldMechanics.enabled };
      velocityUniforms.uComparisonEnabled = { value: configurationRef.current.fieldMechanics.comparisonEnabled };
      velocityUniforms.uComparisonModel = { value: fieldModelIndex(configurationRef.current.fieldMechanics.comparisonModel) };
      velocityUniforms.uDifferenceScale = { value: configurationRef.current.fieldMechanics.differenceScale };
      velocityUniforms.uCoreRadius = { value: configurationRef.current.fieldMechanics.coreRadius };
      velocityUniforms.uQuantumPressure = { value: configurationRef.current.fieldMechanics.quantumPressure };
      velocityUniforms.uCompressibility = { value: configurationRef.current.fieldMechanics.compressibility };
      velocityUniforms.uDilatancy = { value: configurationRef.current.fieldMechanics.dilatancy };
      velocityUniforms.uSpeedLimit = { value: configurationRef.current.fieldMechanics.speedLimit };
      velocityUniforms.uBaseViscosity = { value: configurationRef.current.fieldMechanics.baseViscosity };
      velocityUniforms.uTensorGaussianWaist = { value: configurationRef.current.fieldMechanics.tensorGaussianWaist };
      velocityUniforms.uGrassmannianPoleWeight = { value: configurationRef.current.fieldMechanics.grassmannianPoleWeight };
      velocityUniforms.uGeometryCoupling = { value: configurationRef.current.fieldMechanics.geometryCoupling };
      velocityUniforms.uTime = { value: 0 };
      const initializationError = gpuCompute.init();
      if (initializationError) throw new Error(initializationError);
    } catch (error) {
      onGpuError(error instanceof Error ? error.message : 'GPU attractor simulation could not initialize.');
    }
    return () => {
      computeRef.current = null;
      positionVariableRef.current = null;
      velocityVariableRef.current = null;
      gpuCompute?.dispose();
    };
  }, [geometry, gl, onGpuError, material, resolution, useBlackHoleSeed, useMixedShader, blackHoleStarStateRef]);

  useFrame((state, delta) => {
    if (!simulationPlaying) return;
    const compute = computeRef.current;
    const positionVariable = positionVariableRef.current;
    const velocityVariable = velocityVariableRef.current;
    if (!compute || !positionVariable || !velocityVariable) return;
    const current = simulationConfigurationRef.current;
    const presentation = configurationRef.current;
    const frameDelta = Math.min(delta, 1 / 30);
    const positionUniforms = positionVariable.material.uniforms;
    const velocityUniforms = velocityVariable.material.uniforms;
    positionUniforms.uDt.value = frameDelta;
    positionUniforms.uBoundHalfExtent.value = current.boundHalfExtent;
    velocityUniforms.uDt.value = frameDelta * current.timeScale;
    velocityUniforms.uAttractorMass.value = 10 ** current.attractorMassExponent;
    velocityUniforms.uParticleGlobalMass.value = 10 ** current.particleGlobalMassExponent;
    velocityUniforms.uSpinningStrength.value = current.spinningStrength;
    velocityUniforms.uMaxSpeed.value = current.maxSpeed;
    velocityUniforms.uVelocityDamping.value = current.velocityDamping;
    velocityUniforms.uFieldModel.value = fieldModelIndex(current.fieldMechanics.model);
    velocityUniforms.uMechanicsEnabled.value = current.fieldMechanics.enabled;
    velocityUniforms.uComparisonEnabled.value = current.fieldMechanics.comparisonEnabled;
    velocityUniforms.uComparisonModel.value = fieldModelIndex(current.fieldMechanics.comparisonModel);
    velocityUniforms.uDifferenceScale.value = current.fieldMechanics.differenceScale;
    velocityUniforms.uCoreRadius.value = current.fieldMechanics.coreRadius;
    velocityUniforms.uQuantumPressure.value = current.fieldMechanics.quantumPressure;
    velocityUniforms.uCompressibility.value = current.fieldMechanics.compressibility;
    velocityUniforms.uDilatancy.value = current.fieldMechanics.dilatancy;
    velocityUniforms.uSpeedLimit.value = current.fieldMechanics.speedLimit;
    velocityUniforms.uBaseViscosity.value = current.fieldMechanics.baseViscosity;
    velocityUniforms.uTensorGaussianWaist.value = current.fieldMechanics.tensorGaussianWaist;
    velocityUniforms.uGrassmannianPoleWeight.value = current.fieldMechanics.grassmannianPoleWeight;
    velocityUniforms.uGeometryCoupling.value = current.fieldMechanics.geometryCoupling;
    velocityUniforms.uAttractorCount.value = current.attractors.length;
    velocityUniforms.uBlackHoleStarMassFractions.value.fill(0);
    current.attractors.forEach((attractor, index) => {
      velocityUniforms.uAttractorPositions.value[index].fromArray(attractor.position);
      velocityUniforms.uAttractorRotationAxes.value[index].set(0, 1, 0).applyEuler(new Euler(...attractor.rotation)).normalize();
      velocityUniforms.uAttractorMagnitudes.value[index] = attractor.magnitude;
      velocityUniforms.uAttractorTypes.value[index] = attractor.type === 'blackhole' ? 1 : 0;
      velocityUniforms.uSimpleMassMultipliers.value[index] = attractor.simple.massMultiplier;
      velocityUniforms.uSimpleSpinMultipliers.value[index] = attractor.simple.spinMultiplier;
      velocityUniforms.uBlackHoleEventHorizonShear.value[index] = attractor.blackHole.eventHorizonShear;
      velocityUniforms.uBlackHoleFractureThreshold.value[index] = attractor.blackHole.fractureThreshold;
      velocityUniforms.uBlackHoleRotationSpeed.value[index] = attractor.blackHole.rotationSpeed;
      velocityUniforms.uBlackHoleThermalNoise.value[index] = attractor.blackHole.thermalNoise;
      velocityUniforms.uBlackHoleFractureIntensity.value[index] = attractor.blackHole.fractureIntensity;
    });
    velocityUniforms.uTime.value = state.clock.getElapsedTime();
    compute.compute();
    const positionTarget = compute.getCurrentRenderTarget(positionVariable);
    const velocityTarget = compute.getCurrentRenderTarget(velocityVariable);
    material.uniforms.uPositionTex.value = positionTarget.texture;
    material.uniforms.uVelocityTex.value = velocityTarget.texture;
    material.uniforms.uScale.value = presentation.scale;
    material.uniforms.uMaxSpeed.value = current.maxSpeed;
    material.uniforms.uCameraFacing.value = presentation.particleFacing === 'camera';
    material.uniforms.uComparisonEnabled.value = current.fieldMechanics.comparisonEnabled;
    material.uniforms.uColorA.value.set(presentation.colorA);
    material.uniforms.uColorB.value.set(presentation.colorB);

    if (presentation.particlePathsVisible) {
      if (!particlePathResources.enabled || particlePathResources.particleCount !== particleCount) {
        clearParticlePathHistory(gl, particlePathResources);
        particlePathResources.enabled = true;
        particlePathResources.particleCount = particleCount;
      }
      particlePathResources.sampleTimer += frameDelta;
      const sampleInterval = 1 / PARTICLE_PATH_SAMPLE_RATE;
      if (particlePathResources.sampleCount === 0 || particlePathResources.sampleTimer >= sampleInterval) {
        const sourceTarget = particlePathResources.historyTargets[particlePathResources.historyIndex];
        const targetIndex = 1 - particlePathResources.historyIndex;
        const destinationTarget = particlePathResources.historyTargets[targetIndex];
        const gatherUniforms = particlePathResources.gatherMaterial.uniforms;
        gatherUniforms.uPositionTex.value = positionTarget.texture;
        gatherUniforms.uHistoryTex.value = sourceTarget.texture;
        gatherUniforms.uResolution.value = resolution;
        gatherUniforms.uParticleCount.value = particleCount;
        gatherUniforms.uWriteRow.value = particlePathResources.nextRow;
        const currentTarget = gl.getRenderTarget();
        try {
          gl.setRenderTarget(destinationTarget);
          gl.render(particlePathResources.gatherScene, particlePathResources.gatherCamera);
        } finally {
          gl.setRenderTarget(currentTarget);
        }
        particlePathResources.historyIndex = targetIndex;
        particlePathResources.nextRow = (particlePathResources.nextRow + 1) % PARTICLE_PATH_HISTORY_CAPACITY;
        particlePathResources.sampleCount = Math.min(particlePathResources.sampleCount + 1, PARTICLE_PATH_HISTORY_CAPACITY);
        particlePathResources.sampleTimer %= sampleInterval;
      }

      const pathWindow = particlePathWindow(
        particlePathResources.nextRow,
        particlePathResources.sampleCount,
        presentation.particlePathDuration
      );
      particlePathResources.historyGeometry.setDrawRange(0, pathWindow.vertexCount);
      particlePathResources.pathMaterial.uniforms.uPathHistory.value = particlePathResources.historyTargets[particlePathResources.historyIndex].texture;
      particlePathResources.pathMaterial.uniforms.uPathFirstRow.value = pathWindow.firstRow;
      particlePathResources.pathMaterial.uniforms.uPathColor.value.set(presentation.particlePathColor);
      particlePathResources.pathMaterial.uniforms.uPathOpacity.value = presentation.particlePathOpacity;
    } else {
      particlePathResources.enabled = false;
      particlePathResources.historyGeometry.setDrawRange(0, 0);
    }
  });

  return <>
    <instancedMesh args={[geometry, material, particleCount]} frustumCulled={false} />
    <lineSegments name="particle-motion-paths" geometry={particlePathResources.historyGeometry} material={particlePathResources.pathMaterial} visible={configuration.particlePathsVisible} frustumCulled={false} />
  </>;
}

function applyTransformControlColors(controls, axisColors) {
  if (!controls?.traverse) return;
  controls.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material.color) return;
      const defaultAxis = { ff0000: 'X', '00ff00': 'Y', '0000ff': 'Z' }[material.tempColor?.getHexString?.() ?? material.color.getHexString()];
      const color = axisColors[child.name] ?? axisColors[defaultAxis];
      if (!color) return;
      material.color.set(color);
      material.tempColor = new Color(color);
    });
  });
}

function AttractorHandle({ attractor, index, configuration, onChange }) {
  const objectRef = useRef();
  const controlsRef = useRef();
  const styledControlsRef = useRef();
  const draggingRef = useRef(false);
  const pendingTransformRef = useRef();
  const axisColors = {
    X: configuration.controlsColorX,
    Y: configuration.controlsColorY,
    Z: configuration.controlsColorZ
  };
  useEffect(() => {
    styledControlsRef.current = undefined;
  }, [configuration.controlsColorX, configuration.controlsColorY, configuration.controlsColorZ]);
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || styledControlsRef.current === controls) return;
    applyTransformControlColors(controls, axisColors);
    styledControlsRef.current = controls;
  });
  const readTransform = () => {
    if (!objectRef.current) return;
    return {
      position: objectRef.current.position.toArray(),
      rotation: [objectRef.current.rotation.x, objectRef.current.rotation.y, objectRef.current.rotation.z]
    };
  };
  const commitTransform = () => {
    if (!pendingTransformRef.current) return;
    onChange(index, pendingTransformRef.current);
    pendingTransformRef.current = undefined;
  };
  const commitCurrentTransform = () => {
    const transform = readTransform();
    if (!transform) return;
    pendingTransformRef.current = undefined;
    onChange(index, transform);
  };
  const onObjectChange = () => {
    pendingTransformRef.current = readTransform();
    if (!draggingRef.current) commitTransform();
  };
  const onMouseDown = () => { draggingRef.current = true; };
  const onMouseUp = () => { draggingRef.current = false; commitCurrentTransform(); };
  const labelOffset = configuration.helperNamePlacement === 'center' ? 0 : configuration.helperNamePlacement === 'below' ? -1.5 : 1.5;
  const showLabel = configuration.helperShowName || configuration.helperShowAttributes;
  const attractorGroup = (
      <group ref={objectRef} position={attractor.position} rotation={attractor.rotation}>
        <group visible={configuration.helperVisible} scale={0.325}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1, 1.02, 32, 1, 0, Math.PI * 1.5]} />
            <meshBasicMaterial color={configuration.controlsColorY} side={DoubleSide} />
          </mesh>
          <mesh position={[1, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.25 + Math.min(attractor.magnitude, 10) / 10 * 0.75, 1]}>
            <coneGeometry args={[0.1, 0.4, 12]} />
            <meshBasicMaterial color={configuration.controlsColorX} />
          </mesh>
        </group>
        {showLabel && <Html position={[0, labelOffset, 0]} center distanceFactor={8} className="attractor-label">{configuration.helperShowName && <strong>{attractor.name}</strong>}{configuration.helperShowAttributes && <span>mag {attractor.magnitude.toFixed(2)} / pos {attractor.position.map((value) => value.toFixed(2)).join(', ')}</span>}</Html>}
      </group>
  );
  return configuration.showTransformControls && configuration.controlsMode !== 'disabled' ? (
    <TransformControls ref={controlsRef} object={objectRef} mode={configuration.controlsMode} space={configuration.controlsMode === 'rotate' ? 'local' : 'world'} size={0.5} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onObjectChange={onObjectChange}>
      {attractorGroup}
    </TransformControls>
  ) : attractorGroup;
}

function AttractorCamera({ configuration, onCameraChange, playing, paramsVisible, viewMode, orbitalPlaying, onManualChange }) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef();
  const configurationRef = useRef(configuration);
  const destinationRef = useRef(new Vector3(...ATTRACTOR_CAMERA_VIEWS.find((view) => view.id === 'ortho1').position));
  const targetRef = useRef(new Vector3(...ATTRACTOR_CAMERA_TARGET));
  const frameOffsetRef = useRef(new Vector3());
  const manualInteractionRef = useRef(false);
  const zoomWheelActiveRef = useRef(false);
  const zoomTargetRef = useRef(configuration.cameraZoomEnabled ? configuration.cameraZoom : 1);
  const zoomCommitTimeoutRef = useRef(null);
  const onManualChangeRef = useRef(onManualChange);
  const onCameraChangeRef = useRef(onCameraChange);
  configurationRef.current = configuration;
  onManualChangeRef.current = onManualChange;
  onCameraChangeRef.current = onCameraChange;
  const cameraPoseKey = [configuration.cameraPosX, configuration.cameraPosY, configuration.cameraPosZ, configuration.cameraTargetX, configuration.cameraTargetY, configuration.cameraTargetZ].join(':');
  const cameraProjectionKey = [configuration.cameraZoomEnabled, configuration.cameraZoom, configuration.cameraFov, configuration.cameraNear, configuration.cameraFar].join(':');
  useEffect(() => {
    const view = ATTRACTOR_CAMERA_VIEWS.find((candidate) => candidate.id === viewMode);
    manualInteractionRef.current = false;
    const basePosition = new Vector3(...(view?.position ?? [configuration.cameraPosX, configuration.cameraPosY, configuration.cameraPosZ]));
    if (!view?.position) basePosition.sub(frameOffsetRef.current);
    const target = view?.target
      ? new Vector3(...view.target)
      : new Vector3(configuration.cameraTargetX, configuration.cameraTargetY, configuration.cameraTargetZ);
    if (basePosition.distanceTo(target) < 0.25) basePosition.set(target.x, target.y, target.z + 0.25);
    destinationRef.current.copy(basePosition);
    targetRef.current.copy(target);
  }, [cameraPoseKey, configuration.cameraPosX, configuration.cameraPosY, configuration.cameraPosZ, configuration.cameraTargetX, configuration.cameraTargetY, configuration.cameraTargetZ, size, viewMode]);
  useEffect(() => {
    zoomTargetRef.current = configuration.cameraZoomEnabled ? configuration.cameraZoom : 1;
    camera.fov = configuration.cameraFov;
    camera.near = configuration.cameraNear;
    camera.far = configuration.cameraFar;
    camera.updateProjectionMatrix();
  }, [camera, cameraProjectionKey, configuration.cameraFar, configuration.cameraFov, configuration.cameraNear, configuration.cameraZoom, configuration.cameraZoomEnabled]);
  useFrame((_, delta) => {
    const current = configurationRef.current;
    const controls = controlsRef.current;
    if (!controls) return;
    const basePosition = camera.position.clone().sub(frameOffsetRef.current);
    const blend = 1 - Math.exp(-delta * 5.5);
    if (!manualInteractionRef.current) {
      if (viewMode !== 'orbital') basePosition.lerp(destinationRef.current, blend);
      controls.target.lerp(targetRef.current, blend);
    }
    const target = controls.target;
    if (!manualInteractionRef.current && viewMode === 'orbital' && orbitalPlaying && current.cameraOrbitOn) {
      const angle = delta * current.replayCameraOrbitSpeed;
      const offset = basePosition.clone().sub(target);
      offset.applyEuler(new Euler(angle * current.replayCameraOrbitX, angle * current.replayCameraOrbitY, angle * current.replayCameraOrbitZ));
      basePosition.copy(target).add(offset);
    }
    const frameReference = !manualInteractionRef.current && viewMode !== 'orbital'
      ? destinationRef.current
      : basePosition;
    const nextFrameOffset = cameraFrameOffset(camera, frameReference, targetRef.current, size, paramsVisible);
    frameOffsetRef.current.lerp(nextFrameOffset, blend);
    camera.position.copy(basePosition).add(frameOffsetRef.current);
    const zoomDelta = zoomTargetRef.current - camera.zoom;
    if (Math.abs(zoomDelta) > 0.0001) {
      camera.zoom += zoomDelta * (1 - Math.exp(-delta * 18));
      camera.updateProjectionMatrix();
    }
    controls.update();
  });
  const handleManualChange = () => {
    manualInteractionRef.current = true;
    onManualChangeRef.current();
  };
  const recordCamera = () => {
    if (!controlsRef.current) return;
    const basePosition = camera.position.clone().sub(frameOffsetRef.current);
    onCameraChangeRef.current({
      cameraPosX: basePosition.x,
      cameraPosY: basePosition.y,
      cameraPosZ: basePosition.z,
      cameraTargetX: controlsRef.current.target.x,
      cameraTargetY: controlsRef.current.target.y,
      cameraTargetZ: controlsRef.current.target.z,
      cameraZoom: camera.zoom,
      cameraFov: camera.fov,
      cameraNear: camera.near,
      cameraFar: camera.far
    });
  };
  const recordCameraZoom = () => onCameraChangeRef.current({ cameraZoom: zoomTargetRef.current });
  const handleControlEnd = () => {
    if (zoomWheelActiveRef.current) {
      zoomWheelActiveRef.current = false;
      recordCameraZoom();
      return;
    }
    recordCamera();
  };
  useEffect(() => {
    const handlePointerDown = () => {
      zoomWheelActiveRef.current = false;
      manualInteractionRef.current = true;
      onManualChangeRef.current();
    };
    const handleWheel = (event) => {
      const currentConfiguration = configurationRef.current;
      const isPlainWheel = !event.altKey && !event.shiftKey && !event.ctrlKey;
      const axis = event.altKey
        ? new Vector3(1, 0, 0)
        : event.shiftKey
          ? new Vector3(0, 1, 0)
          : event.ctrlKey
            ? new Vector3(0, 0, 1)
            : null;
        if (isPlainWheel && currentConfiguration.cameraWheelMode === 'zoom') {
          if (!currentConfiguration.cameraZoomEnabled) return;
          zoomWheelActiveRef.current = true;
          manualInteractionRef.current = true;
          onManualChangeRef.current();
          event.preventDefault();
          event.stopImmediatePropagation();
          const deltaPixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * gl.domElement.clientHeight : event.deltaY;
          zoomTargetRef.current = Math.min(10, Math.max(0.1, zoomTargetRef.current * Math.exp(-deltaPixels * 0.0008)));
          clearTimeout(zoomCommitTimeoutRef.current);
          zoomCommitTimeoutRef.current = setTimeout(() => {
            zoomWheelActiveRef.current = false;
            recordCameraZoom();
          }, 80);
          return;
        }
        zoomWheelActiveRef.current = false;
        manualInteractionRef.current = true;
        onManualChangeRef.current();
      if (axis && controlsRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = controlsRef.current.target;
        const basePosition = camera.position.clone().sub(frameOffsetRef.current);
        const offset = basePosition.sub(target).applyAxisAngle(axis, -event.deltaY * 0.003);
        camera.position.copy(target).add(offset).add(frameOffsetRef.current);
        camera.up.applyAxisAngle(axis, -event.deltaY * 0.003).normalize();
        controlsRef.current.update();
        recordCamera();
        return;
      }
    };
    gl.domElement.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    gl.domElement.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      clearTimeout(zoomCommitTimeoutRef.current);
      gl.domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      gl.domElement.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [gl]);
  return <OrbitCameraControls ref={controlsRef} cameraParams={{ enabled: configuration.cameraControlsEnabled ?? true, enableZoom: configuration.cameraZoomEnabled && configuration.cameraWheelMode === 'dolly', minDistance: 0.25, maxDistance: 50 }} touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} onStart={handleManualChange} onEnd={handleControlEnd} />;
}

function BlackHoleEffect({ attractor, configuration, showStreamlines, starStateRef, attractorIndex, simulationPlaying }) {
  const starLightRef = useRef();
  const starField = useMemo(() => createBlackHoleStarField(attractor, configuration), [
    attractor.blackHole.orbitRadius,
    attractor.blackHole.testStarEccentricity,
    attractor.magnitude,
    configuration.attractorMassExponent,
    configuration.particleGlobalMassExponent,
    configuration.maxSpeed
  ]);
  const lineGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(96 * 2 * 3), 3));
    return geometry;
  }, []);
  const starGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(starField.positions, 3));
    geometry.setAttribute('aStarMass', new BufferAttribute(starField.masses, 1));
    return geometry;
  }, [starField]);
  const starMaterial = useMemo(() => new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(configuration.blackHoleStarColor) },
      uOpacity: { value: configuration.blackHoleStarOpacity },
      uPointSize: { value: configuration.scale * 1400 }
    },
    vertexShader: `
      attribute float aStarMass;
      uniform float uPointSize;
      varying float vStarMass;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = max(1.25, uPointSize * (0.4 + aStarMass * 0.8) / max(-viewPosition.z, 1.0));
        vStarMass = aStarMass;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vStarMass;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        if (radius > 0.5 || vStarMass < 0.015) discard;
        float glow = 1.0 - smoothstep(0.08, 0.5, radius);
        gl_FragColor = vec4(uColor * (0.65 + vStarMass * 0.55), glow * uOpacity * vStarMass);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  }), []);
  const center = useMemo(() => new Vector3(), []);

  useEffect(() => () => {
    lineGeometry.dispose();
    starGeometry.dispose();
    starMaterial.dispose();
  }, [lineGeometry, starGeometry, starMaterial]);

  useFrame((_, delta) => {
    if (!simulationPlaying) return;
    const parameters = attractor.blackHole;
    advanceBlackHoleStarField(starField, attractor, configuration, delta);
    starStateRef.current.positions[attractorIndex].fromArray(starField.center);
    starStateRef.current.massFractions[attractorIndex] = starField.massFraction;
    starGeometry.attributes.position.needsUpdate = true;
    starGeometry.attributes.aStarMass.needsUpdate = true;
    starMaterial.uniforms.uColor.value.set(configuration.blackHoleStarColor);
    starMaterial.uniforms.uOpacity.value = configuration.blackHoleStarOpacity;
    starMaterial.uniforms.uPointSize.value = configuration.scale * 1400;
    if (starLightRef.current) starLightRef.current.position.fromArray(starField.center);
    center.fromArray(attractor.position);

    const positions = lineGeometry.attributes.position.array;
    for (let index = 0; index < 96; index += 1) {
      const angle = index / 96 * Math.PI * 2;
      const radius = 1.5 + (index % 12) * 1.05;
      const stress = parameters.eventHorizonShear / radius + parameters.thermalNoise * 0.5;
      const length = stress > parameters.fractureThreshold * 0.6
        ? (1 + stress * 0.2) * 0.12 * parameters.fractureIntensity
        : 0;
      const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(length);
      const point = new Vector3(Math.cos(angle) * radius, (index % 5 - 2) * 0.08, Math.sin(angle) * radius).add(center);
      const offset = index * 6;
      positions[offset] = point.x - tangent.x;
      positions[offset + 1] = point.y - tangent.y;
      positions[offset + 2] = point.z - tangent.z;
      positions[offset + 3] = point.x + tangent.x;
      positions[offset + 4] = point.y + tangent.y;
      positions[offset + 5] = point.z + tangent.z;
    }
    lineGeometry.attributes.position.needsUpdate = true;
  });

  return (
    <group>
      <points
        name={`black-hole-star-splats-${attractorIndex}`}
        geometry={starGeometry}
        material={starMaterial}
        visible={configuration.blackHoleStarsVisible && configuration.scale > 0}
        frustumCulled={false}
      />
      <pointLight ref={starLightRef} intensity={2 * configuration.blackHoleStarOpacity} distance={10} color={configuration.blackHoleStarColor} visible={configuration.blackHoleStarsVisible} />
      <lineSegments visible={showStreamlines} geometry={lineGeometry}>
        <lineBasicMaterial color="#ff0055" transparent opacity={0.3} blending={AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

function BlackHoleEffects({ configuration, starStateRef, simulationPlaying }) {
  return <>{configuration.attractors.map((attractor, index) => attractor.type === 'blackhole' && <BlackHoleEffect key={`${index}:${attractor.name}`} attractor={attractor} configuration={configuration} showStreamlines={configuration.blackHoleStreamlines} starStateRef={starStateRef} attractorIndex={index} simulationPlaying={simulationPlaying} />)}</>;
}

function AttractorPaths({ configuration, simulationPlaying }) {
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    const maximumSegments = MAX_ATTRACTORS * (ATTRACTOR_PATH_HISTORY_CAPACITY - 1);
    nextGeometry.setAttribute('position', new BufferAttribute(new Float32Array(maximumSegments * 6), 3));
    nextGeometry.setDrawRange(0, 0);
    return nextGeometry;
  }, []);
  const historyRef = useRef(createAttractorPathHistory(MAX_ATTRACTORS));
  const nextIndexRef = useRef(0);
  const sampleCountRef = useRef(0);
  const sampleTimerRef = useRef(0);
  const needsUpdateRef = useRef(true);
  const positionNeedsSampleRef = useRef(true);
  const attractorIdentity = configuration.attractors.map((attractor) => `${attractor.name}:${attractor.type}`).join('|');
  const positionSignature = configuration.attractors.map((attractor) => attractor.position.join(',')).join('|');

  useEffect(() => {
    historyRef.current.fill(0);
    nextIndexRef.current = 0;
    sampleCountRef.current = 0;
    sampleTimerRef.current = 0;
    needsUpdateRef.current = true;
    positionNeedsSampleRef.current = true;
  }, [attractorIdentity, configuration.attractorPathsVisible]);

  useEffect(() => {
    needsUpdateRef.current = true;
  }, [configuration.attractorPathLength]);

  useEffect(() => {
    positionNeedsSampleRef.current = true;
  }, [positionSignature]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!simulationPlaying || !configuration.attractorPathsVisible) return;

    sampleTimerRef.current += delta;
    let sampled = false;
    if (sampleCountRef.current === 0 || positionNeedsSampleRef.current || sampleTimerRef.current >= 1 / ATTRACTOR_PATH_SAMPLE_RATE) {
      nextIndexRef.current = appendAttractorPathSample(historyRef.current, configuration.attractors, nextIndexRef.current);
      sampleCountRef.current = Math.min(sampleCountRef.current + 1, ATTRACTOR_PATH_HISTORY_CAPACITY);
      sampleTimerRef.current %= 1 / ATTRACTOR_PATH_SAMPLE_RATE;
      positionNeedsSampleRef.current = false;
      sampled = true;
    }

    if (needsUpdateRef.current || sampled) {
      const visiblePointCount = Math.round(configuration.attractorPathLength * ATTRACTOR_PATH_SAMPLE_RATE) + 1;
      const vertexCount = writeAttractorPathSegments(
        geometry.attributes.position.array,
        historyRef.current,
        nextIndexRef.current,
        sampleCountRef.current,
        configuration.attractors.length,
        visiblePointCount
      );
      geometry.setDrawRange(0, vertexCount);
      geometry.attributes.position.needsUpdate = true;
      needsUpdateRef.current = false;
    }
  });

  return (
    <lineSegments name="attractor-motion-paths" geometry={geometry} visible={configuration.attractorPathsVisible} frustumCulled={false}>
      <lineBasicMaterial color={configuration.attractorPathColor} transparent opacity={configuration.attractorPathOpacity} depthTest={false} depthWrite={false} />
    </lineSegments>
  );
}

function AttractorWorld({ configuration, onAttractorChange, onGpuError, playing, simulationPlaying, onCameraChange, paramsVisible, viewMode, orbitalPlaying, onManualChange, variant }) {
  const blackHoleStarStateRef = useRef(null);
  if (!blackHoleStarStateRef.current) blackHoleStarStateRef.current = createBlackHoleStarRuntimeState();
  const particleCount = E2E_PARTICLE_COUNT ?? configuration.particleCount;
  return (
    <>
      <color attach="background" args={['#050810']} />
      <fog attach="fog" args={['#050810', 14, 55]} />
      <ambientLight color="#9bb4ff" intensity={0.55} />
      <directionalLight color="#fff2d4" intensity={1.5} position={[4, 5, 2]} />
      <pointLight color="#ff885e" intensity={2.2} distance={18} position={[0, 0, 0]} />
      <gridHelper args={[16, 16, '#25304c', '#101827']} />
      {!E2E_MODE && <AttractorParticles key={particleCount} configuration={configuration} onGpuError={onGpuError} variant={variant} particleCount={particleCount} blackHoleStarStateRef={blackHoleStarStateRef} simulationPlaying={simulationPlaying} />}
      <BlackHoleEffects configuration={configuration} starStateRef={blackHoleStarStateRef} simulationPlaying={simulationPlaying} />
      <AttractorPaths configuration={configuration} simulationPlaying={simulationPlaying} />
      {configuration.attractors.map((attractor, index) => (
        <AttractorHandle key={`${index}:${attractor.name}`} attractor={attractor} index={index} configuration={configuration} onChange={onAttractorChange} />
      ))}
      <AttractorCamera configuration={configuration} onCameraChange={onCameraChange} playing={playing} paramsVisible={paramsVisible} viewMode={viewMode} orbitalPlaying={orbitalPlaying} onManualChange={onManualChange} />
    </>
  );
}

function RangeControl({ label, value, min, max, step, onChange, disabled = false, editing = false, isDefault = true, onReset }) {
  return <NumericParamControl className="attractor-control" label={label} value={value} min={min} max={max} step={step} editing={editing} isDefault={isDefault} onReset={onReset} onChange={onChange} />;
}

function ColorControl({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (/^#[\da-f]{6}$/i.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value);
  };
  return <label className="attractor-color"><span>{label}</span><div className="attractor-color-inputs"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`${label} hex`} maxLength={7} spellCheck="false" /></div></label>;
}

function BooleanControl({ label, value, onChange }) {
  return <label className="attractor-toggle"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function SelectControl({ label, value, options, onChange }) {
  return <ParamSelect className="attractor-select" label={label} value={value} options={options} onChange={onChange} />;
}

function AttractorPanel({ variant, particleCount, configuration, presets, currentPreset, presetName, onPresetName, jsonText, setJsonText, showParamEditLog, onShowParamEditLog, paramEditLogYaml, onChange, onApplyPreset, onSavePreset, onReset, onExport, onLoad, onDeletePresets, onReplayLog, replayMessage, replaying, journal, playing, playbackTime, onPlaybackTime, onTogglePlayback, onStop, recording, onRecording, onAddAttractor, onRemoveAttractor, onSetOrigin, onResetOrigin, paramsVisible, editing = false, onEditing = () => {}, canUndo = false, canRedo = false, onUndo = () => {}, onRedo = () => {} }) {
  const hasBlackHoles = configuration.attractors.some((attractor) => attractor.type === 'blackhole');
  const mechanics = configuration.fieldMechanics;
  const modelDetails = FIELD_MODEL_DETAILS[mechanics.model];
  const comparison = compareFieldModels(
    mechanics.model,
    mechanics.comparisonModel,
    { radius: mechanics.coreRadius * 2, speed: configuration.maxSpeed * 0.8, magnitude: 1, rotation: 1 },
    mechanics
  );
  const updateMechanics = (field, value) => onChange({ fieldMechanics: { ...mechanics, [field]: value } }, `fieldMechanics.${field}`);
  return (
    <aside className={`attractor-panel ${paramsVisible ? '' : 'is-hidden'}`} aria-hidden={!paramsVisible} onPointerDown={(event) => event.stopPropagation()}>
      <ParamEditingProvider editing={editing}>
      <div className="attractor-panel-header"><div><span className="attractor-eyebrow">SQGSIM / GPU COMPUTE</span><h2>Attractor particles</h2></div></div>
      <p className="attractor-intro">A bounded field of particles orbiting configurable gravitational and spinning attractors.</p>
      <div className="attractor-status"><span className="status-pip" />{configuration.attractors.length} attractors / {particleCount.toLocaleString()} particles</div><div className="attractor-editor-toolbar"><ParamEditingToggle checked={editing} onChange={onEditing} /><HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} /></div>

      <SimulatorPresetControls className="attractor-section" selectClassName="attractor-preset" name={presetName} onNameChange={onPresetName} presets={presets} currentPreset={currentPreset} onApply={onApplyPreset} onSave={onSavePreset} onReset={onReset} />
      <ParticleAppearanceSettings configuration={configuration} onChange={() => {}} capabilities={{ shape: true, derivativeOrder: false, colorMode: false, color: true, opacity: variant !== 'simple' }} fields={[
        { key: 'sizeScale', path: 'scale', type: 'range', label: 'Particle size', min: 0, max: 0.1, step: 0.001 },
        { key: 'shape', path: 'particleFacing', type: 'select', label: 'Particle facing', options: ['world', 'camera'] },
        { key: 'derivativeOrder', path: 'particleDerivativeOrder', type: 'range', label: 'Derivative order', min: 0, max: 4, step: 1, disabled: true },
        { key: 'color', path: 'colorA', type: 'color', label: 'Particle color A' },
        { key: 'color', path: 'colorB', type: 'color', label: 'Particle color B' },
        { key: 'opacity', path: 'blackHoleStarOpacity', type: 'range', label: 'Star particle opacity', min: 0, max: 1, step: 0.01 }
      ]} />

      <details className="attractor-details" open>
        <summary>Particle field</summary>
        <RangeControl label="Attractor mass exponent" value={configuration.attractorMassExponent} min={1} max={10} step={1} onChange={(value) => onChange({ attractorMassExponent: value }, 'attractorMassExponent')} />
        <RangeControl label="Particle mass exponent" value={configuration.particleGlobalMassExponent} min={1} max={10} step={1} onChange={(value) => onChange({ particleGlobalMassExponent: value }, 'particleGlobalMassExponent')} />
        <RangeControl label="Particle count" value={configuration.particleCount} min={1024} max={PARTICLE_COUNT} step={1024} onChange={(value) => onChange({ particleCount: value }, 'particleCount')} />
        <RangeControl label="Maximum speed" value={configuration.maxSpeed} min={0} max={10} step={0.01} onChange={(value) => onChange({ maxSpeed: value }, 'maxSpeed')} />
        <RangeControl label="Velocity damping" value={configuration.velocityDamping} min={0} max={0.1} step={0.001} onChange={(value) => onChange({ velocityDamping: value }, 'velocityDamping')} />
        <RangeControl label="Spinning strength" value={configuration.spinningStrength} min={0} max={10} step={0.01} onChange={(value) => onChange({ spinningStrength: value }, 'spinningStrength')} />
        <RangeControl label="Particle scale" value={configuration.scale} min={0} max={0.1} step={0.001} onChange={(value) => onChange({ scale: value }, 'scale')} />
        <RangeControl label="Bound half extent" value={configuration.boundHalfExtent} min={0.5} max={20} step={0.01} onChange={(value) => onChange({ boundHalfExtent: value }, 'boundHalfExtent')} />
        <SelectControl label="Particle facing" value={configuration.particleFacing} options={['world', 'camera']} onChange={(value) => onChange({ particleFacing: value }, 'particleFacing')} />
      </details>

      <details className="attractor-details" open>
        <summary>Particle paths</summary>
        <BooleanControl label="Show particle paths" value={configuration.particlePathsVisible} onChange={(value) => onChange({ particlePathsVisible: value }, 'particlePathsVisible')} />
        <RangeControl label="Path duration" value={configuration.particlePathDuration} min={1} max={12} step={0.1} onChange={(value) => onChange({ particlePathDuration: value }, 'particlePathDuration')} />
        <ColorControl label="Particle path color" value={configuration.particlePathColor} onChange={(value) => onChange({ particlePathColor: value }, 'particlePathColor')} />
        <RangeControl label="Particle path opacity" value={configuration.particlePathOpacity} min={0} max={1} step={0.01} onChange={(value) => onChange({ particlePathOpacity: value }, 'particlePathOpacity')} />
      </details>

      <details className="attractor-details" open>
        <summary>Attractor paths</summary>
        <BooleanControl label="Show attractor paths" value={configuration.attractorPathsVisible} onChange={(value) => onChange({ attractorPathsVisible: value }, 'attractorPathsVisible')} />
        <RangeControl label="Path duration" value={configuration.attractorPathLength} min={1} max={12} step={0.1} onChange={(value) => onChange({ attractorPathLength: value }, 'attractorPathLength')} />
        <ColorControl label="Path color" value={configuration.attractorPathColor} onChange={(value) => onChange({ attractorPathColor: value }, 'attractorPathColor')} />
        <RangeControl label="Path opacity" value={configuration.attractorPathOpacity} min={0} max={1} step={0.01} onChange={(value) => onChange({ attractorPathOpacity: value }, 'attractorPathOpacity')} />
      </details>

      <details className="attractor-details" open>
        <summary>Mechanics models</summary>
        <BooleanControl label="Enable model mechanics" value={mechanics.enabled} onChange={(value) => updateMechanics('enabled', value)} />
        <SelectControl label="Active model" value={mechanics.model} options={FIELD_MODEL_OPTIONS} onChange={(value) => updateMechanics('model', value)} />
        <p className="attractor-model-note"><strong>{modelDetails.status}</strong><br />{modelDetails.equation}</p>
        <RangeControl label="Core radius" value={mechanics.coreRadius} min={0.05} max={5} step={0.05} onChange={(value) => updateMechanics('coreRadius', value)} />
        {['sqg', 'ddf'].includes(mechanics.model) && <RangeControl label="Quantum pressure" value={mechanics.quantumPressure} min={0} max={5} step={0.01} onChange={(value) => updateMechanics('quantumPressure', value)} />}
        {['ns-compressible', 'sqg', 'ddf'].includes(mechanics.model) && <RangeControl label="Compressibility" value={mechanics.compressibility} min={0} max={4} step={0.01} onChange={(value) => updateMechanics('compressibility', value)} />}
        {['ns-compressible', 'ns-incompressible', 'sqg', 'ddf'].includes(mechanics.model) && <RangeControl label="Base viscosity" value={mechanics.baseViscosity} min={0} max={0.5} step={0.005} onChange={(value) => updateMechanics('baseViscosity', value)} />}
        {mechanics.model === 'ddf' && <>
          <RangeControl label="Dilatancy" value={mechanics.dilatancy} min={0} max={10} step={0.05} onChange={(value) => updateMechanics('dilatancy', value)} />
          <RangeControl label="Speed limit" value={mechanics.speedLimit} min={0.1} max={10} step={0.1} onChange={(value) => updateMechanics('speedLimit', value)} />
        </>}
        {['ddf', 'grassmannian-amplituhedron'].includes(mechanics.model) && <RangeControl label="Tensor-Gaussian waist" value={mechanics.tensorGaussianWaist} min={0.1} max={20} step={0.1} onChange={(value) => updateMechanics('tensorGaussianWaist', value)} />}
        {mechanics.model === 'grassmannian-amplituhedron' && <>
          <RangeControl label="Positive-cell pole weight" value={mechanics.grassmannianPoleWeight} min={0} max={1} step={0.01} onChange={(value) => updateMechanics('grassmannianPoleWeight', value)} />
          <RangeControl label="Amplituhedron acceleration coupling" value={mechanics.geometryCoupling} min={0} max={0.25} step={0.005} onChange={(value) => updateMechanics('geometryCoupling', value)} />
          <p className="attractor-model-note">A normalized tensor-Gaussian window bounds the speculative positive-Grassmannian acceleration overlay.</p>
        </>}
        {comparison.primary.volumeChangeRate !== null && <p className="attractor-model-difference">Reference volume rate at 2 core radii: <strong>{comparison.primary.volumeChangeRate.toFixed(4)} / step</strong></p>}
        <BooleanControl label="Show model difference" value={mechanics.comparisonEnabled} onChange={(value) => updateMechanics('comparisonEnabled', value)} />
        {mechanics.comparisonEnabled && <>
          <SelectControl label="Compare against" value={mechanics.comparisonModel} options={FIELD_MODEL_OPTIONS} onChange={(value) => updateMechanics('comparisonModel', value)} />
          <RangeControl label="Difference gain" value={mechanics.differenceScale} min={0} max={10} step={0.1} onChange={(value) => updateMechanics('differenceScale', value)} />
          <p className="attractor-model-difference">Reference delta at 2 core radii: <strong>{(comparison.relativeDifference * 100).toFixed(1)}%</strong></p>
        </>}
        {hasBlackHoles && <>
          <BooleanControl label="Show stress streamlines" value={configuration.blackHoleStreamlines} onChange={(value) => onChange({ blackHoleStreamlines: value }, 'blackHoleStreamlines')} />
          <BooleanControl label="Show black-hole star splats" value={configuration.blackHoleStarsVisible} onChange={(value) => onChange({ blackHoleStarsVisible: value }, 'blackHoleStarsVisible')} />
          <ColorControl label="Black-hole star color" value={configuration.blackHoleStarColor} onChange={(value) => onChange({ blackHoleStarColor: value }, 'blackHoleStarColor')} />
          <RangeControl label="Black-hole star opacity" value={configuration.blackHoleStarOpacity} min={0} max={1} step={0.01} onChange={(value) => onChange({ blackHoleStarOpacity: value }, 'blackHoleStarOpacity')} />
          <p className="attractor-model-note">GPU particles sample reduced response fields, not a full shock-capturing or pressure-Poisson NS solver. SQG and DDF remain phenomenological hypotheses with no claimed derivation from QED, amplituhedra, or general relativity.</p>
        </>}
      </details>

      <details className="attractor-details" open>
        <summary>Attractor rig</summary>
        {configuration.showTransformControls && <SelectControl label="Transform mode" value={configuration.controlsMode} options={TRANSFORM_MODE_OPTIONS} onChange={(value) => onChange({ controlsMode: value }, 'controlsMode')} />}
        <BooleanControl label="Show transform controls" value={configuration.showTransformControls} onChange={(value) => onChange({ showTransformControls: value }, 'showTransformControls')} />
        <BooleanControl label="Show helper rings" value={configuration.helperVisible} onChange={(value) => onChange({ helperVisible: value }, 'helperVisible')} />
        <BooleanControl label="Show names" value={configuration.helperShowName} onChange={(value) => onChange({ helperShowName: value }, 'helperShowName')} />
        <BooleanControl label="Show attractor attributes" value={configuration.helperShowAttributes} onChange={(value) => onChange({ helperShowAttributes: value }, 'helperShowAttributes')} />
        <SelectControl label="Label placement" value={configuration.helperNamePlacement} options={['above', 'center', 'below']} onChange={(value) => onChange({ helperNamePlacement: value }, 'helperNamePlacement')} />
        <SelectControl label="New placement" value={configuration.newAttractorPlacement} options={['origin', 'previous', 'centroid', 'random', 'random within distance']} onChange={(value) => onChange({ newAttractorPlacement: value }, 'newAttractorPlacement')} />
        <RangeControl label="Random distance" value={configuration.newAttractorRandomDist} min={0} max={20} step={0.01} onChange={(value) => onChange({ newAttractorRandomDist: value }, 'newAttractorRandomDist')} />
        <div className="attractor-actions"><button type="button" onClick={onAddAttractor}>Add attractor</button><button type="button" onClick={onRemoveAttractor}>Remove last</button><button type="button" onClick={onResetOrigin}>Reset origin</button></div>
        <div className="attractor-list">{configuration.attractors.map((attractor, index) => <AttractorEditor key={`${index}:${attractor.name}`} attractor={attractor} index={index} onChange={onChange} onSetOrigin={onSetOrigin} />)}</div>
      </details>

      <details className="attractor-details">
        <summary>Colors</summary>
        <ColorControl label="Color A" value={configuration.colorA} onChange={(value) => onChange({ colorA: value }, 'colorA')} />
        <ColorControl label="Color B" value={configuration.colorB} onChange={(value) => onChange({ colorB: value }, 'colorB')} />
        <ColorControl label="Controls X" value={configuration.controlsColorX} onChange={(value) => onChange({ controlsColorX: value }, 'controlsColorX')} />
        <ColorControl label="Controls Y" value={configuration.controlsColorY} onChange={(value) => onChange({ controlsColorY: value }, 'controlsColorY')} />
        <ColorControl label="Controls Z" value={configuration.controlsColorZ} onChange={(value) => onChange({ controlsColorZ: value }, 'controlsColorZ')} />
      </details>

      <SimulatorIOJournal currentValue={configuration} presets={presets} jsonText={jsonText} onJsonText={setJsonText} onLoad={onLoad} onExport={onExport} onDeletePresets={onDeletePresets} showEditLog={showParamEditLog} onShowEditLog={onShowParamEditLog} editLogYaml={paramEditLogYaml} onReplayLog={onReplayLog} replayMessage={replayMessage} replaying={replaying} journal={journal} recording={recording} onRecording={onRecording} playing={playing} onTogglePlayback={onTogglePlayback} onStop={onStop} playbackTime={playbackTime} onPlaybackTime={onPlaybackTime} playbackSpeed={configuration.playbackSpeed} onPlaybackSpeed={(value) => onChange({ playbackSpeed: value }, 'playbackSpeed')} />

      <OrbitCameraSettings configuration={configuration} onChange={onChange} />
      </ParamEditingProvider>
    </aside>
  );
}

function AttractorEditor({ attractor, index, onChange, onSetOrigin }) {
  const update = (field, axis, value) => {
    const values = [...attractor[field]];
    values[axis] = value;
    onChange({ attractors: null }, `attractors[${index}].${field}.${axis}`, { index, field, values });
  };
  const updateValue = (field, value, group = null) => {
    const path = group ? `attractors[${index}].${group}.${field}` : `attractors[${index}].${field}`;
    onChange({ attractors: null }, path, { index, field, value, group });
  };
  return (
    <details className="attractor-editor">
      <summary>{attractor.name} / {attractor.type === 'blackhole' ? 'Black hole' : 'Simple attractor'}</summary>
      {['position', 'rotation'].map((field) => <div className="attractor-axis-group" key={field}><span>{field}</span>{[0, 1, 2].map((axis) => <input key={axis} type="number" step="0.01" value={attractor[field][axis]} onChange={(event) => update(field, axis, Number(event.target.value))} aria-label={`${attractor.name} ${field} ${axis}`} />)}</div>)}
      <div className="attractor-actions"><button type="button" onClick={() => onSetOrigin(index)}>Set origin</button></div>
      <SelectControl label="Attractor type" value={attractor.type} options={['simple', 'blackhole']} onChange={(value) => updateValue('type', value)} />
      <label className="attractor-number"><span>Magnitude</span><input type="number" min="0" step="0.01" value={attractor.magnitude} onChange={(event) => updateValue('magnitude', Number(event.target.value))} /></label>
      {attractor.type === 'simple' ? <>
        <label className="attractor-number"><span>Mass multiplier</span><input type="number" min="0" step="0.01" value={attractor.simple.massMultiplier} onChange={(event) => updateValue('massMultiplier', Number(event.target.value), 'simple')} /></label>
        <label className="attractor-number"><span>Spin multiplier</span><input type="number" min="0" step="0.01" value={attractor.simple.spinMultiplier} onChange={(event) => updateValue('spinMultiplier', Number(event.target.value), 'simple')} /></label>
      </> : <>
        <label className="attractor-number"><span>Event horizon shear</span><input type="number" min="0" step="0.1" value={attractor.blackHole.eventHorizonShear} onChange={(event) => updateValue('eventHorizonShear', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Fracture threshold</span><input type="number" min="0.1" step="0.1" value={attractor.blackHole.fractureThreshold} onChange={(event) => updateValue('fractureThreshold', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Star rotation speed</span><input type="number" min="0" step="0.01" value={attractor.blackHole.rotationSpeed} onChange={(event) => updateValue('rotationSpeed', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Star eccentricity</span><input type="number" min="0" max="0.99" step="0.01" value={attractor.blackHole.testStarEccentricity} onChange={(event) => updateValue('testStarEccentricity', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Thermal noise</span><input type="number" min="0" step="0.01" value={attractor.blackHole.thermalNoise} onChange={(event) => updateValue('thermalNoise', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Orbit radius</span><input type="number" min="0" step="0.1" value={attractor.blackHole.orbitRadius} onChange={(event) => updateValue('orbitRadius', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Orbit vertical amplitude</span><input type="number" min="0" step="0.01" value={attractor.blackHole.orbitVerticalAmplitude} onChange={(event) => updateValue('orbitVerticalAmplitude', Number(event.target.value), 'blackHole')} /></label>
        <label className="attractor-number"><span>Fracture indication intensity</span><input type="number" min="0" max="4" step="0.1" value={attractor.blackHole.fractureIntensity} onChange={(event) => updateValue('fractureIntensity', Number(event.target.value), 'blackHole')} /></label>
      </>}
    </details>
  );
}

function SimpleAttractorSim({ variant = 'simple', onBack }) {
  const editor = useSimulationEditor(createConfiguration(variant), { recordParameterEdits: true });
  const { value: configuration, commit, load, record, log, replace, canUndo, canRedo, undo, redo } = editor;
  const particleCount = E2E_PARTICLE_COUNT ?? configuration.particleCount;
  const configurationRef = useRef(configuration);
  const [editing, setEditing] = useState(false);
  const [showParamEditLog, setShowParamEditLog] = useState(false);
  const [replayMessage, setReplayMessage] = useState('');
  useUndoRedoShortcuts({ undo, redo, canUndo, canRedo, isTextEditing: (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) });
  configurationRef.current = configuration;
  const [presets, setPresets] = useState(() => readSavedPresets(variant));
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [presetName, setPresetName] = useState('');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(createConfiguration(variant), null, 2));
  const [gpuError, setGpuError] = useState('');
  const [modal, setModal] = useState(null);
  const [paramsVisible, setParamsVisible] = useState(true);
  const [simulationPlaying, setSimulationPlaying] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [orbitalPlaying, setOrbitalPlaying] = useState(true);
  const initialSnapshot = useMemo(() => clone(configuration), []);
  const journal = useSimulatorJournal({ initialSnapshot, playbackSpeed: configuration.playbackSpeed, onApplySnapshot: (snapshot) => {
    const next = sanitizeConfiguration(snapshot, variant);
    configurationRef.current = next;
    replace(next);
    setJsonText(JSON.stringify(next, null, 2));
  } });
  const presetApplyingRef = useRef(false);
  const paramEditLogYaml = useMemo(() => serializeParameterEditLog(log), [log]);

  const recordChange = (next, path, value) => {
    journal.record(next, path, value);
  };

  const applyConfiguration = (data, path = 'configuration', value = null) => {
    const next = sanitizeConfiguration(data, variant);
    configurationRef.current = next;
    load(next, next, { type: "preset-load", name: path.startsWith("preset:") ? path.slice(7) : path });
    setJsonText(JSON.stringify(next, null, 2));
    recordChange(next, path, value);
  };

  const onChange = (patch, path, special = null) => {
    let next;
    if (patch.attractors === null && special) {
      const attractors = clone(configurationRef.current.attractors);
      const target = attractors[special.index];
      if (special.values) target[special.field] = special.values;
      else if (special.group) target[special.group] = { ...target[special.group], [special.field]: special.value };
      else if (special.field === 'magnitude') target.magnitude = Math.max(0, special.value);
      else target[special.field] = special.value;
      next = { ...configurationRef.current, attractors };
    } else {
      next = { ...configurationRef.current, ...patch };
    }
    configurationRef.current = next;
    commit(next, { type: "parameter-edit", path, value: special || Object.values(patch)[0] });
    setJsonText(JSON.stringify(next, null, 2));
    recordChange(next, path, special || Object.values(patch)[0]);
    if (!presetApplyingRef.current && !currentPreset.includes('draft')) {
      const draftName = `${currentPreset} draft`;
      setPresets((current) => ({ ...current, [draftName]: clone(next) }));
      setCurrentPreset(draftName);
    }
  };

  const onAttractorChange = (index, transform) => {
    const attractors = clone(configurationRef.current.attractors);
    attractors[index] = { ...attractors[index], ...transform };
    onChange({ attractors }, `attractors[${index}].transform`);
  };

  const onSetOrigin = (index) => {
    const current = configurationRef.current;
    const view = ATTRACTOR_CAMERA_VIEWS.find((candidate) => candidate.id === viewMode);
    const currentPosition = new Vector3(...(view?.position ?? [current.cameraPosX, current.cameraPosY, current.cameraPosZ]));
    const currentTarget = new Vector3(...(view?.target ?? [current.cameraTargetX, current.cameraTargetY, current.cameraTargetZ]));
    const target = new Vector3(...current.attractors[index].position);
    const delta = target.clone().sub(currentTarget);
    const nextPosition = currentPosition.add(delta);
    onChange({
      cameraPosX: nextPosition.x,
      cameraPosY: nextPosition.y,
      cameraPosZ: nextPosition.z,
      cameraTargetX: target.x,
      cameraTargetY: target.y,
      cameraTargetZ: target.z
    }, `attractors[${index}].setOrigin`);
    setViewMode(null);
  };

  const onResetOrigin = () => {
    const current = configurationRef.current;
    const target = new Vector3(current.cameraTargetX, current.cameraTargetY, current.cameraTargetZ);
    const position = new Vector3(current.cameraPosX, current.cameraPosY, current.cameraPosZ).sub(target);
    onChange({
      cameraPosX: position.x,
      cameraPosY: position.y,
      cameraPosZ: position.z,
      cameraTargetX: 0,
      cameraTargetY: 0,
      cameraTargetZ: 0
    }, 'sys:resetOrigin');
    setViewMode(null);
  };

  const onAddAttractor = () => {
    if (configurationRef.current.attractors.length >= MAX_ATTRACTORS) return;
    const current = configurationRef.current;
    const index = current.attractors.length;
    const position = new Vector3();
    if (current.newAttractorPlacement === 'previous') position.fromArray(current.attractors[index - 1]?.position || [0, 0, 0]);
    if (current.newAttractorPlacement === 'centroid' || current.newAttractorPlacement === 'random within distance') {
      current.attractors.forEach((attractor) => position.add(new Vector3(...attractor.position)));
      position.divideScalar(Math.max(1, current.attractors.length));
    }
    if (current.newAttractorPlacement === 'random') position.set((Math.random() - 0.5) * current.boundHalfExtent * 2, (Math.random() - 0.5) * current.boundHalfExtent * 2, (Math.random() - 0.5) * current.boundHalfExtent * 2);
    if (current.newAttractorPlacement === 'random within distance') position.add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.cbrt(Math.random()) * current.newAttractorRandomDist));
    onChange({ attractors: [...current.attractors, createAttractor({ position: position.toArray(), name: `Attractor ${index}` }, variant === 'blackhole' || variant === 'ddf' ? 'blackhole' : 'simple')] }, 'sys:addAttractor');
  };

  const onRemoveAttractor = () => {
    if (configurationRef.current.attractors.length <= 1) return;
    onChange({ attractors: configurationRef.current.attractors.slice(0, -1) }, 'sys:removeAttractor');
  };

  const onApplyPreset = (name) => {
    if (!presets[name]) return;
    presetApplyingRef.current = true;
    applyConfiguration(presets[name], `preset:${name}`);
    setCurrentPreset(name);
    presetApplyingRef.current = false;
  };

  const onSavePreset = () => {
    const name = presetName.trim() || new Date().toISOString();
    record({ type: "preset-save", name });
    const nextPresets = { ...presets, [name]: clone(configurationRef.current) };
    setPresets(nextPresets);
    setCurrentPreset(name);
    setPresetName('');
    writePresetLibrary(localStorage, PRESET_STORAGE_KEY, nextPresets);
  };

  const onReset = () => {
    const next = createConfiguration(variant);
    configurationRef.current = next;
    load(next, next, { type: "preset-load", name: "Default" });
    setJsonText(JSON.stringify(next, null, 2));
    setCurrentPreset('Default');
    journal.reset(next);
  };

  const onLoad = () => {
    try {
      applyConfiguration(parseSimulatorJson(jsonText), 'io:load');
      setCurrentPreset('JSON draft');
    } catch {
      setModal({ title: 'Invalid JSON', value: { error: 'The preset JSON could not be parsed.' } });
    }
  };

  const onDeletePresets = () => {
    deletePresetLibrary(localStorage, PRESET_STORAGE_KEY);
    setPresets(createPresetLibrary(variant));
    setCurrentPreset('Default');
  };

  const onReplayParameterLog = (text, options) => {
    try {
      const log = parseParameterEditLogYaml(text);
      const entries = buildParameterReplayJournal(initialSnapshot, log, options);
      if (!journal.replayJournal(entries)) throw new Error('No replayable parameter edits were found.');
      setReplayMessage(`Replaying ${entries.length - 1} parameter edits.`);
    } catch (error) {
      setReplayMessage(`Could not replay parameter log: ${error.message}`);
    }
  };

  useEffect(() => {
    const undo = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'z' || journal.journal.length < 2) return;
      event.preventDefault();
      journal.rewind();
    };
    window.addEventListener('keydown', undo);
    return () => window.removeEventListener('keydown', undo);
  }, [journal.journal.length, journal.rewind]);

  const isHypothesisVariant = variant === 'blackhole' || variant === 'ddf';
  const reportTitle = variant === 'ddf' ? 'DDF particles' : variant === 'blackhole' ? 'SQG particles' : 'Attractor particles';
  return (
    <SimulatorBase className={`attractor-app ${isHypothesisVariant ? 'blackhole-app' : ''}`} headerClassName="attractor-topbar" brandClassName="attractor-base-brand" markClassName="sqg-mark" title={variant === 'ddf' ? 'DILATANT DARK FLUID SANDBOX' : variant === 'blackhole' ? 'SQG BLACK-HOLE SANDBOX' : 'PARTICLE DYNAMICS LAB'} subtitle="N-body / presets / journal" meta={reportTitle.toUpperCase()} metaClassName="attractor-top-actions" metaContentClassName="attractor-top-meta" homeUrl="/" onHome={onBack} homeClassName="attractor-back" parameterValue={configuration} presetValue={editor.baseline} onParameterChange={(next) => onChange(next, 'parameter-group-reset')} actions={<><button type="button" className="attractor-sim-play-toggle" aria-label={simulationPlaying ? 'Pause simulation' : 'Play simulation'} aria-pressed={simulationPlaying} onClick={() => setSimulationPlaying((playing) => !playing)}>{simulationPlaying ? 'Pause' : 'Play'}</button><button type="button" className="attractor-params-toggle" aria-pressed={paramsVisible} onClick={() => setParamsVisible((value) => !value)}>{paramsVisible ? 'Hide params' : 'Show params'}</button></>}>
      <div className="attractor-scene"><Canvas frameloop={E2E_MODE ? 'demand' : 'always'} camera={{ position: [3, 5, 8], fov: 25, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><AttractorWorld configuration={configuration} onAttractorChange={onAttractorChange} onGpuError={setGpuError} playing={journal.playing} simulationPlaying={simulationPlaying} onCameraChange={(change) => onChange(change, 'sys:camera')} paramsVisible={paramsVisible} viewMode={viewMode} orbitalPlaying={orbitalPlaying} onManualChange={() => setViewMode(null)} variant={variant} /></Canvas></div>
      <CameraPerspectiveToolbar className="attractor-view-toolbar" modesClassName="attractor-view-modes" views={ATTRACTOR_CAMERA_VIEWS} viewMode={viewMode} onViewChange={setViewMode} orbitPlaying={orbitalPlaying} onToggleOrbit={() => setOrbitalPlaying((value) => !value)} />
      <AttractorPanel variant={variant} particleCount={particleCount} configuration={configuration} presets={presets} currentPreset={currentPreset} presetName={presetName} onPresetName={setPresetName} jsonText={jsonText} setJsonText={setJsonText} showParamEditLog={showParamEditLog} onShowParamEditLog={setShowParamEditLog} paramEditLogYaml={paramEditLogYaml} onChange={onChange} onApplyPreset={onApplyPreset} onSavePreset={onSavePreset} onReset={onReset} onExport={(type, value) => setModal({ title: type === 'all' ? 'All presets' : type === 'saved' ? 'Saved presets' : 'Current parameters', value: type === 'current' ? configuration : value })} onLoad={onLoad} onDeletePresets={onDeletePresets} onReplayLog={onReplayParameterLog} replayMessage={replayMessage} replaying={journal.playing} journal={journal.journal} playing={journal.playing} playbackTime={journal.playbackTime} onPlaybackTime={journal.seek} onTogglePlayback={() => journal.setPlaying((value) => !value)} onStop={journal.stop} recording={journal.recording} onRecording={journal.setRecording} onAddAttractor={onAddAttractor} onRemoveAttractor={onRemoveAttractor} onSetOrigin={onSetOrigin} onResetOrigin={onResetOrigin} paramsVisible={paramsVisible} editing={editing} onEditing={setEditing} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      <div className="attractor-title"><span>ACTIVE FIELD / {variant === 'ddf' ? 'DDFSIM' : variant === 'blackhole' ? 'SQGBLACKHOLESIM' : 'SIMPLEATTRACTORSIM'}</span><h1>{variant === 'ddf' ? 'Dilatant Dark Fluid System' : variant === 'blackhole' ? 'Superfluid Quantum Gravity System' : 'Simple Particle Attractor System'}</h1><p>{variant === 'ddf' ? 'Phenomenological compressible sink flow with speed-limited shear thickening.' : variant === 'blackhole' ? 'Phenomenological SQG sink flow with a finite quantum-pressure core.' : 'Tune attractor mass, spin, and geometry within a field of particles.'}</p>{gpuError && <strong className="attractor-error">GPU offline: {gpuError}</strong>}</div>
      {modal && <SimulatorExportModal title={modal.title} value={modal.value} onClose={() => setModal(null)} />}
    </SimulatorBase>
  );
}

export { SimpleAttractorSim };