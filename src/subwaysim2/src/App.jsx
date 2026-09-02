import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createGpuParticleField, createSimulationUvs } from './simulations/gpuParticleRuntime.js';
import { SimpleAttractorSim } from './SimpleAttractorSim.jsx';
import SqgBlackHoleSim from './SqgBlackHoleSim.jsx';
import {
  AIRFLOW_PARAMS,
  FLUID_BOUNDS,
  FLOOD_GALLERY,
  FLOOD_WATERFALL,
  GROUND_LAYOUT,
  PARTICLE_SEED_BOUNDS,
  SHAFT_POSITIONS,
  SHAFT_LABELS,
  SHAFT_ROUTE,
  STAIR_ROUTE,
  STREET_LAYOUT,
  STREET_VOLUME,
  SURFACE_MIXING,
  SURFACE_PARTICLE_STRIDE,
  TRACK_ROUTE,
  TURNSTILE_ROUTE,
  glslFloat,
  measureShaftEndpoints,
  PASSENGER_POSITIONS,
  roofCeilingAt,
  roofGapEndpoints,
  roofPanelSegments,
  stairSurfaceY,
  stairStreetPortalX,
  surfaceParticleSeedFraction,
  surfaceParticleSeedY,
  thermalResilienceReport,
  trainStateAtTime,
  verticalLayoutFromSurfaceY
} from './routeModel.js';

const INITIALS = {
  surfaceTemperature: 81.5,
  roadSurfaceTemperature: 92,
  ambientAirTemperature: 72,
  passengerHeat: 0.75,
  surfaceCrosswind: 3,
  stairUndergroundOpeningHeight: STAIR_ROUTE.tunnelHeight,
  stairLandingHeight: STAIR_ROUTE.landingY,
  stairSurfaceOpeningHeight: STAIR_ROUTE.baseY + STAIR_ROUTE.riseY,
  density: 1.18,
  stiffness: 5,
  viscosity: 0.012,
  train: true,
  ac: true,
  brakes: true,
  shaftExchange: 0.65,
  shaftControls: [1, 1, 1],
  shaftFans: true,
  shaftFanVelocity: 2.5,
  downFans: 0.45,
  floorAirMovers: 0.5,
  ceilingFans: 0.5,
  grooves: 0.7,
  floodTunnels: true,
  floodFlow: 0.55,
  floodPumpDirection: 1,
  roofPitch: 14,
  roofOffset: 0,
  roofGapHorizontal: 0,
  roofGapVertical: 0,
  clerestoryWindows: true,
  clerestoryOpen: 0,
  stackEffect: 0.65,
  trainInterval: 20,
  trainStopFrequency: 0.5,
  trainStopDuration: 6,
  particleCount: 4096,
  particleDiameter: 0.7,
  particleMagnitudeScale: 0.6,
  windOcclusion: true
};

const CAMERA_TARGET = [(TRACK_ROUTE.minX + TRACK_ROUTE.maxX) / 2, 3, 0];
const CAMERA_VIEWS = [
  { id: 'front', label: 'Front', position: [0, 3, -72] },
  { id: 'back', label: 'Back', position: [0, 3, 72] },
  { id: 'left', label: 'Left', position: [-61, 3, 0] },
  { id: 'right', label: 'Right', position: [61, 3, 0] },
  { id: 'ortho1', label: 'Ortho 1', position: [41, 38, 48] },
  { id: 'ortho2', label: 'Ortho 2', position: [-41, 38, -48] },
  { id: 'orbital', label: 'Orbital tracking', position: null }
];

const PARAMETERS_PANEL_LAYOUT = {
  breakpoint: 700,
  width: 306,
  right: 28
};

function cameraFrameOffset(camera, cameraPosition, target, viewport, parametersVisible) {
  if (!parametersVisible || viewport.width <= PARAMETERS_PANEL_LAYOUT.breakpoint) return new THREE.Vector3();

  const panelFootprint = PARAMETERS_PANEL_LAYOUT.width + PARAMETERS_PANEL_LAYOUT.right;
  const shiftPixels = panelFootprint / 2;
  const distance = cameraPosition.distanceTo(target);
  const horizontalSpan = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    * viewport.width / viewport.height;
  const forward = target.clone().sub(cameraPosition).normalize();
  const right = forward.cross(new THREE.Vector3(0, 1, 0)).normalize();
  return right.multiplyScalar(shiftPixels * horizontalSpan / viewport.width);
}

const PASSENGER_HEAT_SOURCES_GLSL = PASSENGER_POSITIONS.map((passenger) => (
  `passengerInfluence = max(passengerInfluence, (1.0 - smoothstep(0.25, 1.6, length(particlePosition.xz - vec2(${glslFloat(passenger.x)}, ${glslFloat(passenger.z)})))) * (1.0 - smoothstep(0.4, 1.9, abs(particlePosition.y - ${glslFloat(passenger.y)}))));`
)).join('\n    ');

const positionShader = `
  uniform float uDt;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uRoofGapHorizontal;
  uniform float uRoofGapVertical;
  uniform float uStairTunnelHeight;
  uniform float uStairLandingY;
  uniform float uStairSurfaceY;
  uniform float uStreetY;
  uniform float uSurfaceFloorY;
  uniform float uClerestoryOpen;
  uniform bool uClerestoryWindows;
  uniform bool uFloodTunnels;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;
    if (positionData.y >= uStreetY && positionData.w < 1.5) {
      float surfaceIdentity = fract(sin(dot(positionData.xz, vec2(12.9898, 78.233))) * 43758.5453);
      positionData.w = 2.0 + surfaceIdentity * 0.999;
    }

    if (positionData.w > 1.5) {
      positionData.x = mod(
        positionData.x - ${glslFloat(FLUID_BOUNDS.minX)},
        ${glslFloat(FLUID_BOUNDS.maxX - FLUID_BOUNDS.minX)}
      ) + ${glslFloat(FLUID_BOUNDS.minX)};
    } else {
      if (positionData.x < ${glslFloat(FLUID_BOUNDS.minX)}) positionData.x += ${glslFloat(FLUID_BOUNDS.maxX - FLUID_BOUNDS.minX)};
      if (positionData.x > ${glslFloat(FLUID_BOUNDS.maxX)}) positionData.x -= ${glslFloat(FLUID_BOUNDS.maxX - FLUID_BOUNDS.minX)};
    }
    positionData.y = clamp(positionData.y, ${glslFloat(FLUID_BOUNDS.minY)}, ${glslFloat(FLUID_BOUNDS.maxY)});
    if (positionData.y >= uStreetY) {
      positionData.z = mod(
        positionData.z - ${glslFloat(FLUID_BOUNDS.minZ)},
        ${glslFloat(FLUID_BOUNDS.maxZ - FLUID_BOUNDS.minZ)}
      ) + ${glslFloat(FLUID_BOUNDS.minZ)};
    } else {
      positionData.z = clamp(positionData.z, ${glslFloat(FLUID_BOUNDS.minZ)}, ${glslFloat(FLUID_BOUNDS.maxZ)});
    }
    if (!uFloodTunnels) positionData.y = max(positionData.y, ${glslFloat(FLOOD_GALLERY.maxY)});

    float trackGroundContact = step(${glslFloat(TRACK_ROUTE.minX)}, positionData.x)
      * step(positionData.x, ${glslFloat(TRACK_ROUTE.maxX)})
      * step(abs(positionData.z - ${glslFloat(TRACK_ROUTE.centerZ)}), ${glslFloat(TRACK_ROUTE.tunnelWidth / 2)});
    if (trackGroundContact > 0.5) positionData.y = max(positionData.y, ${glslFloat(GROUND_LAYOUT.trackFloorY)});

    float stairX = positionData.x;
    float lowerStairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.startX)}) / ${glslFloat(STAIR_ROUTE.lowerFlightEndX - STAIR_ROUTE.startX)}, 0.0, 1.0);
    float upperStairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.upperFlightStartX)}) / ${glslFloat(STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX)}, 0.0, 1.0);
    float stairSurfaceY = stairX < ${glslFloat(STAIR_ROUTE.lowerFlightEndX)}
      ? mix(${glslFloat(STAIR_ROUTE.baseY)}, uStairLandingY, lowerStairProgress)
      : (stairX <= ${glslFloat(STAIR_ROUTE.upperFlightStartX)} ? uStairLandingY : mix(uStairLandingY, uStairSurfaceY, upperStairProgress));
    float stairZone = step(${glslFloat(STAIR_ROUTE.landingStartX)}, stairX) * step(stairX, ${glslFloat(STAIR_ROUTE.endX)});
    float stairDistance = abs(positionData.z - ${glslFloat(STAIR_ROUTE.z)});
    float stairFoundationContact = stairZone * step(stairDistance, ${glslFloat(STAIR_ROUTE.width / 2)});
    if (stairFoundationContact > 0.5) positionData.y = max(positionData.y, ${glslFloat(GROUND_LAYOUT.stairFloorY)});
    float stairOuterGroundContact = stairZone
      * step(${glslFloat(STAIR_ROUTE.baseY)}, positionData.y)
      * step(positionData.y, stairSurfaceY + uStairTunnelHeight)
      * step(${glslFloat(FLUID_BOUNDS.minZ)}, positionData.z)
      * step(positionData.z, ${glslFloat(GROUND_LAYOUT.stairOuterZ)});
    if (stairOuterGroundContact > 0.5) positionData.z = ${glslFloat(GROUND_LAYOUT.stairOuterZ + 0.02)};
    float stairContact = stairZone * (1.0 - smoothstep(0.0, 1.7, stairDistance));
    float thermalContact = smoothstep(0.05, 0.4, velocityData.w) * stairContact;
    if (thermalContact > 0.0 && positionData.y < stairSurfaceY + 0.12) {
      positionData.y = mix(positionData.y, stairSurfaceY + 0.12, thermalContact);
    }
    float stairUnderfillContact = step(${glslFloat(STAIR_ROUTE.startX)}, stairX)
      * step(stairX, ${glslFloat(STAIR_ROUTE.endX)})
      * step(stairDistance, ${glslFloat(STAIR_ROUTE.width / 2)});
    if (stairUnderfillContact > 0.5) positionData.y = max(positionData.y, stairSurfaceY + 0.12);

    float turnstileXContact = step(abs(positionData.x - ${glslFloat(TURNSTILE_ROUTE.x)}), ${glslFloat(TURNSTILE_ROUTE.halfDepth)});
    float turnstileYContact = step(${glslFloat(STAIR_ROUTE.baseY)}, positionData.y)
      * step(positionData.y, ${glslFloat(STAIR_ROUTE.baseY + TURNSTILE_ROUTE.pedestalHeight)});
    float turnstilePedestalContact = max(
      max(
        step(abs(positionData.z - ${glslFloat(TURNSTILE_ROUTE.pedestalZ[0])}), ${glslFloat(TURNSTILE_ROUTE.pedestalHalfWidth)}),
        step(abs(positionData.z - ${glslFloat(TURNSTILE_ROUTE.pedestalZ[1])}), ${glslFloat(TURNSTILE_ROUTE.pedestalHalfWidth)})
      ),
      max(
        step(abs(positionData.z - ${glslFloat(TURNSTILE_ROUTE.pedestalZ[2])}), ${glslFloat(TURNSTILE_ROUTE.pedestalHalfWidth)}),
        step(abs(positionData.z - ${glslFloat(TURNSTILE_ROUTE.pedestalZ[3])}), ${glslFloat(TURNSTILE_ROUTE.pedestalHalfWidth)})
      )
    );
    if (turnstileXContact * turnstileYContact * turnstilePedestalContact > 0.5) {
      positionData.x = ${glslFloat(TURNSTILE_ROUTE.x)} + (velocityData.x >= 0.0 ? -${glslFloat(TURNSTILE_ROUTE.halfDepth)} : ${glslFloat(TURNSTILE_ROUTE.halfDepth)});
    }

    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = positionData.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((positionData.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : uRoofGapVertical + mix(roofRidgeY, 4.0, clamp((positionData.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float clerestoryHalfGap = max(${glslFloat(AIRFLOW_PARAMS.clerestoryMinGap)}, uRoofGapHorizontal * 0.5);
    float clerestoryOpening = (uClerestoryWindows ? 1.0 : 0.0) * uClerestoryOpen * uRoofGapVertical
      * (1.0 - smoothstep(clerestoryHalfGap, clerestoryHalfGap + 0.35, abs(positionData.z - uRoofOffset)));
    float shaftNorth = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x - 7.0));
    float shaftOpening = max(shaftNorth, max(shaftCenter, shaftSouth))
      * (1.0 - smoothstep(0.0, 1.1, abs(positionData.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(0.4, ${glslFloat(SHAFT_ROUTE.throatY)}, positionData.y);
    float stairTunnelCeiling = stairSurfaceY + uStairTunnelHeight;
    float stairPassage = stairZone
      * (1.0 - smoothstep(0.0, ${glslFloat(STAIR_ROUTE.width / 2)}, stairDistance))
      * step(positionData.y, stairTunnelCeiling);
    float stairExit = step(${glslFloat(STAIR_ROUTE.endX - 1.4)}, stairX)
      * (1.0 - smoothstep(0.0, ${glslFloat(STAIR_ROUTE.width / 2)}, stairDistance))
      * step(stairSurfaceY, positionData.y);
    float surfaceOpening = max(step(0.05, shaftOpening), stairExit);
    if (positionData.w > 1.5 && surfaceOpening < 0.5) positionData.y = max(positionData.y, uSurfaceFloorY);
    if (stairPassage > 0.5) positionData.y = min(positionData.y, max(roofCeiling, stairTunnelCeiling));
    if (positionData.w < 1.5 && shaftOpening < 0.05 && stairExit < 0.5 && clerestoryOpening < 0.05) positionData.y = min(positionData.y, roofCeiling);

    gl_FragColor = positionData;
  }
`;

const velocityShader = `
  uniform float uDt;
  uniform float uSurfaceTemperature;
  uniform float uRoadSurfaceTemperature;
  uniform float uAmbientAirTemperature;
  uniform float uPassengerHeat;
  uniform float uSurfaceCrosswind;
  uniform float uRadius;
  uniform float uRestDensity;
  uniform float uStiffness;
  uniform float uViscosity;
  uniform float uTrainPosX;
  uniform float uTrainVelX;
  uniform float uShaftExchange;
  uniform vec3 uShaftControls;
  uniform float uShaftFanVelocity;
  uniform float uDownFans;
  uniform float uFloorAirMovers;
  uniform float uCeilingFans;
  uniform float uGrooves;
  uniform float uFloodFlow;
  uniform float uFloodPumpDirection;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uRoofGapHorizontal;
  uniform float uRoofGapVertical;
  uniform float uClerestoryOpen;
  uniform float uStackEffect;
  uniform float uStairTunnelHeight;
  uniform float uStairLandingY;
  uniform float uStairSurfaceY;
  uniform float uStreetY;
  uniform float uStreetMaxY;
  uniform float uSurfaceFloorY;
  uniform float uShaftOutletY;
  uniform bool uTrainActive;
  uniform bool uShaftFans;
  uniform bool uClerestoryWindows;
  uniform bool uWindOcclusion;
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

  vec3 simulationOffset(vec4 positionData, vec4 neighborData) {
    vec3 offset = positionData.xyz - neighborData.xyz;
    if (positionData.w > 1.5 && neighborData.w > 1.5) {
      float surfaceSpan = ${glslFloat(FLUID_BOUNDS.maxZ - FLUID_BOUNDS.minZ)};
      offset.z -= surfaceSpan * floor(offset.z / surfaceSpan + 0.5);
    }
    return offset;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 particlePosition = positionData.xyz;
    vec3 particleVelocity = velocityData.xyz;
    float thermalIntensity = velocityData.w;
    float surfaceParticle = step(1.5, positionData.w);
    float density = 0.0;
    vec3 pressureForce = vec3(0.0);
    vec3 viscosityForce = vec3(0.0);

    for (float y = 0.0; y < resolution.y; y += 2.0) {
      for (float x = 0.0; x < resolution.x; x += 2.0) {
        vec2 neighborUv = vec2(x + 0.5, y + 0.5) / resolution.xy;
        vec4 neighborData = texture2D(uPositionTex, neighborUv);
        vec3 offset = simulationOffset(positionData, neighborData);
        float distanceToNeighbor = length(offset);

        if (distanceToNeighbor > 0.0001 && distanceToNeighbor < uRadius) {
          float kernelPosition = distanceToNeighbor / uRadius;
          density += cubicSplineKernel(kernelPosition);
        }
      }
    }

    float pressure = max(0.0, uStiffness * (density - uRestDensity));
    for (float y = 0.0; y < resolution.y; y += 2.0) {
      for (float x = 0.0; x < resolution.x; x += 2.0) {
        vec2 neighborUv = vec2(x + 0.5, y + 0.5) / resolution.xy;
        vec4 neighborData = texture2D(uPositionTex, neighborUv);
        vec3 neighborVelocity = texture2D(uVelocityTex, neighborUv).xyz;
        vec3 offset = simulationOffset(positionData, neighborData);
        float distanceToNeighbor = length(offset);

        if (distanceToNeighbor > 0.0001 && distanceToNeighbor < uRadius) {
          float kernelPosition = distanceToNeighbor / uRadius;
          float kernelWeight = cubicSplineKernel(kernelPosition);
          pressureForce += normalize(offset) * pressure * (1.0 - kernelPosition);
          viscosityForce += uViscosity * (neighborVelocity - particleVelocity) * kernelWeight;
        }
      }
    }

    vec3 acceleration = pressureForce + viscosityForce + vec3(0.6 * (1.0 - surfaceParticle), 0.0, 0.0);
    float surfaceHeat = clamp((uSurfaceTemperature - 60.0) / 50.0, 0.0, 1.0);
    float surfaceBand = 1.0 - smoothstep(0.0, 2.1, abs(particlePosition.y + 2.4));
    float surfaceThermalDelta = surfaceHeat - 0.42;
    acceleration.y += surfaceThermalDelta * surfaceBand * 0.55;
    thermalIntensity = clamp(thermalIntensity + uDt * surfaceThermalDelta * surfaceBand * 0.25, 0.0, 1.0);
    float passengerInfluence = 0.0;
    ${PASSENGER_HEAT_SOURCES_GLSL}
    if (surfaceParticle < 0.5) {
      acceleration.y += passengerInfluence * uPassengerHeat * 0.8;
      thermalIntensity = clamp(thermalIntensity + uDt * passengerInfluence * uPassengerHeat * 0.18, 0.0, 1.0);
    }
    float roadBand = surfaceParticle
      * step(uStreetY, particlePosition.y)
      * (1.0 - smoothstep(0.0, 2.4, particlePosition.y - uStreetY))
      * step(${glslFloat(STREET_VOLUME.minX)}, particlePosition.x)
      * step(particlePosition.x, ${glslFloat(STREET_VOLUME.maxX)})
      * step(${glslFloat(STREET_LAYOUT.sidewalkRoadEdgeZ)}, particlePosition.z)
      * step(particlePosition.z, ${glslFloat(STREET_VOLUME.maxZ)});
    float roadThermalDelta = clamp((uRoadSurfaceTemperature - uAmbientAirTemperature) / 40.0, -1.0, 1.0);
    acceleration.y += roadThermalDelta * roadBand * 1.15;
    thermalIntensity = clamp(thermalIntensity + uDt * roadThermalDelta * roadBand * 0.35, 0.0, 1.0);
    float ambientBand = surfaceParticle * smoothstep(uStreetY + 0.8, uStreetY + 2.4, particlePosition.y);
    float ambientHeat = clamp((uAmbientAirTemperature - 60.0) / 50.0, 0.0, 1.0);
    acceleration.y += (ambientHeat - 0.42) * ambientBand * 0.1;
    thermalIntensity += (ambientHeat - thermalIntensity) * uDt * ambientBand * 0.12;
    float surfaceWindBand = smoothstep(uStreetY - 0.5, uStreetY + 0.5, particlePosition.y);
    float surfaceMixFraction = fract(positionData.w);
    float surfaceMixTargetY = mix(
      uSurfaceFloorY + ${glslFloat(SURFACE_MIXING.minimumHeight)},
      ${glslFloat(FLUID_BOUNDS.maxY - SURFACE_MIXING.ceilingMargin)},
      surfaceMixFraction
    );
    float surfaceShaftNorth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x + 7.0));
    float surfaceShaftCenter = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x));
    float surfaceShaftSouth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x - 7.0));
    float surfaceShaftOutlet = max(surfaceShaftNorth, max(surfaceShaftCenter, surfaceShaftSouth))
      * (1.0 - smoothstep(0.45, 1.25, abs(particlePosition.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(uShaftOutletY, uShaftOutletY + 0.4, particlePosition.y)
      * (1.0 - smoothstep(uStreetMaxY - 0.4, uStreetMaxY, particlePosition.y));
    float surfaceShaftControl = surfaceShaftSouth > surfaceShaftCenter && surfaceShaftSouth > surfaceShaftNorth
      ? uShaftControls.z
      : (surfaceShaftNorth > surfaceShaftCenter ? uShaftControls.x : uShaftControls.y);
    float surfaceFloorReturn = surfaceWindBand * (
      1.0 - smoothstep(
        uSurfaceFloorY,
        uSurfaceFloorY + 0.9,
        particlePosition.y
      )
    );
    float surfaceCeilingReturn = smoothstep(${glslFloat(FLUID_BOUNDS.maxY - 1.5)}, ${glslFloat(FLUID_BOUNDS.maxY - 0.2)}, particlePosition.y);
    acceleration.y += surfaceFloorReturn * (0.9 + max(0.0, -particleVelocity.y) * 6.0);
    acceleration.y += abs(uSurfaceCrosswind) * surfaceShaftOutlet * surfaceShaftControl * 1.8;
    acceleration.y += surfaceParticle * abs(uSurfaceCrosswind)
      * (surfaceMixTargetY - particlePosition.y) * ${glslFloat(SURFACE_MIXING.strength)} * surfaceWindBand;
    acceleration.y -= surfaceCeilingReturn * (4.0 + max(0.0, particleVelocity.y) * 6.0);
    acceleration.z += (uSurfaceCrosswind - particleVelocity.z) * surfaceWindBand * 1.2 * (1.0 - surfaceShaftOutlet * surfaceShaftControl * 0.82);

    float stairX = particlePosition.x;
    float lowerStairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.startX)}) / ${glslFloat(STAIR_ROUTE.lowerFlightEndX - STAIR_ROUTE.startX)}, 0.0, 1.0);
    float upperStairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.upperFlightStartX)}) / ${glslFloat(STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX)}, 0.0, 1.0);
    float stairSurfaceY = stairX < ${glslFloat(STAIR_ROUTE.lowerFlightEndX)}
      ? mix(${glslFloat(STAIR_ROUTE.baseY)}, uStairLandingY, lowerStairProgress)
      : (stairX <= ${glslFloat(STAIR_ROUTE.upperFlightStartX)} ? uStairLandingY : mix(uStairLandingY, uStairSurfaceY, upperStairProgress));
    float stairProgress = clamp((stairX - ${glslFloat(STAIR_ROUTE.startX)}) / ${glslFloat(STAIR_ROUTE.endX - STAIR_ROUTE.startX)}, 0.0, 1.0);
    float stairZone = step(${glslFloat(STAIR_ROUTE.landingStartX)}, stairX) * step(stairX, ${glslFloat(STAIR_ROUTE.endX)});
    float stairProximity = stairZone
      * (1.0 - smoothstep(0.0, 1.7, abs(particlePosition.z - ${glslFloat(STAIR_ROUTE.z)})))
      * (1.0 - smoothstep(0.0, 1.8, abs(particlePosition.y - stairSurfaceY)));
    float stairApproach = smoothstep(${glslFloat(STAIR_ROUTE.landingStartX - 1.5)}, ${glslFloat(STAIR_ROUTE.landingStartX)}, stairX)
      * (1.0 - smoothstep(${glslFloat(STAIR_ROUTE.endX - 1.5)}, ${glslFloat(STAIR_ROUTE.endX)}, stairX));
    float stairSlope = stairX < ${glslFloat(STAIR_ROUTE.lowerFlightEndX)}
      ? (uStairLandingY - ${glslFloat(STAIR_ROUTE.baseY)}) / ${glslFloat(STAIR_ROUTE.lowerFlightEndX - STAIR_ROUTE.startX)}
      : (stairX <= ${glslFloat(STAIR_ROUTE.upperFlightStartX)}
        ? 0.0
        : (uStairSurfaceY - uStairLandingY) / ${glslFloat(STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX)});
    vec3 stairDirection = normalize(vec3(1.0, stairSlope, 0.0));
    acceleration += stairDirection * stairProximity * (0.45 + thermalIntensity * 2.4);
    acceleration += stairDirection * stairProximity * abs(uSurfaceCrosswind) * (0.12 + stairProgress * 0.28);
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
    float shaftCaptureHeight = 1.0 - smoothstep(
      uStreetY,
      uStreetY + 0.6,
      particlePosition.y
    );
    float ceilingBand = smoothstep(1.8, 4.0, particlePosition.y);
    float shaftHorizontalCapture = shaftInfluence
      * (1.0 - smoothstep(0.0, 1.3, abs(particlePosition.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(0.4, 2.5, particlePosition.y)
      * shaftCaptureHeight;
    float shaftVerticalColumn = shaftInfluence
      * (1.0 - smoothstep(0.0, 0.9, abs(particlePosition.z - ${glslFloat(SHAFT_ROUTE.z)})))
      * smoothstep(0.4, ${glslFloat(SHAFT_ROUTE.throatY)}, particlePosition.y)
      * shaftCaptureHeight;
    float shaftTargetX = shaftSouth > shaftCenter && shaftSouth > shaftNorth ? 7.0 : (shaftNorth > shaftCenter ? -7.0 : 0.0);
    float shaftControl = shaftSouth > shaftCenter && shaftSouth > shaftNorth
      ? uShaftControls.z
      : (shaftNorth > shaftCenter ? uShaftControls.x : uShaftControls.y);
    shaftHorizontalCapture *= shaftControl;
    shaftVerticalColumn *= shaftControl;
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
      float poweredShaftLift = uShaftFans ? uShaftFanVelocity : 0.0;
      float crosswindDraw = abs(uSurfaceCrosswind) * 0.3;
      acceleration.x += (shaftTargetX - particlePosition.x) * shaftVerticalColumn * 3.6;
      acceleration.y += shaftVerticalColumn * (uShaftExchange * 2.4 + uStackEffect * 3.4 + poweredShaftLift + crosswindDraw) * (0.35 + thermalIntensity * 1.8);
      acceleration.z += (${glslFloat(SHAFT_ROUTE.z)} - particlePosition.z) * shaftVerticalColumn * 4.4;
      acceleration.y -= fanBand * uDownFans * 1.8;
      acceleration.x += ceilingBand * uCeilingFans * 1.4 * (1.0 - shaftVerticalColumn);
      acceleration.x += ceilingBand * uGrooves * 0.5 * (1.0 - shaftVerticalColumn);
      thermalIntensity = max(0.0, thermalIntensity - uDt * shaftVerticalColumn * (uShaftExchange * 0.2 + uStackEffect * 0.35));
      thermalIntensity = max(0.0, thermalIntensity - uDt * ceilingBand * (uDownFans + uCeilingFans) * 0.08);
    }
    acceleration.x += floorMoverInfluence * uFloorAirMovers * 2.0;
    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = particlePosition.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((particlePosition.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : uRoofGapVertical + mix(roofRidgeY, 4.0, clamp((particlePosition.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float distanceBelowRoof = roofCeiling - particlePosition.y;
    float roofFollowBand = 1.0 - smoothstep(0.15, 1.35, abs(distanceBelowRoof - 0.25));
    float roofSlope = abs(tan(uRoofPitch));
    float roofAvailable = 1.0 - shaftVerticalColumn;
    acceleration.y += ((distanceBelowRoof - 0.25) * 3.2 + roofSlope * uGrooves * 0.9) * roofFollowBand * roofAvailable;
    acceleration.z += -sign(particlePosition.z - uRoofOffset) * uGrooves * roofFollowBand * roofAvailable * 1.4;
    if (particlePosition.y > roofCeiling - 0.18) {
      acceleration.y -= (particlePosition.y - roofCeiling + 0.18) * 1.8;
      acceleration.x += sign(particlePosition.z) * uGrooves * 0.22;
    }
    float clerestoryWidth = max(${glslFloat(AIRFLOW_PARAMS.clerestoryMinGap)}, uRoofGapHorizontal * 0.5);
    float clerestoryHeight = max(0.05, uRoofGapVertical);
    float clerestoryBand = (1.0 - smoothstep(0.0, clerestoryWidth, abs(particlePosition.z - uRoofOffset)))
      * smoothstep(roofCeiling - clerestoryHeight, roofCeiling + 0.9, particlePosition.y);
    if (uClerestoryWindows && uClerestoryOpen > 0.0 && clerestoryBand > 0.0) {
      acceleration.y += clerestoryBand * uClerestoryOpen * (0.8 + uStackEffect * 2.2) * (0.35 + thermalIntensity * 1.7);
      thermalIntensity = max(0.0, thermalIntensity - uDt * clerestoryBand * uClerestoryOpen * 0.25);
    }
    if (uFloodTunnels) {
      float waterfallRadial = length(vec2(particlePosition.x - ${glslFloat(FLOOD_WATERFALL.x)}, particlePosition.z - ${glslFloat(FLOOD_WATERFALL.z)}));
      float waterfallBand = (1.0 - smoothstep(${glslFloat(FLOOD_WATERFALL.radius * 0.5)}, ${glslFloat(FLOOD_WATERFALL.radius)}, waterfallRadial))
        * smoothstep(${glslFloat(FLOOD_WATERFALL.bottomY)}, ${glslFloat(FLOOD_WATERFALL.bottomY + 0.4)}, particlePosition.y)
        * (1.0 - smoothstep(${glslFloat(FLOOD_WATERFALL.topY - 0.4)}, ${glslFloat(FLOOD_WATERFALL.topY)}, particlePosition.y));
      acceleration.y -= uFloodFlow * floodBand * floodCaptureBand * 0.8;
      acceleration.y -= uFloodFlow * waterfallBand * 2.4;
      acceleration.z += (${glslFloat(FLOOD_GALLERY.z)} - particlePosition.z) * uFloodFlow * floodCaptureBand * 0.45;
      acceleration.x += uFloodPumpDirection * uFloodFlow * floodGalleryBand * 2.4;
      thermalIntensity = max(0.0, thermalIntensity - uDt * uFloodFlow * (floodBand * floodCaptureBand * 0.22 + floodGalleryBand * 0.35 + waterfallBand * 0.8));
    }

    if (surfaceParticle < 0.5 && uAcActive && abs(particlePosition.x - uTrainPosX) < 5.0 && particlePosition.y > 1.0 && particlePosition.z > 0.5) {
      thermalIntensity = min(1.0, thermalIntensity + uDt * 0.45);
      acceleration += vec3(0.0, 4.5, 0.0);
    }
    if (surfaceParticle < 0.5 && uBrakesActive && abs(particlePosition.x - uTrainPosX) < 8.0 && particlePosition.y < -2.0 && abs(particlePosition.z - 2.5) < 1.0) {
      thermalIntensity = min(1.0, thermalIntensity + uDt * 0.6);
      acceleration += vec3((fract(sin(particlePosition.x * 12.0) * 43758.5) - 0.5) * 3.0, 2.0, 0.0);
    }
    if (surfaceParticle < 0.5 && uTrainActive && abs(uTrainVelX) > 0.5) {
      acceleration += vec3(uTrainVelX * 0.4, 0.0, 0.0);
      thermalIntensity *= (1.0 - uDt * 0.2);
    }

    if (uWindOcclusion) {
      float columnX = particlePosition.x < -6.0 ? -8.0 : (particlePosition.x < -2.0 ? -4.0 : (particlePosition.x < 2.0 ? 0.0 : 4.0));
      vec2 columnOffset = vec2(particlePosition.x - columnX, particlePosition.z + 0.6);
      float columnDistance = length(columnOffset);
      float columnHeightBand = smoothstep(-3.0, -2.6, particlePosition.y) * (1.0 - smoothstep(3.6, 4.0, particlePosition.y));
      float columnOcclusion = (1.0 - smoothstep(0.25, 1.1, columnDistance)) * columnHeightBand;
      acceleration.xz += normalize(columnOffset + vec2(0.0001)) * columnOcclusion * 2.4;
      float platformOcclusion = smoothstep(-4.0, -3.6, particlePosition.y) * (1.0 - smoothstep(-2.85, -2.45, particlePosition.y))
        * (1.0 - smoothstep(0.3, 1.2, abs(particlePosition.z + 0.6)));
      acceleration.z += platformOcclusion * 1.6;
      if (uTrainActive) {
        vec3 trainOffset = particlePosition - vec3(uTrainPosX, -1.8, 2.5);
        float trainOcclusion = (1.0 - smoothstep(0.0, 1.0, max(abs(trainOffset.x) - 8.0, max(abs(trainOffset.y) - 1.7, abs(trainOffset.z) - 1.4))));
        acceleration.yz += normalize(trainOffset.yz + vec2(0.0001)) * trainOcclusion * 2.8;
      }
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
  uniform float uParticleDiameter;
  uniform float uParticleMagnitudeScale;
  attribute vec2 aSimulationUv;
  varying float vThermal;

  void main() {
    vec4 positionData = texture2D(uPositionTex, aSimulationUv);
    vec4 velocityData = texture2D(uVelocityTex, aSimulationUv);
    vThermal = velocityData.w;
    float velocityMagnitude = clamp(length(velocityData.xyz) * 0.12, 0.0, 1.0);
    float diameterScale = 1.0 + vThermal * 0.5 + velocityMagnitude * uParticleMagnitudeScale;
    vec3 worldPosition = positionData.xyz + position * uParticleDiameter * diameterScale;
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

function ParticleField({ settings, trainRef, onTelemetry, onGpuError }) {
  const { gl } = useThree();
  const computeRef = useRef(null);
  const positionVariableRef = useRef(null);
  const velocityVariableRef = useRef(null);
  const settingsRef = useRef(settings);
  const telemetryRef = useRef(onTelemetry);
  const telemetryTimer = useRef(0);
  const telemetryBuffers = useRef({ position: null, velocity: null });
  const meanTemperature = useRef(81.5);
  settingsRef.current = settings;
  telemetryRef.current = onTelemetry;
  const particleCount = settings.particleCount;
  const simulationResolution = Math.ceil(Math.sqrt(particleCount));

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.5, 10, 8);
    geometry.setAttribute('aSimulationUv', new THREE.InstancedBufferAttribute(createSimulationUvs(simulationResolution, particleCount), 2));
    return geometry;
  }, [particleCount, simulationResolution]);
  const particleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uVelocityTex: { value: null },
      uParticleDiameter: { value: INITIALS.particleDiameter },
      uParticleMagnitudeScale: { value: INITIALS.particleMagnitudeScale },
      uCoolColor: { value: new THREE.Color('#3a9bb4') },
      uWarmColor: { value: new THREE.Color('#f0a23a') },
      uHotColor: { value: new THREE.Color('#f45b4f') }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), [particleCount]);

  useEffect(() => {
    let gpuCompute;
    try {
      const initialVerticalLayout = verticalLayoutFromSurfaceY(settingsRef.current.stairSurfaceOpeningHeight);
      const simulation = createGpuParticleField({
        gl,
        resolution: simulationResolution,
        positionShader,
        velocityShader,
        initialize: ({ particleIndex, positionData, velocityData, offset }) => {
          const isSurfaceParticle = particleIndex % SURFACE_PARTICLE_STRIDE === 0;
          positionData[offset] = THREE.MathUtils.lerp(FLUID_BOUNDS.minX, FLUID_BOUNDS.maxX, Math.random());
          positionData[offset + 1] = isSurfaceParticle
            ? surfaceParticleSeedY(particleIndex, particleCount, initialVerticalLayout.streetY)
            : THREE.MathUtils.lerp(PARTICLE_SEED_BOUNDS.minY, PARTICLE_SEED_BOUNDS.maxY, Math.random());
          positionData[offset + 2] = THREE.MathUtils.lerp(FLUID_BOUNDS.minZ, FLUID_BOUNDS.maxZ, Math.random());
          positionData[offset + 3] = isSurfaceParticle
            ? 2 + surfaceParticleSeedFraction(particleIndex, particleCount) * 0.999
            : 1;
          velocityData[offset] = 0;
          velocityData[offset + 1] = 0;
          velocityData[offset + 2] = 0;
          velocityData[offset + 3] = 0;
        }
      });
      gpuCompute = simulation.gpuCompute;
      const { positionVariable, velocityVariable } = simulation;
      positionVariable.material.uniforms.uDt = { value: 0.016 };
      positionVariable.material.uniforms.uRoofPitch = { value: THREE.MathUtils.degToRad(INITIALS.roofPitch) };
      positionVariable.material.uniforms.uRoofOffset = { value: INITIALS.roofOffset };
      positionVariable.material.uniforms.uRoofGapHorizontal = { value: INITIALS.roofGapHorizontal };
      positionVariable.material.uniforms.uRoofGapVertical = { value: INITIALS.roofGapVertical };
      positionVariable.material.uniforms.uStairTunnelHeight = { value: INITIALS.stairUndergroundOpeningHeight };
      positionVariable.material.uniforms.uStairLandingY = { value: INITIALS.stairLandingHeight };
      positionVariable.material.uniforms.uStairSurfaceY = { value: INITIALS.stairSurfaceOpeningHeight };
      positionVariable.material.uniforms.uStreetY = { value: verticalLayoutFromSurfaceY(INITIALS.stairSurfaceOpeningHeight).streetY };
      positionVariable.material.uniforms.uSurfaceFloorY = { value: verticalLayoutFromSurfaceY(INITIALS.stairSurfaceOpeningHeight).surfaceParticleFloorY };
      positionVariable.material.uniforms.uClerestoryOpen = { value: INITIALS.clerestoryOpen };
      positionVariable.material.uniforms.uClerestoryWindows = { value: INITIALS.clerestoryWindows };
      positionVariable.material.uniforms.uFloodTunnels = { value: INITIALS.floodTunnels };
      velocityVariable.material.uniforms.uDt = { value: 0.016 };
      velocityVariable.material.uniforms.uSurfaceTemperature = { value: INITIALS.surfaceTemperature };
      velocityVariable.material.uniforms.uRoadSurfaceTemperature = { value: INITIALS.roadSurfaceTemperature };
      velocityVariable.material.uniforms.uAmbientAirTemperature = { value: INITIALS.ambientAirTemperature };
      velocityVariable.material.uniforms.uPassengerHeat = { value: INITIALS.passengerHeat };
      velocityVariable.material.uniforms.uSurfaceCrosswind = { value: INITIALS.surfaceCrosswind };
      velocityVariable.material.uniforms.uRadius = { value: 0.85 };
      velocityVariable.material.uniforms.uRestDensity = { value: INITIALS.density };
      velocityVariable.material.uniforms.uStiffness = { value: INITIALS.stiffness };
      velocityVariable.material.uniforms.uViscosity = { value: INITIALS.viscosity };
      velocityVariable.material.uniforms.uTrainPosX = { value: 0 };
      velocityVariable.material.uniforms.uTrainVelX = { value: 0 };
      velocityVariable.material.uniforms.uShaftExchange = { value: INITIALS.shaftExchange };
      velocityVariable.material.uniforms.uShaftControls = { value: new THREE.Vector3(...INITIALS.shaftControls) };
      velocityVariable.material.uniforms.uShaftFanVelocity = { value: INITIALS.shaftFanVelocity };
      velocityVariable.material.uniforms.uDownFans = { value: INITIALS.downFans };
      velocityVariable.material.uniforms.uFloorAirMovers = { value: INITIALS.floorAirMovers };
      velocityVariable.material.uniforms.uCeilingFans = { value: INITIALS.ceilingFans };
      velocityVariable.material.uniforms.uGrooves = { value: INITIALS.grooves };
      velocityVariable.material.uniforms.uFloodFlow = { value: INITIALS.floodFlow };
      velocityVariable.material.uniforms.uFloodPumpDirection = { value: INITIALS.floodPumpDirection };
      velocityVariable.material.uniforms.uRoofPitch = { value: THREE.MathUtils.degToRad(INITIALS.roofPitch) };
      velocityVariable.material.uniforms.uRoofOffset = { value: INITIALS.roofOffset };
      velocityVariable.material.uniforms.uRoofGapHorizontal = { value: INITIALS.roofGapHorizontal };
      velocityVariable.material.uniforms.uRoofGapVertical = { value: INITIALS.roofGapVertical };
      velocityVariable.material.uniforms.uClerestoryOpen = { value: INITIALS.clerestoryOpen };
      velocityVariable.material.uniforms.uClerestoryWindows = { value: INITIALS.clerestoryWindows };
      velocityVariable.material.uniforms.uStackEffect = { value: INITIALS.stackEffect };
      velocityVariable.material.uniforms.uStairTunnelHeight = { value: INITIALS.stairUndergroundOpeningHeight };
      velocityVariable.material.uniforms.uStairLandingY = { value: INITIALS.stairLandingHeight };
      velocityVariable.material.uniforms.uStairSurfaceY = { value: INITIALS.stairSurfaceOpeningHeight };
      velocityVariable.material.uniforms.uStreetY = { value: verticalLayoutFromSurfaceY(INITIALS.stairSurfaceOpeningHeight).streetY };
      velocityVariable.material.uniforms.uStreetMaxY = { value: verticalLayoutFromSurfaceY(INITIALS.stairSurfaceOpeningHeight).streetMaxY };
      velocityVariable.material.uniforms.uSurfaceFloorY = { value: verticalLayoutFromSurfaceY(INITIALS.stairSurfaceOpeningHeight).surfaceParticleFloorY };
      velocityVariable.material.uniforms.uShaftOutletY = { value: verticalLayoutFromSurfaceY(INITIALS.stairSurfaceOpeningHeight).shaftOutletY };
      velocityVariable.material.uniforms.uTrainActive = { value: true };
      velocityVariable.material.uniforms.uShaftFans = { value: INITIALS.shaftFans };
      velocityVariable.material.uniforms.uAcActive = { value: true };
      velocityVariable.material.uniforms.uBrakesActive = { value: true };
      velocityVariable.material.uniforms.uFloodTunnels = { value: true };
      velocityVariable.material.uniforms.uWindOcclusion = { value: INITIALS.windOcclusion };

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

  useFrame((state, delta) => {
    const compute = computeRef.current;
    const positionVariable = positionVariableRef.current;
    const velocityVariable = velocityVariableRef.current;
    if (!compute || !positionVariable || !velocityVariable) return;

    const frameDelta = Math.min(delta, 0.033);
    const currentSettings = settingsRef.current;
    const currentVerticalLayout = verticalLayoutFromSurfaceY(currentSettings.stairSurfaceOpeningHeight);
    const trainState = trainStateAtTime(
      state.clock.elapsedTime,
      currentSettings.trainInterval,
      currentSettings.train,
      currentSettings.trainStopFrequency,
      currentSettings.trainStopDuration
    );
    if (trainRef.current) {
      trainRef.current.position.x = trainState.positionX;
      trainRef.current.visible = trainState.active;
    }

    positionVariable.material.uniforms.uDt.value = frameDelta;
    positionVariable.material.uniforms.uRoofPitch.value = THREE.MathUtils.degToRad(currentSettings.roofPitch);
    positionVariable.material.uniforms.uRoofOffset.value = currentSettings.roofOffset;
    positionVariable.material.uniforms.uRoofGapHorizontal.value = currentSettings.roofGapHorizontal;
    positionVariable.material.uniforms.uRoofGapVertical.value = currentSettings.roofGapVertical;
    positionVariable.material.uniforms.uStairTunnelHeight.value = currentSettings.stairUndergroundOpeningHeight;
    positionVariable.material.uniforms.uStairLandingY.value = currentSettings.stairLandingHeight;
    positionVariable.material.uniforms.uStairSurfaceY.value = currentSettings.stairSurfaceOpeningHeight;
    positionVariable.material.uniforms.uStreetY.value = currentVerticalLayout.streetY;
    positionVariable.material.uniforms.uSurfaceFloorY.value = currentVerticalLayout.surfaceParticleFloorY;
    positionVariable.material.uniforms.uClerestoryOpen.value = currentSettings.clerestoryOpen;
    positionVariable.material.uniforms.uClerestoryWindows.value = currentSettings.clerestoryWindows;
    positionVariable.material.uniforms.uFloodTunnels.value = currentSettings.floodTunnels;
    velocityVariable.material.uniforms.uDt.value = frameDelta;
    velocityVariable.material.uniforms.uSurfaceTemperature.value = currentSettings.surfaceTemperature;
    velocityVariable.material.uniforms.uRoadSurfaceTemperature.value = currentSettings.roadSurfaceTemperature;
    velocityVariable.material.uniforms.uAmbientAirTemperature.value = currentSettings.ambientAirTemperature;
    velocityVariable.material.uniforms.uPassengerHeat.value = currentSettings.passengerHeat;
    velocityVariable.material.uniforms.uSurfaceCrosswind.value = currentSettings.surfaceCrosswind;
    velocityVariable.material.uniforms.uRestDensity.value = currentSettings.density;
    velocityVariable.material.uniforms.uStiffness.value = currentSettings.stiffness;
    velocityVariable.material.uniforms.uViscosity.value = currentSettings.viscosity;
    velocityVariable.material.uniforms.uTrainPosX.value = trainState.positionX;
    velocityVariable.material.uniforms.uTrainVelX.value = trainState.velocityX;
    velocityVariable.material.uniforms.uShaftExchange.value = currentSettings.shaftExchange;
    velocityVariable.material.uniforms.uShaftControls.value.fromArray(currentSettings.shaftControls);
    velocityVariable.material.uniforms.uShaftFanVelocity.value = currentSettings.shaftFanVelocity;
    velocityVariable.material.uniforms.uDownFans.value = currentSettings.downFans;
    velocityVariable.material.uniforms.uFloorAirMovers.value = currentSettings.floorAirMovers;
    velocityVariable.material.uniforms.uCeilingFans.value = currentSettings.ceilingFans;
    velocityVariable.material.uniforms.uGrooves.value = currentSettings.grooves;
    velocityVariable.material.uniforms.uFloodFlow.value = currentSettings.floodFlow;
    velocityVariable.material.uniforms.uFloodPumpDirection.value = currentSettings.floodPumpDirection;
    velocityVariable.material.uniforms.uRoofPitch.value = THREE.MathUtils.degToRad(currentSettings.roofPitch);
    velocityVariable.material.uniforms.uRoofOffset.value = currentSettings.roofOffset;
    velocityVariable.material.uniforms.uRoofGapHorizontal.value = currentSettings.roofGapHorizontal;
    velocityVariable.material.uniforms.uRoofGapVertical.value = currentSettings.roofGapVertical;
    velocityVariable.material.uniforms.uClerestoryOpen.value = currentSettings.clerestoryOpen;
    velocityVariable.material.uniforms.uClerestoryWindows.value = currentSettings.clerestoryWindows;
    velocityVariable.material.uniforms.uStackEffect.value = currentSettings.stackEffect;
    velocityVariable.material.uniforms.uStairTunnelHeight.value = currentSettings.stairUndergroundOpeningHeight;
    velocityVariable.material.uniforms.uStairLandingY.value = currentSettings.stairLandingHeight;
    velocityVariable.material.uniforms.uStairSurfaceY.value = currentSettings.stairSurfaceOpeningHeight;
    velocityVariable.material.uniforms.uStreetY.value = currentVerticalLayout.streetY;
    velocityVariable.material.uniforms.uStreetMaxY.value = currentVerticalLayout.streetMaxY;
    velocityVariable.material.uniforms.uSurfaceFloorY.value = currentVerticalLayout.surfaceParticleFloorY;
    velocityVariable.material.uniforms.uShaftOutletY.value = currentVerticalLayout.shaftOutletY;
    velocityVariable.material.uniforms.uTrainActive.value = trainState.active;
    velocityVariable.material.uniforms.uShaftFans.value = currentSettings.shaftFans;
    velocityVariable.material.uniforms.uAcActive.value = currentSettings.ac && trainState.active;
    velocityVariable.material.uniforms.uBrakesActive.value = currentSettings.brakes && trainState.active;
    velocityVariable.material.uniforms.uFloodTunnels.value = currentSettings.floodTunnels;
    velocityVariable.material.uniforms.uWindOcclusion.value = currentSettings.windOcclusion;
    compute.compute();
    const positionTarget = compute.getCurrentRenderTarget(positionVariable);
    const velocityTarget = compute.getCurrentRenderTarget(velocityVariable);
    particleMaterial.uniforms.uPositionTex.value = positionTarget.texture;
    particleMaterial.uniforms.uVelocityTex.value = velocityTarget.texture;
    particleMaterial.uniforms.uParticleDiameter.value = currentSettings.particleDiameter;
    particleMaterial.uniforms.uParticleMagnitudeScale.value = currentSettings.particleMagnitudeScale;

    telemetryTimer.current += frameDelta;
    if (telemetryTimer.current > 0.4) {
      let targetTemperature = currentSettings.ambientAirTemperature;
      targetTemperature += (currentSettings.roadSurfaceTemperature - currentSettings.ambientAirTemperature) * 0.22;
      targetTemperature += currentSettings.passengerHeat * 1.4;
      if (currentSettings.ac) targetTemperature += 4.5;
      if (currentSettings.brakes && trainState.active && Math.abs(trainState.positionX) < 2) targetTemperature += 3.2;
      if (trainState.active) targetTemperature -= 2;
      meanTemperature.current += (targetTemperature - meanTemperature.current) * 0.05 + (Math.random() - 0.5) * 0.35;
      const sampleLength = simulationResolution * simulationResolution * 4;
      if (telemetryBuffers.current.position?.length !== sampleLength) {
        telemetryBuffers.current = {
          position: new Float32Array(sampleLength),
          velocity: new Float32Array(sampleLength)
        };
      }
      gl.readRenderTargetPixels(positionTarget, 0, 0, simulationResolution, simulationResolution, telemetryBuffers.current.position);
      gl.readRenderTargetPixels(velocityTarget, 0, 0, simulationResolution, simulationResolution, telemetryBuffers.current.velocity);
      telemetryRef.current({
        temperature: meanTemperature.current,
        shafts: measureShaftEndpoints(
          telemetryBuffers.current.position,
          telemetryBuffers.current.velocity,
          particleCount,
          currentVerticalLayout.streetY
        )
      });
      telemetryTimer.current = 0;
    }
  });

  return <instancedMesh args={[particleGeometry, particleMaterial, particleCount]} frustumCulled={false} />;
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
      {[1.06, 3.94].map((sideZ) => (
        <group key={sideZ}>
          {[-6.2, -1.7, 1.7, 6.2].map((windowX) => (
            <mesh key={windowX} position={[windowX, -1.5, sideZ]}>
              <boxGeometry args={[1.55, 1.1, 0.05]} />
              <meshStandardMaterial color="#17333a" metalness={0.4} roughness={0.18} emissive="#0d6872" emissiveIntensity={0.35} />
            </mesh>
          ))}
          {[-4, 4].map((doorX) => (
            <group key={doorX} position={[doorX, -1.8, sideZ]}>
              {[-0.59, 0.59].map((panelX) => (
                <group key={panelX} position={[panelX, 0, 0]}>
                  <mesh>
                    <boxGeometry args={[1.14, 2.75, 0.06]} />
                    <meshStandardMaterial color="#8fa3a2" metalness={0.75} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0.55, sideZ < 2.5 ? -0.04 : 0.04]}>
                    <boxGeometry args={[0.78, 0.88, 0.035]} />
                    <meshStandardMaterial color="#17333a" metalness={0.4} roughness={0.18} emissive="#0d6872" emissiveIntensity={0.3} />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, 0, sideZ < 2.5 ? -0.04 : 0.04]}>
                <boxGeometry args={[0.045, 2.75, 0.035]} />
                <meshStandardMaterial color="#263638" metalness={0.55} roughness={0.4} />
              </mesh>
            </group>
          ))}
        </group>
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
  const shaftFanRefs = useRef([]);
  const roofPitchRadians = THREE.MathUtils.degToRad(settings.roofPitch);
  const roofRidgeZ = settings.roofOffset;
  const roofRidgeY = 4 + Math.tan(roofPitchRadians) * 2.3;
  const roofGapHorizontal = Math.max(0, settings.roofGapHorizontal);
  const roofGapVertical = Math.max(0.05, settings.roofGapVertical);
  const { streetY } = verticalLayoutFromSurfaceY(settings.stairSurfaceOpeningHeight);
  const { leftEndZ: leftRoofEndZ, rightStartZ: rightRoofStartZ } = roofGapEndpoints(roofRidgeZ, roofGapHorizontal);
  const roofSegments = [
    ...roofPanelSegments(-11, 11, -4.6, leftRoofEndZ),
    ...roofPanelSegments(-11, 11, rightRoofStartZ, 4.6)
  ].map((segment) => {
    const startY = roofCeilingAt(segment.startZ, settings.roofPitch, roofRidgeZ, roofGapVertical);
    const endY = roofCeilingAt(segment.endZ, settings.roofPitch, roofRidgeZ, roofGapVertical);
    return {
      ...segment,
      centerX: (segment.startX + segment.endX) / 2,
      centerY: (startY + endY) / 2,
      centerZ: (segment.startZ + segment.endZ) / 2,
      length: Math.hypot(segment.endZ - segment.startZ, endY - startY),
      rotation: Math.atan2(-(endY - startY), segment.endZ - segment.startZ)
    };
  });
  const clerestorySpan = Math.hypot(roofGapHorizontal, roofGapVertical);
  const clerestoryBridgeAngle = -Math.atan2(roofGapVertical, roofGapHorizontal);

  useFrame((_, delta) => {
    ceilingFanRefs.current.forEach((fan) => {
      if (fan) fan.rotation.x += delta * (2 + settings.ceilingFans * 5);
    });
    floorFanRefs.current.forEach((fan) => {
      if (fan) fan.rotation.x += delta * (1.5 + settings.floorAirMovers * 6);
    });
    shaftFanRefs.current.forEach((fan, index) => {
      if (fan && settings.shaftFans) fan.rotation.y += delta * settings.shaftFanVelocity * settings.shaftControls[index] * 5;
    });
  });

  return (
    <group>
      <group>
        {SHAFT_POSITIONS.map((shaftX, index) => (
          <group key={shaftX} position={[shaftX, 0, -1.4]}>
            <mesh position={[0, (SHAFT_ROUTE.throatY + streetY) / 2, 0]}>
              <boxGeometry args={[1.25, streetY - SHAFT_ROUTE.throatY, 1.25]} />
              <meshStandardMaterial color="#708b82" metalness={0.45} roughness={0.55} transparent opacity={0.18} depthWrite={false} />
            </mesh>
            <mesh position={[0, streetY, 0]}>
              <boxGeometry args={[1.5, 0.12, 1.5]} />
              <meshStandardMaterial color="#d5b75e" metalness={0.7} roughness={0.3} transparent opacity={0.65} />
            </mesh>
            {[-0.48, -0.24, 0, 0.24, 0.48].map((ventZ) => (
              <mesh key={ventZ} position={[0, streetY + 0.08, ventZ]}>
                <boxGeometry args={[1.2, 0.06, 0.1]} />
                <meshStandardMaterial color="#203b3d" metalness={0.78} roughness={0.28} />
              </mesh>
            ))}
            <mesh position={[0, SHAFT_ROUTE.throatY, 0]}>
              <boxGeometry args={[1.05, 0.08, 1.05]} />
              <meshStandardMaterial color="#1d3536" metalness={0.35} roughness={0.45} />
            </mesh>
            <group ref={(element) => { shaftFanRefs.current[index] = element; }} position={[0, SHAFT_ROUTE.throatY + 0.14, 0]}>
              <mesh>
                <cylinderGeometry args={[0.46, 0.46, 0.08, 16]} />
                <meshStandardMaterial color={settings.shaftFans ? '#63b6b1' : '#49615e'} metalness={0.55} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0.06, 0]}>
                <boxGeometry args={[0.86, 0.035, 0.08]} />
                <meshBasicMaterial color={settings.shaftFans ? '#bce8d5' : '#708b82'} />
              </mesh>
              <mesh position={[0, 0.06, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[0.86, 0.035, 0.08]} />
                <meshBasicMaterial color={settings.shaftFans ? '#bce8d5' : '#708b82'} />
              </mesh>
            </group>
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
        {roofSegments.map((segment) => (
          <mesh
            key={`${segment.startX}:${segment.endX}:${segment.startZ}:${segment.endZ}`}
            position={[segment.centerX, segment.centerY, segment.centerZ]}
            rotation={[segment.rotation, 0, 0]}
            receiveShadow
          >
            <boxGeometry args={[segment.endX - segment.startX, 0.22, Math.max(0.2, segment.length)]} />
            <meshStandardMaterial color="#607974" roughness={0.78} metalness={0.18} />
          </mesh>
        ))}
        <group visible={settings.clerestoryWindows} position={[0, roofRidgeY + roofGapVertical / 2, roofRidgeZ]}>
          {Array.from({ length: 10 }, (_, windowIndex) => (
            <mesh key={windowIndex} position={[-9 + windowIndex * 2, 0, 0]} rotation={[clerestoryBridgeAngle, 0, 0]}>
              <boxGeometry args={[1.7, 0.08, clerestorySpan]} />
              <meshStandardMaterial color="#9bdfe1" emissive="#2f8e83" emissiveIntensity={0.2 + settings.clerestoryOpen * 0.7} transparent opacity={0.18 + settings.clerestoryOpen * 0.42} metalness={0.18} roughness={0.25} />
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

function createStairProfileBandGeometry(sections, lowerOffset, upperOffset, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(sections[0].startX, sections[0].startY + lowerOffset);
  sections.forEach((section) => shape.lineTo(section.endX, section.endY + lowerOffset));
  shape.lineTo(sections.at(-1).endX, sections.at(-1).endY + upperOffset);
  [...sections].reverse().forEach((section) => shape.lineTo(section.startX, section.startY + upperOffset));
  shape.closePath();
  const geometry = depth == null
    ? new THREE.ShapeGeometry(shape)
    : new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  if (depth != null) geometry.translate(0, 0, STAIR_ROUTE.z - depth / 2);
  return geometry;
}

function createUnderfillGeometry(sections, baseY) {
  const shape = new THREE.Shape();
  shape.moveTo(sections[0].startX, baseY);
  shape.lineTo(sections.at(-1).endX, baseY);
  shape.lineTo(sections.at(-1).endX, sections.at(-1).endY - 0.2);
  [...sections].reverse().forEach((section) => shape.lineTo(section.startX, section.startY - 0.2));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: STAIR_ROUTE.width, bevelEnabled: false });
  geometry.translate(0, 0, STAIR_ROUTE.z - STAIR_ROUTE.width / 2);
  return geometry;
}

function createStairOuterGroundGeometry(tunnelHeight, landingY, surfaceY) {
  const shape = new THREE.Shape();
  shape.moveTo(STAIR_ROUTE.landingStartX, STAIR_ROUTE.baseY);
  shape.lineTo(STAIR_ROUTE.endX, STAIR_ROUTE.baseY);
  shape.lineTo(STAIR_ROUTE.endX, surfaceY + tunnelHeight);
  shape.lineTo(STAIR_ROUTE.upperFlightStartX, landingY + tunnelHeight);
  shape.lineTo(STAIR_ROUTE.lowerFlightEndX, landingY + tunnelHeight);
  shape.lineTo(STAIR_ROUTE.startX, STAIR_ROUTE.baseY + tunnelHeight);
  shape.lineTo(STAIR_ROUTE.landingStartX, STAIR_ROUTE.baseY + tunnelHeight);
  shape.closePath();
  const depth = GROUND_LAYOUT.stairOuterZ - FLUID_BOUNDS.minZ;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, FLUID_BOUNDS.minZ);
  return geometry;
}

function PermanentGround({ tunnelHeight, landingY, surfaceY }) {
  const trackLength = TRACK_ROUTE.maxX - TRACK_ROUTE.minX;
  const trackCenterX = (TRACK_ROUTE.minX + TRACK_ROUTE.maxX) / 2;
  const trackGroundHeight = TRACK_ROUTE.bedY - 0.2 - FLUID_BOUNDS.minY;
  const stairLength = STAIR_ROUTE.endX - STAIR_ROUTE.landingStartX;
  const stairCenterX = (STAIR_ROUTE.endX + STAIR_ROUTE.landingStartX) / 2;
  const stairGroundHeight = STAIR_ROUTE.baseY - 0.2 - FLUID_BOUNDS.minY;
  const outerGroundGeometry = useMemo(
    () => createStairOuterGroundGeometry(tunnelHeight, landingY, surfaceY),
    [tunnelHeight, landingY, surfaceY]
  );
  useEffect(() => () => outerGroundGeometry.dispose(), [outerGroundGeometry]);
  return (
    <group>
      <mesh position={[trackCenterX, FLUID_BOUNDS.minY + trackGroundHeight / 2, TRACK_ROUTE.centerZ]} receiveShadow>
        <boxGeometry args={[trackLength, trackGroundHeight, TRACK_ROUTE.tunnelWidth]} />
        <meshStandardMaterial color="#33403f" roughness={0.98} />
      </mesh>
      <mesh position={[stairCenterX, FLUID_BOUNDS.minY + stairGroundHeight / 2, STAIR_ROUTE.z]} receiveShadow>
        <boxGeometry args={[stairLength, stairGroundHeight, STAIR_ROUTE.width]} />
        <meshStandardMaterial color="#46514e" roughness={0.98} />
      </mesh>
      <mesh geometry={outerGroundGeometry} receiveShadow>
        <meshStandardMaterial color="#596763" transparent opacity={0.09} depthWrite={false} side={THREE.DoubleSide} roughness={0.95} />
      </mesh>
    </group>
  );
}

function StairRouteEnclosure({ tunnelHeight, landingY, surfaceY }) {
  const landingLength = STAIR_ROUTE.startX - STAIR_ROUTE.landingStartX;
  const landingCenterX = (STAIR_ROUTE.landingStartX + STAIR_ROUTE.startX) / 2;
  const sections = [
    { id: 'lower', startX: STAIR_ROUTE.startX, endX: STAIR_ROUTE.lowerFlightEndX, startY: STAIR_ROUTE.baseY, endY: landingY },
    { id: 'landing', startX: STAIR_ROUTE.lowerFlightEndX, endX: STAIR_ROUTE.upperFlightStartX, startY: landingY, endY: landingY },
    { id: 'upper', startX: STAIR_ROUTE.upperFlightStartX, endX: STAIR_ROUTE.endX, startY: landingY, endY: surfaceY }
  ].map((section) => ({
    ...section,
    centerX: (section.startX + section.endX) / 2,
    centerY: (section.startY + section.endY) / 2,
    length: Math.hypot(section.endX - section.startX, section.endY - section.startY),
    angle: Math.atan2(section.endY - section.startY, section.endX - section.startX)
  }));
  const enclosureGeometries = useMemo(
    () => ({
      underfill: createUnderfillGeometry(sections, STAIR_ROUTE.baseY - 0.2),
      wall: createStairProfileBandGeometry(sections, 0, tunnelHeight),
      ceiling: createStairProfileBandGeometry(sections, tunnelHeight - 0.04, tunnelHeight + 0.04, STAIR_ROUTE.width)
    }),
    [landingY, surfaceY, tunnelHeight]
  );
  useEffect(() => () => Object.values(enclosureGeometries).forEach((geometry) => geometry.dispose()), [enclosureGeometries]);
  const stairMaterial = {
    color: '#9bd1c1',
    emissive: '#2f8e83',
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide
  };
  return (
    <group>
      <mesh geometry={enclosureGeometries.underfill} receiveShadow>
        <meshStandardMaterial color="#596763" transparent opacity={0.09} depthWrite={false} side={THREE.DoubleSide} roughness={0.95} />
      </mesh>
      <mesh position={[landingCenterX, STAIR_ROUTE.baseY + tunnelHeight, STAIR_ROUTE.z]}>
        <boxGeometry args={[landingLength, 0.08, STAIR_ROUTE.width]} />
        <meshStandardMaterial {...stairMaterial} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`entry-${side}`} position={[landingCenterX, STAIR_ROUTE.baseY + tunnelHeight / 2, STAIR_ROUTE.z + side * STAIR_ROUTE.width / 2]}>
          <boxGeometry args={[landingLength, tunnelHeight, 0.08]} />
          <meshStandardMaterial {...stairMaterial} />
        </mesh>
      ))}
      <mesh geometry={enclosureGeometries.ceiling}>
        <meshStandardMaterial {...stairMaterial} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={enclosureGeometries.wall} position={[0, 0, STAIR_ROUTE.z + side * STAIR_ROUTE.width / 2]}>
          <meshStandardMaterial {...stairMaterial} />
        </mesh>
      ))}
    </group>
  );
}

function TicketTurnstiles() {
  return (
    <group>
      {TURNSTILE_ROUTE.pedestalZ.map((pedestalZ) => (
        <group key={pedestalZ} position={[TURNSTILE_ROUTE.x, STAIR_ROUTE.baseY, pedestalZ]}>
          <mesh position={[0, TURNSTILE_ROUTE.pedestalHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[TURNSTILE_ROUTE.halfDepth * 2, TURNSTILE_ROUTE.pedestalHeight, TURNSTILE_ROUTE.pedestalHalfWidth * 2]} />
            <meshStandardMaterial color="#324b50" metalness={0.72} roughness={0.3} />
          </mesh>
          <mesh position={[0, TURNSTILE_ROUTE.pedestalHeight + 0.05, 0]}>
            <boxGeometry args={[0.48, 0.12, 0.32]} />
            <meshStandardMaterial color="#79c9bb" emissive="#1d706b" emissiveIntensity={0.45} metalness={0.45} roughness={0.28} />
          </mesh>
          <group position={[0.28, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
            {[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle) => (
              <mesh key={angle} position={[Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0]} rotation={[0, 0, angle]}>
                <boxGeometry args={[0.62, 0.055, 0.055]} />
                <meshStandardMaterial color="#c8d5cf" metalness={0.9} roughness={0.18} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

function SurfaceStreet({ tunnelHeight, landingY, surfaceY }) {
  const { streetY } = verticalLayoutFromSurfaceY(surfaceY);
  const streetLength = STREET_VOLUME.maxX - STREET_VOLUME.minX;
  const streetCenterX = (STREET_VOLUME.minX + STREET_VOLUME.maxX) / 2;
  const sidewalkEndX = stairStreetPortalX(landingY, surfaceY, tunnelHeight);
  const sidewalkSegments = roofPanelSegments(
    STREET_VOLUME.minX,
    sidewalkEndX,
    STREET_VOLUME.minZ,
    STREET_LAYOUT.sidewalkRoadEdgeZ,
    SHAFT_POSITIONS,
    SHAFT_ROUTE.z,
    STREET_LAYOUT.shaftApertureSize
  );
  const roadStartZ = STREET_LAYOUT.sidewalkRoadEdgeZ;
  const roadWidth = STREET_VOLUME.maxZ - roadStartZ;
  const roadCenterZ = (roadStartZ + STREET_VOLUME.maxZ) / 2;
  const insulationBottomY = 4.8;
  const insulationHeight = streetY - insulationBottomY;
  const insulationSegments = roofPanelSegments(
    -11,
    9,
    STREET_VOLUME.minZ,
    STREET_VOLUME.maxZ
  );

  return (
    <group>
      {insulationSegments.map((segment) => (
        <mesh
          key={`insulation:${segment.startX}:${segment.endX}:${segment.startZ}:${segment.endZ}`}
          position={[
            (segment.startX + segment.endX) / 2,
            insulationBottomY + insulationHeight / 2,
            (segment.startZ + segment.endZ) / 2
          ]}
        >
          <boxGeometry args={[segment.endX - segment.startX, insulationHeight, segment.endZ - segment.startZ]} />
          <meshStandardMaterial color="#596763" transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[streetCenterX, streetY - 0.09, roadCenterZ]} receiveShadow>
        <boxGeometry args={[streetLength, 0.18, roadWidth]} />
        <meshStandardMaterial color="#273238" roughness={0.96} metalness={0.02} />
      </mesh>
      {sidewalkSegments.map((segment) => (
        <mesh
          key={`${segment.startX}:${segment.endX}:${segment.startZ}:${segment.endZ}`}
          position={[
            (segment.startX + segment.endX) / 2,
            streetY,
            (segment.startZ + segment.endZ) / 2
          ]}
          receiveShadow
        >
          <boxGeometry args={[segment.endX - segment.startX, 0.2, segment.endZ - segment.startZ]} />
          <meshStandardMaterial color="#7d8582" roughness={0.88} metalness={0.04} />
        </mesh>
      ))}
      <mesh position={[streetCenterX, streetY + 0.08, roadStartZ + 0.07]}>
        <boxGeometry args={[streetLength, 0.24, 0.14]} />
        <meshStandardMaterial color="#c4c8bd" roughness={0.78} />
      </mesh>
      {[0, 4.2].map((lineZ) => (
        <mesh key={lineZ} position={[streetCenterX, streetY + 0.015, lineZ]}>
          <boxGeometry args={[streetLength - 1, 0.025, 0.1]} />
          <meshBasicMaterial color="#eef0df" />
        </mesh>
      ))}
      {Array.from({ length: 14 }, (_, markingIndex) => (
        <mesh key={markingIndex} position={[STREET_VOLUME.minX + 2 + markingIndex * 3.4, streetY + 0.02, 1.8]}>
          <boxGeometry args={[1.8, 0.03, 0.12]} />
          <meshBasicMaterial color="#e8b941" />
        </mesh>
      ))}
    </group>
  );
}

function FloodControlTunnels({ enabled, flow, pumpDirection }) {
  const tracerRefs = useRef([]);
  const waterfallRefs = useRef([]);
  const galleryLength = FLOOD_GALLERY.maxX - FLOOD_GALLERY.minX;
  const galleryCenterX = (FLOOD_GALLERY.minX + FLOOD_GALLERY.maxX) / 2;
  useFrame((_, delta) => {
    if (!enabled || flow <= 0) return;
    tracerRefs.current.forEach((tracer) => {
      if (!tracer) return;
      tracer.position.x += delta * pumpDirection * (1.5 + flow * 5);
      if (tracer.position.x > FLOOD_GALLERY.maxX) tracer.position.x = FLOOD_GALLERY.minX;
      if (tracer.position.x < FLOOD_GALLERY.minX) tracer.position.x = FLOOD_GALLERY.maxX;
    });
    waterfallRefs.current.forEach((drop) => {
      if (!drop) return;
      drop.position.y -= delta * (1.5 + flow * 4);
      if (drop.position.y < FLOOD_WATERFALL.bottomY) drop.position.y = FLOOD_WATERFALL.topY;
    });
  });

  return (
    <group visible={enabled}>
      <mesh position={[galleryCenterX, FLOOD_GALLERY.y, FLOOD_GALLERY.z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[FLOOD_GALLERY.radius, FLOOD_GALLERY.radius, galleryLength, 24, 1, true]} />
        <meshStandardMaterial color="#15383e" side={THREE.BackSide} roughness={0.9} metalness={0.1} transparent opacity={0.82} />
      </mesh>
      <mesh position={[galleryCenterX, -6.08, FLOOD_GALLERY.z]}>
        <boxGeometry args={[galleryLength - 0.5, 0.05, 1.6]} />
        <meshStandardMaterial color="#21727a" emissive="#0c4249" emissiveIntensity={0.35 + flow * 0.45} roughness={0.25} metalness={0.12} />
      </mesh>
      {[FLOOD_GALLERY.minX, FLOOD_GALLERY.maxX].map((tunnelX) => (
        <mesh key={tunnelX} position={[tunnelX, -5.0, -4.15]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[1.25, 0.1, 12, 28]} />
          <meshStandardMaterial color="#d5b75e" metalness={0.7} roughness={0.34} />
        </mesh>
      ))}
      <mesh position={[galleryCenterX, -5.72, FLOOD_GALLERY.z]} rotation={[0, pumpDirection < 0 ? Math.PI : 0, 0]}>
        <boxGeometry args={[4.5, 0.08, 0.1]} />
        <meshBasicMaterial color="#9bd1aa" />
      </mesh>
      <group visible={flow > 0}>
        {Array.from({ length: 18 }, (_, tracerIndex) => (
          <mesh key={tracerIndex} ref={(element) => { tracerRefs.current[tracerIndex] = element; }} position={[FLOOD_GALLERY.minX + (tracerIndex + 0.5) * galleryLength / 18, -5.35, FLOOD_GALLERY.z]}>
            <sphereGeometry args={[0.09 + flow * 0.06, 8, 6]} />
            <meshBasicMaterial color="#77e6e8" transparent opacity={0.45 + flow * 0.5} />
          </mesh>
        ))}
      </group>
      <pointLight color="#48cbd1" intensity={0.4 + flow * 1.4} distance={7} position={[0, -5.2, -4.15]} />
      <group visible={flow > 0}>
        <mesh position={[FLOOD_WATERFALL.x, (FLOOD_WATERFALL.topY + FLOOD_WATERFALL.bottomY) / 2, FLOOD_WATERFALL.z]}>
          <boxGeometry args={[1.35, FLOOD_WATERFALL.topY - FLOOD_WATERFALL.bottomY, 0.06]} />
          <meshStandardMaterial color="#68d9e1" emissive="#167782" emissiveIntensity={0.7 + flow} transparent opacity={0.12 + flow * 0.28} roughness={0.18} />
        </mesh>
        {Array.from({ length: 12 }, (_, dropIndex) => (
          <mesh key={dropIndex} ref={(element) => { waterfallRefs.current[dropIndex] = element; }} position={[FLOOD_WATERFALL.x - 0.55 + (dropIndex % 4) * 0.36, FLOOD_WATERFALL.topY - (dropIndex % 6) * 0.45, FLOOD_WATERFALL.z + 0.04]}>
            <sphereGeometry args={[0.07 + flow * 0.04, 7, 5]} />
            <meshBasicMaterial color="#a4f4f0" transparent opacity={0.55 + flow * 0.4} />
          </mesh>
        ))}
        <pointLight color="#55dce2" intensity={0.5 + flow * 1.8} distance={6} position={[FLOOD_WATERFALL.x, -4, FLOOD_WATERFALL.z]} />
      </group>
    </group>
  );
}

function StationArchitecture({ landingY, surfaceY }) {
  const concreteMaterial = <meshStandardMaterial color="#52646a" roughness={0.88} />;
  const trackLength = TRACK_ROUTE.maxX - TRACK_ROUTE.minX;
  const trackCenterX = (TRACK_ROUTE.minX + TRACK_ROUTE.maxX) / 2;
  const tunnelCenterY = TRACK_ROUTE.bedY + TRACK_ROUTE.tunnelHeight / 2;
  const stairStepCount = STAIR_ROUTE.stepCount;
  const stairStepRun = (STAIR_ROUTE.endX - STAIR_ROUTE.startX) / stairStepCount;
  const landingLength = STAIR_ROUTE.startX - STAIR_ROUTE.landingStartX;
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
      <mesh position={[trackCenterX, TRACK_ROUTE.bedY, TRACK_ROUTE.centerZ]} receiveShadow>
        <boxGeometry args={[trackLength, 0.4, TRACK_ROUTE.width]} />
        <meshStandardMaterial color="#111e21" roughness={0.95} />
      </mesh>
      {[-1.5, 0, 1.5].map((railZ) => (
        <mesh key={railZ} position={[trackCenterX, TRACK_ROUTE.bedY + 0.25, TRACK_ROUTE.centerZ + railZ]}>
          <boxGeometry args={[trackLength, 0.08, 0.08]} />
          <meshStandardMaterial color="#b3c3bf" metalness={0.9} roughness={0.22} />
        </mesh>
      ))}
      <mesh position={[trackCenterX, tunnelCenterY, TRACK_ROUTE.centerZ]}>
        <boxGeometry args={[trackLength, TRACK_ROUTE.tunnelHeight, TRACK_ROUTE.tunnelWidth]} />
        <meshStandardMaterial color="#8fb8b5" transparent opacity={0.035} depthWrite={false} side={THREE.DoubleSide} roughness={0.2} metalness={0.08} />
      </mesh>
      <mesh position={[(STAIR_ROUTE.landingStartX + STAIR_ROUTE.startX) / 2, STAIR_ROUTE.baseY - 0.1, STAIR_ROUTE.z]}>
        <boxGeometry args={[landingLength, 0.2, STAIR_ROUTE.width]} />
        {concreteMaterial}
      </mesh>
      {Array.from({ length: stairStepCount }, (_, stepIndex) => {
        const stepX = STAIR_ROUTE.startX + (stepIndex + 0.5) * stairStepRun;
        return (
        <mesh key={stepIndex} position={[stepX, stairSurfaceY(stepX, STAIR_ROUTE.baseY, landingY, surfaceY) - 0.1, STAIR_ROUTE.z]}>
          <boxGeometry args={[stairStepRun + 0.04, 0.2, STAIR_ROUTE.width]} />
          {concreteMaterial}
        </mesh>
        );
      })}
      {[-8, -4, 0, 4].map((columnX) => (
        <mesh key={columnX} position={[columnX, 0.5, -0.6]}>
          <boxGeometry args={[0.3, 7, 0.3]} />
          <meshStandardMaterial color="#235160" metalness={0.6} roughness={0.36} />
        </mesh>
      ))}
      {PASSENGER_POSITIONS.map((passenger, commuterIndex) => {
        return (
          <mesh key={commuterIndex} position={[passenger.x, passenger.y, passenger.z]}>
            <cylinderGeometry args={[0.18, 0.18, 1.5, 8]} />
            <meshStandardMaterial color={commuterIndex % 2 ? '#384f55' : '#23363c'} roughness={0.86} />
          </mesh>
        );
      })}
    </group>
  );
}

function CameraController({ viewMode, parametersVisible, onManualChange }) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef();
  const destinationRef = useRef(new THREE.Vector3(...CAMERA_VIEWS.find((view) => view.id === 'ortho1').position));
  const targetRef = useRef(new THREE.Vector3(...CAMERA_TARGET));
  const frameOffsetRef = useRef(new THREE.Vector3());
  const manualInteractionRef = useRef(false);
  const onManualChangeRef = useRef(onManualChange);
  onManualChangeRef.current = onManualChange;

  useEffect(() => {
    const view = CAMERA_VIEWS.find((candidate) => candidate.id === viewMode);
    if (viewMode) manualInteractionRef.current = false;
    const basePosition = new THREE.Vector3(...(view?.position ?? camera.position.toArray()));
    if (!view?.position) basePosition.sub(frameOffsetRef.current);
    const baseTarget = new THREE.Vector3(...CAMERA_TARGET);
    const nextOffset = cameraFrameOffset(camera, basePosition, baseTarget, size, parametersVisible);
    if (!view?.position) camera.position.add(nextOffset).sub(frameOffsetRef.current);
    frameOffsetRef.current.copy(nextOffset);
    destinationRef.current.copy(basePosition).add(nextOffset);
    targetRef.current.copy(baseTarget);
  }, [camera, parametersVisible, size, viewMode]);

  useFrame((_, delta) => {
    if (!controlsRef.current || manualInteractionRef.current || !viewMode) return;
    const blend = 1 - Math.exp(-delta * 5.5);
    if (viewMode !== 'orbital') camera.position.lerp(destinationRef.current, blend);
    controlsRef.current.target.lerp(targetRef.current, blend);
  });

  const handleManualChange = () => {
    manualInteractionRef.current = true;
    onManualChangeRef.current();
  };

  useEffect(() => {
    const handleWheel = () => {
      manualInteractionRef.current = true;
      onManualChangeRef.current();
    };
    gl.domElement.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    return () => gl.domElement.removeEventListener('wheel', handleWheel, { capture: true });
  }, [gl]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={CAMERA_TARGET}
      enableDamping
      dampingFactor={0.08}
      minDistance={12}
      maxDistance={90}
      autoRotate={viewMode === 'orbital'}
      autoRotateSpeed={0.55}
      onStart={handleManualChange}
    />
  );
}

function SimulationScene({ settings, viewMode, parametersVisible, onManualViewChange, onTelemetry, onGpuError }) {
  const trainRef = useRef();
  const stairProfile = {
    tunnelHeight: settings.stairUndergroundOpeningHeight,
    landingY: settings.stairLandingHeight,
    surfaceY: settings.stairSurfaceOpeningHeight
  };
  return (
    <>
      <ambientLight color="#8ab0ae" intensity={1.25} />
      <directionalLight color="#fff4dd" intensity={2.3} position={[10, 20, 15]} castShadow />
      <StationArchitecture {...stairProfile} />
      <PermanentGround {...stairProfile} />
      <TicketTurnstiles />
      <VentilationInfrastructure settings={settings} />
      <StairRouteEnclosure {...stairProfile} />
      <SurfaceStreet {...stairProfile} />
      <FloodControlTunnels enabled={settings.floodTunnels} flow={settings.floodFlow} pumpDirection={settings.floodPumpDirection} />
      <Train ref={trainRef} active={settings.train} brakes={settings.brakes} />
      <ParticleField key={settings.particleCount} settings={settings} trainRef={trainRef} onTelemetry={onTelemetry} onGpuError={onGpuError} />
      <ContactShadows position={[9, -4, 0]} opacity={0.42} scale={56} blur={2.5} far={8} />
      <CameraController viewMode={viewMode} parametersVisible={parametersVisible} onManualChange={onManualViewChange} />
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

function ControlSlider({ label, value, min, max, step, precision, suffix, description, showDescription, onChange }) {
  const displayValue = Number.isFinite(value) ? value : min;
  const decimals = precision ?? (step < 0.01 ? 3 : step < 1 ? 1 : 0);
  return (
    <label className="slider-control">
      <span className="control-label"><span>{label}</span><strong>{displayValue.toFixed(decimals)}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={displayValue} onChange={(event) => onChange(Number(event.target.value))} />
      {showDescription && <small className="parameter-description">{description}</small>}
    </label>
  );
}

function VentEndpointChart({ history, metric, label, unit }) {
  const values = history.flatMap((sample) => [sample?.intake?.[metric], sample?.outlet?.[metric]])
    .filter(Number.isFinite);
  const maximumMagnitude = metric === 'flow'
    ? Math.max(1, ...values.map(Math.abs))
    : 50;
  const minimum = metric === 'flow' ? -maximumMagnitude : 60;
  const maximum = metric === 'flow' ? maximumMagnitude : 110;
  const pointsFor = (endpoint) => history.map((sample, index) => {
    const value = sample?.[endpoint]?.[metric];
    if (!Number.isFinite(value)) return null;
    const x = history.length > 1 ? index / (history.length - 1) * 220 : 220;
    const y = 42 - (value - minimum) / (maximum - minimum) * 38;
    return `${x},${Math.max(2, Math.min(42, y))}`;
  }).filter(Boolean).join(' ');
  return (
    <div className="vent-chart">
      <div className="vent-chart-heading"><span>{label}</span><span>{unit}</span></div>
      <svg viewBox="0 0 220 44" preserveAspectRatio="none" aria-label={`${label} history`}>
        <line x1="0" y1="22" x2="220" y2="22" className="vent-chart-grid" />
        <polyline points={pointsFor('intake')} className="vent-chart-line intake" />
        <polyline points={pointsFor('outlet')} className="vent-chart-line outlet" />
      </svg>
    </div>
  );
}

function VentFlowCharts({ settings, telemetry, onSettingsChange, showDescriptions }) {
  const [history, setHistory] = useState(() => SHAFT_POSITIONS.map(() => []));
  useEffect(() => {
    if (telemetry.shafts.length !== SHAFT_POSITIONS.length) return;
    setHistory((current) => current.map((shaftHistory, index) => (
      [...shaftHistory.slice(-35), telemetry.shafts[index]]
    )));
  }, [telemetry.shafts]);
  const updateShaftControl = (index, value) => {
    const shaftControls = [...settings.shaftControls];
    shaftControls[index] = value;
    onSettingsChange({ shaftControls });
  };
  return (
    <details className="parameter-group vent-flow-group">
      <summary>Vent flow charts</summary>
      <div className="vent-flow-list">
        {SHAFT_POSITIONS.map((shaftX, index) => {
          const sample = telemetry.shafts[index];
          return (
            <section className="vent-flow-shaft" key={shaftX}>
              <ControlSlider
                label={`${SHAFT_LABELS[index]} shaft (${shaftX > 0 ? '+' : ''}${shaftX} m)`}
                value={settings.shaftControls[index]}
                min={0}
                max={1}
                step={0.05}
                suffix=""
                description="Scales capture, stack lift, powered fan flow, and outlet suction for this shaft."
                showDescription={showDescriptions}
                onChange={(value) => updateShaftControl(index, value)}
              />
              <div className="vent-endpoints">
                {['intake', 'outlet'].map((endpoint) => (
                  <div key={endpoint} className="vent-endpoint">
                    <span>{endpoint}</span>
                    <strong>{Number.isFinite(sample?.[endpoint]?.flow) ? `${sample[endpoint].flow.toFixed(2)} m/s` : '--'}</strong>
                    <small>{Number.isFinite(sample?.[endpoint]?.temperature) ? `${sample[endpoint].temperature.toFixed(1)}°F` : '--'} · n={sample?.[endpoint]?.count ?? 0}</small>
                  </div>
                ))}
              </div>
              <VentEndpointChart history={history[index]} metric="flow" label="Vertical flow" unit="m/s" />
              <VentEndpointChart history={history[index]} metric="temperature" label="Air temperature" unit="°F" />
              <div className="vent-chart-legend"><span className="intake">Intake</span><span className="outlet">Outlet</span></div>
            </section>
          );
        })}
      </div>
    </details>
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

function TelemetryPanel({ settings, onSettingsChange, telemetry, gpuError, sustainabilityScore, showDescriptions, onShowDescriptionsChange, onOpenReport, onHide }) {
  const { temperature } = telemetry;
  const [temperatureHistory, setTemperatureHistory] = useState(() => new Array(48).fill(81.5));
  useEffect(() => {
    setTemperatureHistory((history) => [...history.slice(-47), temperature]);
  }, [temperature]);

  return (
    <aside className="telemetry-panel panel">
      <div className="panel-topline">
        <div className="panel-kicker"><span className={`status-dot ${gpuError ? 'status-error' : ''}`} />LIVE / TEST CHAMBER</div>
        <button className="panel-hide" type="button" onClick={onHide}>Hide</button>
      </div>
      <div className="telemetry-heading"><span>Ambient field</span><strong>{temperature.toFixed(1)}°F</strong></div>
      <Sparkline values={temperatureHistory} />
      {gpuError && <p className="error-copy">GPU field offline: {gpuError}</p>}

      <div className="sustainability-readout">
        <div className="sustainability-heading"><span>Thermal resilience</span><strong>{sustainabilityScore}%</strong></div>
        <div className="sustainability-meter"><span style={{ width: `${sustainabilityScore}%` }} /></div>
        <div className="balance-labels"><span>PASSIVE FIRST</span><span>LOW ENERGY LOAD</span></div>
        <button className="report-link" type="button" onClick={onOpenReport}>Open resilience report</button>
      </div>

      <div className="description-toggle">
        <Toggle label="Show descriptions" checked={showDescriptions} onChange={onShowDescriptionsChange} />
      </div>
      <div className="primary-parameter">
        <ControlSlider label="Surface temperature" value={settings.surfaceTemperature} min={60} max={110} step={0.5} suffix="°F" description="Sets the station floor's thermal influence on nearby air." showDescription={showDescriptions} onChange={(surfaceTemperature) => onSettingsChange({ surfaceTemperature })} />
        <ControlSlider label="Passenger heat" value={settings.passengerHeat} min={0} max={1.5} step={0.05} suffix="" description="Adds localized body heat around the visible passengers." showDescription={showDescriptions} onChange={(passengerHeat) => onSettingsChange({ passengerHeat })} />
        <ControlSlider label="Road surface temperature" value={settings.roadSurfaceTemperature} min={45} max={130} step={0.5} suffix="°F" description="Sets the outdoor road temperature that drives upward convection above the street." showDescription={showDescriptions} onChange={(roadSurfaceTemperature) => onSettingsChange({ roadSurfaceTemperature })} />
        <ControlSlider label="Ambient air above road" value={settings.ambientAirTemperature} min={40} max={110} step={0.5} suffix="°F" description="Sets the outdoor air temperature that the upper field gradually approaches." showDescription={showDescriptions} onChange={(ambientAirTemperature) => onSettingsChange({ ambientAirTemperature })} />
        <ControlSlider label="Surface crosswind" value={settings.surfaceCrosswind} min={-8} max={8} step={0.25} suffix=" m/s" description="Sets outdoor wind across the station along the Z axis; negative values reverse direction." showDescription={showDescriptions} onChange={(surfaceCrosswind) => onSettingsChange({ surfaceCrosswind })} />
        <ControlSlider label="Stair underground opening" value={settings.stairUndergroundOpeningHeight} min={2.2} max={5} step={0.1} precision={2} suffix=" m" description="Sets underground tunnel and doorway clear height without moving the stairs or turnstiles." showDescription={showDescriptions} onChange={(stairUndergroundOpeningHeight) => onSettingsChange({ stairUndergroundOpeningHeight })} />
        <ControlSlider label="Stair landing height" value={settings.stairLandingHeight} min={1} max={5} step={0.1} precision={2} suffix=" m" description="Sets the level elevation between the lower and upper stair flights." showDescription={showDescriptions} onChange={(stairLandingHeight) => onSettingsChange({ stairLandingHeight })} />
        <ControlSlider label="Stair surface opening" value={settings.stairSurfaceOpeningHeight} min={8.2} max={10} step={0.1} precision={2} suffix=" m" description="Sets the street opening elevation and moves the street and ventilation outlets with it." showDescription={showDescriptions} onChange={(stairSurfaceOpeningHeight) => onSettingsChange({ stairSurfaceOpeningHeight })} />
      </div>
      <div className="toggles-group">
        <Toggle label="Allow trains to run" checked={settings.train} description="Runs one train through the station at the configured interval." showDescription={showDescriptions} onChange={(train) => onSettingsChange({ train })} />
        <Toggle label="Powered shaft fans" checked={settings.shaftFans} description="Adds powered upward airflow in the three ventilation shafts." showDescription={showDescriptions} onChange={(shaftFans) => onSettingsChange({ shaftFans })} />
        <Toggle label="Clerestory windows" checked={settings.clerestoryWindows} description="Shows the bridging windows and enables clerestory exchange." showDescription={showDescriptions} onChange={(clerestoryWindows) => onSettingsChange({ clerestoryWindows })} />
        <Toggle label="Wind resistance / occlusion" checked={settings.windOcclusion} description="Deflects airflow around station columns, platforms, and the train." showDescription={showDescriptions} onChange={(windOcclusion) => onSettingsChange({ windOcclusion })} />
        <Toggle label="AC exhaust heat" checked={settings.ac} description="Adds heat and lift near the active train." showDescription={showDescriptions} onChange={(ac) => onSettingsChange({ ac })} />
        <Toggle label="Brake friction" checked={settings.brakes} description="Adds localized heat and turbulence during braking." showDescription={showDescriptions} onChange={(brakes) => onSettingsChange({ brakes })} />
        <Toggle label="Flood control tunnels" checked={settings.floodTunnels} description="Enables the below-station cold-sink gallery." showDescription={showDescriptions} onChange={(floodTunnels) => onSettingsChange({ floodTunnels })} />
      </div>

      <div className="systems-group">
        <div className="subsection-label">SUSTAINABLE AIRFLOW SYSTEMS</div>
        <ControlSlider label="Shaft exchange" value={settings.shaftExchange} min={0} max={1} step={0.05} suffix="" description="Captures air toward the three passive vertical shafts." showDescription={showDescriptions} onChange={(shaftExchange) => onSettingsChange({ shaftExchange })} />
        <ControlSlider label="Shaft fan velocity" value={settings.shaftFanVelocity} min={0} max={8} step={0.25} suffix=" m/s" description="Sets upward powered airflow through each ventilation shaft." showDescription={showDescriptions} onChange={(shaftFanVelocity) => onSettingsChange({ shaftFanVelocity })} />
        <ControlSlider label="Downward fans" value={settings.downFans} min={0} max={1} step={0.05} suffix="" description="Pushes air down from the station ceiling fan banks." showDescription={showDescriptions} onChange={(downFans) => onSettingsChange({ downFans })} />
        <ControlSlider label="Floor air movers" value={settings.floorAirMovers} min={0} max={1} step={0.05} suffix="" description="Blows air across the platform floor toward the stair route." showDescription={showDescriptions} onChange={(floorAirMovers) => onSettingsChange({ floorAirMovers })} />
        <ControlSlider label="Ceiling flow" value={settings.ceilingFans} min={0} max={1} step={0.05} suffix="" description="Sweeps the warm ceiling band toward the egress." showDescription={showDescriptions} onChange={(ceilingFans) => onSettingsChange({ ceilingFans })} />
        <ControlSlider label="Passive grooves" value={settings.grooves} min={0} max={1} step={0.05} suffix="" description="Adds low-energy guidance along the roof grooves." showDescription={showDescriptions} onChange={(grooves) => onSettingsChange({ grooves })} />
        <ControlSlider label="Roof pitch" value={settings.roofPitch} min={-28} max={28} step={1} suffix="°" description="Tilts the roof envelope and changes buoyant headroom." showDescription={showDescriptions} onChange={(roofPitch) => onSettingsChange({ roofPitch })} />
        <ControlSlider label="Ridge offset" value={settings.roofOffset} min={-2} max={2} step={0.1} suffix=" z" description="Moves the roof ridge across the station width." showDescription={showDescriptions} onChange={(roofOffset) => onSettingsChange({ roofOffset })} />
        <ControlSlider label="Roof gap: horizontal" value={settings.roofGapHorizontal} min={0.1} max={2.4} step={0.1} suffix=" m" description="Sets the horizontal distance between the two roof panels." showDescription={showDescriptions} onChange={(roofGapHorizontal) => onSettingsChange({ roofGapHorizontal })} />
        <ControlSlider label="Roof gap: vertical" value={settings.roofGapVertical} min={0.1} max={3} step={0.1} suffix=" m" description="Sets the height bridged by each clerestory pane." showDescription={showDescriptions} onChange={(roofGapVertical) => onSettingsChange({ roofGapVertical })} />
        <ControlSlider label="Clerestory opening" value={settings.clerestoryOpen} min={0} max={1} step={0.05} suffix="" description="Controls passive exchange through the clerestory span." showDescription={showDescriptions} onChange={(clerestoryOpen) => onSettingsChange({ clerestoryOpen })} />
        <ControlSlider label="Shaft stack effect" value={settings.stackEffect} min={0} max={1} step={0.05} suffix="" description="Applies passive localized shaft lift to warm air; powered fans and crosswind draw remain separate." showDescription={showDescriptions} onChange={(stackEffect) => onSettingsChange({ stackEffect })} />
        <ControlSlider label="Flood gallery flow" value={settings.floodFlow} min={0} max={1} step={0.05} suffix="" description="Pulls warm lower air into the gallery as a cold sink." showDescription={showDescriptions} onChange={(floodFlow) => onSettingsChange({ floodFlow })} />
        <ControlSlider label="Flood pump direction" value={settings.floodPumpDirection} min={-1} max={1} step={0.1} suffix="" description="Sets the flood-gallery air-pump direction along X." showDescription={showDescriptions} onChange={(floodPumpDirection) => onSettingsChange({ floodPumpDirection })} />
      </div>
      <div className="controls-group">
        <div className="subsection-label">SIMULATION</div>
        <ControlSlider label="Train interval" value={settings.trainInterval} min={8} max={60} step={1} suffix=" s" description="Time from the start of one train pass to the next." showDescription={showDescriptions} onChange={(trainInterval) => onSettingsChange({ trainInterval })} />
        <ControlSlider label="Train stop frequency" value={settings.trainStopFrequency} min={0} max={1} step={0.05} suffix="" description="Sets the fraction of train passes that stop at the platform." showDescription={showDescriptions} onChange={(trainStopFrequency) => onSettingsChange({ trainStopFrequency })} />
        <ControlSlider label="Train stop duration" value={settings.trainStopDuration} min={0} max={30} step={1} suffix=" s" description="Sets how long a stopping train dwells at the platform." showDescription={showDescriptions} onChange={(trainStopDuration) => onSettingsChange({ trainStopDuration })} />
        <ControlSlider label="Particle count" value={settings.particleCount} min={1024} max={9216} step={512} suffix="" description="Rebuilds the GPU field with the selected number of rendered particles." showDescription={showDescriptions} onChange={(particleCount) => onSettingsChange({ particleCount })} />
        <ControlSlider label="Particle diameter" value={settings.particleDiameter} min={0.2} max={1.4} step={0.05} suffix=" m" description="Changes the rendered diameter of each airflow particle." showDescription={showDescriptions} onChange={(particleDiameter) => onSettingsChange({ particleDiameter })} />
        <ControlSlider label="Velocity diameter response" value={settings.particleMagnitudeScale} min={0} max={2} step={0.05} suffix="" description="Scales individual particle diameter according to velocity magnitude." showDescription={showDescriptions} onChange={(particleMagnitudeScale) => onSettingsChange({ particleMagnitudeScale })} />
      </div>
      <VentFlowCharts settings={settings} telemetry={telemetry} onSettingsChange={onSettingsChange} showDescriptions={showDescriptions} />
      <details className="parameter-group">
        <summary>Fluid parameters</summary>

        <div className="controls-group">
          <ControlSlider label="Air density" value={settings.density} min={0.5} max={3} step={0.05} suffix=" kg/m³" description="Mass packed into each simulated air volume." showDescription={showDescriptions} onChange={(density) => onSettingsChange({ density })} />
          <ControlSlider label="Fluid stiffness" value={settings.stiffness} min={1} max={20} step={0.5} suffix="" description="How strongly nearby particles resist compression." showDescription={showDescriptions} onChange={(stiffness) => onSettingsChange({ stiffness })} />
          <ControlSlider label="Viscosity" value={settings.viscosity} min={0.001} max={0.05} step={0.001} suffix=" Pa·s" description="How quickly neighboring air velocities blend." showDescription={showDescriptions} onChange={(viscosity) => onSettingsChange({ viscosity })} />
        </div>
      </details>
    </aside>
  );
}

function ViewToolbar({ viewMode, onViewChange, parametersVisible, onToggleParameters }) {
  return (
    <nav className="view-toolbar panel" aria-label="Camera views">
      <div className="view-modes" role="group" aria-label="Select camera perspective">
        {CAMERA_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={viewMode === view.id ? 'active' : ''}
            aria-pressed={viewMode === view.id}
            onClick={() => onViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <button className="params-toggle" type="button" aria-pressed={parametersVisible} onClick={onToggleParameters}>
        {parametersVisible ? 'Hide params' : 'Show params'}
      </button>
    </nav>
  );
}

function SubwaySim({ onBack }) {
  const [settings, setSettings] = useState(INITIALS);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [parametersVisible, setParametersVisible] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [reportOpen, setReportOpen] = useState(false);
  const [telemetry, setTelemetry] = useState({ temperature: 81.5, shafts: [] });
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
        <Canvas camera={{ position: [7, 20, 55], fov: 45, near: 0.1, far: 1000 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <color attach="background" args={['#071316']} />
          <fog attach="fog" args={['#071316', 28, 72]} />
          <SimulationScene settings={settings} viewMode={viewMode} parametersVisible={parametersVisible} onManualViewChange={() => setViewMode(null)} onTelemetry={setTelemetry} onGpuError={setGpuError} />
        </Canvas>
      </div>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">T</span><span><b>TRANSIT / UNDERGROUND</b><em>Thermodynamics lab</em></span></div>
        <div className="topbar-meta"><span>GPGPU / SPH</span><span>FIELD 04</span></div>
        <button className="mode-switch" type="button" onClick={onBack}>Lab menu</button>
      </header>
      {/* <section className="scene-title"><p>Airflow study</p><h1>Heat is a passenger.</h1><span>Watch the station exchange energy in real time.</span></section> */}
      <ViewToolbar viewMode={viewMode} onViewChange={setViewMode} parametersVisible={parametersVisible} onToggleParameters={() => setParametersVisible((visible) => !visible)} />
      {parametersVisible && <TelemetryPanel settings={settings} onSettingsChange={handleSettingsChange} telemetry={telemetry} gpuError={gpuError} sustainabilityScore={resilienceReport.score} showDescriptions={showDescriptions} onShowDescriptionsChange={setShowDescriptions} onOpenReport={() => setReportOpen(true)} onHide={() => setParametersVisible(false)} />}
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

const SIMULATION_MODES = [
  {
    id: 'subwaysim2',
    index: '01',
    name: 'subwaysim2',
    label: 'Transit thermodynamics',
    description: 'A GPU airflow chamber where trains, shafts, stairs, and thermal sources shape a living station field.',
    detail: 'FLUID / SPH / INFRASTRUCTURE',
    accent: 'teal'
  },
  {
    id: 'simpleattractorsim',
    index: '02',
    name: 'simpleattractorsim',
    label: 'Attractor particles',
    description: 'A direct React port of the Three.js attractor lab with spinning masses, transform rigs, presets, and playback.',
    detail: 'N-BODY / PRESETS / JOURNAL',
    accent: 'blue'
  },
  {
    id: 'sqgblackholesim',
    index: '03',
    name: 'sqgblackholesim',
    label: 'Black-hole sandbox',
    description: 'The attractor rig, copied forward as a blank gravitational playground for the next SQG experiment.',
    detail: 'PROTOTYPE / INHERITED RIG',
    accent: 'orange'
  }
];

function SimulationLoader() {
  const [selectedSimulation, setSelectedSimulation] = useState(null);
  if (selectedSimulation === 'subwaysim2') return <SubwaySim onBack={() => setSelectedSimulation(null)} />;
  if (selectedSimulation === 'simpleattractorsim') return <SimpleAttractorSim onBack={() => setSelectedSimulation(null)} />;
  if (selectedSimulation === 'sqgblackholesim') return <SqgBlackHoleSim onBack={() => setSelectedSimulation(null)} />;

  return (
    <main className="sqg-loader">
      <header className="sqg-loader-header">
        <div className="sqg-loader-brand"><span className="sqg-loader-mark">SQG</span><span><b>SQGSIM</b><em>Particle systems / field experiments</em></span></div>
        <span className="sqg-loader-meta">00 / SIM LOADER</span>
      </header>
      <section className="sqg-loader-intro">
        <span className="sqg-loader-kicker">SELECT A SIMULATION</span>
        <h1>Particle, Wave, Gravity, Fluid, Plasma<br />simulation</h1>
        <h2>Simulators for all of the things.</h2>
        <p>An R3F (React Three Fiber (ThreeJS)) and GPU shader based particle framework. Choose a field to simulate:</p>
      </section>
      <section className="sqg-mode-grid" aria-label="Available simulations">
        {SIMULATION_MODES.map((mode) => (
          <button key={mode.id} type="button" className={`sqg-mode-card ${mode.accent}`} onClick={() => setSelectedSimulation(mode.id)}>
            <span className="sqg-mode-index">{mode.index} / LOAD FIELD</span>
            <span className="sqg-mode-name">{mode.name}</span>
            <span className="sqg-mode-label">{mode.label}</span>
            <span className="sqg-mode-description">{mode.description}</span>
            <span className="sqg-mode-footer"><span>{mode.detail}</span><strong>Enter <span aria-hidden="true">↗</span></strong></span>
          </button>
        ))}
      </section>
      <footer className="sqg-loader-footer"><span>THREE.JS / REACT / WEBGL</span><span>Choose a field to begin</span></footer>
    </main>
  );
}

function App() {
  return <SimulationLoader />;
}

export default App;