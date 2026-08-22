import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import {
  AIRFLOW_PARAMS,
  FLUID_BOUNDS,
  FLOOD_GALLERY,
  PARTICLE_SEED_BOUNDS,
  SHAFT_POSITIONS,
  SHAFT_ROUTE,
  STAIR_ROUTE,
  STREET_VOLUME,
  glslFloat,
  roofGapEndpoints,
  stairSurfaceY,
  thermalResilienceReport
} from './routeModel.js';

const SIM_RESOLUTION = 64;
const PARTICLE_COUNT = SIM_RESOLUTION * SIM_RESOLUTION;
const INITIALS = {
  surfaceTemperature: 81.5,
  density: 1.18,
  stiffness: 5,
  viscosity: 0.012,
  train: true,
  ac: true,
  brakes: true,
  shaftExchange: 0.65,
  downFans: 0.45,
  floorAirMovers: 0.5,
  ceilingFans: 0.5,
  grooves: 0.7,
  floodTunnels: true,
  floodFlow: 0.55,
  floodPumpDirection: 1,
  roofPitch: 14,
  roofOffset: 0,
  roofGap: 0.8,
  clerestoryOpen: 0.55,
  clerestorySize: 0.65,
  stackEffect: 0.65
};

const positionShader = `
  uniform float uDt;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uRoofGap;
  uniform float uClerestoryOpen;
  uniform float uClerestorySize;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;

    if (positionData.x < ${glslFloat(FLUID_BOUNDS.minX)}) positionData.x += ${glslFloat(FLUID_BOUNDS.maxX - FLUID_BOUNDS.minX)};
    if (positionData.x > ${glslFloat(FLUID_BOUNDS.maxX)}) positionData.x -= ${glslFloat(FLUID_BOUNDS.maxX - FLUID_BOUNDS.minX)};
    positionData.y = clamp(positionData.y, ${glslFloat(FLUID_BOUNDS.minY)}, ${glslFloat(FLUID_BOUNDS.maxY)});
    positionData.z = clamp(positionData.z, ${glslFloat(FLUID_BOUNDS.minZ)}, ${glslFloat(FLUID_BOUNDS.maxZ)});

    float stairX = positionData.x;
    float stairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.startX)}) / ${glslFloat(STAIR_ROUTE.endX - STAIR_ROUTE.startX)}, 0.0, 1.0);
    float stairSurfaceY = ${glslFloat(STAIR_ROUTE.baseY)} + stairProgress * ${glslFloat(STAIR_ROUTE.riseY)};
    float stairZone = step(${glslFloat(STAIR_ROUTE.startX)}, stairX) * step(stairX, ${glslFloat(STAIR_ROUTE.endX)});
    float stairDistance = abs(positionData.z - ${glslFloat(STAIR_ROUTE.z)});
    float stairContact = stairZone * (1.0 - smoothstep(0.0, 1.7, stairDistance));
    float thermalContact = smoothstep(0.05, 0.4, velocityData.w) * stairContact;
    if (thermalContact > 0.0 && positionData.y < stairSurfaceY + 0.12) {
      positionData.y = mix(positionData.y, stairSurfaceY + 0.12, thermalContact);
    }

    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = positionData.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((positionData.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : mix(roofRidgeY, 4.0, clamp((positionData.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float clerestoryHalfGap = max(${glslFloat(AIRFLOW_PARAMS.clerestoryMinGap)}, uRoofGap * 0.5);
    float clerestoryOpening = uClerestoryOpen * uClerestorySize
      * (1.0 - smoothstep(clerestoryHalfGap, clerestoryHalfGap + 0.35, abs(positionData.z - uRoofOffset)));
    float shaftNorth = 1.0 - smoothstep(0.0, 0.72, abs(positionData.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 0.72, abs(positionData.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 0.72, abs(positionData.x - 7.0));
    float shaftOpening = max(shaftNorth, max(shaftCenter, shaftSouth))
      * (1.0 - smoothstep(0.0, 0.9, abs(positionData.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(${glslFloat(SHAFT_ROUTE.throatY - 0.8)}, ${glslFloat(SHAFT_ROUTE.throatY)}, positionData.y);
    float stairTunnelCeiling = stairSurfaceY + ${glslFloat(STAIR_ROUTE.tunnelHeight)};
    float stairPassage = stairZone
      * (1.0 - smoothstep(0.0, ${glslFloat(STAIR_ROUTE.width / 2)}, stairDistance))
      * step(positionData.y, stairTunnelCeiling);
    float stairExit = step(${glslFloat(STAIR_ROUTE.endX - 1.4)}, stairX)
      * (1.0 - smoothstep(0.0, ${glslFloat(STAIR_ROUTE.width / 2)}, stairDistance))
      * step(stairSurfaceY, positionData.y);
    if (stairPassage > 0.5) positionData.y = min(positionData.y, max(roofCeiling, stairTunnelCeiling));
    if (shaftOpening < 0.5 && stairExit < 0.5 && clerestoryOpening < 0.5) positionData.y = min(positionData.y, roofCeiling);

    gl_FragColor = positionData;
  }
`;

const velocityShader = `
  uniform float uDt;
  uniform float uSurfaceTemperature;
  uniform float uRadius;
  uniform float uRestDensity;
  uniform float uStiffness;
  uniform float uViscosity;
  uniform float uTrainPosX;
  uniform float uTrainVelX;
  uniform float uShaftExchange;
  uniform float uDownFans;
  uniform float uFloorAirMovers;
  uniform float uCeilingFans;
  uniform float uGrooves;
  uniform float uFloodFlow;
  uniform float uFloodPumpDirection;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uRoofGap;
  uniform float uClerestoryOpen;
  uniform float uClerestorySize;
  uniform float uStackEffect;
  uniform bool uTrainActive;
  uniform bool uAcActive;
  uniform bool uBrakesActive;
  uniform bool uFloodTunnels;

  #define PI 3.141592653589793

  float cubicSplineKernel(float q) {
    float sigma = 8.0 / (PI * pow(uRadius, 3.0));
    if (q >= 0.0 && q <= 0.5) return sigma * (6.0 * (pow(q, 3.0) - pow(q, 2.0)) + 1.0);
    if (q > 0.5 && q <= 1.0) return sigma * (2.0 * pow(1.0 - q, 3.0));
    return 0.0;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 particlePosition = positionData.xyz;
    vec3 particleVelocity = velocityData.xyz;
    float thermalIntensity = velocityData.w;
    float density = 0.0;
    vec3 pressureForce = vec3(0.0);
    vec3 viscosityForce = vec3(0.0);

    for (float y = 0.0; y < resolution.y; y += 2.0) {
      for (float x = 0.0; x < resolution.x; x += 2.0) {
        vec2 neighborUv = vec2(x + 0.5, y + 0.5) / resolution.xy;
        vec3 neighborPosition = texture2D(uPositionTex, neighborUv).xyz;
        vec3 neighborVelocity = texture2D(uVelocityTex, neighborUv).xyz;
        vec3 offset = particlePosition - neighborPosition;
        float distanceToNeighbor = length(offset);

        if (distanceToNeighbor > 0.0001 && distanceToNeighbor < uRadius) {
          float kernelPosition = distanceToNeighbor / uRadius;
          float kernelWeight = cubicSplineKernel(kernelPosition);
          density += kernelWeight;
          float pressure = max(0.0, uStiffness * (density - uRestDensity));
          pressureForce -= normalize(offset) * pressure * (1.0 - kernelPosition);
          viscosityForce += uViscosity * (neighborVelocity - particleVelocity) * kernelWeight;
        }
      }
    }

    vec3 acceleration = pressureForce + viscosityForce + vec3(0.6, 0.0, 0.0);
    float surfaceHeat = clamp((uSurfaceTemperature - 60.0) / 50.0, 0.0, 1.0);
    float surfaceBand = 1.0 - smoothstep(0.0, 2.1, abs(particlePosition.y + 2.4));
    float surfaceThermalDelta = surfaceHeat - 0.42;
    acceleration.y += surfaceThermalDelta * surfaceBand * 0.55;
    thermalIntensity = clamp(thermalIntensity + uDt * surfaceThermalDelta * surfaceBand * 0.25, 0.0, 1.0);

    float stairX = particlePosition.x;
    float stairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.startX)}) / ${glslFloat(STAIR_ROUTE.endX - STAIR_ROUTE.startX)}, 0.0, 1.0);
    float stairSurfaceY = ${glslFloat(STAIR_ROUTE.baseY)} + stairProgress * ${glslFloat(STAIR_ROUTE.riseY)};
    float stairZone = step(${glslFloat(STAIR_ROUTE.startX)}, stairX) * step(stairX, ${glslFloat(STAIR_ROUTE.endX)});
    float stairProximity = stairZone
      * (1.0 - smoothstep(0.0, 1.7, abs(particlePosition.z - ${glslFloat(STAIR_ROUTE.z)})))
      * (1.0 - smoothstep(0.0, 1.8, abs(particlePosition.y - stairSurfaceY)));
    float stairApproach = smoothstep(3.5, 5.0, stairX) * (1.0 - smoothstep(8.5, 10.0, stairX));
    vec3 stairDirection = normalize(vec3(1.0, 0.625, 0.0));
    acceleration += stairDirection * stairProximity * (0.45 + thermalIntensity * 2.4);
    acceleration.z += (${glslFloat(STAIR_ROUTE.z)} - particlePosition.z) * stairApproach * thermalIntensity * 0.35;
    float stairExit = smoothstep(${glslFloat(STAIR_ROUTE.endX - 2.4)}, ${glslFloat(STAIR_ROUTE.endX)}, stairX)
      * (1.0 - smoothstep(0.0, ${glslFloat(STAIR_ROUTE.width / 2)}, abs(particlePosition.z - ${glslFloat(STAIR_ROUTE.z)})))
      * smoothstep(stairSurfaceY - 0.2, stairSurfaceY + 1.0, particlePosition.y);
    acceleration.y += stairExit * (1.4 + uStackEffect * 2.8) * (0.3 + thermalIntensity * 2.2);
    acceleration.x += stairExit * (1.0 - stairX) * thermalIntensity * 0.12;
    acceleration.y += thermalIntensity * 0.22;

    float shaftNorth = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x - 7.0));
    float shaftInfluence = max(shaftNorth, max(shaftCenter, shaftSouth));
    float ceilingBand = smoothstep(1.8, 4.0, particlePosition.y);
    float shaftHorizontalCapture = shaftInfluence
      * (1.0 - smoothstep(0.0, 1.3, abs(particlePosition.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(0.4, 2.5, particlePosition.y);
    float shaftVerticalColumn = shaftInfluence
      * (1.0 - smoothstep(0.0, 0.9, abs(particlePosition.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(2.0, ${glslFloat(SHAFT_ROUTE.throatY)}, particlePosition.y);
    float shaftTargetX = shaftSouth > shaftCenter && shaftSouth > shaftNorth ? 7.0 : (shaftNorth > shaftCenter ? -7.0 : 0.0);
    float floodBand = 1.0 - smoothstep(0.0, 2.4, abs(particlePosition.z + 4.15));
    float fanBand = max(
      (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanRadius * 0.6)}, ${glslFloat(AIRFLOW_PARAMS.fanRadius)}, abs(particlePosition.x + 6.0))),
      max(
        (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanRadius * 0.6)}, ${glslFloat(AIRFLOW_PARAMS.fanRadius)}, abs(particlePosition.x))),
        (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanRadius * 0.6)}, ${glslFloat(AIRFLOW_PARAMS.fanRadius)}, abs(particlePosition.x - 6.0)))
      )
    )
      * (1.0 - smoothstep(1.4, 2.3, abs(particlePosition.z - ${glslFloat(AIRFLOW_PARAMS.fanZ)})))
      * smoothstep(${glslFloat(AIRFLOW_PARAMS.fanMinY)}, ${glslFloat(AIRFLOW_PARAMS.fanMinY + 0.4)}, particlePosition.y)
      * (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanMaxY - 0.4)}, ${glslFloat(AIRFLOW_PARAMS.fanMaxY)}, particlePosition.y));
    float floodCaptureBand = 1.0 - smoothstep(0.0, 1.6, abs(particlePosition.y + 3.1));
    float floodGalleryBand = (1.0 - smoothstep(0.0, ${glslFloat(FLOOD_GALLERY.radius)}, abs(particlePosition.z - ${glslFloat(FLOOD_GALLERY.z)})))
      * (1.0 - smoothstep(${glslFloat(FLOOD_GALLERY.minY)}, ${glslFloat(FLOOD_GALLERY.maxY)}, particlePosition.y));
    float floorMoverInfluence = max(
      (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanRadius * 0.6)}, ${glslFloat(AIRFLOW_PARAMS.fanRadius)}, abs(particlePosition.x + 6.0))),
      max(
        (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanRadius * 0.6)}, ${glslFloat(AIRFLOW_PARAMS.fanRadius)}, abs(particlePosition.x))),
        (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.fanRadius * 0.6)}, ${glslFloat(AIRFLOW_PARAMS.fanRadius)}, abs(particlePosition.x - 6.0)))
      )
    )
      * (1.0 - smoothstep(1.0, 1.8, abs(particlePosition.z - ${glslFloat(AIRFLOW_PARAMS.floorMoverZ)})))
      * smoothstep(${glslFloat(AIRFLOW_PARAMS.floorMoverMinY)}, ${glslFloat(AIRFLOW_PARAMS.floorMoverMinY + 0.4)}, particlePosition.y)
      * (1.0 - smoothstep(${glslFloat(AIRFLOW_PARAMS.floorMoverMaxY - 0.4)}, ${glslFloat(AIRFLOW_PARAMS.floorMoverMaxY)}, particlePosition.y));

    if (particlePosition.y > 0.4) {
      acceleration.x += (shaftTargetX - particlePosition.x)
        * shaftHorizontalCapture * uShaftExchange * 0.9;
      acceleration.y += shaftVerticalColumn * (uShaftExchange * 2.4 + uStackEffect * 3.4) * (0.35 + thermalIntensity * 1.8);
      acceleration.y -= fanBand * uDownFans * 1.8;
      acceleration.x += ceilingBand * uCeilingFans * 1.4;
      acceleration.x += ceilingBand * uGrooves * 0.5;
      thermalIntensity = max(0.0, thermalIntensity - uDt * shaftVerticalColumn * (uShaftExchange * 0.2 + uStackEffect * 0.35));
      thermalIntensity = max(0.0, thermalIntensity - uDt * ceilingBand * (uDownFans + uCeilingFans) * 0.08);
    }
    acceleration.x += floorMoverInfluence * uFloorAirMovers * 2.0;
    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = particlePosition.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((particlePosition.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : mix(roofRidgeY, 4.0, clamp((particlePosition.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    if (particlePosition.y > roofCeiling - 0.18) {
      acceleration.y -= (particlePosition.y - roofCeiling + 0.18) * 1.8;
      acceleration.x += sign(particlePosition.z) * uGrooves * 0.22;
    }
    float clerestoryWidth = max(${glslFloat(AIRFLOW_PARAMS.clerestoryMinGap)}, mix(0.15, uRoofGap * 0.5, uClerestorySize));
    float clerestoryHeight = mix(0.15, 1.8, uClerestorySize);
    float clerestoryBand = (1.0 - smoothstep(0.0, clerestoryWidth, abs(particlePosition.z - uRoofOffset)))
      * smoothstep(roofCeiling - clerestoryHeight, roofCeiling + 0.9, particlePosition.y);
    if (uClerestoryOpen > 0.0 && clerestoryBand > 0.0) {
      acceleration.y += clerestoryBand * uClerestoryOpen * (0.8 + uStackEffect * 2.2) * (0.35 + thermalIntensity * 1.7);
      thermalIntensity = max(0.0, thermalIntensity - uDt * clerestoryBand * uClerestoryOpen * 0.25);
    }
    if (uFloodTunnels) {
      acceleration.y -= uFloodFlow * floodBand * floodCaptureBand * 0.8;
      acceleration.z += (${glslFloat(FLOOD_GALLERY.z)} - particlePosition.z) * uFloodFlow * floodCaptureBand * 0.45;
      acceleration.x += uFloodPumpDirection * uFloodFlow * floodGalleryBand * 2.4;
      thermalIntensity = max(0.0, thermalIntensity - uDt * uFloodFlow * (floodBand * floodCaptureBand * 0.22 + floodGalleryBand * 0.35));
    }

    if (uAcActive && abs(particlePosition.x - uTrainPosX) < 5.0 && particlePosition.y > 1.0 && particlePosition.z > 0.5) {
      thermalIntensity = min(1.0, thermalIntensity + uDt * 0.45);
      acceleration += vec3(0.0, 4.5, 0.0);
    }
    if (uBrakesActive && abs(particlePosition.x - uTrainPosX) < 8.0 && particlePosition.y < -2.0 && abs(particlePosition.z - 2.5) < 1.0) {
      thermalIntensity = min(1.0, thermalIntensity + uDt * 0.6);
      acceleration += vec3((fract(sin(particlePosition.x * 12.0) * 43758.5) - 0.5) * 3.0, 2.0, 0.0);
    }
    if (uTrainActive && abs(uTrainVelX) > 0.5) {
      acceleration += vec3(uTrainVelX * 0.4, 0.0, 0.0);
      thermalIntensity *= (1.0 - uDt * 0.2);
    }

    thermalIntensity = max(0.0, thermalIntensity - uDt * 0.015);
    particleVelocity += acceleration * uDt;
    particleVelocity *= 0.985;
    gl_FragColor = vec4(particleVelocity, thermalIntensity);
  }
`;

const particleVertexShader = `
  uniform sampler2D uPositionTex;
  uniform sampler2D uVelocityTex;
  attribute vec2 aSimulationUv;
  varying float vThermal;

  void main() {
    vec4 positionData = texture2D(uPositionTex, aSimulationUv);
    vec4 velocityData = texture2D(uVelocityTex, aSimulationUv);
    vThermal = velocityData.w;
    vec3 worldPosition = positionData.xyz + position * (0.8 + vThermal * 0.4);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
  }
`;

const particleFragmentShader = `
  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;
  uniform vec3 uHotColor;
  varying float vThermal;

  void main() {
    vec3 color = vThermal < 0.5
      ? mix(uCoolColor, uWarmColor, vThermal * 2.0)
      : mix(uWarmColor, uHotColor, (vThermal - 0.5) * 2.0);
    gl_FragColor = vec4(color, 0.76);
  }
`;

function createSimulationUvs() {
  const uvs = new Float32Array(PARTICLE_COUNT * 2);
  for (let row = 0, particleIndex = 0; row < SIM_RESOLUTION; row += 1) {
    for (let column = 0; column < SIM_RESOLUTION; column += 1, particleIndex += 1) {
      uvs[particleIndex * 2] = (column + 0.5) / SIM_RESOLUTION;
      uvs[particleIndex * 2 + 1] = (row + 0.5) / SIM_RESOLUTION;
    }
  }
  return uvs;
}

function ParticleField({ settings, trainRef, onTelemetry, onGpuError }) {
  const { gl } = useThree();
  const computeRef = useRef(null);
  const positionVariableRef = useRef(null);
  const velocityVariableRef = useRef(null);
  const settingsRef = useRef(settings);
  const telemetryRef = useRef(onTelemetry);
  const trainPreviousX = useRef(0);
  const telemetryTimer = useRef(0);
  const meanTemperature = useRef(81.5);
  settingsRef.current = settings;
  telemetryRef.current = onTelemetry;

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.35, 10, 8);
    geometry.setAttribute('aSimulationUv', new THREE.InstancedBufferAttribute(createSimulationUvs(), 2));
    return geometry;
  }, []);
  const particleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uVelocityTex: { value: null },
      uCoolColor: { value: new THREE.Color('#3a9bb4') },
      uWarmColor: { value: new THREE.Color('#f0a23a') },
      uHotColor: { value: new THREE.Color('#f45b4f') }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), []);

  useEffect(() => {
    let gpuCompute;
    try {
      gpuCompute = new GPUComputationRenderer(SIM_RESOLUTION, SIM_RESOLUTION, gl);
      if (!gl.capabilities.isWebGL2) gpuCompute.setDataType(THREE.HalfFloatType);
      const positionTexture = gpuCompute.createTexture();
      const velocityTexture = gpuCompute.createTexture();

      for (let offset = 0; offset < positionTexture.image.data.length; offset += 4) {
        positionTexture.image.data[offset] = THREE.MathUtils.lerp(FLUID_BOUNDS.minX, FLUID_BOUNDS.maxX, Math.random());
        positionTexture.image.data[offset + 1] = THREE.MathUtils.lerp(PARTICLE_SEED_BOUNDS.minY, PARTICLE_SEED_BOUNDS.maxY, Math.random());
        positionTexture.image.data[offset + 2] = THREE.MathUtils.lerp(FLUID_BOUNDS.minZ, FLUID_BOUNDS.maxZ, Math.random());
        positionTexture.image.data[offset + 3] = 1;
        velocityTexture.image.data[offset] = 0;
        velocityTexture.image.data[offset + 1] = 0;
        velocityTexture.image.data[offset + 2] = 0;
        velocityTexture.image.data[offset + 3] = 0;
      }

      const positionVariable = gpuCompute.addVariable('uPositionTex', positionShader, positionTexture);
      const velocityVariable = gpuCompute.addVariable('uVelocityTex', velocityShader, velocityTexture);
      gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
      gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
      positionVariable.material.uniforms.uDt = { value: 0.016 };
      positionVariable.material.uniforms.uRoofPitch = { value: THREE.MathUtils.degToRad(INITIALS.roofPitch) };
      positionVariable.material.uniforms.uRoofOffset = { value: INITIALS.roofOffset };
      positionVariable.material.uniforms.uRoofGap = { value: INITIALS.roofGap };
      positionVariable.material.uniforms.uClerestoryOpen = { value: INITIALS.clerestoryOpen };
      positionVariable.material.uniforms.uClerestorySize = { value: INITIALS.clerestorySize };
      velocityVariable.material.uniforms.uDt = { value: 0.016 };
      velocityVariable.material.uniforms.uSurfaceTemperature = { value: INITIALS.surfaceTemperature };
      velocityVariable.material.uniforms.uRadius = { value: 0.85 };
      velocityVariable.material.uniforms.uRestDensity = { value: INITIALS.density };
      velocityVariable.material.uniforms.uStiffness = { value: INITIALS.stiffness };
      velocityVariable.material.uniforms.uViscosity = { value: INITIALS.viscosity };
      velocityVariable.material.uniforms.uTrainPosX = { value: 0 };
      velocityVariable.material.uniforms.uTrainVelX = { value: 0 };
      velocityVariable.material.uniforms.uShaftExchange = { value: INITIALS.shaftExchange };
      velocityVariable.material.uniforms.uDownFans = { value: INITIALS.downFans };
      velocityVariable.material.uniforms.uFloorAirMovers = { value: INITIALS.floorAirMovers };
      velocityVariable.material.uniforms.uCeilingFans = { value: INITIALS.ceilingFans };
      velocityVariable.material.uniforms.uGrooves = { value: INITIALS.grooves };
      velocityVariable.material.uniforms.uFloodFlow = { value: INITIALS.floodFlow };
      velocityVariable.material.uniforms.uFloodPumpDirection = { value: INITIALS.floodPumpDirection };
      velocityVariable.material.uniforms.uRoofPitch = { value: THREE.MathUtils.degToRad(INITIALS.roofPitch) };
      velocityVariable.material.uniforms.uRoofOffset = { value: INITIALS.roofOffset };
      velocityVariable.material.uniforms.uRoofGap = { value: INITIALS.roofGap };
      velocityVariable.material.uniforms.uClerestoryOpen = { value: INITIALS.clerestoryOpen };
      velocityVariable.material.uniforms.uClerestorySize = { value: INITIALS.clerestorySize };
      velocityVariable.material.uniforms.uStackEffect = { value: INITIALS.stackEffect };
      velocityVariable.material.uniforms.uTrainActive = { value: true };
      velocityVariable.material.uniforms.uAcActive = { value: true };
      velocityVariable.material.uniforms.uBrakesActive = { value: true };
      velocityVariable.material.uniforms.uFloodTunnels = { value: true };

      const initializationError = gpuCompute.init();
      if (initializationError) throw new Error(initializationError);
      computeRef.current = gpuCompute;
      positionVariableRef.current = positionVariable;
      velocityVariableRef.current = velocityVariable;
    } catch (error) {
      onGpuError(error instanceof Error ? error.message : 'GPU simulation could not initialize.');
    }

    return () => {
      computeRef.current = null;
      positionVariableRef.current = null;
      velocityVariableRef.current = null;
      gpuCompute?.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
    };
  }, [gl, onGpuError, particleGeometry, particleMaterial]);

  useFrame((_, delta) => {
    const compute = computeRef.current;
    const positionVariable = positionVariableRef.current;
    const velocityVariable = velocityVariableRef.current;
    if (!compute || !positionVariable || !velocityVariable) return;

    const frameDelta = Math.min(delta, 0.033);
    const currentSettings = settingsRef.current;
    const currentTrainX = trainRef.current?.position.x ?? 0;
    const targetTrainX = currentSettings.train ? 0 : 35;
    const previousTrainX = currentTrainX;
    const nextTrainX = currentTrainX + (targetTrainX - currentTrainX) * frameDelta * 2;
    if (trainRef.current) trainRef.current.position.x = nextTrainX;
    const trainVelocity = (nextTrainX - previousTrainX) / Math.max(frameDelta, 0.0001);

    positionVariable.material.uniforms.uDt.value = frameDelta;
    positionVariable.material.uniforms.uRoofPitch.value = THREE.MathUtils.degToRad(currentSettings.roofPitch);
    positionVariable.material.uniforms.uRoofOffset.value = currentSettings.roofOffset;
    positionVariable.material.uniforms.uRoofGap.value = currentSettings.roofGap;
    positionVariable.material.uniforms.uClerestoryOpen.value = currentSettings.clerestoryOpen;
    positionVariable.material.uniforms.uClerestorySize.value = currentSettings.clerestorySize;
    velocityVariable.material.uniforms.uDt.value = frameDelta;
    velocityVariable.material.uniforms.uSurfaceTemperature.value = currentSettings.surfaceTemperature;
    velocityVariable.material.uniforms.uRestDensity.value = currentSettings.density;
    velocityVariable.material.uniforms.uStiffness.value = currentSettings.stiffness;
    velocityVariable.material.uniforms.uViscosity.value = currentSettings.viscosity;
    velocityVariable.material.uniforms.uTrainPosX.value = nextTrainX;
    velocityVariable.material.uniforms.uTrainVelX.value = trainVelocity;
    velocityVariable.material.uniforms.uShaftExchange.value = currentSettings.shaftExchange;
    velocityVariable.material.uniforms.uDownFans.value = currentSettings.downFans;
    velocityVariable.material.uniforms.uFloorAirMovers.value = currentSettings.floorAirMovers;
    velocityVariable.material.uniforms.uCeilingFans.value = currentSettings.ceilingFans;
    velocityVariable.material.uniforms.uGrooves.value = currentSettings.grooves;
    velocityVariable.material.uniforms.uFloodFlow.value = currentSettings.floodFlow;
    velocityVariable.material.uniforms.uFloodPumpDirection.value = currentSettings.floodPumpDirection;
    velocityVariable.material.uniforms.uRoofPitch.value = THREE.MathUtils.degToRad(currentSettings.roofPitch);
    velocityVariable.material.uniforms.uRoofOffset.value = currentSettings.roofOffset;
    velocityVariable.material.uniforms.uRoofGap.value = currentSettings.roofGap;
    velocityVariable.material.uniforms.uClerestoryOpen.value = currentSettings.clerestoryOpen;
    velocityVariable.material.uniforms.uClerestorySize.value = currentSettings.clerestorySize;
    velocityVariable.material.uniforms.uStackEffect.value = currentSettings.stackEffect;
    velocityVariable.material.uniforms.uTrainActive.value = currentSettings.train;
    velocityVariable.material.uniforms.uAcActive.value = currentSettings.ac;
    velocityVariable.material.uniforms.uBrakesActive.value = currentSettings.brakes;
    velocityVariable.material.uniforms.uFloodTunnels.value = currentSettings.floodTunnels;
    compute.compute();
    particleMaterial.uniforms.uPositionTex.value = compute.getCurrentRenderTarget(positionVariable).texture;
    particleMaterial.uniforms.uVelocityTex.value = compute.getCurrentRenderTarget(velocityVariable).texture;

    telemetryTimer.current += frameDelta;
    if (telemetryTimer.current > 0.12) {
      let targetTemperature = currentSettings.surfaceTemperature;
      if (currentSettings.ac) targetTemperature += 4.5;
      if (currentSettings.brakes && Math.abs(nextTrainX) < 2) targetTemperature += 3.2;
      if (currentSettings.train) targetTemperature -= 2;
      meanTemperature.current += (targetTemperature - meanTemperature.current) * 0.05 + (Math.random() - 0.5) * 0.35;
      telemetryRef.current(meanTemperature.current);
      telemetryTimer.current = 0;
    }
    trainPreviousX.current = nextTrainX;
  });

  return <instancedMesh args={[particleGeometry, particleMaterial, PARTICLE_COUNT]} frustumCulled={false} />;
}

const Train = forwardRef(function Train({ active, brakes }, ref) {
  const carBodyRef = useRef();
  const fanRefs = [useRef(), useRef()];
  const brakeRefs = [useRef(), useRef()];
  useFrame(() => {
    fanRefs.forEach((fan) => {
      if (active) fan.current.rotation.y += 0.3;
    });
    const isBraking = brakes && ref.current && Math.abs(ref.current.position.x) < 2;
    if (carBodyRef.current) carBodyRef.current.position.y = isBraking ? -1.8 + (Math.random() - 0.5) * 0.04 : -1.8;
    brakeRefs.forEach((light) => { light.current.intensity = isBraking ? 4 + Math.random() * 5 : 0; });
  });

  return (
    <group ref={ref}>
      <mesh ref={carBodyRef} position={[0, -1.8, 2.5]} castShadow>
        <boxGeometry args={[16, 3.4, 2.8]} />
        <meshStandardMaterial color="#b7c7c5" metalness={0.82} roughness={0.25} />
      </mesh>
      {[-6, -3.6, -1.2, 1.2, 3.6, 6].map((windowX) => (
        <mesh key={windowX} position={[windowX, -1.5, 1.06]}>
          <boxGeometry args={[1.55, 1.1, 0.05]} />
          <meshStandardMaterial color="#17333a" metalness={0.4} roughness={0.18} emissive="#0d6872" emissiveIntensity={0.35} />
        </mesh>
      ))}
      {[-4, 4].map((unitX, index) => (
        <group key={unitX}>
          <mesh position={[unitX, 0.1, 2.5]}>
            <boxGeometry args={[2.5, 0.4, 1.8]} />
            <meshStandardMaterial color="#33484b" roughness={0.8} />
          </mesh>
          <mesh ref={fanRefs[index]} position={[unitX, 0.35, 2.5]}>
            <boxGeometry args={[1.4, 0.05, 0.2]} />
            <meshStandardMaterial color="#192427" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {[-6, 6].map((lightX, index) => (
        <pointLight key={lightX} ref={brakeRefs[index]} color="#ff493d" distance={7} position={[lightX, -3, 3.5]} />
      ))}
    </group>
  );
});

const GROOVE_POSITIONS = [-2.4, -0.8, 0.8, 2.4];

function VentilationInfrastructure({ settings }) {
  const ceilingFanRefs = useRef([]);
  const floorFanRefs = useRef([]);
  const roofPitchRadians = THREE.MathUtils.degToRad(settings.roofPitch);
  const roofRidgeZ = settings.roofOffset;
  const roofRidgeY = 4 + Math.tan(roofPitchRadians) * 2.3;
  const roofGap = Math.max(0, settings.roofGap);
  const { leftEndZ: leftRoofEndZ, rightStartZ: rightRoofStartZ } = roofGapEndpoints(roofRidgeZ, roofGap);
  const leftRoofSpan = leftRoofEndZ + 4.6;
  const rightRoofSpan = 4.6 - rightRoofStartZ;
  const leftRoofLength = Math.max(0.2, Math.hypot(leftRoofSpan, roofRidgeY - 4));
  const rightRoofLength = Math.max(0.2, Math.hypot(rightRoofSpan, 4 - roofRidgeY));
  const leftRoofCenter = [0, (4 + roofRidgeY) / 2, (-4.6 + leftRoofEndZ) / 2];
  const rightRoofCenter = [0, (roofRidgeY + 4) / 2, (rightRoofStartZ + 4.6) / 2];
  const leftRoofRotation = Math.atan2(-(roofRidgeY - 4), leftRoofSpan);
  const rightRoofRotation = Math.atan2(-(4 - roofRidgeY), rightRoofSpan);
  const louverAngle = THREE.MathUtils.lerp(0, THREE.MathUtils.degToRad(58), settings.clerestoryOpen);
  const louverWidth = THREE.MathUtils.lerp(0.75, 1.6, settings.clerestorySize);

  useFrame((_, delta) => {
    ceilingFanRefs.current.forEach((fan) => {
      if (fan) fan.rotation.x += delta * (2 + settings.ceilingFans * 5);
    });
    floorFanRefs.current.forEach((fan) => {
      if (fan) fan.rotation.x += delta * (1.5 + settings.floorAirMovers * 6);
    });
  });

  return (
    <group>
      <group>
        {SHAFT_POSITIONS.map((shaftX) => (
          <group key={shaftX} position={[shaftX, 0, -1.4]}>
            <mesh position={[0, (SHAFT_ROUTE.throatY + SHAFT_ROUTE.streetY) / 2, 0]}>
              <boxGeometry args={[1.25, SHAFT_ROUTE.streetY - SHAFT_ROUTE.throatY, 1.25]} />
              <meshStandardMaterial color="#708b82" metalness={0.45} roughness={0.55} transparent opacity={0.18} depthWrite={false} />
            </mesh>
            <mesh position={[0, SHAFT_ROUTE.streetY, 0]}>
              <boxGeometry args={[1.5, 0.12, 1.5]} />
              <meshStandardMaterial color="#d5b75e" metalness={0.7} roughness={0.3} transparent opacity={0.65} />
            </mesh>
            <mesh position={[0, SHAFT_ROUTE.throatY, 0]}>
              <boxGeometry args={[1.05, 0.08, 1.05]} />
              <meshStandardMaterial color="#1d3536" metalness={0.35} roughness={0.45} />
            </mesh>
          </group>
        ))}
      </group>
      <group>
        {[-6, 0, 6].map((fanX, index) => (
          <group key={fanX} ref={(element) => { ceilingFanRefs.current[index] = element; }} position={[fanX, 3.48, 1.4]} rotation={[0, 0, Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.42, 0.42, 0.14, 16]} />
              <meshStandardMaterial color="#63b6b1" emissive="#165d61" emissiveIntensity={0.3} metalness={0.55} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.75, 0.035, 0.06]} />
              <meshBasicMaterial color="#bce8d5" />
            </mesh>
            <mesh position={[0, 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.75, 0.035, 0.06]} />
              <meshBasicMaterial color="#bce8d5" />
            </mesh>
          </group>
        ))}
      </group>
      <group>
        {AIRFLOW_PARAMS.fanPositions.map((fanX, index) => (
          <group key={fanX} ref={(element) => { floorFanRefs.current[index] = element; }} position={[fanX, -2.34, AIRFLOW_PARAMS.floorMoverZ]} rotation={[0, 0, Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.42, 0.42, 0.14, 16]} />
              <meshStandardMaterial color="#d5b75e" emissive="#7a5421" emissiveIntensity={0.35} metalness={0.65} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.72, 0.035, 0.06]} />
              <meshBasicMaterial color="#f0d38a" />
            </mesh>
            <mesh position={[0, 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.72, 0.035, 0.06]} />
              <meshBasicMaterial color="#f0d38a" />
            </mesh>
          </group>
        ))}
      </group>
      <group>
        {GROOVE_POSITIONS.map((grooveZ, index) => (
          <mesh key={grooveZ} position={[0, 3.95, grooveZ]} rotation={[0, 0, index % 2 ? -0.018 : 0.018]}>
            <boxGeometry args={[20, 0.07, 0.12]} />
            <meshStandardMaterial color="#254546" emissive="#1d5d58" emissiveIntensity={0.25} roughness={0.72} />
          </mesh>
        ))}
      </group>
      <group>
        <mesh position={leftRoofCenter} rotation={[leftRoofRotation, 0, 0]} receiveShadow>
          <boxGeometry args={[22, 0.22, leftRoofLength]} />
          <meshStandardMaterial color="#607974" roughness={0.78} metalness={0.18} />
        </mesh>
        <mesh position={rightRoofCenter} rotation={[rightRoofRotation, 0, 0]} receiveShadow>
          <boxGeometry args={[22, 0.22, rightRoofLength]} />
          <meshStandardMaterial color="#607974" roughness={0.78} metalness={0.18} />
        </mesh>
        <group visible={settings.clerestoryOpen > 0.01} position={[0, roofRidgeY + 0.16, roofRidgeZ]}>
          {Array.from({ length: 10 }, (_, louverIndex) => (
            <mesh key={louverIndex} position={[-9 + louverIndex * 2, 0, 0]} rotation={[louverAngle, 0, 0]}>
              <boxGeometry args={[louverWidth, 0.08, 0.16]} />
              <meshStandardMaterial color="#bce8d5" emissive="#2f8e83" emissiveIntensity={0.25 + settings.clerestoryOpen * 0.8} transparent opacity={0.35 + settings.clerestoryOpen * 0.65} metalness={0.25} roughness={0.35} />
            </mesh>
          ))}
        </group>
        <mesh position={[9.65, 4.1, 0]}>
          <boxGeometry args={[0.12, 0.45, 5.8]} />
          <meshBasicMaterial color="#9bd1aa" />
        </mesh>
      </group>
    </group>
  );
}

function StairRouteEnclosure() {
  const stairRiseY = STAIR_ROUTE.baseY + STAIR_ROUTE.riseY - STAIR_ROUTE.baseY;
  const stairLength = Math.hypot(STAIR_ROUTE.endX - STAIR_ROUTE.startX, stairRiseY);
  const stairAngle = Math.atan2(stairRiseY, STAIR_ROUTE.endX - STAIR_ROUTE.startX);
  const stairCenterX = (STAIR_ROUTE.startX + STAIR_ROUTE.endX) / 2;
  const stairCenterY = (STAIR_ROUTE.baseY + STAIR_ROUTE.baseY + STAIR_ROUTE.riseY) / 2;
  const stairMaterial = {
    color: '#9bd1c1',
    emissive: '#2f8e83',
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide
  };
  const streetMaterial = {
    color: '#d5eadf',
    emissive: '#5da99b',
    emissiveIntensity: 0.12,
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
    side: THREE.DoubleSide
  };

  return (
    <group>
      <mesh position={[stairCenterX, stairCenterY + STAIR_ROUTE.tunnelHeight, STAIR_ROUTE.z]} rotation={[0, 0, stairAngle]}>
        <boxGeometry args={[stairLength, 0.08, STAIR_ROUTE.width]} />
        <meshStandardMaterial {...stairMaterial} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[stairCenterX, stairCenterY + STAIR_ROUTE.tunnelHeight / 2, STAIR_ROUTE.z + side * STAIR_ROUTE.width / 2]} rotation={[0, 0, stairAngle]}>
          <boxGeometry args={[stairLength, STAIR_ROUTE.tunnelHeight, 0.08]} />
          <meshStandardMaterial {...stairMaterial} />
        </mesh>
      ))}
      <mesh position={[STAIR_ROUTE.endX, (stairSurfaceY(STAIR_ROUTE.endX) + STREET_VOLUME.maxY) / 2, STAIR_ROUTE.z]}>
        <boxGeometry args={[STAIR_ROUTE.width, STREET_VOLUME.maxY - stairSurfaceY(STAIR_ROUTE.endX), STAIR_ROUTE.width]} />
        <meshStandardMaterial {...stairMaterial} />
      </mesh>
      <mesh position={[(STREET_VOLUME.minX + STREET_VOLUME.maxX) / 2, (STREET_VOLUME.minY + STREET_VOLUME.maxY) / 2, (STREET_VOLUME.minZ + STREET_VOLUME.maxZ) / 2]}>
        <boxGeometry args={[STREET_VOLUME.maxX - STREET_VOLUME.minX, STREET_VOLUME.maxY - STREET_VOLUME.minY, STREET_VOLUME.maxZ - STREET_VOLUME.minZ]} />
        <meshStandardMaterial {...streetMaterial} />
      </mesh>
    </group>
  );
}

function FloodControlTunnels({ enabled, flow, pumpDirection }) {
  return (
    <group visible={enabled}>
      <mesh position={[0, -5.0, -4.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.25, 1.25, 22, 24, 1, true]} />
        <meshStandardMaterial color="#15383e" side={THREE.BackSide} roughness={0.9} metalness={0.1} transparent opacity={0.82} />
      </mesh>
      <mesh position={[0, -6.08, -4.15]}>
        <boxGeometry args={[21.5, 0.05, 1.6]} />
        <meshStandardMaterial color="#21727a" emissive="#0c4249" emissiveIntensity={0.35 + flow * 0.45} roughness={0.25} metalness={0.12} />
      </mesh>
      {[-9.8, 9.8].map((tunnelX) => (
        <mesh key={tunnelX} position={[tunnelX, -5.0, -4.15]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[1.25, 0.1, 12, 28]} />
          <meshStandardMaterial color="#d5b75e" metalness={0.7} roughness={0.34} />
        </mesh>
      ))}
      <mesh position={[0, -5.72, -4.15]} rotation={[0, pumpDirection < 0 ? Math.PI : 0, 0]}>
        <boxGeometry args={[4.5, 0.08, 0.1]} />
        <meshBasicMaterial color="#9bd1aa" />
      </mesh>
    </group>
  );
}

function StationArchitecture() {
  const concreteMaterial = <meshStandardMaterial color="#52646a" roughness={0.88} />;
  return (
    <group>
      <mesh position={[0, -3.25, -2.5]} receiveShadow>
        <boxGeometry args={[22, 1.5, 4]} />
        {concreteMaterial}
      </mesh>
      <mesh position={[0, -2.48, -0.6]}>
        <boxGeometry args={[22, 0.05, 0.3]} />
        <meshBasicMaterial color="#e5bd42" />
      </mesh>
      <mesh position={[0, -3.8, 2.5]} receiveShadow>
        <boxGeometry args={[22, 0.4, 5]} />
        <meshStandardMaterial color="#111e21" roughness={0.95} />
      </mesh>
      {[-1.5, 0, 1.5].map((railZ) => (
        <mesh key={railZ} position={[0, -3.55, 2.5 + railZ]}>
          <boxGeometry args={[22, 0.08, 0.08]} />
          <meshStandardMaterial color="#b3c3bf" metalness={0.9} roughness={0.22} />
        </mesh>
      ))}
      {Array.from({ length: 22 }, (_, stepIndex) => (
        <mesh key={stepIndex} position={[7 + stepIndex * 0.4, -3.15 + stepIndex * 0.25, -2.5]}>
          <boxGeometry args={[0.5, 0.2, 2.8]} />
          {concreteMaterial}
        </mesh>
      ))}
      {[-8, -4, 0, 4].map((columnX) => (
        <mesh key={columnX} position={[columnX, 0.5, -0.6]}>
          <boxGeometry args={[0.3, 7, 0.3]} />
          <meshStandardMaterial color="#235160" metalness={0.6} roughness={0.36} />
        </mesh>
      ))}
      {Array.from({ length: 18 }, (_, commuterIndex) => {
        const commuterX = -6 + (commuterIndex * 37 % 120) / 10;
        const commuterZ = -2 - (commuterIndex * 17 % 15) / 10;
        return (
          <mesh key={commuterIndex} position={[commuterX, -1.75, commuterZ]}>
            <cylinderGeometry args={[0.18, 0.18, 1.5, 8]} />
            <meshStandardMaterial color={commuterIndex % 2 ? '#384f55' : '#23363c'} roughness={0.86} />
          </mesh>
        );
      })}
    </group>
  );
}

function SimulationScene({ settings, onTelemetry, onGpuError }) {
  const trainRef = useRef();
  return (
    <>
      <ambientLight color="#8ab0ae" intensity={1.25} />
      <directionalLight color="#fff4dd" intensity={2.3} position={[10, 20, 15]} castShadow />
      <StationArchitecture />
      <VentilationInfrastructure settings={settings} />
      <StairRouteEnclosure />
      <FloodControlTunnels enabled={settings.floodTunnels} flow={settings.floodFlow} pumpDirection={settings.floodPumpDirection} />
      <Train ref={trainRef} active={settings.train} brakes={settings.brakes} />
      <ParticleField settings={settings} trainRef={trainRef} onTelemetry={onTelemetry} onGpuError={onGpuError} />
      <ContactShadows position={[0, -4, 0]} opacity={0.42} scale={32} blur={2.5} far={8} />
      <OrbitControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.08} minDistance={12} maxDistance={48} />
    </>
  );
}

function Sparkline({ values }) {
  const points = values.map((temperature, index) => `${(index / (values.length - 1)) * 250},${60 - ((temperature - 78) / 14) * 52}`).join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 250 64" preserveAspectRatio="none" aria-label="Station temperature history">
      <path d="M0 48 H250 M0 28 H250" className="sparkline-grid" />
      <polyline points={points} className="sparkline-line" />
    </svg>
  );
}

function Toggle({ label, checked, onChange, description, showDescription }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track"><span /></span>
      <span className="toggle-copy"><span>{label}</span>{showDescription && <small className="parameter-description">{description}</small>}</span>
    </label>
  );
}

function ControlSlider({ label, value, min, max, step, suffix, description, showDescription, onChange }) {
  const displayValue = Number.isFinite(value) ? value : min;
  return (
    <label className="slider-control">
      <span className="control-label"><span>{label}</span><strong>{displayValue.toFixed(step < 0.01 ? 3 : step < 1 ? 1 : 2)}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={displayValue} onChange={(event) => onChange(Number(event.target.value))} />
      {showDescription && <small className="parameter-description">{description}</small>}
    </label>
  );
}

function ReportContributionList({ title, items, tone }) {
  const maximum = Math.max(...items.map((item) => item.points), 1);
  return (
    <section className="report-contributions">
      <div className="report-section-heading"><span>{title}</span><strong>{items.reduce((total, item) => total + item.points, 0).toFixed(1)} pts</strong></div>
      <div className="contribution-list">
        {items.map((item) => (
          <div className="contribution-row" key={item.key}>
            <div className="contribution-label"><span>{item.label}</span><strong className={`contribution-points ${tone}`}>{tone === 'positive' ? '+' : '-'}{item.points.toFixed(1)}</strong></div>
            <div className="contribution-track"><span className={tone} style={{ width: `${(item.points / maximum) * 100}%` }} /></div>
            <small>{item.description}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ThermalResilienceReport({ report, onClose }) {
  return (
    <div className="report-layer" onClick={onClose}>
      <section className="report-screen panel" role="dialog" aria-modal="true" aria-labelledby="resilience-report-title" onClick={(event) => event.stopPropagation()}>
        <header className="report-header">
          <div>
            <div className="panel-kicker"><span className="status-dot" />THERMAL RESILIENCE / FIELD REPORT</div>
            <h2 id="resilience-report-title">What is moving the score</h2>
          </div>
          <button className="report-close" type="button" onClick={onClose} aria-label="Close thermal resilience report">Close</button>
        </header>
        <div className="report-score-block">
          <span>Current resilience</span>
          <strong>{report.score}%</strong>
          <div className="sustainability-meter"><span style={{ width: `${report.score}%` }} /></div>
          <p>Higher scores favor passive heat removal and penalize powered air movement.</p>
        </div>
        <div className="report-equation">
          <span>Baseline</span><strong>{report.baseline.toFixed(0)}</strong>
          <span>+</span><strong className="positive-text">{report.passiveTotal.toFixed(1)}</strong>
          <span>-</span><strong className="negative-text">{report.activeTotal.toFixed(1)}</strong>
          <span>=</span><strong>{report.score}</strong>
        </div>
        <ReportContributionList title="Passive cooling credits" items={report.passive} tone="positive" />
        <ReportContributionList title="Active airflow load" items={report.active} tone="negative" />
        <div className="report-note"><strong>Field note</strong><span>Surface temperature changes floor buoyancy and particle heat, but remains a physical input rather than a resilience-score credit or penalty.</span></div>
      </section>
    </div>
  );
}

function TelemetryPanel({ settings, onSettingsChange, temperature, gpuError, sustainabilityScore, showDescriptions, onShowDescriptionsChange, onOpenReport }) {
  const [temperatureHistory, setTemperatureHistory] = useState(() => new Array(48).fill(81.5));
  useEffect(() => {
    setTemperatureHistory((history) => [...history.slice(-47), temperature]);
  }, [temperature]);

  return (
    <aside className="telemetry-panel panel">
      <div className="panel-kicker"><span className={`status-dot ${gpuError ? 'status-error' : ''}`} />LIVE / TEST CHAMBER</div>
      <div className="telemetry-heading"><span>Ambient field</span><strong>{temperature.toFixed(1)}°F</strong></div>
      <Sparkline values={temperatureHistory} />
      {gpuError && <p className="error-copy">GPU field offline: {gpuError}</p>}
      <div className="primary-parameter">
        <ControlSlider label="Surface temperature" value={settings.surfaceTemperature} min={60} max={110} step={0.5} suffix="°F" description="Sets the station floor's thermal influence on nearby air." showDescription={showDescriptions} onChange={(surfaceTemperature) => onSettingsChange({ surfaceTemperature })} />
      </div>
      <details className="parameter-group">
        <summary>Fluid parameters</summary>
        <div className="controls-group">
          <ControlSlider label="Air density" value={settings.density} min={0.5} max={3} step={0.05} suffix=" kg/m³" description="Mass packed into each simulated air volume." showDescription={showDescriptions} onChange={(density) => onSettingsChange({ density })} />
          <ControlSlider label="Fluid stiffness" value={settings.stiffness} min={1} max={20} step={0.5} suffix="" description="How strongly nearby particles resist compression." showDescription={showDescriptions} onChange={(stiffness) => onSettingsChange({ stiffness })} />
          <ControlSlider label="Viscosity" value={settings.viscosity} min={0.001} max={0.05} step={0.001} suffix=" Pa·s" description="How quickly neighboring air velocities blend." showDescription={showDescriptions} onChange={(viscosity) => onSettingsChange({ viscosity })} />
        </div>
      </details>
      <div className="systems-group">
        <div className="subsection-label">SUSTAINABLE AIRFLOW SYSTEMS</div>
        <ControlSlider label="Shaft exchange" value={settings.shaftExchange} min={0} max={1} step={0.05} suffix="" description="Captures air toward the three passive vertical shafts." showDescription={showDescriptions} onChange={(shaftExchange) => onSettingsChange({ shaftExchange })} />
        <ControlSlider label="Downward fans" value={settings.downFans} min={0} max={1} step={0.05} suffix="" description="Pushes air down from the station ceiling fan banks." showDescription={showDescriptions} onChange={(downFans) => onSettingsChange({ downFans })} />
        <ControlSlider label="Floor air movers" value={settings.floorAirMovers} min={0} max={1} step={0.05} suffix="" description="Blows air across the platform floor toward the stair route." showDescription={showDescriptions} onChange={(floorAirMovers) => onSettingsChange({ floorAirMovers })} />
        <ControlSlider label="Ceiling flow" value={settings.ceilingFans} min={0} max={1} step={0.05} suffix="" description="Sweeps the warm ceiling band toward the egress." showDescription={showDescriptions} onChange={(ceilingFans) => onSettingsChange({ ceilingFans })} />
        <ControlSlider label="Passive grooves" value={settings.grooves} min={0} max={1} step={0.05} suffix="" description="Adds low-energy guidance along the roof grooves." showDescription={showDescriptions} onChange={(grooves) => onSettingsChange({ grooves })} />
        <ControlSlider label="Roof pitch" value={settings.roofPitch} min={-28} max={28} step={1} suffix="°" description="Tilts the roof envelope and changes buoyant headroom." showDescription={showDescriptions} onChange={(roofPitch) => onSettingsChange({ roofPitch })} />
        <ControlSlider label="Ridge offset" value={settings.roofOffset} min={-2} max={2} step={0.1} suffix=" z" description="Moves the roof ridge across the station width." showDescription={showDescriptions} onChange={(roofOffset) => onSettingsChange({ roofOffset })} />
        <ControlSlider label="Roof gap" value={settings.roofGap} min={0.08} max={2.4} step={0.1} suffix=" z" description="Sets the open distance between the two roof panels." showDescription={showDescriptions} onChange={(roofGap) => onSettingsChange({ roofGap })} />
        <ControlSlider label="Clerestory louvers" value={settings.clerestoryOpen} min={0} max={1} step={0.05} suffix="" description="Opens the ridge louvers for passive heat escape." showDescription={showDescriptions} onChange={(clerestoryOpen) => onSettingsChange({ clerestoryOpen })} />
        <ControlSlider label="Clerestory window size" value={settings.clerestorySize} min={0} max={1} step={0.05} suffix="" description="Scales the vertical and lateral clerestory aperture." showDescription={showDescriptions} onChange={(clerestorySize) => onSettingsChange({ clerestorySize })} />
        <ControlSlider label="Shaft stack effect" value={settings.stackEffect} min={0} max={1} step={0.05} suffix="" description="Lifts warm air through the shafts without powered fans." showDescription={showDescriptions} onChange={(stackEffect) => onSettingsChange({ stackEffect })} />
        <ControlSlider label="Flood gallery flow" value={settings.floodFlow} min={0} max={1} step={0.05} suffix="" description="Pulls warm lower air into the gallery as a cold sink." showDescription={showDescriptions} onChange={(floodFlow) => onSettingsChange({ floodFlow })} />
        <ControlSlider label="Flood pump direction" value={settings.floodPumpDirection} min={-1} max={1} step={0.1} suffix="" description="Sets the flood-gallery air-pump direction along X." showDescription={showDescriptions} onChange={(floodPumpDirection) => onSettingsChange({ floodPumpDirection })} />
      </div>
      <div className="description-toggle">
        <Toggle label="Show descriptions" checked={showDescriptions} onChange={onShowDescriptionsChange} />
      </div>
      <div className="toggles-group">
        <Toggle label="Train piston force" checked={settings.train} description="Adds the train's moving-air displacement." showDescription={showDescriptions} onChange={(train) => onSettingsChange({ train })} />
        <Toggle label="AC exhaust heat" checked={settings.ac} description="Adds heat and lift near the active train." showDescription={showDescriptions} onChange={(ac) => onSettingsChange({ ac })} />
        <Toggle label="Brake friction" checked={settings.brakes} description="Adds localized heat and turbulence during braking." showDescription={showDescriptions} onChange={(brakes) => onSettingsChange({ brakes })} />
        <Toggle label="Flood control tunnels" checked={settings.floodTunnels} description="Enables the below-station cold-sink gallery." showDescription={showDescriptions} onChange={(floodTunnels) => onSettingsChange({ floodTunnels })} />
      </div>
      <div className="sustainability-readout">
        <div className="sustainability-heading"><span>Thermal resilience</span><strong>{sustainabilityScore}%</strong></div>
        <div className="sustainability-meter"><span style={{ width: `${sustainabilityScore}%` }} /></div>
        <div className="balance-labels"><span>PASSIVE FIRST</span><span>LOW ENERGY LOAD</span></div>
        <button className="report-link" type="button" onClick={onOpenReport}>Open resilience report</button>
      </div>
    </aside>
  );
}

function App() {
  const [settings, setSettings] = useState(INITIALS);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [temperature, setTemperature] = useState(81.5);
  const [gpuError, setGpuError] = useState('');
  const handleSettingsChange = (change) => setSettings((currentSettings) => ({ ...currentSettings, ...change }));
  const resilienceReport = thermalResilienceReport(settings);
  useEffect(() => {
    if (!reportOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setReportOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reportOpen]);

  return (
    <main className="app-shell">
      <div className="scene-layer">
        <Canvas camera={{ position: [-18, 10, 22], fov: 45, near: 0.1, far: 1000 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <color attach="background" args={['#071316']} />
          <fog attach="fog" args={['#071316', 28, 72]} />
          <SimulationScene settings={settings} onTelemetry={setTemperature} onGpuError={setGpuError} />
        </Canvas>
      </div>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">T</span><span><b>TRANSIT / UNDERGROUND</b><em>Thermodynamics lab</em></span></div>
        <div className="topbar-meta"><span>GPGPU / SPH</span><span>FIELD 04</span></div>
      </header>
      {/* <section className="scene-title"><p>Airflow study</p><h1>Heat is a passenger.</h1><span>Watch the station exchange energy in real time.</span></section> */}
      <TelemetryPanel settings={settings} onSettingsChange={handleSettingsChange} temperature={temperature} gpuError={gpuError} sustainabilityScore={resilienceReport.score} showDescriptions={showDescriptions} onShowDescriptionsChange={setShowDescriptions} onOpenReport={() => setReportOpen(true)} />
      <aside className="legend-panel panel">
        <div className="legend-heading"><span>Thermal dispersion</span><span className="legend-unit">NORMALIZED / 0—1</span></div>
        <div className="gradient-bar" />
        <div className="legend-labels"><span>60°F <small>cool air</small></span><span>85°F <small>mixed</small></span><span>110°F <small>heat input</small></span></div>
      </aside>
      {reportOpen && <ThermalResilienceReport report={resilienceReport} onClose={() => setReportOpen(false)} />}
      <footer className="footer-note"><span>PLATFORM 04 / ACTIVE</span><span>Drag to orbit · Scroll to zoom</span></footer>
    </main>
  );
}

export default App;