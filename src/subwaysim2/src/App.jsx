import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

const SIM_RESOLUTION = 64;
const PARTICLE_COUNT = SIM_RESOLUTION * SIM_RESOLUTION;
const TUNNEL = { x: 22, y: 8, z: 10 };
const INITIALS = {
  density: 1.18,
  stiffness: 5,
  viscosity: 0.012,
  train: true,
  ac: true,
  brakes: true,
  shaftExchange: 0.65,
  downFans: 0.45,
  ceilingFans: 0.5,
  grooves: 0.7,
  floodTunnels: true,
  floodFlow: 0.55,
  floodPumpDirection: 1,
  roofPitch: 14,
  roofOffset: 0,
  clerestoryOpen: 0.55,
  stackEffect: 0.65
};

const positionShader = `
  uniform float uDt;
  uniform float uRoofPitch;
  uniform float uRoofOffset;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;

    if (positionData.x < -11.0) positionData.x += 22.0;
    if (positionData.x > 11.0) positionData.x -= 22.0;
    positionData.y = clamp(positionData.y, -6.2, 8.0);
    positionData.z = clamp(positionData.z, -5.0, 5.0);

    float stairX = positionData.x < -6.6 ? positionData.x + 22.0 : positionData.x;
    float stairProgress = clamp((stairX - 7.0) / 8.4, 0.0, 1.0);
    float stairSurfaceY = -3.05 + stairProgress * 5.25;
    float stairZone = step(7.0, stairX) * step(stairX, 15.4);
    float stairDistance = abs(positionData.z + 2.5);
    float stairContact = stairZone * (1.0 - smoothstep(0.0, 1.7, stairDistance));
    float thermalContact = smoothstep(0.05, 0.4, velocityData.w) * stairContact;
    if (thermalContact > 0.0 && positionData.y < stairSurfaceY + 0.12) {
      positionData.y = mix(positionData.y, stairSurfaceY + 0.12, thermalContact);
    }

    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = positionData.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((positionData.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : mix(roofRidgeY, 4.0, clamp((positionData.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float shaftNorth = 1.0 - smoothstep(0.0, 0.72, abs(positionData.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 0.72, abs(positionData.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 0.72, abs(positionData.x - 7.0));
    float shaftOpening = max(shaftNorth, max(shaftCenter, shaftSouth))
      * (1.0 - smoothstep(0.0, 0.9, abs(positionData.z + 1.4)))
      * smoothstep(2.8, 3.6, positionData.y);
    if (shaftOpening < 0.5) positionData.y = min(positionData.y, roofCeiling);

    gl_FragColor = positionData;
  }
`;

const velocityShader = `
  uniform float uDt;
  uniform float uRadius;
  uniform float uRestDensity;
  uniform float uStiffness;
  uniform float uViscosity;
  uniform float uTrainPosX;
  uniform float uTrainVelX;
  uniform float uShaftExchange;
  uniform float uDownFans;
  uniform float uCeilingFans;
  uniform float uGrooves;
  uniform float uFloodFlow;
  uniform float uFloodPumpDirection;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uClerestoryOpen;
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

    float stairX = particlePosition.x < -6.6 ? particlePosition.x + 22.0 : particlePosition.x;
    float stairProgress = clamp((stairX - 7.0) / 8.4, 0.0, 1.0);
    float stairSurfaceY = -3.05 + stairProgress * 5.25;
    float stairZone = step(7.0, stairX) * step(stairX, 15.4);
    float stairProximity = stairZone
      * (1.0 - smoothstep(0.0, 1.7, abs(particlePosition.z + 2.5)))
      * (1.0 - smoothstep(0.0, 1.8, abs(particlePosition.y - stairSurfaceY)));
    float stairApproach = smoothstep(3.5, 5.0, stairX) * (1.0 - smoothstep(8.5, 10.0, stairX));
    vec3 stairDirection = normalize(vec3(1.0, 0.625, 0.0));
    acceleration += stairDirection * stairProximity * (0.45 + thermalIntensity * 2.4);
    acceleration.z += (-2.5 - particlePosition.z) * stairApproach * thermalIntensity * 0.35;
    acceleration.y += thermalIntensity * 0.22;

    float shaftNorth = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x - 7.0));
    float shaftInfluence = max(shaftNorth, max(shaftCenter, shaftSouth));
    float ceilingBand = smoothstep(1.8, 4.0, particlePosition.y);
    float shaftHorizontalCapture = shaftInfluence
      * (1.0 - smoothstep(0.0, 1.3, abs(particlePosition.z + 1.4)))
      * smoothstep(0.4, 2.5, particlePosition.y);
    float shaftVerticalColumn = shaftInfluence
      * (1.0 - smoothstep(0.0, 0.9, abs(particlePosition.z + 1.4)))
      * smoothstep(2.0, 3.6, particlePosition.y);
    float shaftTargetX = shaftSouth > shaftCenter && shaftSouth > shaftNorth ? 7.0 : (shaftNorth > shaftCenter ? -7.0 : 0.0);
    float floodBand = 1.0 - smoothstep(0.0, 2.4, abs(particlePosition.z + 4.15));

    if (particlePosition.y > 0.4) {
      acceleration.x += (shaftTargetX - particlePosition.x)
        * shaftHorizontalCapture * uShaftExchange * 0.9;
      acceleration.y += shaftVerticalColumn * uShaftExchange * (2.4 + uStackEffect * 3.4) * (0.35 + thermalIntensity * 1.8);
      acceleration.y -= shaftInfluence * uDownFans * 1.35;
      acceleration.x += ceilingBand * uCeilingFans * 1.4;
      acceleration.x += ceilingBand * uGrooves * 0.5;
      thermalIntensity = max(0.0, thermalIntensity - uDt * shaftVerticalColumn * uShaftExchange * (0.2 + uStackEffect * 0.35));
      thermalIntensity = max(0.0, thermalIntensity - uDt * ceilingBand * (uDownFans + uCeilingFans) * 0.08);
    }
    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = particlePosition.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((particlePosition.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : mix(roofRidgeY, 4.0, clamp((particlePosition.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    if (particlePosition.y > roofCeiling - 0.18) {
      acceleration.y -= (particlePosition.y - roofCeiling + 0.18) * 1.8;
      acceleration.x += sign(particlePosition.z) * uGrooves * 0.22;
    }
    float clerestoryBand = (1.0 - smoothstep(0.0, 1.1, abs(particlePosition.z - uRoofOffset)))
      * smoothstep(0.0, 1.0, particlePosition.y - roofCeiling + 0.9);
    if (uClerestoryOpen > 0.0 && clerestoryBand > 0.0) {
      acceleration.y += clerestoryBand * uClerestoryOpen * (0.8 + uStackEffect * 2.2) * (0.35 + thermalIntensity * 1.7);
      thermalIntensity = max(0.0, thermalIntensity - uDt * clerestoryBand * uClerestoryOpen * 0.25);
    }
    if (uFloodTunnels && particlePosition.y < -3.8 && floodBand > 0.0) {
      acceleration.x += uFloodPumpDirection * uFloodFlow * floodBand * 1.4;
      acceleration.y += uFloodFlow * floodBand * 0.16;
      thermalIntensity = max(0.0, thermalIntensity - uDt * uFloodFlow * floodBand * 0.22);
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
        positionTexture.image.data[offset] = (Math.random() - 0.5) * TUNNEL.x;
        positionTexture.image.data[offset + 1] = -3.5 + Math.random() * TUNNEL.y;
        positionTexture.image.data[offset + 2] = (Math.random() - 0.5) * TUNNEL.z;
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
      velocityVariable.material.uniforms.uDt = { value: 0.016 };
      velocityVariable.material.uniforms.uRadius = { value: 0.85 };
      velocityVariable.material.uniforms.uRestDensity = { value: INITIALS.density };
      velocityVariable.material.uniforms.uStiffness = { value: INITIALS.stiffness };
      velocityVariable.material.uniforms.uViscosity = { value: INITIALS.viscosity };
      velocityVariable.material.uniforms.uTrainPosX = { value: 0 };
      velocityVariable.material.uniforms.uTrainVelX = { value: 0 };
      velocityVariable.material.uniforms.uShaftExchange = { value: INITIALS.shaftExchange };
      velocityVariable.material.uniforms.uDownFans = { value: INITIALS.downFans };
      velocityVariable.material.uniforms.uCeilingFans = { value: INITIALS.ceilingFans };
      velocityVariable.material.uniforms.uGrooves = { value: INITIALS.grooves };
      velocityVariable.material.uniforms.uFloodFlow = { value: INITIALS.floodFlow };
      velocityVariable.material.uniforms.uFloodPumpDirection = { value: INITIALS.floodPumpDirection };
      velocityVariable.material.uniforms.uRoofPitch = { value: THREE.MathUtils.degToRad(INITIALS.roofPitch) };
      velocityVariable.material.uniforms.uRoofOffset = { value: INITIALS.roofOffset };
      velocityVariable.material.uniforms.uClerestoryOpen = { value: INITIALS.clerestoryOpen };
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
    velocityVariable.material.uniforms.uDt.value = frameDelta;
    velocityVariable.material.uniforms.uRestDensity.value = currentSettings.density;
    velocityVariable.material.uniforms.uStiffness.value = currentSettings.stiffness;
    velocityVariable.material.uniforms.uViscosity.value = currentSettings.viscosity;
    velocityVariable.material.uniforms.uTrainPosX.value = nextTrainX;
    velocityVariable.material.uniforms.uTrainVelX.value = trainVelocity;
    velocityVariable.material.uniforms.uShaftExchange.value = currentSettings.shaftExchange;
    velocityVariable.material.uniforms.uDownFans.value = currentSettings.downFans;
    velocityVariable.material.uniforms.uCeilingFans.value = currentSettings.ceilingFans;
    velocityVariable.material.uniforms.uGrooves.value = currentSettings.grooves;
    velocityVariable.material.uniforms.uFloodFlow.value = currentSettings.floodFlow;
    velocityVariable.material.uniforms.uFloodPumpDirection.value = currentSettings.floodPumpDirection;
    velocityVariable.material.uniforms.uRoofPitch.value = THREE.MathUtils.degToRad(currentSettings.roofPitch);
    velocityVariable.material.uniforms.uRoofOffset.value = currentSettings.roofOffset;
    velocityVariable.material.uniforms.uClerestoryOpen.value = currentSettings.clerestoryOpen;
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
      let targetTemperature = 80;
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

const SHAFT_POSITIONS = [-7, 0, 7];
const GROOVE_POSITIONS = [-2.4, -0.8, 0.8, 2.4];

function VentilationInfrastructure({ settings }) {
  const downwardFanRefs = useRef([]);
  const ceilingFanRefs = useRef([]);
  const roofPitchRadians = THREE.MathUtils.degToRad(settings.roofPitch);
  const roofRidgeZ = settings.roofOffset;
  const roofRidgeY = 4 + Math.tan(roofPitchRadians) * 2.3;
  const leftRoofLength = Math.hypot(roofRidgeZ + 4.6, roofRidgeY - 4);
  const rightRoofLength = Math.hypot(4.6 - roofRidgeZ, 4 - roofRidgeY);
  const leftRoofCenter = [0, (4 + roofRidgeY) / 2, (-4.6 + roofRidgeZ) / 2];
  const rightRoofCenter = [0, (roofRidgeY + 4) / 2, (roofRidgeZ + 4.6) / 2];
  const leftRoofRotation = Math.atan2(-(roofRidgeY - 4), roofRidgeZ + 4.6);
  const rightRoofRotation = Math.atan2(-(4 - roofRidgeY), 4.6 - roofRidgeZ);
  const louverAngle = THREE.MathUtils.lerp(0, THREE.MathUtils.degToRad(58), settings.clerestoryOpen);

  useFrame((_, delta) => {
    downwardFanRefs.current.forEach((fan) => {
      if (fan) fan.rotation.y += delta * (2 + settings.downFans * 5);
    });
    ceilingFanRefs.current.forEach((fan) => {
      if (fan) fan.rotation.x += delta * (2 + settings.ceilingFans * 5);
    });
  });

  return (
    <group>
      <group visible={settings.shaftExchange > 0.01}>
        {SHAFT_POSITIONS.map((shaftX) => (
          <group key={shaftX} position={[shaftX, 0, -1.4]}>
            <mesh position={[0, 5.2, 0]}>
              <boxGeometry args={[1.25, 2.5, 1.25]} />
              <meshStandardMaterial color="#708b82" metalness={0.45} roughness={0.55} transparent opacity={0.78} />
            </mesh>
            <mesh position={[0, 6.55, 0]}>
              <boxGeometry args={[1.5, 0.12, 1.5]} />
              <meshStandardMaterial color="#d5b75e" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 3.98, 0]}>
              <boxGeometry args={[1.05, 0.08, 1.05]} />
              <meshStandardMaterial color="#1d3536" metalness={0.35} roughness={0.45} />
            </mesh>
            <group ref={(element) => { downwardFanRefs.current[SHAFT_POSITIONS.indexOf(shaftX)] = element; }} position={[0, 3.84, 0]}>
              <mesh>
                <cylinderGeometry args={[0.48, 0.48, 0.1, 16]} />
                <meshStandardMaterial color="#e0a24e" emissive="#7a3d18" emissiveIntensity={0.25} metalness={0.65} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0.06, 0]}>
                <boxGeometry args={[0.9, 0.04, 0.08]} />
                <meshBasicMaterial color="#f7d68a" />
              </mesh>
              <mesh position={[0, 0.06, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[0.9, 0.04, 0.08]} />
                <meshBasicMaterial color="#f7d68a" />
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
              <boxGeometry args={[1.35, 0.08, 0.16]} />
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

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track"><span /></span>
      <span>{label}</span>
    </label>
  );
}

function ControlSlider({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="slider-control">
      <span className="control-label"><span>{label}</span><strong>{value.toFixed(step < 0.01 ? 3 : step < 1 ? 1 : 2)}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function TelemetryPanel({ settings, onSettingsChange, temperature, gpuError, sustainabilityScore }) {
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
      <div className="controls-group">
        <ControlSlider label="Air density" value={settings.density} min={0.5} max={3} step={0.05} suffix=" kg/m³" onChange={(density) => onSettingsChange({ density })} />
        <ControlSlider label="Fluid stiffness" value={settings.stiffness} min={1} max={20} step={0.5} suffix="" onChange={(stiffness) => onSettingsChange({ stiffness })} />
        <ControlSlider label="Viscosity" value={settings.viscosity} min={0.001} max={0.05} step={0.001} suffix=" Pa·s" onChange={(viscosity) => onSettingsChange({ viscosity })} />
      </div>
      <div className="systems-group">
        <div className="subsection-label">SUSTAINABLE AIRFLOW SYSTEMS</div>
        <ControlSlider label="Shaft exchange" value={settings.shaftExchange} min={0} max={1} step={0.05} suffix="" onChange={(shaftExchange) => onSettingsChange({ shaftExchange })} />
        <ControlSlider label="Downward fans" value={settings.downFans} min={0} max={1} step={0.05} suffix="" onChange={(downFans) => onSettingsChange({ downFans })} />
        <ControlSlider label="Ceiling flow" value={settings.ceilingFans} min={0} max={1} step={0.05} suffix="" onChange={(ceilingFans) => onSettingsChange({ ceilingFans })} />
        <ControlSlider label="Passive grooves" value={settings.grooves} min={0} max={1} step={0.05} suffix="" onChange={(grooves) => onSettingsChange({ grooves })} />
        <ControlSlider label="Roof pitch" value={settings.roofPitch} min={-28} max={28} step={1} suffix="°" onChange={(roofPitch) => onSettingsChange({ roofPitch })} />
        <ControlSlider label="Ridge offset" value={settings.roofOffset} min={-2} max={2} step={0.1} suffix=" z" onChange={(roofOffset) => onSettingsChange({ roofOffset })} />
        <ControlSlider label="Clerestory louvers" value={settings.clerestoryOpen} min={0} max={1} step={0.05} suffix="" onChange={(clerestoryOpen) => onSettingsChange({ clerestoryOpen })} />
        <ControlSlider label="Shaft stack effect" value={settings.stackEffect} min={0} max={1} step={0.05} suffix="" onChange={(stackEffect) => onSettingsChange({ stackEffect })} />
        <ControlSlider label="Flood gallery flow" value={settings.floodFlow} min={0} max={1} step={0.05} suffix="" onChange={(floodFlow) => onSettingsChange({ floodFlow })} />
        <ControlSlider label="Flood pump direction" value={settings.floodPumpDirection} min={-1} max={1} step={0.1} suffix="" onChange={(floodPumpDirection) => onSettingsChange({ floodPumpDirection })} />
      </div>
      <div className="toggles-group">
        <Toggle label="Train piston force" checked={settings.train} onChange={(train) => onSettingsChange({ train })} />
        <Toggle label="AC exhaust heat" checked={settings.ac} onChange={(ac) => onSettingsChange({ ac })} />
        <Toggle label="Brake friction" checked={settings.brakes} onChange={(brakes) => onSettingsChange({ brakes })} />
        <Toggle label="Flood control tunnels" checked={settings.floodTunnels} onChange={(floodTunnels) => onSettingsChange({ floodTunnels })} />
      </div>
      <div className="sustainability-readout">
        <div className="sustainability-heading"><span>Thermal resilience</span><strong>{sustainabilityScore}%</strong></div>
        <div className="sustainability-meter"><span style={{ width: `${sustainabilityScore}%` }} /></div>
        <div className="balance-labels"><span>PASSIVE FIRST</span><span>LOW ENERGY LOAD</span></div>
      </div>
    </aside>
  );
}

function App() {
  const [settings, setSettings] = useState(INITIALS);
  const [temperature, setTemperature] = useState(81.5);
  const [gpuError, setGpuError] = useState('');
  const handleSettingsChange = (change) => setSettings((currentSettings) => ({ ...currentSettings, ...change }));
  const passiveCooling = settings.shaftExchange * 32 + settings.grooves * 18 + (settings.floodTunnels ? settings.floodFlow * 22 : 0);
  const activeLoad = settings.downFans * 8 + settings.ceilingFans * 10;
  const sustainabilityScore = Math.round(Math.max(0, Math.min(100, 45 + passiveCooling - activeLoad)));

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
      <TelemetryPanel settings={settings} onSettingsChange={handleSettingsChange} temperature={temperature} gpuError={gpuError} sustainabilityScore={sustainabilityScore} />
      <aside className="legend-panel panel">
        <div className="legend-heading"><span>Thermal dispersion</span><span className="legend-unit">NORMALIZED / 0—1</span></div>
        <div className="gradient-bar" />
        <div className="legend-labels"><span>60°F <small>cool air</small></span><span>85°F <small>mixed</small></span><span>110°F <small>heat input</small></span></div>
      </aside>
      <footer className="footer-note"><span>PLATFORM 04 / ACTIVE</span><span>Drag to orbit · Scroll to zoom</span></footer>
    </main>
  );
}

export default App;