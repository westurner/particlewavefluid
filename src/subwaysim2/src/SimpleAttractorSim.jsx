import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls } from '@react-three/drei';
import { stringify as stringifyYaml } from "yaml";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Euler, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial, TOUCH, Vector3 } from 'three';
import { createGpuParticleField, createSimulationUvs } from './simulations/gpuParticleRuntime.js';
import { HistoryControls, NumericParamControl, ParamEditingProvider, ParamEditingToggle, ParamSelect, YamlTextArea } from './lib/ParamControls.jsx';
import { useSimulationEditor, useUndoRedoShortcuts } from './lib/simulation-state.js';

const MAX_ATTRACTORS = 20;
const PARTICLE_COUNT = 2 ** 18;
const E2E_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e');
const E2E_PARTICLE_COUNT = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e') ? 2 ** 11 : null;
const PRESET_STORAGE_KEY = 'sqgsim-attractor-presets';
const ATTRACTOR_PANEL_LAYOUT = { breakpoint: 700, width: 350, right: 28 };
const ATTRACTOR_CAMERA_TARGET = [0, 0, 0];
const ATTRACTOR_CAMERA_VIEWS = [
  { id: 'front', label: 'Front', position: [0, 0, 24] },
  { id: 'back', label: 'Back', position: [0, 0, -24] },
  { id: 'left', label: 'Left', position: [-24, 0, 0] },
  { id: 'right', label: 'Right', position: [24, 0, 0] },
  { id: 'ortho1', label: 'Ortho 1', position: [14, 14, 20] },
  { id: 'ortho2', label: 'Ortho 2', position: [-14, 12, -20] },
  { id: 'orbital', label: 'Orbital tracking', position: null }
];
const TRANSFORM_MODE_OPTIONS = [
  { value: 'translate', label: 'Translate' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'disabled', label: 'Disabled' }
];
const CAMERA_WHEEL_MODE_OPTIONS = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'dolly', label: 'Move camera' }
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
  uniform float uBlackHoleTestStarEccentricity[20];
  uniform float uBlackHoleThermalNoise[20];
  uniform float uBlackHoleOrbitRadius[20];
  uniform float uBlackHoleOrbitVerticalAmplitude[20];
  uniform float uBlackHoleFractureIntensity[20];

  const float GRAVITY_CONSTANT = 6.67e-11;

  float hash21(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
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

    for (int index = 0; index < 20; index += 1) {
      if (float(index) >= uAttractorCount) break;
      vec3 toAttractor = uAttractorPositions[index] - particlePosition;
      float distanceToAttractor = max(length(toAttractor), 0.08);
      vec3 direction = toAttractor / distanceToAttractor;
      if (uAttractorTypes[index] < 0.5) {
        float gravityStrength = uAttractorMass * particleMass * GRAVITY_CONSTANT
          * uAttractorMagnitudes[index] * uSimpleMassMultipliers[index]
          / (distanceToAttractor * distanceToAttractor);
        force += direction * gravityStrength;
        vec3 spinningForce = uAttractorRotationAxes[index] * gravityStrength
          * uSpinningStrength * uSimpleSpinMultipliers[index];
        force += cross(spinningForce, toAttractor);
      } else {
        vec3 fromCenter = particlePosition - uAttractorPositions[index];
        float radius = max(length(fromCenter), 0.12);
        vec3 radial = fromCenter / radius;
        vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), radial) + vec3(0.0001, 0.0, 0.0));
        float shear = uBlackHoleEventHorizonShear[index];
        float threshold = max(uBlackHoleFractureThreshold[index], 0.001);
        float semiMajorAxis = max(uBlackHoleOrbitRadius[index], 0.0);
        float eccentricity = clamp(uBlackHoleTestStarEccentricity[index], 0.0, 0.99);
        float semiMinorAxis = semiMajorAxis * sqrt(max(0.0, 1.0 - eccentricity * eccentricity));
        float orbitAngle = uTime * uBlackHoleRotationSpeed[index] * 0.5;
        float linearEccentricity = sqrt(max(0.0, semiMajorAxis * semiMajorAxis - semiMinorAxis * semiMinorAxis));
        vec3 starPosition = uAttractorPositions[index] + vec3(
          cos(orbitAngle) * semiMajorAxis - linearEccentricity,
          sin(orbitAngle * 2.0) * uBlackHoleOrbitVerticalAmplitude[index],
          sin(orbitAngle) * semiMinorAxis
        );
        float distanceToStar = distance(particlePosition, starPosition);
        float wakeStress = distanceToStar < 2.5
          ? (2.5 - distanceToStar) / (length(starPosition - uAttractorPositions[index]) + 0.1) * 50.0
          : 0.0;
        float thermalStress = hash21(uv + vec2(uTime * 0.03, uTime * 0.017)) * uBlackHoleThermalNoise[index];
        float localStress = shear / radius + wakeStress + thermalStress;
        blackHoleStress = max(blackHoleStress, localStress / threshold * uBlackHoleFractureIntensity[index]);
        force += -radial * (shear * uAttractorMagnitudes[index] / (radius * radius)) * 0.035;
        force += tangent * uBlackHoleRotationSpeed[index] * uAttractorMagnitudes[index] * 0.12 / radius;
        if (distanceToStar < 2.5) force += normalize(particlePosition - starPosition) * wakeStress * 0.008;
      }
    }

    particleVelocity += force * uDt;
    float speed = length(particleVelocity);
    if (speed > uMaxSpeed) particleVelocity = particleVelocity / speed * uMaxSpeed;
    particleVelocity *= (1.0 - uVelocityDamping);
    gl_FragColor = vec4(particleVelocity, clamp(blackHoleStress, 0.0, 1.0));
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
    gl_FragColor = vec4(color * glow, 0.88);
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
    float snap = step(1.0, stress);
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
  varying vec2 vPosition;
  varying float vSpeed;
  varying float vMass;
  varying float vStress;
  varying float vSnap;
  varying float vBlackHole;

  void main() {
    float splat = 1.0 - smoothstep(0.1, 0.5, length(vPosition));
    vec3 color = mix(uColorA, uColorB, max(vSpeed, max(vStress, vSnap)));
    float glow = mix(0.55 + vMass * 0.45, 0.65 + vStress * 0.8 + vSnap * 0.35, vBlackHole);
    float alpha = mix(0.88, 0.45 + vStress * 0.5, vBlackHole);
    gl_FragColor = vec4(color * glow, splat * alpha);
  }
`;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createConfiguration(variant = 'simple') {
  return {
    attractorMassExponent: 7,
    particleGlobalMassExponent: 4,
    particleCount: PARTICLE_COUNT,
    maxSpeed: 8,
    velocityDamping: 0.1,
    spinningStrength: 2.75,
    scale: 0.008,
    boundHalfExtent: 8,
    colorA: variant === 'blackhole' ? '#4de8ff' : '#33905f',
    colorB: variant === 'blackhole' ? '#e74315' : '#55e699',
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
    replayCameraTrack: 'easing',
    replayCameraEasing: 0.1,
    replayCameraOrbitSpeed: 0.1,
    replayCameraOrbitX: 1,
    replayCameraOrbitY: 0,
    replayCameraOrbitZ: 0,
    cameraOrbitOn: true,
    cameraZoomEnabled: true,
    cameraWheelMode: 'zoom',
    cameraPosX: 3,
    cameraPosY: 5,
    cameraPosZ: 8,
    cameraTargetX: 0,
    cameraTargetY: 0,
    cameraTargetZ: 0,
    cameraZoom: 1,
    cameraFov: 25,
    cameraNear: 0.1,
    cameraFar: 100,
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
    attractors: clone(INITIAL_ATTRACTORS).map((attractor) => ({
      ...attractor,
      type: variant === 'blackhole' ? 'blackhole' : attractor.type
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
  const library = createPresetLibrary(variant);
  try {
    const saved = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '{}');
    Object.assign(library, saved);
  } catch {
    return library;
  }
  return library;
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

function AttractorParticles({ configuration, onGpuError, variant, particleCount }) {
  const { gl } = useThree();
  const useBlackHoleSeed = variant === 'blackhole';
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

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

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
      velocityUniforms.uAttractorMagnitudes = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      velocityUniforms.uAttractorTypes = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uSimpleMassMultipliers = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      velocityUniforms.uSimpleSpinMultipliers = { value: new Float32Array(MAX_ATTRACTORS).fill(1) };
      velocityUniforms.uBlackHoleEventHorizonShear = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleFractureThreshold = { value: new Float32Array(MAX_ATTRACTORS).fill(25) };
      velocityUniforms.uBlackHoleRotationSpeed = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleTestStarEccentricity = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleThermalNoise = { value: new Float32Array(MAX_ATTRACTORS) };
      velocityUniforms.uBlackHoleOrbitRadius = { value: new Float32Array(MAX_ATTRACTORS).fill(BLACK_HOLE_ATTRACTOR_DEFAULTS.orbitRadius) };
      velocityUniforms.uBlackHoleOrbitVerticalAmplitude = { value: new Float32Array(MAX_ATTRACTORS).fill(BLACK_HOLE_ATTRACTOR_DEFAULTS.orbitVerticalAmplitude) };
      velocityUniforms.uBlackHoleFractureIntensity = { value: new Float32Array(MAX_ATTRACTORS).fill(BLACK_HOLE_ATTRACTOR_DEFAULTS.fractureIntensity) };
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
  }, [geometry, gl, onGpuError, material, resolution, useBlackHoleSeed, useMixedShader]);

  useFrame((state, delta) => {
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
    velocityUniforms.uAttractorCount.value = current.attractors.length;
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
      velocityUniforms.uBlackHoleTestStarEccentricity.value[index] = attractor.blackHole.testStarEccentricity;
      velocityUniforms.uBlackHoleThermalNoise.value[index] = attractor.blackHole.thermalNoise;
      velocityUniforms.uBlackHoleOrbitRadius.value[index] = attractor.blackHole.orbitRadius;
      velocityUniforms.uBlackHoleOrbitVerticalAmplitude.value[index] = attractor.blackHole.orbitVerticalAmplitude;
      velocityUniforms.uBlackHoleFractureIntensity.value[index] = attractor.blackHole.fractureIntensity;
    });
    velocityUniforms.uTime.value = state.clock.getElapsedTime();
    compute.compute();
    material.uniforms.uPositionTex.value = compute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uVelocityTex.value = compute.getCurrentRenderTarget(velocityVariable).texture;
    material.uniforms.uScale.value = presentation.scale;
    material.uniforms.uMaxSpeed.value = current.maxSpeed;
    material.uniforms.uCameraFacing.value = presentation.particleFacing === 'camera';
    material.uniforms.uColorA.value.set(presentation.colorA);
    material.uniforms.uColorB.value.set(presentation.colorB);
  });

  return <instancedMesh args={[geometry, material, particleCount]} frustumCulled={false} />;
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

function AttractorCamera({ configuration, onCameraChange, playing, paramsVisible, viewMode, onManualChange }) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef();
  const configurationRef = useRef(configuration);
  const destinationRef = useRef(new Vector3(...ATTRACTOR_CAMERA_VIEWS.find((view) => view.id === 'ortho1').position));
  const targetRef = useRef(new Vector3(...ATTRACTOR_CAMERA_TARGET));
  const frameOffsetRef = useRef(new Vector3());
  const manualInteractionRef = useRef(false);
  const zoomWheelActiveRef = useRef(false);
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
    camera.zoom = configuration.cameraZoomEnabled ? configuration.cameraZoom : 1;
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
    if (!manualInteractionRef.current && viewMode === 'orbital') {
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
  const recordCameraZoom = () => onCameraChangeRef.current({ cameraZoom: camera.zoom });
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
          event.preventDefault();
          event.stopImmediatePropagation();
          camera.zoom = Math.min(10, Math.max(0.1, camera.zoom * Math.pow(0.95, event.deltaY / 100)));
          camera.updateProjectionMatrix();
          controlsRef.current?.update();
          recordCameraZoom();
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
      gl.domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      gl.domElement.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [gl]);
  return <OrbitControls ref={controlsRef} makeDefault enableDamping enableZoom={configuration.cameraZoomEnabled && configuration.cameraWheelMode === 'dolly'} touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} dampingFactor={0.08} minDistance={0.25} maxDistance={50} onStart={handleManualChange} onEnd={handleControlEnd} />;
}

function BlackHoleEffect({ attractor, showStreamlines }) {
  const starRef = useRef();
  const lineGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(96 * 2 * 3), 3));
    return geometry;
  }, []);
  const starPosition = useMemo(() => new Vector3(), []);
  const center = useMemo(() => new Vector3(), []);

  useEffect(() => () => lineGeometry.dispose(), [lineGeometry]);

  useFrame(({ clock }) => {
    const parameters = attractor.blackHole;
    center.fromArray(attractor.position);
    const orbitAngle = clock.getElapsedTime() * parameters.rotationSpeed * 0.5;
    const semiMajorAxis = parameters.orbitRadius;
    const semiMinorAxis = semiMajorAxis * Math.sqrt(Math.max(0, 1 - parameters.testStarEccentricity ** 2));
    const linearEccentricity = Math.sqrt(Math.max(0, semiMajorAxis ** 2 - semiMinorAxis ** 2));
    starPosition.set(
      Math.cos(orbitAngle) * semiMajorAxis - linearEccentricity,
      Math.sin(orbitAngle * 2) * parameters.orbitVerticalAmplitude,
      Math.sin(orbitAngle) * semiMinorAxis
    ).add(center);
    if (starRef.current) starRef.current.position.copy(starPosition);

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
      <mesh ref={starRef}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
        <pointLight intensity={2} distance={10} color="#aaddff" />
      </mesh>
      <lineSegments visible={showStreamlines} geometry={lineGeometry}>
        <lineBasicMaterial color="#ff0055" transparent opacity={0.3} blending={AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

function BlackHoleEffects({ configuration }) {
  return <>{configuration.attractors.map((attractor, index) => attractor.type === 'blackhole' && <BlackHoleEffect key={`${index}:${attractor.name}`} attractor={attractor} showStreamlines={configuration.blackHoleStreamlines} />)}</>;
}

function AttractorViewToolbar({ viewMode, onViewChange }) {
  return (
    <nav className="attractor-view-toolbar" aria-label="Camera views">
      <div className="attractor-view-modes" role="group" aria-label="Select camera perspective">
        {ATTRACTOR_CAMERA_VIEWS.map((view) => (
          <button key={view.id} type="button" className={viewMode === view.id ? 'active' : ''} aria-pressed={viewMode === view.id} onClick={() => onViewChange(view.id)}>
            {view.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function AttractorWorld({ configuration, onAttractorChange, onGpuError, playing, onCameraChange, paramsVisible, viewMode, onManualChange, variant }) {
  const particleCount = E2E_PARTICLE_COUNT ?? configuration.particleCount;
  return (
    <>
      <color attach="background" args={['#050810']} />
      <fog attach="fog" args={['#050810', 14, 55]} />
      <ambientLight color="#9bb4ff" intensity={0.55} />
      <directionalLight color="#fff2d4" intensity={1.5} position={[4, 5, 2]} />
      <pointLight color="#ff885e" intensity={2.2} distance={18} position={[0, 0, 0]} />
      <gridHelper args={[16, 16, '#25304c', '#101827']} />
      {!E2E_MODE && <AttractorParticles key={particleCount} configuration={configuration} onGpuError={onGpuError} variant={variant} particleCount={particleCount} />}
      <BlackHoleEffects configuration={configuration} />
      {configuration.attractors.map((attractor, index) => (
        <AttractorHandle key={`${index}:${attractor.name}`} attractor={attractor} index={index} configuration={configuration} onChange={onAttractorChange} />
      ))}
      <AttractorCamera configuration={configuration} onCameraChange={onCameraChange} playing={playing} paramsVisible={paramsVisible} viewMode={viewMode} onManualChange={onManualChange} />
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

function AttractorPanel({ variant, particleCount, configuration, presets, currentPreset, jsonText, setJsonText, showParamEditLog, onShowParamEditLog, paramEditLogYaml, onChange, onApplyPreset, onSavePreset, onReset, onExport, onLoad, onDeletePresets, journal, playing, playbackTime, onPlaybackTime, onTogglePlayback, onStop, recording, onRecording, onAddAttractor, onRemoveAttractor, onSetOrigin, onResetOrigin, onBack, paramsVisible, editing = false, onEditing = () => {}, canUndo = false, canRedo = false, onUndo = () => {}, onRedo = () => {} }) {
  const hasBlackHoles = configuration.attractors.some((attractor) => attractor.type === 'blackhole');
  return (
    <aside className={`attractor-panel ${paramsVisible ? '' : 'is-hidden'}`} aria-hidden={!paramsVisible} onPointerDown={(event) => event.stopPropagation()}>
      <ParamEditingProvider editing={editing}>
      <div className="attractor-panel-header"><div><span className="attractor-eyebrow">SQGSIM / GPU COMPUTE</span><h2>Attractor particles</h2></div><button type="button" className="attractor-back" onClick={onBack}>Lab menu</button></div>
      <p className="attractor-intro">A bounded field of particles orbiting configurable gravitational and spinning attractors.</p>
      <div className="attractor-status"><span className="status-pip" />{configuration.attractors.length} attractors / {particleCount.toLocaleString()} particles</div><div className="attractor-editor-toolbar"><ParamEditingToggle checked={editing} onChange={onEditing} /><HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} /></div>

      <section className="attractor-section">
        <div className="attractor-section-heading"><span>Preset</span><div className="attractor-actions attractor-preset-actions"><button type="button" onClick={onSavePreset}>Save snapshot</button><button type="button" onClick={onReset}>Reset</button></div></div>
        <ParamSelect className="attractor-preset" ariaLabel="Preset" value={currentPreset} options={Object.keys(presets)} onChange={onApplyPreset} />
      </section>

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

      {hasBlackHoles && <details className="attractor-details" open>
        <summary>Black-hole display</summary>
        <BooleanControl label="Show stress streamlines" value={configuration.blackHoleStreamlines} onChange={(value) => onChange({ blackHoleStreamlines: value }, 'blackHoleStreamlines')} />
      </details>}

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

      <details className="attractor-details">
        <summary>IO / journal</summary>
        <textarea className="attractor-json" value={jsonText} onChange={(event) => setJsonText(event.target.value)} aria-label="Preset JSON" />
        <div className="attractor-actions"><button type="button" onClick={onLoad}>Load JSON</button><button type="button" onClick={() => onExport('current')}>Export current</button></div>
        <div className="attractor-actions"><button type="button" onClick={() => onExport('all')}>Export all</button><button type="button" onClick={() => onExport('saved')}>Export saved</button></div>
        <BooleanControl label="Show param edit log" value={showParamEditLog} onChange={onShowParamEditLog} />
        {showParamEditLog && <YamlTextArea label="Parameter edit log YAML" value={paramEditLogYaml} />}
        <button type="button" className="attractor-danger" onClick={onDeletePresets}>Delete local presets</button>
        <BooleanControl label="Record simulation (slow)" value={recording} onChange={onRecording} />
        <div className="journal-controls"><button type="button" onClick={onTogglePlayback}>{playing ? 'Pause' : 'Play'}</button><button type="button" onClick={onStop}>Stop / reset</button></div>
        <RangeControl label="Playback speed" value={configuration.playbackSpeed} min={0.1} max={10} step={0.1} onChange={(value) => onChange({ playbackSpeed: value }, 'playbackSpeed')} />
        <RangeControl label="Timeline" value={playbackTime} min={0} max={Math.max(1, journal.at(-1)?.time || 1)} step={1} onChange={onPlaybackTime} />
      </details>

      <details className="attractor-details">
        <summary>Camera</summary>
        <SelectControl label="Replay mode" value={configuration.replayCameraTrack} options={['false', 'exact', 'easing', 'orbit']} onChange={(value) => onChange({ replayCameraTrack: value }, 'replayCameraTrack')} />
        <BooleanControl label="Orbit on" value={configuration.cameraOrbitOn} onChange={(value) => onChange({ cameraOrbitOn: value }, 'cameraOrbitOn')} />
        <BooleanControl label="Enable zoom" value={configuration.cameraZoomEnabled} onChange={(value) => onChange({ cameraZoomEnabled: value }, 'cameraZoomEnabled')} />
        <SelectControl label="Scroll mode" value={configuration.cameraWheelMode} options={CAMERA_WHEEL_MODE_OPTIONS} onChange={(value) => onChange({ cameraWheelMode: value }, 'cameraWheelMode')} />
        <RangeControl label="Orbit speed" value={configuration.replayCameraOrbitSpeed} min={0.01} max={2} step={0.01} onChange={(value) => onChange({ replayCameraOrbitSpeed: value }, 'replayCameraOrbitSpeed')} />
        <RangeControl label="Orbit X" value={configuration.replayCameraOrbitX} min={-1} max={1} step={0.01} onChange={(value) => onChange({ replayCameraOrbitX: value }, 'replayCameraOrbitX')} />
        <RangeControl label="Orbit Y" value={configuration.replayCameraOrbitY} min={-1} max={1} step={0.01} onChange={(value) => onChange({ replayCameraOrbitY: value }, 'replayCameraOrbitY')} />
        <RangeControl label="Orbit Z" value={configuration.replayCameraOrbitZ} min={-1} max={1} step={0.01} onChange={(value) => onChange({ replayCameraOrbitZ: value }, 'replayCameraOrbitZ')} />
        {['cameraPosX', 'cameraPosY', 'cameraPosZ', 'cameraTargetX', 'cameraTargetY', 'cameraTargetZ'].map((key) => <RangeControl key={key} label={key.replace('camera', 'Camera ')} value={configuration[key]} min={-50} max={50} step={0.01} onChange={(value) => onChange({ [key]: value }, key)} />)}
        <RangeControl label="Zoom" value={configuration.cameraZoom} min={0.1} max={10} step={0.01} onChange={(value) => onChange({ cameraZoom: value }, 'cameraZoom')} disabled={!configuration.cameraZoomEnabled} />
        <RangeControl label="FOV" value={configuration.cameraFov} min={1} max={179} step={1} onChange={(value) => onChange({ cameraFov: value }, 'cameraFov')} />
        <RangeControl label="Near" value={configuration.cameraNear} min={0.001} max={10} step={0.001} onChange={(value) => onChange({ cameraNear: value }, 'cameraNear')} />
        <RangeControl label="Far" value={configuration.cameraFar} min={10} max={10000} step={1} onChange={(value) => onChange({ cameraFar: value }, 'cameraFar')} />
      </details>
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

function AttractorModal({ title, value, onClose }) {
  return <div className="attractor-modal-backdrop" onClick={onClose}><section className="attractor-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Close export">Close</button></header><textarea readOnly value={JSON.stringify(value, null, 2)} /></section></div>;
}

function SimpleAttractorSim({ variant = 'simple', onBack }) {
  const editor = useSimulationEditor(createConfiguration(variant));
  const { value: configuration, commit, load, record, log, replace, canUndo, canRedo, undo, redo } = editor;
  const particleCount = E2E_PARTICLE_COUNT ?? configuration.particleCount;
  const configurationRef = useRef(configuration);
  const [editing, setEditing] = useState(false);
  const [showParamEditLog, setShowParamEditLog] = useState(false);
  useUndoRedoShortcuts({ undo, redo, canUndo, canRedo, isTextEditing: (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) });
  configurationRef.current = configuration;
  const [presets, setPresets] = useState(() => readSavedPresets(variant));
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(createConfiguration(variant), null, 2));
  const [gpuError, setGpuError] = useState('');
  const [modal, setModal] = useState(null);
  const [paramsVisible, setParamsVisible] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [recording, setRecording] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const initialSnapshot = useMemo(() => clone(configuration), []);
  const [journal, setJournal] = useState(() => [{ time: 0, snapshot: initialSnapshot }]);
  const journalRef = useRef(journal);
  const journalStartRef = useRef(Date.now());
  const replayingRef = useRef(false);
  const presetApplyingRef = useRef(false);
  const paramEditLogYaml = useMemo(() => stringifyYaml(log), [log]);

  const recordChange = (next, path, value) => {
    if (!recording || replayingRef.current || !path) return;
    const entry = { time: Date.now() - journalStartRef.current, path, value, snapshot: clone(next) };
    const nextJournal = [...journalRef.current, entry];
    journalRef.current = nextJournal;
    setJournal(nextJournal);
    setPlaybackTime(entry.time);
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
    onChange({ attractors: [...current.attractors, createAttractor({ position: position.toArray(), name: `Attractor ${index}` }, variant === 'blackhole' ? 'blackhole' : 'simple')] }, 'sys:addAttractor');
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
    const name = new Date().toISOString();
    record({ type: "preset-save", name });
    const nextPresets = { ...presets, [name]: clone(configurationRef.current) };
    setPresets(nextPresets);
    setCurrentPreset(name);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(nextPresets));
    } catch {
      return;
    }
  };

  const onReset = () => {
    const next = createConfiguration(variant);
    configurationRef.current = next;
    load(next, next, { type: "preset-load", name: "Default" });
    setJsonText(JSON.stringify(next, null, 2));
    setCurrentPreset('Default');
    setPlaying(false);
    setPlaybackTime(0);
    journalStartRef.current = Date.now();
    const nextJournal = [{ time: 0, snapshot: clone(next) }];
    journalRef.current = nextJournal;
    setJournal(nextJournal);
  };

  const onLoad = () => {
    try {
      applyConfiguration(JSON.parse(jsonText), 'io:load');
      setCurrentPreset('JSON draft');
    } catch {
      setModal({ title: 'Invalid JSON', value: { error: 'The preset JSON could not be parsed.' } });
    }
  };

  const onDeletePresets = () => {
    localStorage.removeItem(PRESET_STORAGE_KEY);
    setPresets(createPresetLibrary(variant));
    setCurrentPreset('Default');
  };

  const applyStateAt = (time) => {
    const snapshot = [...journalRef.current].reverse().find((entry) => entry.time <= time)?.snapshot;
    if (!snapshot) return;
    replayingRef.current = true;
    const next = sanitizeConfiguration(snapshot, variant);
    configurationRef.current = next;
    replace(next);
    setJsonText(JSON.stringify(next, null, 2));
    replayingRef.current = false;
  };

  useEffect(() => {
    if (!playing) return undefined;
    let frameId;
    const tick = () => {
      const duration = journalRef.current.at(-1)?.time || 0;
      const nextTime = Math.min(duration, playbackTime + 16 * configurationRef.current.playbackSpeed);
      setPlaybackTime(nextTime);
      applyStateAt(nextTime);
      if (nextTime >= duration) setPlaying(false);
      else frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, playbackTime]);

  useEffect(() => {
    const undo = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'z' || journalRef.current.length < 2) return;
      event.preventDefault();
      const nextJournal = journalRef.current.slice(0, -1);
      journalRef.current = nextJournal;
      setJournal(nextJournal);
      const time = nextJournal.at(-1).time;
      setPlaybackTime(time);
      applyStateAt(time);
    };
    window.addEventListener('keydown', undo);
    return () => window.removeEventListener('keydown', undo);
  }, []);

  const reportTitle = variant === 'blackhole' ? 'Black hole particles' : 'Attractor particles';
  return (
    <main className={`attractor-app ${variant === 'blackhole' ? 'blackhole-app' : ''}`}>
      <div className="attractor-scene"><Canvas frameloop={E2E_MODE ? 'demand' : 'always'} camera={{ position: [3, 5, 8], fov: 25, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><AttractorWorld configuration={configuration} onAttractorChange={onAttractorChange} onGpuError={setGpuError} playing={playing} onCameraChange={(change) => onChange(change, 'sys:camera')} paramsVisible={paramsVisible} viewMode={viewMode} onManualChange={() => setViewMode(null)} variant={variant} /></Canvas></div>
      <header className="attractor-topbar"><div><span className="sqg-mark">PAS</span><span><em>{variant === 'blackhole' ? 'Black hole attractor sandbox' : 'Particle dynamics lab'}</em></span></div><div className="attractor-top-actions"><span className="attractor-top-meta">WEBGL / GPGPU / {reportTitle.toUpperCase()}</span><button type="button" className="attractor-params-toggle" aria-pressed={paramsVisible} onClick={() => setParamsVisible((value) => !value)}>{paramsVisible ? 'Hide params' : 'Show params'}</button></div></header>
      <AttractorViewToolbar viewMode={viewMode} onViewChange={setViewMode} />
      <AttractorPanel variant={variant} particleCount={particleCount} configuration={configuration} presets={presets} currentPreset={currentPreset} jsonText={jsonText} setJsonText={setJsonText} showParamEditLog={showParamEditLog} onShowParamEditLog={setShowParamEditLog} paramEditLogYaml={paramEditLogYaml} onChange={onChange} onApplyPreset={onApplyPreset} onSavePreset={onSavePreset} onReset={onReset} onExport={(type) => setModal({ title: type === 'all' ? 'All presets' : type === 'saved' ? 'Saved presets' : 'Current parameters', value: type === 'current' ? configuration : presets })} onLoad={onLoad} onDeletePresets={onDeletePresets} journal={journal} playing={playing} playbackTime={playbackTime} onPlaybackTime={(value) => { setPlaybackTime(value); applyStateAt(value); }} onTogglePlayback={() => setPlaying((value) => !value)} onStop={() => { setPlaying(false); setPlaybackTime(0); applyStateAt(0); }} recording={recording} onRecording={setRecording} onAddAttractor={onAddAttractor} onRemoveAttractor={onRemoveAttractor} onSetOrigin={onSetOrigin} onResetOrigin={onResetOrigin} onBack={onBack} paramsVisible={paramsVisible} editing={editing} onEditing={setEditing} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      <div className="attractor-title"><span>ACTIVE FIELD / {variant === 'blackhole' ? 'SQGBLACKHOLESIM' : 'SIMPLEATTRACTORSIM'}</span><h1>{variant === 'blackhole' ? 'Superfluid Quantum Gravity Attractor System' : 'Simple Particle Attractor System'}</h1><p>{variant === 'blackhole' ? 'SQG GPE Gross-Pitaevskii Equation Gaussian splat black holes and optionally also simple attractors' : 'Tune attractor mass, spin, and geometry within a field of particles.'}</p>{gpuError && <strong className="attractor-error">GPU offline: {gpuError}</strong>}</div>
      {modal && <AttractorModal title={modal.title} value={modal.value} onClose={() => setModal(null)} />}
    </main>
  );
}

export { SimpleAttractorSim };