import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, FrontSide, MathUtils, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { calculateFrcModel, FRC_CONFIGURATIONS, FRC_EXCITATION_CONFIGURATIONS, FRC_INPUTS, FRC_RECOVERY_CONFIGURATIONS, FRC_SHAPES, getFrcVisualizationVisibility } from './frcModel.js';
import { advanceFlowProgress, createFlowPathPoints, createInputParticlePathPoints, FLOW_PARTICLE_STREAMS, getFlowParticleVisibility, getInputParticleVisibility, INPUT_PARTICLE_STREAMS, toroidalPoint } from './flowParticles.js';
import { calculateFocusBeamDirection, calculatePlasmaFocusBeam, PLASMA_FOCUS_ION_SPECIES, samplePlasmaFocusTrajectory } from './plasmaFocusModel.js';
import { createGpuParticleField, createSimulationUvs } from './simulations/gpuParticleRuntime.js';
import { ColorParamControl, HistoryControls, NumericParamControl, ParamEditingProvider, ParamEditingToggle, ParamSelect } from './lib/ParamControls.jsx';
import { useSimulationEditor, useUndoRedoShortcuts } from './lib/simulation-state.js';
import { QUANTUM_TRANSPORT_OPTIONS, quantumTransportIndex } from './mechanicsModels.js';

const DEFAULT_PLASMA_COLOR = '#ff4fa3';
const ARGON_PLASMA_COLOR = '#5ed9e8';
const DEFAULT_VESSEL_SHELL_COLOR = '#a9d9dd';
const DEFAULT_VESSEL_SHELL_EMISSIVE_COLOR = '#000000';
const DEFAULT_SEPARATRIX_VOLUME_COLOR = DEFAULT_PLASMA_COLOR;
const DEFAULT_SEPARATRIX_VOLUME_EMISSIVE_COLOR = DEFAULT_PLASMA_COLOR;
const INITIAL_RECOVERY_CONFIGURATIONS = Object.fromEntries(
  Object.entries(FRC_RECOVERY_CONFIGURATIONS).map(([id, recovery]) => [id, { ...recovery }])
);
const INITIAL_EXCITATION_CONFIGURATIONS = Object.fromEntries(
  Object.entries(FRC_EXCITATION_CONFIGURATIONS).map(([id, excitation]) => [id, { ...excitation }])
);

const INITIAL_CONFIGURATION = {
  shape: 'elongated',
  configuration: 'thetaPinch',
  input: 'DT',
  magneticField: 2.8,
  density: 1.8,
  ionTemperature: 1.6,
  auxiliaryHeatingMW: 12,
  excitationConfiguration: 'axialReference',
  excitationConfigurations: INITIAL_EXCITATION_CONFIGURATIONS,
  recoveryConfiguration: 'inductiveDirect',
  recoveryConfigurations: INITIAL_RECOVERY_CONFIGURATIONS,
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
  plasmaColor: DEFAULT_PLASMA_COLOR,
  vesselShellColor: DEFAULT_VESSEL_SHELL_COLOR,
  vesselShellEmissiveColor: DEFAULT_VESSEL_SHELL_EMISSIVE_COLOR,
  separatrixVolumeColor: DEFAULT_SEPARATRIX_VOLUME_COLOR,
  separatrixVolumeEmissiveColor: DEFAULT_SEPARATRIX_VOLUME_EMISSIVE_COLOR,
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
};
const FRC_PANEL_LAYOUT = {
  breakpoint: 700,
  width: 350,
  right: 28
};

function cameraFrameOffset(camera, cameraPosition, target, viewport, parametersVisible) {
  if (!parametersVisible || viewport.width <= FRC_PANEL_LAYOUT.breakpoint) return new Vector3();
  const shiftPixels = FRC_PANEL_LAYOUT.width / 2;
  const distance = cameraPosition.distanceTo(target);
  const horizontalSpan = 2 * distance * Math.tan(MathUtils.degToRad(camera.fov) / 2)
    * viewport.width / viewport.height;
  const forward = target.clone().sub(cameraPosition).normalize();
  const right = forward.cross(new Vector3(0, 1, 0)).normalize();
  return right.multiplyScalar(shiftPixels * horizontalSpan / viewport.width);
}

const OUTPUT_COMPONENTS = {
  nitrogen: {
    label: 'Nitrogen purge',
    detail: 'N2 blanket / vessel cooling'
  },
  helium: {
    label: 'Helium alpha product',
    detail: 'charged fusion energy'
  },
  neutrons: {
    label: 'Neutron flux',
    detail: '14.1 MeV reaction branch'
  }
};

const ORIENTATION_TICKS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
const ORIENTATION_SNAP_DISTANCE = 4;
const ORIENTATION_EASING = 12;

function dampRotationAngle(current, target, delta) {
  const fullTurn = Math.PI * 2;
  const shortestDelta = MathUtils.euclideanModulo(target - current + Math.PI, fullTurn) - Math.PI;
  return current + shortestDelta * (1 - Math.exp(-ORIENTATION_EASING * delta));
}

const PLASMA_PARTICLE_COUNT = 4096;
const E2E_PLASMA_PARTICLE_COUNT = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e') ? 2048 : null;
const ACTIVE_PLASMA_PARTICLE_COUNT = E2E_PLASMA_PARTICLE_COUNT ?? PLASMA_PARTICLE_COUNT;
const PLASMA_RESOLUTION = Math.ceil(Math.sqrt(ACTIVE_PLASMA_PARTICLE_COUNT));
const MHD_MODE_INDICES = Object.freeze({ axial: 1, rotating: 2, nozzle: 3, 'piezo-rmf': 4, 'ion-acoustic': 5 });

function mhdModeIndex(model) {
  return model.mhd.active ? MHD_MODE_INDICES[model.mhd.mode] ?? 0 : 0;
}

const plasmaPositionShader = `
  uniform float uDt;
  uniform float uHalfLength;
  uniform float uRadius;
  uniform float uToroidal;
  uniform float uHelicalExcursion;
  uniform float uFieldPeriods;
  uniform bool uRunning;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    if (uRunning) positionData.xyz += velocityData.xyz * uDt;

    if (uToroidal > 0.5) {
      float toroidalAngle = atan(positionData.y, positionData.x);
      float centerRadius = uHalfLength + uHelicalExcursion * cos(uFieldPeriods * toroidalAngle);
      float centerZ = uHelicalExcursion * sin(uFieldPeriods * toroidalAngle);
      vec3 centerline = vec3(cos(toroidalAngle) * centerRadius, sin(toroidalAngle) * centerRadius, centerZ);
      vec3 tubeOffset = positionData.xyz - centerline;
      float tubeDistance = length(tubeOffset);
      if (tubeDistance > uRadius) {
        positionData.xyz = centerline + tubeOffset * (uRadius * 0.985 / tubeDistance);
        velocityData.xyz *= -0.45;
      }
    } else {
      float radialDistance = length(positionData.yz);
      if (radialDistance > uRadius) {
        positionData.yz *= (uRadius * 0.985) / radialDistance;
        velocityData.yz *= -0.45;
      }
      if (positionData.x > uHalfLength) positionData.x = -uHalfLength + 0.02;
      if (positionData.x < -uHalfLength) positionData.x = uHalfLength - 0.02;
    }
    positionData.w = clamp(positionData.w * 0.998 + length(velocityData.xyz) * 0.03, 0.05, 1.0);
    gl_FragColor = positionData;
  }
`;

const plasmaVelocityShader = `
  uniform float uDt;
  uniform float uField;
  uniform float uAxialField;
  uniform float uRadius;
  uniform float uHalfLength;
  uniform float uToroidal;
  uniform float uHelicalExcursion;
  uniform float uFieldPeriods;
  uniform float uRotation;
  uniform float uTemperature;
  uniform float uDensity;
  uniform float uTransportSpeed;
  uniform float uTransportModel;
  uniform float uQuantumPressure;
  uniform float uDilatancy;
  uniform float uSpeedLimit;
  uniform float uMhdMode;
  uniform float uDriveTime;
  uniform float uDriveAmplitude;
  uniform float uDriveCoupling;
  uniform float uDriveFrequencyRatio;
  uniform float uWavePacketWidth;
  uniform bool uRunning;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 position = positionData.xyz;
    vec3 velocity = velocityData.xyz;
    float toroidalAngle = atan(position.y, position.x);
    float centerRadius = uHalfLength + uHelicalExcursion * cos(uFieldPeriods * toroidalAngle);
    float centerZ = uHelicalExcursion * sin(uFieldPeriods * toroidalAngle);
    vec3 centerline = vec3(cos(toroidalAngle) * centerRadius, sin(toroidalAngle) * centerRadius, centerZ);
    vec3 tubeOffset = position - centerline;
    float radialDistance = uToroidal > 0.5 ? max(length(tubeOffset), 0.001) : max(length(position.yz), 0.001);
    vec3 radial = uToroidal > 0.5 ? tubeOffset / radialDistance : vec3(0.0, position.y, position.z) / radialDistance;
    vec3 azimuthal = uToroidal > 0.5
      ? normalize(vec3(-position.y, position.x, 0.0))
      : vec3(0.0, -position.z, position.y) / radialDistance;
    float normalizedRadius = clamp(radialDistance / uRadius, 0.0, 1.0);
    float edgePressure = smoothstep(0.45, 1.0, normalizedRadius);
    float axialProfile = cos(position.x / max(uHalfLength, 0.1) * 1.5708);
    vec3 acceleration = -radial * edgePressure * (uField * 0.72 + uDensity * 0.18);
    acceleration += azimuthal * uRotation * uField * (0.3 + 0.7 * axialProfile);
    if (uToroidal > 0.5) acceleration += azimuthal * uTransportSpeed * 0.32 * sign(uAxialField);
    else acceleration.x += uTransportSpeed * (0.16 + 0.28 * axialProfile) * sign(uAxialField);
    if (uMhdMode > 0.5) {
      vec3 axialDirection = vec3(sign(uAxialField), 0.0, 0.0);
      acceleration += cross(velocity, axialDirection) * uField * 0.55;
      if (uMhdMode < 1.5) {
        acceleration.x += -position.x / max(uHalfLength, 0.1) * uField * 0.18;
      } else if (uMhdMode < 2.5) {
        acceleration += azimuthal * uField * (0.24 + normalizedRadius * 0.34);
      } else if (uMhdMode < 3.5) {
        float nozzleProgress = clamp(position.x / max(uHalfLength, 0.1) * 0.5 + 0.5, 0.0, 1.0);
        acceleration.x += uField * (0.12 + nozzleProgress * 0.42);
        acceleration += -radial * uField * (1.0 - nozzleProgress) * 0.16;
      } else if (uMhdMode < 4.5) {
        float piezoPhase = uDriveTime * (2.0 + min(uDriveFrequencyRatio, 2.0) * 2.0);
        float strainModulation = uDriveAmplitude * uDriveCoupling * sin(piezoPhase);
        acceleration += azimuthal * uField * (0.24 + strainModulation * 0.7);
        acceleration += -radial * uField * abs(strainModulation) * 0.12;
      } else {
        float normalizedAxialPosition = position.x / max(uHalfLength, 0.1);
        float packetEnvelope = exp(-pow(normalizedAxialPosition / max(uWavePacketWidth, 0.05), 2.0));
        float wavePhase = normalizedAxialPosition * 6.2832 - uDriveTime * (2.0 + min(uDriveFrequencyRatio, 4.0));
        acceleration.x += sin(wavePhase) * packetEnvelope * uField * uDriveAmplitude * uDriveCoupling * 0.85;
      }
    }
    if (uTransportModel > 0.5 && uTransportModel < 1.5) {
      float coreRadius = max(uRadius * 0.28, 0.05);
      float coreRatio = radialDistance / coreRadius;
      acceleration += radial * uQuantumPressure * exp(-(coreRatio * coreRatio));
    } else if (uTransportModel > 1.5) {
      float speed = length(velocity);
      float beta = clamp(speed / max(uSpeedLimit, 0.1), 0.0, 0.9999);
      float lorentzFactor = inversesqrt(1.0 - beta * beta);
      float strainRate = speed / max(uRadius, 0.05);
      float dilatantDrag = uDilatancy * ((lorentzFactor - 1.0) + strainRate);
      acceleration += -velocity * dilatantDrag;
    }
    acceleration += -velocity * (0.34 + uTemperature * 0.018);
    if (!uRunning) acceleration = -velocity * 3.0;
    velocity += acceleration * uDt;
    float maxSpeed = 0.45 + uTemperature * 0.08 + uField * 0.06;
    velocity = clamp(velocity, vec3(-maxSpeed), vec3(maxSpeed));
    velocityData.xyz = velocity;
    velocityData.w = clamp(0.18 + length(velocity) / max(maxSpeed, 0.01) * 0.72, 0.0, 1.0);
    gl_FragColor = velocityData;
  }
`;

const plasmaVertexShader = `
  attribute vec2 aSimulationUv;
  uniform sampler2D uPositionTex;
  uniform sampler2D uVelocityTex;
  uniform float uPointSize;
  uniform float uOpacity;
  uniform float uHighlight;
  varying float vEnergy;

  void main() {
    vec2 simulationUv = aSimulationUv;
    vec4 positionData = texture2D(uPositionTex, simulationUv);
    vec4 velocityData = texture2D(uVelocityTex, simulationUv);
    vec4 mvPosition = modelViewMatrix * vec4(positionData.xyz, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = max(1.5, uPointSize * (1.0 + velocityData.w * 0.9) / max(-mvPosition.z, 1.0)) * (1.0 + uHighlight * 0.55);
    vEnergy = clamp(positionData.w * 0.72 + velocityData.w * 0.28, 0.0, 1.0) * uOpacity;
  }
`;

const plasmaFragmentShader = `
  uniform vec3 uColor;
  uniform float uHighlight;
  varying float vEnergy;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceFromCenter = length(point);
    if (distanceFromCenter > 0.5) discard;
    float glow = pow(1.0 - smoothstep(0.0, 0.5, distanceFromCenter), 1.7);
    vec3 color = mix(uColor, vec3(1.0), clamp(vEnergy * 0.42 + uHighlight * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(color, glow * (0.35 + vEnergy * 0.65) * (1.0 + uHighlight * 0.3));
  }
`;

function deviceToroidalCenterline(model, scale, minorOffset = 0, verticalOffset = 0, segments = 192) {
  return new CatmullRomCurve3(Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return new Vector3(...toroidalPoint({
      angle,
      majorRadius: model.wallHalfLength * scale,
      minorOffset: minorOffset * scale,
      verticalOffset: verticalOffset * scale,
      helicalExcursion: model.helicalExcursion * scale,
      fieldPeriods: model.fieldPeriods
    }));
  }), true);
}

function stellaratorCenterline(model, scale, segments = 192) {
  return deviceToroidalCenterline(model, scale, 0, 0, segments);
}

function StellaratorVessel({ model, scale, opacity, surfaceColor, emissiveColor, showCoils }) {
  const centerline = useMemo(() => stellaratorCenterline(model, scale), [model, scale]);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[centerline, 256, model.wallRadius * scale, 32, true]} />
        <meshPhysicalMaterial color={surfaceColor} emissive={emissiveColor} transparent opacity={opacity} roughness={0.2} metalness={0.35} side={FrontSide} depthWrite={false} />
      </mesh>
      <group name="magnetic-coils" visible={showCoils}>
        {Array.from({ length: 12 }, (_, index) => {
          const progress = index / 12;
          const point = centerline.getPointAt(progress);
          const tangent = centerline.getTangentAt(progress);
          const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangent);
          return (
            <mesh key={index} position={point} quaternion={quaternion}>
              <torusGeometry args={[model.wallRadius * scale + 0.2, 0.07, 10, 40]} />
              <meshBasicMaterial color="#a9e46f" transparent opacity={0.78} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function ReactorVessel({ model, scale, opacity, surfaceColor, emissiveColor, showCoils }) {
  const vesselLength = model.wallHalfLength * 2 * scale;
  const vesselRadius = model.wallRadius * scale;
  const coilPositions = Array.from({ length: 9 }, (_, index) => (
    -model.plasmaHalfLength + (index / 8) * model.plasmaHalfLength * 2
  ));

  if (model.geometry === 'stellarator') {
    return <StellaratorVessel model={model} scale={scale} opacity={opacity} surfaceColor={surfaceColor} emissiveColor={emissiveColor} showCoils={showCoils} />;
  }
  if (model.geometry === 'tokamak') {
    return (
      <group>
        <mesh>
          <torusGeometry args={[model.wallHalfLength * scale, vesselRadius, 32, 128]} />
          <meshPhysicalMaterial color={surfaceColor} emissive={emissiveColor} transparent opacity={opacity} roughness={0.2} metalness={0.35} side={FrontSide} depthWrite={false} />
        </mesh>
        <group name="magnetic-coils" visible={showCoils}>
          {[-0.48, -0.24, 0, 0.24, 0.48].map((offset) => (
            <mesh key={offset} position={[0, 0, offset * vesselRadius]}>
              <torusGeometry args={[model.wallHalfLength * scale + offset * vesselRadius * 0.16, vesselRadius + 0.08, 10, 96]} />
              <meshBasicMaterial color="#5ed9e8" transparent opacity={0.72} depthWrite={false} />
            </mesh>
          ))}
        </group>
      </group>
    );
  }
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[vesselRadius, vesselRadius, vesselLength, 64, 1, true]} />
        <meshPhysicalMaterial color={surfaceColor} emissive={emissiveColor} transparent opacity={opacity} roughness={0.2} metalness={0.35} side={DoubleSide} depthWrite={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * vesselLength / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[vesselRadius, 0.1, 12, 64]} />
          <meshBasicMaterial color="#8fc9cd" transparent opacity={Math.min(0.8, opacity + 0.3)} depthWrite={false} />
        </mesh>
      ))}
      <group name="magnetic-coils" visible={showCoils}>
        {coilPositions.map((position) => (
          <mesh key={position} position={[position * scale, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[vesselRadius + 0.28, 0.075, 10, 48]} />
            <meshBasicMaterial color="#ee9565" transparent opacity={0.76} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const PLASMA_FOCUS_NOZZLE_COLOR = '#74d6bd';
const PLASMA_FOCUS_EMISSIVE_COLOR = '#68c1aa';
const PLASMA_FOCUS_ARRAY_PALETTES = {
  radialGunRings: { body: PLASMA_FOCUS_NOZZLE_COLOR, emissive: PLASMA_FOCUS_EMISSIVE_COLOR, nozzle: PLASMA_FOCUS_NOZZLE_COLOR },
  vortexGunRings: { body: PLASMA_FOCUS_NOZZLE_COLOR, emissive: PLASMA_FOCUS_EMISSIVE_COLOR, nozzle: PLASMA_FOCUS_NOZZLE_COLOR }
};

function PlasmaGun({ position, azimuth, cantDegrees, scale, direction: directedAim, palette }) {
  const quaternion = useMemo(() => {
    if (directedAim) return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...directedAim).normalize());
    const inward = new Vector3(0, -Math.cos(azimuth), -Math.sin(azimuth));
    const tangent = new Vector3(0, -Math.sin(azimuth), Math.cos(azimuth));
    const cant = MathUtils.degToRad(cantDegrees);
    const direction = inward.multiplyScalar(Math.cos(cant)).add(tangent.multiplyScalar(Math.sin(cant))).normalize();
    return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
  }, [azimuth, cantDegrees, directedAim]);
  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      <mesh>
        <cylinderGeometry args={[0.12, 0.17, 0.72, 12]} />
        <meshStandardMaterial color={palette.body} emissive={palette.emissive} emissiveIntensity={0.9} metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh position={[0, -0.36, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[0.17, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color={palette.nozzle} />
      </mesh>
    </group>
  );
}

function calculateFocusLauncherLayout(model, scale) {
  const { ringCount, launchersPerRing, launcherAnglesDegrees } = model.excitation;
  const tubeAxisCantDegrees = model.excitation.tubeAxisCantDegrees;
  const mountRadius = (model.wallRadius + 0.62) * scale;
  const axialSpan = model.plasmaHalfLength * 1.28 * scale;
  return Array.from({ length: ringCount }, (_, ringIndex) => Array.from({ length: launchersPerRing }, (__, launcherIndex) => {
      const index = ringIndex * launchersPerRing + launcherIndex;
      const cant = MathUtils.degToRad(launcherAnglesDegrees[index] ?? 0);
      if (model.geometry === 'frc') {
        const azimuth = launcherIndex / launchersPerRing * Math.PI * 2
          + ringIndex * MathUtils.degToRad(model.excitation.phaseOffsetDegrees);
        const axialPosition = ringCount === 1
          ? 0
          : -axialSpan / 2 + ringIndex / (ringCount - 1) * axialSpan;
        const inward = new Vector3(0, -Math.cos(azimuth), -Math.sin(azimuth));
        const tangent = new Vector3(0, -Math.sin(azimuth), Math.cos(azimuth));
        const direction = calculateFocusBeamDirection({
          inward: inward.toArray(),
          flowTangent: tangent.toArray(),
          tubeDirection: [1, 0, 0],
          flowRelativeCantDegrees: launcherAnglesDegrees[index] ?? 0,
          tubeAxisCantDegrees
        });
        return {
          position: [axialPosition, Math.cos(azimuth) * mountRadius, Math.sin(azimuth) * mountRadius],
          direction,
          azimuth,
          cantDegrees: launcherAnglesDegrees[index] ?? 0,
          travelLengthM: (model.wallRadius + 0.62) / Math.max(0.15, Math.cos(cant) * Math.cos(MathUtils.degToRad(tubeAxisCantDegrees)))
        };
      }
      const angle = launcherIndex / launchersPerRing * Math.PI * 2
        + ringIndex / (ringCount * launchersPerRing) * Math.PI * 2
        + MathUtils.degToRad(model.excitation.phaseOffsetDegrees);
      const centerlinePoint = (positionAngle) => new Vector3(...toroidalPoint({
        angle: positionAngle,
        majorRadius: model.wallHalfLength * scale,
        helicalExcursion: model.helicalExcursion * scale,
        fieldPeriods: model.fieldPeriods
      }));
      const epsilon = 0.001;
      const center = centerlinePoint(angle);
      const tangent = centerlinePoint(angle + epsilon).sub(centerlinePoint(angle - epsilon)).normalize();
      const outward = new Vector3(Math.cos(angle), Math.sin(angle), 0);
      outward.addScaledVector(tangent, -outward.dot(tangent)).normalize();
      const binormal = new Vector3().crossVectors(outward, tangent).normalize();
      const crossSectionAngle = ringIndex / ringCount * Math.PI * 2;
      const localNormal = outward.multiplyScalar(Math.cos(crossSectionAngle))
        .addScaledVector(binormal, Math.sin(crossSectionAngle)).normalize();
      const direction = calculateFocusBeamDirection({
        inward: localNormal.clone().negate().toArray(),
        flowTangent: tangent.toArray(),
        tubeDirection: tangent.toArray(),
        flowRelativeCantDegrees: launcherAnglesDegrees[index] ?? 0,
        tubeAxisCantDegrees
      });
      const position = center.addScaledVector(localNormal, mountRadius);
      return {
        position: position.toArray(),
        direction,
        azimuth: angle,
        cantDegrees: launcherAnglesDegrees[index] ?? 0,
        travelLengthM: (model.wallRadius + 0.62) / Math.max(0.15, Math.cos(cant) * Math.cos(MathUtils.degToRad(tubeAxisCantDegrees)))
      };
    }));
}

function GunRingHardware({ model, scale }) {
  const layout = calculateFocusLauncherLayout(model, scale);
  const palette = PLASMA_FOCUS_ARRAY_PALETTES[model.excitation.configuration] ?? PLASMA_FOCUS_ARRAY_PALETTES.radialGunRings;
  return layout.flatMap((ring, ringIndex) => ring.map((launcher, launcherIndex) => (
    <PlasmaGun
      key={`${ringIndex}-${launcherIndex}`}
      position={launcher.position}
      direction={launcher.direction}
      azimuth={launcher.azimuth}
      cantDegrees={launcher.cantDegrees}
      scale={scale}
      palette={palette}
    />
  )));
}

function ToroidalGunRingHardware({ model, scale }) {
  const layout = calculateFocusLauncherLayout(model, scale);
  const palette = PLASMA_FOCUS_ARRAY_PALETTES[model.excitation.configuration] ?? PLASMA_FOCUS_ARRAY_PALETTES.radialGunRings;
  return (
    <group name={`${model.geometry}-toroidal-gun-rings`}>
      {layout.flatMap((ring, ringIndex) => ring.map((launcher, launcherIndex) => (
        <PlasmaGun key={`${ringIndex}-${launcherIndex}`} position={launcher.position} direction={launcher.direction} scale={scale} palette={palette} />
      )))}
    </group>
  );
}

const BEAMLETS_PER_FOCUS = 8;

function PlasmaFocusBeamParticles({ model, scale, visible, running }) {
  const layout = useMemo(() => calculateFocusLauncherLayout(model, 1).flat(), [model]);
  const positions = useMemo(() => new Float32Array(layout.length * BEAMLETS_PER_FOCUS * 3), [layout.length]);
  const energies = useMemo(() => new Float32Array(layout.length * BEAMLETS_PER_FOCUS), [layout.length]);
  const geometry = useMemo(() => {
    const beamGeometry = new BufferGeometry();
    beamGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    beamGeometry.setAttribute('aBeamEnergy', new BufferAttribute(energies, 1));
    return beamGeometry;
  }, [energies, positions]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: `
      attribute float aBeamEnergy;
      varying float vBeamEnergy;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = max(3.0, 52.0 / max(-viewPosition.z, 1.0)) * (0.75 + aBeamEnergy * 0.5);
        vBeamEnergy = aBeamEnergy;
      }
    `,
    fragmentShader: `
      varying float vBeamEnergy;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float radius = length(point);
        if (radius > 0.5) discard;
        float glow = 1.0 - smoothstep(0.08, 0.5, radius);
        vec3 beamColor = mix(vec3(1.0, 0.34, 0.12), vec3(1.0, 0.91, 0.56), vBeamEnergy);
        gl_FragColor = vec4(beamColor, glow * (0.45 + 0.5 * vBeamEnergy));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending
  }), []);
  const focusSettings = model.excitation.focusBeam;

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    if (!running || !focusSettings) return;
    const displayPulseRateHz = Math.min(2, Math.max(0.15, focusSettings.pulseRepetitionHz * 0.08));
    const physicalWaveTime = clock.elapsedTime * 1e-4;
    layout.forEach((launcher, launcherIndex) => {
      const beam = calculatePlasmaFocusBeam({
        ...focusSettings,
        launcherCount: model.excitation.launcherCount,
        wavePosition: { x: launcher.position[0], y: launcher.position[1], z: launcher.position[2] },
        timeSeconds: physicalWaveTime
      });
      const gapM = Math.min(beam.focusGapM, launcher.travelLengthM);
      const flightTime = beam.accelerationTimeMicroseconds * 1e-6
        + Math.max(0, launcher.travelLengthM - gapM) / beam.ionSpeedMps;
      for (let beamletIndex = 0; beamletIndex < BEAMLETS_PER_FOCUS; beamletIndex += 1) {
        const pulsePhase = (clock.elapsedTime * displayPulseRateHz + beamletIndex / BEAMLETS_PER_FOCUS) % 1;
        const trajectory = samplePlasmaFocusTrajectory({
          origin: { x: launcher.position[0], y: launcher.position[1], z: launcher.position[2] },
          direction: { x: launcher.direction[0], y: launcher.direction[1], z: launcher.direction[2] },
          beam,
          ageSeconds: pulsePhase * flightTime,
          travelLengthM: launcher.travelLengthM
        });
        const particleIndex = launcherIndex * BEAMLETS_PER_FOCUS + beamletIndex;
        const offset = particleIndex * 3;
        positions[offset] = trajectory.position.x * scale;
        positions[offset + 1] = trajectory.position.y * scale;
        positions[offset + 2] = trajectory.position.z * scale;
        energies[particleIndex] = trajectory.velocityMps / beam.ionSpeedMps;
      }
    });
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aBeamEnergy.needsUpdate = true;
  });

  if (!focusSettings || layout.length === 0) return null;
  return <points name="plasma-focus-beamlets" geometry={geometry} material={material} visible={visible} renderOrder={25} frustumCulled={false} />;
}

function TokamakLoopHardware({ model, scale }) {
  const radius = (model.wallRadius + 0.55) * scale;
  const count = Math.max(1, model.excitation.ringCount);
  return Array.from({ length: count }, (_, index) => {
    const axialPosition = count === 1 ? 0 : (-0.32 + index / (count - 1) * 0.64) * model.plasmaHalfLength * scale;
    return (
      <mesh key={index} position={[axialPosition, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[radius, 0.13 * scale, 12, 72]} />
        <meshStandardMaterial color="#5ed9e8" emissive="#123f49" emissiveIntensity={0.9} metalness={0.62} roughness={0.25} />
      </mesh>
    );
  });
}

function ToroidalTokamakLoopHardware({ model, scale }) {
  const centerline = useMemo(() => deviceToroidalCenterline(model, scale), [model, scale]);
  const count = Math.max(8, model.excitation.ringCount * 4);
  return Array.from({ length: count }, (_, index) => {
    const progress = index / count;
    const point = centerline.getPointAt(progress);
    const tangent = centerline.getTangentAt(progress);
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangent);
    return (
      <mesh key={index} position={point} quaternion={quaternion}>
        <torusGeometry args={[(model.wallRadius + 0.48) * scale, 0.1 * scale, 12, 56]} />
        <meshStandardMaterial color="#5ed9e8" emissive="#123f49" emissiveIntensity={0.9} metalness={0.62} roughness={0.25} />
      </mesh>
    );
  });
}

function StellaratorLoopHardware({ model, scale }) {
  const curves = useMemo(() => Array.from({ length: Math.max(1, model.excitation.ringCount) }, (_, windingIndex) => {
    const points = Array.from({ length: 129 }, (__, pointIndex) => {
      const progress = pointIndex / 128;
      const phase = progress * Math.PI * 2 * model.excitation.fieldPeriods
        + windingIndex / Math.max(1, model.excitation.ringCount) * Math.PI * 2;
      const radius = (model.wallRadius + 0.48 + Math.cos(phase * 2) * 0.08) * scale;
      return new Vector3(
        (progress * 2 - 1) * model.plasmaHalfLength * 0.82 * scale,
        Math.cos(phase) * radius,
        Math.sin(phase) * radius
      );
    });
    return new CatmullRomCurve3(points);
  }), [model.excitation.fieldPeriods, model.excitation.ringCount, model.plasmaHalfLength, model.wallRadius, scale]);
  return curves.map((curve, index) => (
    <mesh key={index}>
      <tubeGeometry args={[curve, 192, 0.09 * scale, 8, false]} />
      <meshStandardMaterial color="#a9e46f" emissive="#294818" emissiveIntensity={0.85} metalness={0.58} roughness={0.3} />
    </mesh>
  ));
}

function ToroidalStellaratorLoopHardware({ model, scale }) {
  const curves = useMemo(() => Array.from({ length: Math.max(1, model.excitation.ringCount) }, (_, windingIndex) => {
    const points = Array.from({ length: 129 }, (__, pointIndex) => {
      const angle = pointIndex / 128 * Math.PI * 2;
      const phase = model.excitation.fieldPeriods * angle
        + windingIndex / Math.max(1, model.excitation.ringCount) * Math.PI * 2;
      const coilRadius = model.wallRadius + 0.5;
      return new Vector3(...toroidalPoint({
        angle,
        majorRadius: model.wallHalfLength * scale,
        minorOffset: (coilRadius + Math.cos(phase * 2) * 0.08) * scale,
        verticalOffset: Math.sin(phase) * coilRadius * scale,
        helicalExcursion: model.helicalExcursion * scale,
        fieldPeriods: model.fieldPeriods
      }));
    });
    return new CatmullRomCurve3(points, true);
  }), [model, scale]);
  return curves.map((curve, index) => (
    <mesh key={index}>
      <tubeGeometry args={[curve, 256, 0.09 * scale, 8, true]} />
      <meshStandardMaterial color="#a9e46f" emissive="#294818" emissiveIntensity={0.85} metalness={0.58} roughness={0.3} />
    </mesh>
  ));
}

function ExcitationHardware({ model, scale, visible }) {
  if (!visible || model.excitation.topology === 'axial') return null;
  return (
    <group name="excitation-hardware">
      {model.excitation.topology === 'gun-rings' && (model.geometry === 'frc' ? <GunRingHardware model={model} scale={scale} /> : <ToroidalGunRingHardware model={model} scale={scale} />)}
      {model.excitation.topology === 'tokamak-loop' && (model.geometry === 'tokamak' ? <ToroidalTokamakLoopHardware model={model} scale={scale} /> : <TokamakLoopHardware model={model} scale={scale} />)}
      {model.excitation.topology === 'stellarator-loop' && (model.geometry === 'stellarator' ? <ToroidalStellaratorLoopHardware model={model} scale={scale} /> : <StellaratorLoopHardware model={model} scale={scale} />)}
    </group>
  );
}

function FieldVolume({ model, scale, tilt, surfaceColor, emissiveColor, opacity, highlighted = false }) {
  const plasmaScale = [model.plasmaHalfLength * scale, model.plasmaRadius * scale, model.plasmaRadius * scale];
  const lobeShape = model.shape === 'doubleLobed';
  if (model.geometry === 'stellarator') {
    return (
      <mesh rotation={[0, MathUtils.degToRad(tilt), 0]}>
        <tubeGeometry args={[stellaratorCenterline(model, scale), 256, model.plasmaRadius * scale, 28, true]} />
        <meshPhysicalMaterial color={highlighted ? '#fff1bd' : surfaceColor} emissive={emissiveColor} emissiveIntensity={highlighted ? 1.15 : 0.55} transparent opacity={Math.min(0.9, opacity * (highlighted ? 1.35 : 1))} roughness={0.16} metalness={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
    );
  }
  if (model.geometry === 'tokamak') {
    return (
      <mesh rotation={[0, MathUtils.degToRad(tilt), 0]}>
        <torusGeometry args={[(model.toroidalMajorRadius ?? model.plasmaHalfLength) * scale, model.plasmaRadius * scale, 28, 128]} />
        <meshPhysicalMaterial color={highlighted ? '#fff1bd' : surfaceColor} emissive={emissiveColor} emissiveIntensity={highlighted ? 1.15 : 0.55} transparent opacity={Math.min(0.9, opacity * (highlighted ? 1.35 : 1))} roughness={0.16} metalness={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
    );
  }
  return (
    <group rotation={[0, MathUtils.degToRad(tilt), 0]}>
      <mesh scale={plasmaScale}>
        {lobeShape ? <capsuleGeometry args={[0.72, 1.35, 12, 32]} rotation={[0, 0, Math.PI / 2]} /> : <sphereGeometry args={[1, 48, 24]} />}
        <meshPhysicalMaterial color={highlighted ? '#fff1bd' : surfaceColor} emissive={emissiveColor} emissiveIntensity={highlighted ? 1.15 : 0.55} transparent opacity={Math.min(0.9, opacity * (highlighted ? 1.35 : 1))} roughness={0.16} metalness={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
      {lobeShape && [-1, 1].map((side) => (
        <mesh key={side} position={[side * model.plasmaHalfLength * 0.43 * scale, 0, 0]} scale={[model.plasmaHalfLength * 0.48 * scale, model.plasmaRadius * 0.82 * scale, model.plasmaRadius * 0.82 * scale]}>
          <sphereGeometry args={[1, 36, 20]} />
          <meshBasicMaterial color={highlighted ? '#fff1bd' : surfaceColor} transparent opacity={opacity * (highlighted ? 1.3 : 0.8)} depthWrite={false} />
        </mesh>
      ))}
      <mesh scale={[model.plasmaHalfLength * scale, model.plasmaRadius * 0.28 * scale, model.plasmaRadius * 0.28 * scale]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color={highlighted ? '#ffffff' : '#ffd18a'} transparent opacity={opacity * (highlighted ? 3 : 2)} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FieldAxis({ model, scale, tilt }) {
  const length = model.wallHalfLength * 2.15 * scale;
  if (model.geometry === 'stellarator') {
    return (
      <mesh rotation={[0, MathUtils.degToRad(tilt), 0]}>
        <tubeGeometry args={[stellaratorCenterline(model, scale), 192, 0.025, 8, true]} />
        <meshBasicMaterial color="#ffd18a" transparent opacity={0.76} />
      </mesh>
    );
  }
  if (model.geometry === 'tokamak') {
    return (
      <mesh rotation={[0, MathUtils.degToRad(tilt), 0]}>
        <torusGeometry args={[(model.toroidalMajorRadius ?? model.plasmaHalfLength) * scale, 0.025, 8, 128]} />
        <meshBasicMaterial color="#ffd18a" transparent opacity={0.76} />
      </mesh>
    );
  }
  return (
    <group rotation={[0, MathUtils.degToRad(tilt), 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, length, 12]} />
        <meshBasicMaterial color="#ffd18a" transparent opacity={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * length / 2, 0, 0]} rotation={[0, 0, side < 0 ? -Math.PI / 2 : Math.PI / 2]}>
          <coneGeometry args={[0.11, 0.3, 16]} />
          <meshBasicMaterial color="#ffd18a" transparent opacity={0.76} />
        </mesh>
      ))}
    </group>
  );
}

function ToroidalEnergyHarness({ model, scale, visible, harnessHeight, harnessCollectorCount, highlighted }) {
  const radius = model.wallRadius * scale;
  const busColor = highlighted ? '#fff6dc' : '#ffd990';
  const collectorColor = highlighted ? '#fff3c6' : '#f5c16c';
  const collectorCount = Math.max(3, Math.round(Number(harnessCollectorCount)));
  const centerline = useMemo(() => deviceToroidalCenterline(model, scale), [model, scale]);
  const busCurve = useMemo(() => deviceToroidalCenterline(model, scale, model.wallRadius + Number(harnessHeight)), [model, scale, harnessHeight]);
  return (
    <group name="toroidal-energy-capture-harness" visible={visible}>
      <mesh>
        <tubeGeometry args={[busCurve, 256, 0.075 * scale, 10, true]} />
        <meshBasicMaterial color={busColor} transparent opacity={highlighted ? 1 : 0.78} depthWrite={false} />
      </mesh>
      {Array.from({ length: collectorCount }, (_, index) => {
        const progress = index / collectorCount;
        const angle = progress * Math.PI * 2;
        const center = centerline.getPointAt(progress);
        const tangent = centerline.getTangentAt(progress);
        const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), tangent);
        const leadCurve = new CatmullRomCurve3([
          new Vector3(...toroidalPoint({ angle, majorRadius: model.wallHalfLength * scale, minorOffset: radius * 0.78, helicalExcursion: model.helicalExcursion * scale, fieldPeriods: model.fieldPeriods })),
          new Vector3(...toroidalPoint({ angle, majorRadius: model.wallHalfLength * scale, minorOffset: radius + Number(harnessHeight) * scale * 0.35, helicalExcursion: model.helicalExcursion * scale, fieldPeriods: model.fieldPeriods })),
          new Vector3(...toroidalPoint({ angle, majorRadius: model.wallHalfLength * scale, minorOffset: radius + Number(harnessHeight) * scale, helicalExcursion: model.helicalExcursion * scale, fieldPeriods: model.fieldPeriods }))
        ]);
        return (
          <group key={index}>
            <mesh position={center} quaternion={quaternion}>
              <torusGeometry args={[radius + 0.32 * scale, 0.045 * scale, 8, 40]} />
              <meshBasicMaterial color={collectorColor} transparent opacity={highlighted ? 1 : 0.84} depthWrite={false} />
            </mesh>
            <mesh>
              <tubeGeometry args={[leadCurve, 16, 0.05 * scale, 8, false]} />
              <meshBasicMaterial color={collectorColor} transparent opacity={highlighted ? 1 : 0.88} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function EnergyHarness({ model, scale, visible, harnessHeight = 1.15, harnessCollectorCount = 7, highlighted = false }) {
  if (model.geometry !== 'frc') {
    return <ToroidalEnergyHarness model={model} scale={scale} visible={visible} harnessHeight={harnessHeight} harnessCollectorCount={harnessCollectorCount} highlighted={highlighted} />;
  }
  const halfLength = model.wallHalfLength * scale;
  const radius = model.wallRadius * scale;
  const manifoldHeight = radius + Number(harnessHeight);
  const collectorCount = Math.max(3, Math.round(Number(harnessCollectorCount)));
  const collectorPositions = Array.from({ length: collectorCount }, (_, index) => (
    -model.wallHalfLength * 0.82 + (index / (collectorCount - 1)) * model.wallHalfLength * 1.64
  ));
  const cableCurves = collectorPositions.map((position, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const zOffset = (index - 3) * 0.34;
    return new CatmullRomCurve3([
      new Vector3(position * scale, radius + 0.35, zOffset),
      new Vector3(position * scale, manifoldHeight, zOffset * 0.6),
      new Vector3(side * halfLength * 0.82, manifoldHeight + 0.2, zOffset * 1.5),
      new Vector3(side * halfLength * 1.18, manifoldHeight, zOffset * 1.9)
    ]);
  });

  return (
    <group name="energy-capture-harness" visible={visible}>
      {collectorPositions.map((position) => (
        <mesh key={position} position={[position * scale, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius + 0.52, 0.045, 8, 40]} />
          <meshBasicMaterial color={highlighted ? '#fff3c6' : '#f5c16c'} transparent opacity={highlighted ? 1 : 0.8} depthWrite={false} />
        </mesh>
      ))}
      {cableCurves.map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 24, 0.055, 8, false]} />
          <meshBasicMaterial color={highlighted ? '#fff3c6' : '#f5c16c'} transparent opacity={highlighted ? 1 : 0.9} depthWrite={false} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, manifoldHeight, side * 0.7]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, halfLength * 2.5, 12]} />
          <meshBasicMaterial color="#ffd990" transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * halfLength * 1.22, manifoldHeight, 0]}>
          <sphereGeometry args={[0.18, 16, 12]} />
          <meshBasicMaterial color="#fff0b5" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function OutputManifold({ model, scale, visible, outputSpread = 1.8, outputTubeRadius = 0.085, showNitrogenOutput = true, showHeliumOutput = true, showNeutronOutput = true, focusedAnnotation }) {
  const outputs = [
    { id: 'nitrogen', color: '#77c9e9', y: Number(outputSpread), pathKey: 'nitrogenPath', visible: showNitrogenOutput },
    { id: 'helium', color: '#82e0c0', y: 0, pathKey: 'heliumPath', visible: showHeliumOutput },
    { id: 'neutrons', color: '#f3ad63', y: -Number(outputSpread), pathKey: 'neutronPath', visible: showNeutronOutput }
  ];
  const outputPaths = createFlowPathPoints({
    wallHalfLength: model.wallHalfLength,
    wallRadius: model.wallRadius,
    scale,
    outputSpread,
    geometry: model.geometry,
    fieldPeriods: model.fieldPeriods,
    helicalExcursion: model.helicalExcursion
  });
  return (
    <group name="output-manifold" visible={visible}>
      {outputs.map((output) => {
        const pathPoints = outputPaths[output.pathKey];
        const curve = new CatmullRomCurve3(pathPoints.map((point) => new Vector3(...point)));
        const endpoint = pathPoints.at(-1);
        const highlighted = focusedAnnotation === `output:${output.id}`;
        const outputColor = highlighted ? '#ffffff' : output.color;
        return (
          <group key={output.id} visible={output.visible}>
            <mesh>
              <tubeGeometry args={[curve, 20, Number(outputTubeRadius), 10, false]} />
              <meshBasicMaterial color={outputColor} transparent opacity={highlighted ? 1 : 0.85} depthWrite={false} />
            </mesh>
            <mesh position={endpoint}>
              <sphereGeometry args={[0.2, 16, 12]} />
              <meshBasicMaterial color={outputColor} transparent opacity={highlighted ? 1 : 0.95} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function FrcAnnotationTarget({ id, focused, onHover = () => {}, onToggle = () => {}, style, children }) {
  const toggleFromKeyboard = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onToggle(id);
  };
  return (
    <div
      className={`frc-annotation-target${focused ? ' is-focused' : ''}`}
      data-annotation-id={id}
      role="button"
      tabIndex={0}
      aria-pressed={focused}
      style={style}
      onPointerEnter={() => onHover(id)}
      onPointerMove={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
      onMouseEnter={() => onHover(id)}
      onMouseMove={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onTouchStart={() => onHover(id)}
      onClick={(event) => { event.stopPropagation(); onToggle(id); }}
      onKeyDown={toggleFromKeyboard}
    >
      {children}
    </div>
  );
}

function DeviceAnnotations({ model, scale, outputSpread, harnessHeight, harnessCollectorCount, showNames, showAttributes, showEnergyHarness, showOutputManifold, showNitrogenOutput, showHeliumOutput, showNeutronOutput, focusedAnnotation, onHoverAnnotation, onToggleAnnotation }) {
  if (!showNames && !showAttributes) return null;
  const halfLength = model.wallHalfLength * scale;
  const radius = model.wallRadius * scale;
  const outputY = Number(outputSpread);
  const toroidalOutputPaths = createFlowPathPoints({
    wallHalfLength: model.wallHalfLength,
    wallRadius: model.wallRadius,
    scale,
    outputSpread,
    geometry: model.geometry,
    fieldPeriods: model.fieldPeriods,
    helicalExcursion: model.helicalExcursion
  });
  const outputPosition = (pathKey, axialPosition) => model.geometry === 'frc'
    ? axialPosition
    : toroidalOutputPaths[pathKey].at(-1).map((coordinate, axis) => coordinate + (axis === 2 ? 0.42 : 0));
  const outputAnnotations = [
    { id: 'nitrogen', position: outputPosition('nitrogenPath', [halfLength + 1.45, outputY, radius + 0.92]), color: '#77c9e9', value: `${model.nitrogenOutputSLM.toFixed(1)} SLM`, visible: showNitrogenOutput },
    { id: 'helium', position: outputPosition('heliumPath', [halfLength + 1.45, 0, radius + 0.92]), color: '#82e0c0', value: `${model.heliumOutputGPerHour.toFixed(3)} g/h`, visible: showHeliumOutput },
    { id: 'neutrons', position: outputPosition('neutronPath', [halfLength + 1.45, -outputY, radius + 0.92]), color: '#f3ad63', value: `${model.neutronFlux.toExponential(2)} /m2/s`, visible: showNeutronOutput }
  ];
  const harnessPosition = model.geometry === 'frc'
    ? [0, radius + Number(harnessHeight) + 0.45, 0]
    : [0, 0, radius + Number(harnessHeight) + 0.45];
  return (
    <group name="device-annotations">
      {showEnergyHarness && (
        <Html position={harnessPosition} center distanceFactor={8} zIndexRange={[1, 0]} className="frc-device-label">
          <FrcAnnotationTarget id="energy-harness" focused={focusedAnnotation === 'energy-harness'} onHover={onHoverAnnotation} onToggle={onToggleAnnotation} style={{ '--frc-input-color': '#ffd990' }}>
            {showNames && <strong>Energy capture harness</strong>}
            {showAttributes && <span>{harnessCollectorCount} collector rings / conversion bus</span>}
          </FrcAnnotationTarget>
        </Html>
      )}
      {showOutputManifold && outputAnnotations.filter((output) => output.visible).map((output) => (
        <Html key={output.id} position={output.position} center distanceFactor={8} zIndexRange={[1, 0]} className="frc-device-label">
          <FrcAnnotationTarget id={`output:${output.id}`} focused={focusedAnnotation === `output:${output.id}`} onHover={onHoverAnnotation} onToggle={onToggleAnnotation} style={{ '--frc-input-color': output.color }}>
            {showNames && <strong>{OUTPUT_COMPONENTS[output.id].label}</strong>}
            {showAttributes && <span>{OUTPUT_COMPONENTS[output.id].detail} / {output.value}</span>}
          </FrcAnnotationTarget>
        </Html>
      ))}
    </group>
  );
}

function FlowParticles({ model, scale, outputSpread, showGasFlow, showChargeFlow, showHeliumOutput, showNeutronOutput, showOutputManifold, gasFlowSpeed = 1, chargeFlowSpeed = 1, heliumFlowSpeed = 1, neutronFlowSpeed = 1, showCabling, showEnergyHarness, showNames, showAttributes, focusedAnnotation, onHoverAnnotation, onToggleAnnotation }) {
  const pointsRef = useRef(null);
  const particleVisibility = getFlowParticleVisibility({ showCabling, showGasFlow, showChargeFlow, showOutputManifold, showHeliumOutput, showNeutronOutput });
  const materials = useMemo(() => Object.fromEntries(Object.entries(FLOW_PARTICLE_STREAMS).map(([streamId, stream]) => [streamId, new ShaderMaterial({
    uniforms: { uColor: { value: new Color(stream.color) }, uHighlight: { value: 0 } },
    vertexShader: `
      uniform float uHighlight;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = max(8.0, 120.0 / max(-mvPosition.z, 1.0)) * (1.0 + uHighlight * 0.65);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uHighlight;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distanceFromCenter = length(point);
        if (distanceFromCenter > 0.5) discard;
        float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), uHighlight * 0.72), glow * (0.9 + uHighlight * 0.1));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  })])), []);
  const paths = useMemo(() => {
    const flowPathPoints = createFlowPathPoints({
      wallHalfLength: model.wallHalfLength,
      wallRadius: model.wallRadius,
      scale,
      outputSpread,
      geometry: model.geometry,
      fieldPeriods: model.fieldPeriods,
      helicalExcursion: model.helicalExcursion
    });
    return Object.fromEntries(Object.entries(flowPathPoints).map(([pathKey, points]) => [
      pathKey,
      new CatmullRomCurve3(points.map((point) => new Vector3(...point)))
    ]));
  }, [model.geometry, model.fieldPeriods, model.helicalExcursion, model.wallHalfLength, model.wallRadius, outputSpread, scale]);
  const geometries = useMemo(() => Object.fromEntries(Object.keys(FLOW_PARTICLE_STREAMS).map((streamId) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(32 * 3), 3));
    return [streamId, geometry];
  })), []);
  const speeds = { gas: gasFlowSpeed, charge: chargeFlowSpeed, helium: heliumFlowSpeed, neutrons: neutronFlowSpeed };

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
    Object.values(materials).forEach((material) => material.dispose());
  }, [geometries, materials]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    Object.entries(FLOW_PARTICLE_STREAMS).forEach(([streamId, stream]) => {
      const focusId = streamId === 'gas' ? 'output:nitrogen'
        : streamId === 'charge' ? 'flow:charge'
          : `output:${streamId === 'neutrons' ? 'neutrons' : 'helium'}`;
      materials[streamId].uniforms.uHighlight.value = focusedAnnotation === focusId ? 1 : 0;
      const positions = geometries[streamId].attributes.position.array;
      const path = paths[stream.pathKey];
      for (let index = 0; index < 32; index += 1) {
        const progress = advanceFlowProgress(index / 32, stream.speed * speeds[streamId], clock.elapsedTime);
        const point = path.getPointAt(progress);
        const offset = index * 3;
        positions[offset] = point.x;
        positions[offset + 1] = point.y;
        positions[offset + 2] = point.z;
      }
      geometries[streamId].attributes.position.needsUpdate = true;
    });
  });

  return (
    <group ref={pointsRef} name="flow-particles" visible={showCabling}>
      {Object.entries(FLOW_PARTICLE_STREAMS).map(([streamId, stream]) => (
        <points
          key={streamId}
          name={`${streamId}-flow-particles`}
          geometry={geometries[streamId]}
          material={materials[streamId]}
          visible={particleVisibility[streamId]}
          frustumCulled={false}
        />
      ))}
      {showEnergyHarness && particleVisibility.charge && (showNames || showAttributes) && (
        <Html position={model.geometry === 'frc'
          ? [model.wallHalfLength * scale * 0.2, model.wallRadius * scale + 1.4, 0]
          : toroidalPoint({ angle: 0.2, majorRadius: model.wallHalfLength * scale, minorOffset: (model.wallRadius + 1.1) * scale, helicalExcursion: model.helicalExcursion * scale, fieldPeriods: model.fieldPeriods })} center distanceFactor={8} zIndexRange={[1, 0]} className="frc-device-label">
          <FrcAnnotationTarget id="flow:charge" focused={focusedAnnotation === 'flow:charge'} onHover={onHoverAnnotation} onToggle={onToggleAnnotation} style={{ '--frc-input-color': FLOW_PARTICLE_STREAMS.charge.color }}>
            {showNames && <strong>Charged particle stream</strong>}
            {showAttributes && <span>external red stream / harness capture path</span>}
          </FrcAnnotationTarget>
        </Html>
      )}
    </group>
  );
}

const INPUT_PARTICLE_COUNT = 24;

function InputParticles({ model, scale, activeInput, showInputParticles, showDTInput, showDHe3Input, showArgonInput, inputParticleSpeed = 1, showCabling, focusedAnnotation }) {
  const pointsRef = useRef(null);
  const particleVisibility = getInputParticleVisibility({ activeInput, showCabling, showInputParticles, showDTInput, showDHe3Input, showArgonInput });
  const paths = useMemo(() => {
    const inputPathPoints = createInputParticlePathPoints({
      plasmaHalfLength: model.geometry === 'frc' ? model.plasmaHalfLength : model.toroidalMajorRadius,
      plasmaRadius: model.plasmaRadius,
      scale,
      geometry: model.geometry,
      fieldPeriods: model.fieldPeriods,
      helicalExcursion: model.helicalExcursion
    });
    return Object.fromEntries(Object.entries(inputPathPoints).map(([input, points]) => [
      input,
      new CatmullRomCurve3(points.map((point) => new Vector3(...point)))
    ]));
  }, [model.fieldPeriods, model.geometry, model.helicalExcursion, model.plasmaHalfLength, model.plasmaRadius, scale]);
  const geometries = useMemo(() => Object.fromEntries(Object.keys(INPUT_PARTICLE_STREAMS).map((input) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(INPUT_PARTICLE_COUNT * 3), 3));
    return [input, geometry];
  })), []);
  const materials = useMemo(() => Object.fromEntries(Object.entries(INPUT_PARTICLE_STREAMS).map(([input, stream]) => [
    input,
    new ShaderMaterial({
      uniforms: { uColor: { value: new Color(stream.color) }, uHighlight: { value: 0 } },
      vertexShader: `
        uniform float uHighlight;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = max(7.0, 92.0 / max(-mvPosition.z, 1.0)) * (1.0 + uHighlight * 0.65);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uHighlight;
        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float distanceFromCenter = length(point);
          if (distanceFromCenter > 0.5) discard;
          float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
          gl_FragColor = vec4(mix(uColor, vec3(1.0), uHighlight * 0.72), glow * (0.92 + uHighlight * 0.08));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    })
  ])), []);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
    Object.values(materials).forEach((material) => material.dispose());
  }, [geometries, materials]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    Object.entries(INPUT_PARTICLE_STREAMS).forEach(([input, stream]) => {
      materials[input].uniforms.uHighlight.value = focusedAnnotation === `input:${input}` ? 1 : 0;
      const positions = geometries[input].attributes.position.array;
      const path = paths[input];
      for (let index = 0; index < INPUT_PARTICLE_COUNT; index += 1) {
        const progress = advanceFlowProgress(index / INPUT_PARTICLE_COUNT, stream.speed * inputParticleSpeed, clock.elapsedTime);
        const point = path.getPointAt(progress);
        const offset = index * 3;
        positions[offset] = point.x;
        positions[offset + 1] = point.y;
        positions[offset + 2] = point.z;
      }
      geometries[input].attributes.position.needsUpdate = true;
    });
  });

  return (
    <group ref={pointsRef} name="input-particles" visible={showCabling}>
      {Object.keys(INPUT_PARTICLE_STREAMS).map((input) => (
        <points key={input} name={`${input}-input-particles`} geometry={geometries[input]} material={materials[input]} visible={particleVisibility[input]} frustumCulled={false} />
      ))}
    </group>
  );
}

function PlasmaAnnotations({ model, scale, showNames, showAttributes, focusedAnnotation, onHoverAnnotation, onToggleAnnotation }) {
  if (!showNames && !showAttributes) return null;
  const radius = model.plasmaRadius * scale;
  const position = model.geometry === 'frc'
    ? [0, -radius - 0.85, radius * 0.45]
    : toroidalPoint({
      angle: -Math.PI / 2,
      majorRadius: model.toroidalMajorRadius * scale,
      verticalOffset: (model.plasmaRadius + 0.65) * scale,
      helicalExcursion: model.helicalExcursion * scale,
      fieldPeriods: model.fieldPeriods
    });
  return (
    <Html position={position} center distanceFactor={8} zIndexRange={[1, 0]} className="frc-device-label">
      <FrcAnnotationTarget id="plasma" focused={focusedAnnotation === 'plasma'} onHover={onHoverAnnotation} onToggle={onToggleAnnotation} style={{ '--frc-input-color': '#ffd18a' }}>
        {showNames && <strong>Plasma</strong>}
        {showAttributes && <span>beta {(model.beta * 100).toFixed(1)}% / {model.axialField.toFixed(2)} T {model.reversedField ? 'reversal' : 'guide field'} / {model.plasmaCurrentMA.toFixed(2)} MA / {model.plasmaVolume.toFixed(1)} m3</span>}
      </FrcAnnotationTarget>
    </Html>
  );
}

function InputAnnotations({ model, scale, activeInput, showNames, showAttributes, focusedAnnotation, onHoverAnnotation, onToggleAnnotation }) {
  if (!showNames && !showAttributes) return null;
  const halfLength = model.plasmaHalfLength * scale;
  const radius = model.plasmaRadius * scale;
  const annotationPositions = model.geometry === 'frc'
    ? {
      DT: [-halfLength * 0.74, -radius * 0.9, radius * 0.28],
      DHe_3: [0, radius * 0.92, radius * 0.2],
      Argon: [halfLength * 0.74, -radius * 0.9, radius * 0.28]
    }
    : Object.fromEntries(Object.entries(createInputParticlePathPoints({
      plasmaHalfLength: model.geometry === 'frc' ? model.plasmaHalfLength : model.toroidalMajorRadius,
      plasmaRadius: model.plasmaRadius,
      scale,
      geometry: model.geometry,
      fieldPeriods: model.fieldPeriods,
      helicalExcursion: model.helicalExcursion
    })).map(([input, points]) => [input, points[0].map((coordinate, axis) => coordinate + (axis === 2 ? 0.55 : 0))]));
  return Object.entries(INPUT_PARTICLE_STREAMS).filter(([input]) => input === activeInput).map(([input, stream]) => {
    const inputModel = FRC_INPUTS[input];
    return (
      <Html key={input} position={annotationPositions[input]} center distanceFactor={8} zIndexRange={[1, 0]} className="frc-input-label">
        <FrcAnnotationTarget id={`input:${input}`} focused={focusedAnnotation === `input:${input}`} onHover={onHoverAnnotation} onToggle={onToggleAnnotation} style={{ '--frc-input-color': stream.color }}>
          {showNames && <strong>{stream.label}</strong>}
          {showAttributes && <span>{stream.channel} / {inputModel.description}</span>}
        </FrcAnnotationTarget>
      </Html>
    );
  });
}

function ToroidalPlasmaVolume({ model, scale, color, opacity, visible, focused }) {
  const plasmaTubeRadius = model.plasmaRadius * 0.72 * scale;
  return (
    <mesh renderOrder={10} visible={visible}>
      {model.geometry === 'stellarator'
        ? <tubeGeometry args={[stellaratorCenterline(model, scale), 256, plasmaTubeRadius, 28, true]} />
        : <torusGeometry args={[model.toroidalMajorRadius * scale, plasmaTubeRadius, 28, 128]} />}
      <meshBasicMaterial color={focused ? '#fff1bd' : color} transparent opacity={Math.min(0.9, Math.max(0, opacity * (focused ? 1.35 : 1)))} side={DoubleSide} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function PlasmaParticles({ configuration, model, onGpuError, focusedAnnotation }) {
  const { gl } = useThree();
  const computeRef = useRef(null);
  const positionVariableRef = useRef(null);
  const velocityVariableRef = useRef(null);
  const stateRef = useRef({ configuration, model, focusedAnnotation });
  stateRef.current = { configuration, model, focusedAnnotation };
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new BufferAttribute(new Float32Array(ACTIVE_PLASMA_PARTICLE_COUNT * 3), 3));
    nextGeometry.setAttribute('aSimulationUv', new BufferAttribute(createSimulationUvs(PLASMA_RESOLUTION, ACTIVE_PLASMA_PARTICLE_COUNT), 2));
    return nextGeometry;
  }, []);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uVelocityTex: { value: null },
      uPointSize: { value: 260 },
      uOpacity: { value: configuration.plasmaOpacity },
      uHighlight: { value: 0 },
      uColor: { value: new Color(configuration.plasmaColor) }
    },
    vertexShader: plasmaVertexShader,
    fragmentShader: plasmaFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending
  }), []);

  useEffect(() => {
    let simulation;
    try {
      simulation = createGpuParticleField({
        gl,
        resolution: PLASMA_RESOLUTION,
        positionShader: plasmaPositionShader,
        velocityShader: plasmaVelocityShader,
        initialize: ({ positionData, velocityData, offset }) => {
          const initialModel = stateRef.current.model;
          if (initialModel.geometry !== 'frc') {
            const toroidalAngle = Math.random() * Math.PI * 2;
            const crossSectionAngle = Math.random() * Math.PI * 2;
            const tubeRadius = Math.sqrt(Math.random()) * initialModel.plasmaRadius * 0.82;
            const helicalPhase = initialModel.fieldPeriods * toroidalAngle;
            const centerRadius = initialModel.toroidalMajorRadius
              + initialModel.helicalExcursion * Math.cos(helicalPhase);
            const centerZ = initialModel.helicalExcursion * Math.sin(helicalPhase);
            const radialOffset = Math.cos(crossSectionAngle) * tubeRadius;
            positionData[offset] = Math.cos(toroidalAngle) * (centerRadius + radialOffset);
            positionData[offset + 1] = Math.sin(toroidalAngle) * (centerRadius + radialOffset);
            positionData[offset + 2] = centerZ + Math.sin(crossSectionAngle) * tubeRadius;
            positionData[offset + 3] = 0.3 + Math.random() * 0.7;
            velocityData[offset] = -Math.sin(toroidalAngle) * 0.05;
            velocityData[offset + 1] = Math.cos(toroidalAngle) * 0.05;
            velocityData[offset + 2] = (Math.random() - 0.5) * 0.03;
            velocityData[offset + 3] = 0.2 + Math.random() * 0.5;
            return;
          }
          const axialPosition = (Math.random() * 2 - 1) * initialModel.plasmaHalfLength * 0.92;
          const lobeFactor = initialModel.shape === 'doubleLobed'
            ? 0.42 + 0.58 * Math.abs(Math.sin(axialPosition / initialModel.plasmaHalfLength * Math.PI))
            : 1;
          const radialPosition = Math.sqrt(Math.random()) * initialModel.plasmaRadius * 0.82 * lobeFactor;
          const angle = Math.random() * Math.PI * 2;
          positionData[offset] = axialPosition;
          positionData[offset + 1] = Math.cos(angle) * radialPosition;
          positionData[offset + 2] = Math.sin(angle) * radialPosition;
          positionData[offset + 3] = 0.3 + Math.random() * 0.7;
          velocityData[offset] = (Math.random() - 0.5) * 0.08;
          velocityData[offset + 1] = -Math.sin(angle) * 0.05;
          velocityData[offset + 2] = Math.cos(angle) * 0.05;
          velocityData[offset + 3] = 0.2 + Math.random() * 0.5;
        }
      });
      computeRef.current = simulation.gpuCompute;
      positionVariableRef.current = simulation.positionVariable;
      velocityVariableRef.current = simulation.velocityVariable;
      const positionUniforms = simulation.positionVariable.material.uniforms;
      positionUniforms.uDt = { value: 1 / 60 };
      positionUniforms.uHalfLength = { value: stateRef.current.model.geometry === 'frc' ? stateRef.current.model.plasmaHalfLength : stateRef.current.model.toroidalMajorRadius };
      positionUniforms.uRadius = { value: stateRef.current.model.plasmaRadius };
      positionUniforms.uToroidal = { value: stateRef.current.model.geometry === 'frc' ? 0 : 1 };
      positionUniforms.uHelicalExcursion = { value: stateRef.current.model.helicalExcursion };
      positionUniforms.uFieldPeriods = { value: stateRef.current.model.fieldPeriods };
      positionUniforms.uRunning = { value: true };
      const velocityUniforms = simulation.velocityVariable.material.uniforms;
      velocityUniforms.uDt = { value: 1 / 60 };
      velocityUniforms.uField = { value: stateRef.current.model.magneticField };
      velocityUniforms.uAxialField = { value: stateRef.current.model.axialField };
      velocityUniforms.uRadius = { value: stateRef.current.model.plasmaRadius };
      velocityUniforms.uHalfLength = { value: stateRef.current.model.geometry === 'frc' ? stateRef.current.model.plasmaHalfLength : stateRef.current.model.toroidalMajorRadius };
      velocityUniforms.uToroidal = { value: stateRef.current.model.geometry === 'frc' ? 0 : 1 };
      velocityUniforms.uHelicalExcursion = { value: stateRef.current.model.helicalExcursion };
      velocityUniforms.uFieldPeriods = { value: stateRef.current.model.fieldPeriods };
      velocityUniforms.uRotation = { value: stateRef.current.model.rotation + stateRef.current.model.excitation.signedVorticity * 0.6 };
      velocityUniforms.uTemperature = { value: stateRef.current.model.ionTemperature };
      velocityUniforms.uDensity = { value: stateRef.current.model.density };
      velocityUniforms.uTransportSpeed = { value: stateRef.current.configuration.transportSpeed };
      velocityUniforms.uTransportModel = { value: quantumTransportIndex(stateRef.current.configuration.transportModel) };
      velocityUniforms.uQuantumPressure = { value: stateRef.current.configuration.quantumPressure };
      velocityUniforms.uDilatancy = { value: stateRef.current.configuration.transportDilatancy };
      velocityUniforms.uSpeedLimit = { value: stateRef.current.configuration.transportSpeedLimit };
      velocityUniforms.uMhdMode = { value: mhdModeIndex(stateRef.current.model) };
      velocityUniforms.uDriveTime = { value: 0 };
      velocityUniforms.uDriveAmplitude = { value: 0 };
      velocityUniforms.uDriveCoupling = { value: 0 };
      velocityUniforms.uDriveFrequencyRatio = { value: 0 };
      velocityUniforms.uWavePacketWidth = { value: 0.35 };
      velocityUniforms.uRunning = { value: true };
      const initializationError = simulation.gpuCompute.init();
      if (initializationError) throw new Error(initializationError);
    } catch (error) {
      onGpuError(error instanceof Error ? error.message : 'GPU plasma transport could not initialize.');
    }
    return () => {
      computeRef.current = null;
      positionVariableRef.current = null;
      velocityVariableRef.current = null;
      simulation?.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, gl, material, onGpuError]);

  useFrame((_, delta) => {
    const compute = computeRef.current;
    const positionVariable = positionVariableRef.current;
    const velocityVariable = velocityVariableRef.current;
    if (!compute || !positionVariable || !velocityVariable) return;
    const { configuration: currentConfiguration, model: currentModel } = stateRef.current;
    const frameDelta = Math.min(delta, 1 / 30);
    const positionUniforms = positionVariable.material.uniforms;
    const velocityUniforms = velocityVariable.material.uniforms;
    positionUniforms.uDt.value = frameDelta;
    positionUniforms.uHalfLength.value = currentModel.geometry === 'frc' ? currentModel.plasmaHalfLength : currentModel.toroidalMajorRadius;
    positionUniforms.uRadius.value = currentModel.plasmaRadius;
    positionUniforms.uToroidal.value = currentModel.geometry === 'frc' ? 0 : 1;
    positionUniforms.uHelicalExcursion.value = currentModel.helicalExcursion;
    positionUniforms.uFieldPeriods.value = currentModel.fieldPeriods;
    positionUniforms.uRunning.value = currentConfiguration.plasmaRunning;
    velocityUniforms.uDt.value = frameDelta * currentConfiguration.transportSpeed;
    velocityUniforms.uField.value = currentModel.magneticField;
    velocityUniforms.uAxialField.value = currentModel.axialField;
    velocityUniforms.uRadius.value = currentModel.plasmaRadius;
    velocityUniforms.uHalfLength.value = currentModel.geometry === 'frc' ? currentModel.plasmaHalfLength : currentModel.toroidalMajorRadius;
    velocityUniforms.uToroidal.value = currentModel.geometry === 'frc' ? 0 : 1;
    velocityUniforms.uHelicalExcursion.value = currentModel.helicalExcursion;
    velocityUniforms.uFieldPeriods.value = currentModel.fieldPeriods;
    velocityUniforms.uRotation.value = currentModel.rotation + currentModel.excitation.signedVorticity * 0.6;
    velocityUniforms.uTemperature.value = currentModel.ionTemperature;
    velocityUniforms.uDensity.value = currentModel.density;
    velocityUniforms.uTransportSpeed.value = currentConfiguration.transportSpeed;
    velocityUniforms.uTransportModel.value = quantumTransportIndex(currentConfiguration.transportModel);
    velocityUniforms.uQuantumPressure.value = currentConfiguration.quantumPressure;
    velocityUniforms.uDilatancy.value = currentConfiguration.transportDilatancy;
    velocityUniforms.uSpeedLimit.value = currentConfiguration.transportSpeedLimit;
    velocityUniforms.uMhdMode.value = mhdModeIndex(currentModel);
    velocityUniforms.uDriveTime.value += frameDelta;
    velocityUniforms.uDriveAmplitude.value = currentModel.drive.mode === 'piezo-rmf'
      ? currentModel.drive.piezoStrainPpm / 1000
      : currentModel.drive.longitudinalAmplitude;
    velocityUniforms.uDriveCoupling.value = currentModel.drive.active ? currentModel.drive.coupling : 0;
    velocityUniforms.uDriveFrequencyRatio.value = currentModel.drive.mode === 'piezo-rmf'
      ? currentModel.drive.piezoCyclotronRatio
      : currentModel.drive.longitudinalFrequencyHz / Math.max(currentModel.drive.acousticFundamentalHz, 1);
    velocityUniforms.uWavePacketWidth.value = currentModel.drive.wavePacketWidth;
    velocityUniforms.uRunning.value = currentConfiguration.plasmaRunning;
    compute.compute();
    material.uniforms.uPositionTex.value = compute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uVelocityTex.value = compute.getCurrentRenderTarget(velocityVariable).texture;
    material.uniforms.uOpacity.value = currentConfiguration.plasmaOpacity;
    material.uniforms.uColor.value.set(currentConfiguration.plasmaColor);
    material.uniforms.uHighlight.value = stateRef.current.focusedAnnotation === 'plasma' ? 1 : 0;
    material.uniforms.uPointSize.value = stateRef.current.focusedAnnotation === 'plasma' ? 340 : 260;
  });

  return <points geometry={geometry} material={material} scale={configuration.vesselScale ?? 1} rotation={[0, MathUtils.degToRad(configuration.fieldTilt ?? 0), 0]} visible={configuration.showPlasma} renderOrder={20} frustumCulled={false} />;
}

function ReactorControls({ controlsRef }) {
  return <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} minDistance={9} maxDistance={38} target={[0, 0, 0]} />;
}

function ReactorCameraFrame({ controlsRef, parametersVisible }) {
  const { camera, size } = useThree();
  const targetRef = useRef(new Vector3(0, 0, 0));
  const frameOffsetRef = useRef(new Vector3());
  const desiredFrameOffsetRef = useRef(new Vector3());

  useEffect(() => {
    const basePosition = camera.position.clone().sub(frameOffsetRef.current);
    const baseTarget = targetRef.current.clone();
    desiredFrameOffsetRef.current.copy(cameraFrameOffset(camera, basePosition, baseTarget, size, parametersVisible));
  }, [camera, parametersVisible, size]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const blend = 1 - Math.exp(-delta * 5.5);
    const basePosition = camera.position.clone().sub(frameOffsetRef.current);
    const baseTarget = controls.target.clone().sub(frameOffsetRef.current);
    targetRef.current.copy(baseTarget);
    const desiredOffset = cameraFrameOffset(camera, basePosition, baseTarget, size, parametersVisible);
    desiredFrameOffsetRef.current.copy(desiredOffset);
    frameOffsetRef.current.lerp(desiredFrameOffsetRef.current, blend);
    controls.target.copy(baseTarget).add(frameOffsetRef.current);
    camera.position.copy(basePosition).add(frameOffsetRef.current);
  });
}

function ReactorScene({ configuration, onGpuError, parametersVisible, focusedAnnotation, onHoverAnnotation, onToggleAnnotation }) {
  const deviceGroupRef = useRef();
  const controlsRef = useRef();
  const model = useMemo(() => calculateFrcModel(configuration), [configuration]);
  const scale = configuration.vesselScale;
  const visualizationVisibility = getFrcVisualizationVisibility(configuration);
  const annotationsEnabled = configuration.showAnnotations !== false;
  const deviceRotation = [
    MathUtils.degToRad(configuration.devicePitch ?? configuration.deviceRotationX ?? 0),
    MathUtils.degToRad(configuration.deviceYaw ?? configuration.deviceRotationY ?? 0),
    MathUtils.degToRad(configuration.deviceRoll ?? configuration.deviceRotationZ ?? 0)
  ];
  useFrame((_, delta) => {
    const deviceGroup = deviceGroupRef.current;
    if (!deviceGroup) return;
    deviceGroup.rotation.x = dampRotationAngle(deviceGroup.rotation.x, deviceRotation[0], delta);
    deviceGroup.rotation.y = dampRotationAngle(deviceGroup.rotation.y, deviceRotation[1], delta);
    deviceGroup.rotation.z = dampRotationAngle(deviceGroup.rotation.z, deviceRotation[2], delta);
  });
  return (
    <>
      <color attach="background" args={['#08171b']} />
      <fog attach="fog" args={['#08171b', 18, 42]} />
      <ambientLight intensity={0.6} color="#b9e1dc" />
      <directionalLight position={[4, 8, 7]} intensity={2.4} color="#ffe2b7" />
      <pointLight position={[-8, 2, 4]} intensity={8} distance={30} color="#45c7c0" />
      <group ref={deviceGroupRef}>
        <ReactorVessel model={model} scale={scale} opacity={configuration.vesselOpacity} surfaceColor={configuration.vesselShellColor} emissiveColor={configuration.vesselShellEmissiveColor} showCoils={configuration.showCoils} />
        <ExcitationHardware model={model} scale={scale} visible={configuration.showExcitationHardware !== false} />
        <PlasmaFocusBeamParticles model={model} scale={scale} visible={configuration.showPlasmaFocusBeamlets !== false} running={configuration.plasmaRunning} />
        <PlasmaParticles key={model.shape} configuration={configuration} model={model} onGpuError={onGpuError} focusedAnnotation={focusedAnnotation} />
        {model.geometry !== 'frc' && <ToroidalPlasmaVolume model={model} scale={scale} color={configuration.plasmaColor} opacity={configuration.toroidalPlasmaOpacity ?? 0.28} visible={configuration.showToroidalPlasmaVolume === true} focused={focusedAnnotation === 'plasma'} />}
        {annotationsEnabled && (
          <PlasmaAnnotations
            model={model}
            scale={scale}
            showNames={configuration.showPlasmaAnnotations !== false}
            showAttributes={configuration.showPlasmaAttributes !== false}
            focusedAnnotation={focusedAnnotation}
            onHoverAnnotation={onHoverAnnotation}
            onToggleAnnotation={onToggleAnnotation}
          />
        )}
        <EnergyHarness model={model} scale={scale} visible={(configuration.showCabling ?? true) && (configuration.showEnergyHarness ?? true) && visualizationVisibility.ancillary.energyHarness} harnessHeight={configuration.harnessHeight} harnessCollectorCount={configuration.harnessCollectorCount} highlighted={focusedAnnotation === 'energy-harness'} />
        <OutputManifold model={model} scale={scale} visible={(configuration.showCabling ?? true) && (configuration.showOutputManifold ?? true) && visualizationVisibility.ancillary.outputManifold} outputSpread={configuration.outputSpread} outputTubeRadius={configuration.outputTubeRadius} showNitrogenOutput={(configuration.showNitrogenOutput ?? true) && visualizationVisibility.output.nitrogen} showHeliumOutput={(configuration.showHeliumOutput ?? true) && visualizationVisibility.output.helium} showNeutronOutput={(configuration.showNeutronOutput ?? true) && visualizationVisibility.output.neutrons} focusedAnnotation={focusedAnnotation} />
        <FlowParticles
          model={model}
          scale={scale}
          outputSpread={configuration.outputSpread}
          showGasFlow={(configuration.showGasFlow ?? true) && visualizationVisibility.ancillary.nitrogenGasFlow}
          showChargeFlow={(configuration.showChargeFlow ?? true) && visualizationVisibility.ancillary.chargeFlow}
          showHeliumOutput={(configuration.showHeliumOutput ?? true) && visualizationVisibility.output.helium}
          showNeutronOutput={(configuration.showNeutronOutput ?? true) && visualizationVisibility.output.neutrons}
          showOutputManifold={(configuration.showOutputManifold ?? true) && visualizationVisibility.ancillary.outputManifold}
          gasFlowSpeed={configuration.gasFlowSpeed ?? 1}
          chargeFlowSpeed={configuration.chargeFlowSpeed ?? 1}
          heliumFlowSpeed={configuration.heliumFlowSpeed ?? 1}
          neutronFlowSpeed={configuration.neutronFlowSpeed ?? 1}
          showCabling={configuration.showCabling ?? true}
          showEnergyHarness={(configuration.showEnergyHarness ?? true) && visualizationVisibility.ancillary.energyHarness}
          showNames={annotationsEnabled && configuration.showDeviceAnnotations !== false}
          showAttributes={annotationsEnabled && configuration.showDeviceAttributes !== false}
          focusedAnnotation={focusedAnnotation}
          onHoverAnnotation={onHoverAnnotation}
          onToggleAnnotation={onToggleAnnotation}
        />
        <group rotation={[0, MathUtils.degToRad(configuration.fieldTilt ?? 0), 0]}>
          <InputParticles
            model={model}
            scale={scale}
            activeInput={model.input}
            showInputParticles={(configuration.showInputParticles ?? true) && visualizationVisibility.ancillary.inputParticles}
            showDTInput={configuration.showDTInput ?? true}
            showDHe3Input={configuration.showDHe3Input ?? true}
            showArgonInput={configuration.showArgonInput ?? true}
            inputParticleSpeed={configuration.inputParticleSpeed ?? 1}
            showCabling={configuration.showCabling ?? true}
            focusedAnnotation={focusedAnnotation}
          />
          {annotationsEnabled && visualizationVisibility.ancillary.inputParticles && (configuration.showInputAnnotations !== false || configuration.showInputAttributes !== false) && (
            <InputAnnotations model={model} scale={scale} activeInput={model.input} showNames={configuration.showInputAnnotations !== false} showAttributes={configuration.showInputAttributes !== false} focusedAnnotation={focusedAnnotation} onHoverAnnotation={onHoverAnnotation} onToggleAnnotation={onToggleAnnotation} />
          )}
        </group>
        {(configuration.showDeviceAnnotations !== false || configuration.showDeviceAttributes !== false) && (
          <DeviceAnnotations
            model={model}
            scale={scale}
            outputSpread={configuration.outputSpread}
            harnessHeight={configuration.harnessHeight}
            harnessCollectorCount={configuration.harnessCollectorCount}
            showNames={annotationsEnabled && configuration.showDeviceAnnotations !== false}
            showAttributes={annotationsEnabled && configuration.showDeviceAttributes !== false}
            focusedAnnotation={focusedAnnotation}
            onHoverAnnotation={onHoverAnnotation}
            onToggleAnnotation={onToggleAnnotation}
            showEnergyHarness={(configuration.showCabling ?? true) && (configuration.showEnergyHarness ?? true) && visualizationVisibility.ancillary.energyHarness}
            showOutputManifold={(configuration.showCabling ?? true) && (configuration.showOutputManifold ?? true) && visualizationVisibility.ancillary.outputManifold}
            showNitrogenOutput={configuration.showNitrogenOutput !== false && visualizationVisibility.output.nitrogen}
            showHeliumOutput={configuration.showHeliumOutput !== false && visualizationVisibility.output.helium}
            showNeutronOutput={configuration.showNeutronOutput !== false && visualizationVisibility.output.neutrons}
          />
        )}
        {configuration.showFieldVolume && <FieldVolume model={model} scale={scale} tilt={configuration.fieldTilt} surfaceColor={configuration.separatrixVolumeColor} emissiveColor={configuration.separatrixVolumeEmissiveColor} opacity={configuration.fieldVolumeOpacity ?? 0.06} highlighted={focusedAnnotation === 'plasma'} />}
        {configuration.showAxis && <FieldAxis model={model} scale={scale} tilt={configuration.fieldTilt} />}
      </group>
      <gridHelper args={[36, 18, '#2b5b5a', '#153434']} position={[0, -5.2, 0]} />
      <ReactorControls controlsRef={controlsRef} />
      <ReactorCameraFrame controlsRef={controlsRef} parametersVisible={parametersVisible} />
    </>
  );
}

function RangeInput({ label, value, min, max, step, onChange, suffix = '', ticks = [], editing = false, isDefault = true, onReset }) {
  const handleChange = (event) => {
    const nextValue = Number(event.target.value);
    const nearestTick = ticks.reduce((nearest, tick) => (
      Math.abs(tick - nextValue) < Math.abs(nearest - nextValue) ? tick : nearest
    ), ticks[0]);
    const snappedValue = ticks.length > 0 && Math.abs(nearestTick - nextValue) <= ORIENTATION_SNAP_DISTANCE
      ? nearestTick
      : nextValue;
    onChange(snappedValue);
  };
  return <><NumericParamControl className="frc-range-control" label={label} value={value} min={min} max={max} step={step} suffix={suffix} editing={editing} isDefault={isDefault} onReset={onReset} onChange={(value) => handleChange({ target: { value } })} />{ticks.length > 0 && <div className="frc-range-ticks" aria-hidden="true">{ticks.map((tick) => <i key={tick} />)}</div>}</>;
}

function ToggleInput({ label, checked, onChange, swatch, disabled = false }) {
  return (
    <label className={`frc-toggle-row${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="frc-toggle-mark" aria-hidden="true">{checked ? 'ON' : 'OFF'}</span>
      {swatch && <i className="frc-flow-swatch" style={{ backgroundColor: swatch, color: swatch }} aria-hidden="true" />}
      <span>{label}</span>
    </label>
  );
}

function formatSignedPower(powerMW) {
  return `${powerMW >= 0 ? '+' : ''}${powerMW.toFixed(2)} MW`;
}

function FrcKeyReadouts({ model }) {
  return (
    <aside className="frc-key-readouts" aria-label="Key performance readouts">
      <section className="frc-q-factor" aria-label="Plasma fusion gain">
        <span>PLASMA FUSION GAIN</span>
        <strong>Q {model.fusionGainQ.toFixed(2)}</strong>
        <small>{model.fusionPowerMW.toFixed(2)} MW fusion / {model.auxiliaryHeatingMW.toFixed(2)} MW auxiliary heating</small>
      </section>
      <section className={`frc-q-factor frc-net-electric${model.recovery.netElectricPowerMW >= 0 ? ' is-positive' : ''}`} aria-label="Net electric power">
        <span>NET ELECTRIC OBJECTIVE</span>
        <strong>{formatSignedPower(model.recovery.netElectricPowerMW)}</strong>
        <small>{model.recovery.recoveredPowerMW.toFixed(2)} MW gross recovery - {model.recovery.totalElectricLoadMW.toFixed(2)} MW electrical loads</small>
      </section>
    </aside>
  );
}

function FrcPanel({ configuration, model, gpuError, onChange, onHide, editing = false, onEditing = () => {}, canUndo = false, canRedo = false, onUndo = () => {}, onRedo = () => {}, onReset = () => {} }) {
  const visualizationVisibility = getFrcVisualizationVisibility(configuration);
  const activeInput = model.input;
  const annotationsEnabled = configuration.showAnnotations !== false;
  const selectedDevice = FRC_CONFIGURATIONS[configuration.configuration];
  const selectedExcitation = FRC_EXCITATION_CONFIGURATIONS[model.excitation.configuration];
  const selectedRecovery = FRC_RECOVERY_CONFIGURATIONS[model.recovery.configuration];
  const mhdConfigurationSelected = Boolean(selectedDevice.mhdMode);
  const updateRecovery = (change) => onChange({
    recoveryConfigurations: {
      ...configuration.recoveryConfigurations,
      [model.recovery.configuration]: {
        ...configuration.recoveryConfigurations?.[model.recovery.configuration],
        ...change
      }
    }
  });
  const selectVesselShape = (shape) => {
    const configurationForShape = shape === 'tokamak'
      ? 'tokamakStudy'
      : shape === 'stellarator'
        ? 'stellaratorStudy'
        : FRC_CONFIGURATIONS[configuration.configuration]?.deviceTopology
          ? 'thetaPinch'
          : null;
    onChange(configurationForShape ? { shape, configuration: configurationForShape } : { shape });
  };
  const updateExcitation = (change) => onChange({
    excitationConfigurations: {
      ...configuration.excitationConfigurations,
      [model.excitation.configuration]: {
        ...configuration.excitationConfigurations?.[model.excitation.configuration],
        ...change
      }
    }
  });
  const deviceStatus = selectedDevice.mhdGridOptimized
    ? `${model.input === 'Argon' ? 'ARGON CHECK' : 'DT PROJECTION'} / ${selectedDevice.mhdMode.toUpperCase()} / ARGON GRID`
    : model.mhd.active
      ? `ARGON MHD / ${model.mhd.mode.toUpperCase()}`
      : selectedDevice.deviceTopology
        ? `${selectedDevice.deviceTopology.toUpperCase()} / REDUCED TOROIDAL STUDY`
        : 'FIELD-REVERSED CONFIGURATION';
  return (
    <aside className="frc-panel">
      <ParamEditingProvider editing={editing}>
      <div className="frc-panel-topline"><span className="frc-panel-kicker"><i /> DEVICE + PLASMA / PHASE 02</span><button type="button" className="frc-hide-button" onClick={onHide}>Hide params</button></div>
      <div className="frc-status"><span>{deviceStatus}</span><strong>{selectedDevice.deviceTopology ? 'TOROIDAL GUIDE FIELD' : model.reversedField ? 'STABLE AXIAL BIAS' : 'OPEN AXIAL BIAS'}</strong></div>
      <div className="frc-editor-toolbar"><ParamEditingToggle checked={editing} onChange={onEditing} /><HistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} /></div>
      {gpuError && <p className="frc-gpu-error">GPU OFFLINE / {gpuError}</p>}
      <div className="frc-select-grid">
        <ParamSelect label="Vessel shape" value={configuration.shape} options={Object.entries(FRC_SHAPES).map(([id, shape]) => ({ value: id, label: shape.label }))} onChange={selectVesselShape} />
        <ParamSelect label="Device configuration" value={configuration.configuration} options={Object.entries(FRC_CONFIGURATIONS).map(([id, config]) => ({ value: id, label: config.label }))} onChange={(value) => onChange({ configuration: value })} />
        <ParamSelect label="Plasma input" value={configuration.input ?? 'DT'} options={Object.entries(FRC_INPUTS).map(([id, input]) => ({ value: id, label: input.label }))} onChange={(value) => onChange({ input: value })} />
      </div>
      <p className="frc-description">{FRC_SHAPES[configuration.shape].description} {FRC_CONFIGURATIONS[configuration.configuration].description} {FRC_INPUTS[configuration.input ?? 'DT'].description}</p>
      {mhdConfigurationSelected && !model.mhd.active && <p className="frc-description">{selectedDevice.mhdGridOptimized ? 'This is a DT counterfactual at an Argon-grid operating point. Reduced MHD forcing remains Argon-only; the displayed DT gain comes from the current screening model.' : 'This configuration preserves the independent plasma-input control. Select Argon to activate its MHD transport response and diagnostics.'}</p>}
      <section className="frc-readout-grid" aria-label="Calculated reactor values">
        <div><span>PLASMA BETA</span><strong>{(model.beta * 100).toFixed(1)}%</strong></div>
        <div><span>{model.geometry === 'frc' ? 'FIELD REVERSAL' : 'GUIDE FIELD'}</span><strong>{model.axialField.toFixed(2)} T</strong></div>
        <div><span>PLASMA CURRENT</span><strong>{model.plasmaCurrentMA.toFixed(2)} MA</strong></div>
        <div><span>PLASMA VOLUME</span><strong>{model.plasmaVolume.toFixed(1)} m3</strong></div>
      </section>
      <section className="frc-output-section" aria-label="Excitation geometry diagnostics">
        <div className="frc-section-label">EXCITATION / {selectedExcitation.label.toUpperCase()}</div>
        <div className="frc-output-grid">
          <div><span>RADIAL COUPLING</span><strong>{(model.excitation.radialCoupling * 100).toFixed(1)}%</strong><small>mean inward launcher component</small></div>
          <div><span>TANGENTIAL COUPLING</span><strong>{(model.excitation.tangentialCoupling * 100).toFixed(1)}%</strong><small>mean circulation component</small></div>
          <div><span>NET VORTICITY DRIVE</span><strong>{(model.excitation.signedVorticity * 100).toFixed(1)}%</strong><small>signed mean tangential component</small></div>
          {model.excitation.topology === 'gun-rings' && <div><span>TUBE-AXIS CANT</span><strong>{model.excitation.tubeAxisCantDegrees > 0 ? '+' : ''}{model.excitation.tubeAxisCantDegrees.toFixed(0)} deg</strong><small>signed along-centerline beam angle</small></div>}
          <div><span>Q SENSITIVITY</span><strong>{model.excitation.fusionGainDelta >= 0 ? '+' : ''}{(model.excitation.fusionGainDelta * 100).toFixed(2)}%</strong><small>relative to the axial reference model</small></div>
        </div>
        <p className="frc-description">No angle is universally optimal. This bounded sensitivity study varies local launcher cant and field topology; it is not a kinetic optimization or a true tokamak/stellarator equilibrium comparison.</p>
      </section>
      {model.mhd.active && <section className="frc-output-section" aria-label="Argon MHD diagnostics">
        <div className="frc-section-label">ARGON MHD / DERIVED DIAGNOSTICS</div>
        <div className="frc-output-grid">
          <div><span>MASS DENSITY</span><strong>{model.mhd.massDensityKgM3.toExponential(2)} kg/m3</strong><small>singly ionized argon estimate</small></div>
          <div><span>ALFVEN SPEED</span><strong>{(model.mhd.alfvenSpeedMps / 1000).toFixed(1)} km/s</strong><small>B / sqrt(mu0 rho)</small></div>
          <div><span>ION SOUND SPEED</span><strong>{(model.mhd.ionSoundSpeedMps / 1000).toFixed(1)} km/s</strong><small>ideal monatomic estimate</small></div>
          <div><span>ION CYCLOTRON</span><strong>{(model.mhd.ionCyclotronFrequencyHz / 1000).toFixed(1)} kHz</strong><small>qB / 2 pi m-Ar</small></div>
          <div><span>THERMAL GYRORADIUS</span><strong>{model.mhd.ionGyroradiusM.toFixed(3)} m</strong><small>thermal speed / cyclotron rate</small></div>
          <div><span>PROJECTED DT GAIN</span><strong>Q {model.mhd.projectedDtFusionGainQ.toFixed(2)}</strong><small>same state with DT reaction factor; not Argon gain</small></div>
        </div>
        {selectedDevice.mhdGridOptimized && <p className="frc-description">Best of 5,760 points for this mode at fixed 12 MW auxiliary heating: 4 shapes, 8 fields, 6 densities, 6 temperatures, and 5 rotations. Constraints: beta 0.05-0.80, stability at least 0.55, confinement at least 0.45, and thermal gyroradius at most 5% of plasma radius.</p>}
        <p className="frc-description">Reduced ideal-MHD tracer response; not a resistive, Hall-MHD, or kinetic plasma solver.</p>
      </section>}
      {model.drive.active && <section className="frc-output-section" aria-label="Argon external-drive diagnostics">
        <div className="frc-section-label">EXTERNAL DRIVE / REDUCED RESPONSE</div>
        <div className="frc-output-grid">
          {model.drive.mode === 'piezo-rmf' ? <>
            <div><span>PIEZO FREQUENCY</span><strong>{(model.drive.piezoFrequencyHz / 1000).toFixed(1)} kHz</strong><small>external actuator command</small></div>
            <div><span>STRAIN COMMAND</span><strong>{model.drive.piezoStrainPpm.toFixed(0)} ppm</strong><small>structure-side amplitude</small></div>
            <div><span>CYCLOTRON RATIO</span><strong>{model.drive.piezoCyclotronRatio.toFixed(3)}</strong><small>actuator / argon ion rate</small></div>
          </> : <>
            <div><span>ION-ACOUSTIC MODE</span><strong>{(model.drive.acousticFundamentalHz / 1000).toFixed(1)} kHz</strong><small>sound speed / 4 half-length</small></div>
            <div><span>DRIVE FREQUENCY</span><strong>{(model.drive.longitudinalFrequencyHz / 1000).toFixed(1)} kHz</strong><small>electrostatic packet command</small></div>
            <div><span>WAVELENGTH</span><strong>{model.drive.acousticWavelengthM.toFixed(2)} m</strong><small>ion sound speed / drive rate</small></div>
          </>}
          <div><span>COUPLING</span><strong>{(model.drive.coupling * 100).toFixed(0)}%</strong><small>assumed transfer coefficient</small></div>
        </div>
        <p className="frc-description">{model.drive.status}. The drive changes only the tracer response; it does not alter fusion power, confinement, or Q.</p>
      </section>}
      <section className="frc-output-section" aria-label="Reactor outputs">
        <div className="frc-section-label">OUTPUTS / ENGINEERING ESTIMATE</div>
        <div className="frc-output-grid">
          <div><span>GRID FREQUENCY</span><strong>{model.outputFrequencyHz.toFixed(0)} Hz</strong><small>conversion-stage grid interface</small></div>
          <div><span>PLASMA FREQUENCY</span><strong>{(model.plasmaFrequencyHz / 1e9).toFixed(1)} GHz</strong><small>density-derived electron mode</small></div>
          <div><span>PLASMA CYCLE</span><strong>{model.plasmaPeriodSeconds.toExponential(2)} s</strong><small>one full electron oscillation</small></div>
          <div><span>NITROGEN OUTPUT</span><strong>{model.nitrogenOutputSLM.toFixed(1)} SLM</strong><small>N2 purge / blanket stream</small></div>
          <div><span>HELIUM OUTPUT</span><strong>{model.heliumOutputGPerHour.toFixed(3)} g/h</strong><small>fusion alpha product</small></div>
          <div><span>NEUTRONS PRODUCED</span><strong>{model.neutronProductionRate.toExponential(2)} /s</strong><small>{model.neutronFlux.toExponential(2)} /m2/s estimated flux</small></div>
        </div>
      </section>
      <section className="frc-output-section" aria-label="Electric recovery accounting">
        <div className="frc-section-label">ELECTRIC RECOVERY / {selectedRecovery.label.toUpperCase()}</div>
        <div className="frc-output-grid">
          <div><span>DIRECT ELECTRIC</span><strong>{model.recovery.directElectricPowerMW.toFixed(2)} MW</strong><small>charged products captured and converted</small></div>
          <div><span>THERMAL ELECTRIC</span><strong>{model.recovery.thermalElectricPowerMW.toFixed(2)} MW</strong><small>remaining fusion channel through heat cycle</small></div>
          <div><span>INDUCTIVE RETURN</span><strong>{model.recovery.inductiveElectricPowerMW.toFixed(2)} MW</strong><small>recovered from pulsed drive</small></div>
          <div><span>GROSS RECOVERED</span><strong>{model.recovery.recoveredPowerMW.toFixed(2)} MW</strong><small>direct + thermal + inductive return</small></div>
          <div><span>DRIVE INPUT</span><strong>-{model.recovery.drivePowerMW.toFixed(2)} MW</strong><small>gross pulsed electrical demand</small></div>
          <div><span>AUXILIARY ELECTRIC</span><strong>-{model.recovery.auxiliaryElectricPowerMW.toFixed(2)} MW</strong><small>wall-plug cost of plasma heating</small></div>
          <div><span>FACILITY LOAD</span><strong>-{model.recovery.facilityPowerMW.toFixed(2)} MW</strong><small>balance-of-plant demand</small></div>
          <div><span>NET ELECTRIC</span><strong>{formatSignedPower(model.recovery.netElectricPowerMW)}</strong><small>gross recovery minus all electrical loads</small></div>
        </div>
        <p className="frc-description">Configurable engineering scenario, not measured Helion performance. Fusion energy captured by the direct path is removed before thermal conversion.</p>
      </section>
      <div className="frc-control-group">
        <span className="frc-section-label">PHYSICAL INPUTS</span>
        <RangeInput label="Applied magnetic field" value={configuration.magneticField} min={1} max={4.5} step={0.1} suffix=" T" onChange={(value) => onChange({ magneticField: value })} />
        <RangeInput label="Particle density" value={configuration.density} min={0.5} max={3} step={0.05} suffix="e20 m-3" onChange={(value) => onChange({ density: value })} />
        <RangeInput label="Ion temperature" value={configuration.ionTemperature} min={0.5} max={5} step={0.1} suffix=" keV" onChange={(value) => onChange({ ionTemperature: value })} />
        <RangeInput label="Auxiliary heating" value={configuration.auxiliaryHeatingMW} min={0.5} max={50} step={0.5} suffix=" MW" onChange={(value) => onChange({ auxiliaryHeatingMW: value })} />
        <RangeInput label="Field-axis tilt" value={configuration.fieldTilt} min={-18} max={18} step={1} suffix=" deg" onChange={(value) => onChange({ fieldTilt: value })} />
        <RangeInput label="Transport speed" value={configuration.transportSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ transportSpeed: value })} />
        <ParamSelect label="Transport model" value={configuration.transportModel} options={QUANTUM_TRANSPORT_OPTIONS} onChange={(value) => onChange({ transportModel: value })} />
        {configuration.transportModel === 'gpe' && <RangeInput label="Quantum pressure" value={configuration.quantumPressure} min={0} max={3} step={0.05} onChange={(value) => onChange({ quantumPressure: value })} />}
        {configuration.transportModel === 'ddf' && <>
          <RangeInput label="DDF dilatancy" value={configuration.transportDilatancy} min={0} max={8} step={0.05} onChange={(value) => onChange({ transportDilatancy: value })} />
          <RangeInput label="DDF speed limit" value={configuration.transportSpeedLimit} min={0.1} max={3} step={0.05} onChange={(value) => onChange({ transportSpeedLimit: value })} />
        </>}
        {configuration.transportModel !== 'classical' && <p className="frc-description">Experimental constitutive overlay; it does not alter the reactor power estimates.</p>}
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">PLASMA EXCITATION GEOMETRY</span>
        <ParamSelect label="Excitation architecture" value={model.excitation.configuration} options={Object.entries(FRC_EXCITATION_CONFIGURATIONS).map(([id, excitation]) => ({ value: id, label: excitation.label }))} onChange={(value) => onChange({ excitationConfiguration: value })} />
        <p className="frc-description">{selectedExcitation.description} Parameters are retained independently when switching architectures.</p>
        {model.excitation.topology === 'gun-rings' && <>
          <RangeInput label="Launcher rings" value={model.excitation.ringCount} min={1} max={6} step={1} onChange={(value) => updateExcitation({ ringCount: value })} />
          <RangeInput label="Launchers per ring" value={model.excitation.launchersPerRing} min={2} max={24} step={1} onChange={(value) => updateExcitation({ launchersPerRing: value })} />
          <RangeInput label="Flow-relative beam cant" value={model.excitation.flowRelativeCantDegrees} min={-75} max={75} step={1} suffix=" deg" onChange={(value) => updateExcitation({ flowRelativeCantDegrees: value })} />
          <p className="frc-description">Positive cant follows the modeled plasma-flow tangent; negative cant opposes it. Zero keeps the launcher aimed radially inward.</p>
          <RangeInput label="Tube-axis beam cant" value={model.excitation.tubeAxisCantDegrees} min={-45} max={45} step={1} suffix=" deg" onChange={(value) => updateExcitation({ tubeAxisCantDegrees: value })} />
          <p className="frc-description">FRC: positive aims toward the +X tube end; negative toward -X. Tokamak/Stellarator: positive follows the local tube centerline; negative aims against it. Zero keeps the beam in the tube cross-section plane.</p>
          <RangeInput label="Angle spread" value={model.excitation.angleSpreadDegrees} min={0} max={45} step={1} suffix=" deg" onChange={(value) => updateExcitation({ angleSpreadDegrees: value })} />
          <RangeInput label="Ring phase offset" value={model.excitation.phaseOffsetDegrees} min={-180} max={180} step={1} suffix=" deg" onChange={(value) => updateExcitation({ phaseOffsetDegrees: value })} />
          <div className="frc-control-group">
            <span className="frc-section-label">PLASMA FOCUS ACCELERATOR / REDUCED ION BEAM</span>
            <ParamSelect label="Focus ion species" value={model.excitation.focusBeam.ionSpecies} options={Object.entries(PLASMA_FOCUS_ION_SPECIES).map(([id, ion]) => ({ value: id, label: ion.label }))} onChange={(value) => updateExcitation({ ionSpecies: value })} />
            <RangeInput label="Accelerator voltage" value={model.excitation.focusBeam.acceleratorVoltageKV} min={1} max={500} step={1} suffix=" kV" onChange={(value) => updateExcitation({ acceleratorVoltageKV: value })} />
            <RangeInput label="Total beam current" value={model.excitation.focusBeam.totalBeamCurrentKA} min={0} max={100} step={0.1} suffix=" kA" onChange={(value) => updateExcitation({ totalBeamCurrentKA: value })} />
            <RangeInput label="Pulse duration" value={model.excitation.focusBeam.pulseDurationMicroseconds} min={0.1} max={1000} step={0.1} suffix=" us" onChange={(value) => updateExcitation({ pulseDurationMicroseconds: value })} />
            <RangeInput label="Pulse repetition rate" value={model.excitation.focusBeam.pulseRepetitionHz} min={0.1} max={1000} step={0.1} suffix=" Hz" onChange={(value) => updateExcitation({ pulseRepetitionHz: value })} />
            <RangeInput label="Acceleration gap" value={model.excitation.focusBeam.focusGapM} min={0.01} max={5} step={0.01} suffix=" m" onChange={(value) => updateExcitation({ focusGapM: value })} />
            <RangeInput label="Wave phase modulation" value={model.excitation.focusBeam.waveModulationDepth} min={0} max={0.5} step={0.01} onChange={(value) => updateExcitation({ waveModulationDepth: value })} />
            <RangeInput label="Modulation wavelength" value={model.excitation.focusBeam.waveWavelengthM} min={0.1} max={20} step={0.1} suffix=" m" onChange={(value) => updateExcitation({ waveWavelengthM: value })} />
            <RangeInput label="Modulation frequency" value={model.excitation.focusBeam.waveFrequencyKHz} min={0} max={5000} step={1} suffix=" kHz" onChange={(value) => updateExcitation({ waveFrequencyKHz: value })} />
            <RangeInput label="Modulation phase" value={model.excitation.focusBeam.wavePhaseRadians} min={-Math.PI} max={Math.PI} step={0.01} suffix=" rad" onChange={(value) => updateExcitation({ wavePhaseRadians: value })} />
            <ToggleInput label="Accelerated beamlets" checked={configuration.showPlasmaFocusBeamlets !== false} onChange={(value) => onChange({ showPlasmaFocusBeamlets: value })} />
            <div className="frc-output-grid" aria-label="Plasma focus beam diagnostics">
              <div><span>ION ENERGY</span><strong>{model.excitation.focusBeam.ionEnergyKeV.toFixed(1)} keV</strong><small>charge state x instantaneous qV</small></div>
              <div><span>ION SPEED</span><strong>{(model.excitation.focusBeam.ionSpeedMps / 1000).toFixed(1)} km/s</strong><small>relativistic energy-to-speed estimate</small></div>
              <div><span>PEAK BEAM POWER</span><strong>{model.excitation.focusBeam.peakPowerMW.toFixed(2)} MW</strong><small>array voltage x total pulse current</small></div>
              <div><span>PULSE ENERGY</span><strong>{model.excitation.focusBeam.pulseEnergyJ.toFixed(2)} J</strong><small>peak beam power x pulse duration</small></div>
              <div><span>AVERAGE BEAM POWER</span><strong>{model.excitation.focusBeam.averagePowerMW.toFixed(3)} MW</strong><small>{(model.excitation.focusBeam.dutyFactor * 100).toFixed(3)}% duty factor</small></div>
              <div><span>PER-FOCUS CURRENT</span><strong>{model.excitation.focusBeam.currentPerLauncherKA.toFixed(3)} kA</strong><small>equal current allocation proxy</small></div>
            </div>
            <p className="frc-description">Reduced electrostatic ion-beam kinematics; not a plasma-focus MHD, sheath, space-charge, or electrode solver. Wave phase reuses the interference sampler only as bounded terminal-voltage modulation. Beam pulses are slowed for display; diagnostics use configured physical voltage, current, and timing.</p>
          </div>
        </>}
        {(model.excitation.topology === 'tokamak-loop' || model.excitation.topology === 'stellarator-loop') && <>
          <RangeInput label="Drive loops" value={model.excitation.ringCount} min={1} max={6} step={1} onChange={(value) => updateExcitation({ ringCount: value })} />
          {model.excitation.topology === 'stellarator-loop' && <RangeInput label="Helical field periods" value={model.excitation.fieldPeriods} min={1} max={8} step={1} onChange={(value) => updateExcitation({ fieldPeriods: value })} />}
          <RangeInput label="Rotational-transform proxy" value={model.excitation.rotationalTransform} min={0} max={1} step={0.01} onChange={(value) => updateExcitation({ rotationalTransform: value })} />
        </>}
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">ELECTRIC RECOVERY SCENARIO</span>
        <ParamSelect label="Recovery architecture" value={model.recovery.configuration} options={Object.entries(FRC_RECOVERY_CONFIGURATIONS).map(([id, recovery]) => ({ value: id, label: recovery.label }))} onChange={(value) => onChange({ recoveryConfiguration: value })} />
        <p className="frc-description">{selectedRecovery.description} Parameters are retained independently when switching architectures.</p>
        <RangeInput label="Pulsed drive input" value={model.recovery.drivePowerMW} min={0} max={100} step={0.5} suffix=" MW" onChange={(value) => updateRecovery({ drivePowerMW: value })} />
        <RangeInput label="Inductive recovery" value={model.recovery.inductiveRecoveryEfficiency} min={0} max={1} step={0.01} onChange={(value) => updateRecovery({ inductiveRecoveryEfficiency: value })} />
        <RangeInput label="Charged-particle capture" value={model.recovery.chargedParticleCaptureEfficiency} min={0} max={1} step={0.01} onChange={(value) => updateRecovery({ chargedParticleCaptureEfficiency: value })} />
        <RangeInput label="Direct conversion" value={model.recovery.directConversionEfficiency} min={0} max={1} step={0.01} onChange={(value) => updateRecovery({ directConversionEfficiency: value })} />
        <RangeInput label="Thermal capture" value={model.recovery.thermalCaptureEfficiency} min={0} max={1} step={0.01} onChange={(value) => updateRecovery({ thermalCaptureEfficiency: value })} />
        <RangeInput label="Thermal conversion" value={model.recovery.thermalConversionEfficiency} min={0} max={1} step={0.01} onChange={(value) => updateRecovery({ thermalConversionEfficiency: value })} />
        <RangeInput label="Auxiliary wall-plug efficiency" value={model.recovery.auxiliaryWallPlugEfficiency} min={0.05} max={1} step={0.01} onChange={(value) => updateRecovery({ auxiliaryWallPlugEfficiency: value })} />
        <RangeInput label="Facility load" value={model.recovery.facilityPowerMW} min={0} max={50} step={0.5} suffix=" MW" onChange={(value) => updateRecovery({ facilityPowerMW: value })} />
      </div>
      {selectedDevice.driveMode && <div className="frc-control-group">
        <span className="frc-section-label">EXTERNAL DRIVE PARAMETERS</span>
        {selectedDevice.driveMode === 'piezo-rmf' ? <>
          <RangeInput label="Piezo drive frequency" value={configuration.piezoDriveFrequencyKHz} min={1} max={100} step={1} suffix=" kHz" onChange={(value) => onChange({ piezoDriveFrequencyKHz: value })} />
          <RangeInput label="Piezo strain command" value={configuration.piezoStrainPpm} min={0} max={1000} step={10} suffix=" ppm" onChange={(value) => onChange({ piezoStrainPpm: value })} />
        </> : <>
          <RangeInput label="Longitudinal drive frequency" value={configuration.longitudinalDriveFrequencyKHz} min={0.1} max={100} step={0.1} suffix=" kHz" onChange={(value) => onChange({ longitudinalDriveFrequencyKHz: value })} />
          <RangeInput label="Longitudinal field amplitude" value={configuration.longitudinalDriveAmplitude} min={0} max={1} step={0.01} onChange={(value) => onChange({ longitudinalDriveAmplitude: value })} />
          <RangeInput label="Wave-packet width" value={configuration.wavePacketWidth} min={0.05} max={1} step={0.05} suffix=" L" onChange={(value) => onChange({ wavePacketWidth: value })} />
        </>}
        <RangeInput label="Measured drive coupling" value={configuration.driveCoupling} min={0} max={1} step={0.01} onChange={(value) => onChange({ driveCoupling: value })} />
        <p className="frc-description">Argon-only reduced experiment. Renderer phase is slowed for visibility and does not resolve the physical kHz timescale.</p>
      </div>}
      <div className="frc-control-group">
        <span className="frc-section-label">DEVICE LAYERS</span>
        <RangeInput label="Vessel scale" value={configuration.vesselScale} min={0.8} max={1.2} step={0.01} onChange={(value) => onChange({ vesselScale: value })} />
        <RangeInput label="Vessel transparency" value={configuration.vesselOpacity} min={0.06} max={0.34} step={0.01} onChange={(value) => onChange({ vesselOpacity: value })} />
        <RangeInput label="Plasma opacity" value={configuration.plasmaOpacity} min={0.15} max={1} step={0.05} onChange={(value) => onChange({ plasmaOpacity: value })} />
        <RangeInput label="Separatrix volume opacity" value={configuration.fieldVolumeOpacity ?? 0.06} min={0} max={0.3} step={0.01} onChange={(value) => onChange({ fieldVolumeOpacity: value })} />
        {model.geometry !== 'frc' && <>
          <ToggleInput label="Toroidal plasma tube" checked={configuration.showToroidalPlasmaVolume === true} onChange={(value) => onChange({ showToroidalPlasmaVolume: value })} />
          <RangeInput label="Toroidal plasma tube opacity" value={configuration.toroidalPlasmaOpacity ?? 0.28} min={0} max={0.9} step={0.05} onChange={(value) => onChange({ toroidalPlasmaOpacity: value })} />
        </>}
        <ColorParamControl label="Plasma color" value={configuration.plasmaColor} editing={editing} isDefault={configuration.plasmaColor === (activeInput === 'Argon' ? ARGON_PLASMA_COLOR : DEFAULT_PLASMA_COLOR)} onReset={() => onChange({ plasmaColor: activeInput === 'Argon' ? ARGON_PLASMA_COLOR : DEFAULT_PLASMA_COLOR })} onChange={(value) => onChange({ plasmaColor: value })} />
        <ColorParamControl label="Vessel shell color" value={configuration.vesselShellColor} editing={editing} isDefault={configuration.vesselShellColor === DEFAULT_VESSEL_SHELL_COLOR} onReset={() => onChange({ vesselShellColor: DEFAULT_VESSEL_SHELL_COLOR })} onChange={(value) => onChange({ vesselShellColor: value })} />
        <ColorParamControl label="Vessel shell emissive" value={configuration.vesselShellEmissiveColor} editing={editing} isDefault={configuration.vesselShellEmissiveColor === DEFAULT_VESSEL_SHELL_EMISSIVE_COLOR} onReset={() => onChange({ vesselShellEmissiveColor: DEFAULT_VESSEL_SHELL_EMISSIVE_COLOR })} onChange={(value) => onChange({ vesselShellEmissiveColor: value })} />
        <ColorParamControl label="Separatrix volume color" value={configuration.separatrixVolumeColor} editing={editing} isDefault={configuration.separatrixVolumeColor === DEFAULT_SEPARATRIX_VOLUME_COLOR} onReset={() => onChange({ separatrixVolumeColor: DEFAULT_SEPARATRIX_VOLUME_COLOR })} onChange={(value) => onChange({ separatrixVolumeColor: value })} />
        <ColorParamControl label="Separatrix volume emissive" value={configuration.separatrixVolumeEmissiveColor} editing={editing} isDefault={configuration.separatrixVolumeEmissiveColor === DEFAULT_SEPARATRIX_VOLUME_EMISSIVE_COLOR} onReset={() => onChange({ separatrixVolumeEmissiveColor: DEFAULT_SEPARATRIX_VOLUME_EMISSIVE_COLOR })} onChange={(value) => onChange({ separatrixVolumeEmissiveColor: value })} />
        <ToggleInput label="Run plasma transport" checked={configuration.plasmaRunning} onChange={(value) => onChange({ plasmaRunning: value })} />
        <ToggleInput label="Plasma particles" checked={configuration.showPlasma} onChange={(value) => onChange({ showPlasma: value })} />
        <ToggleInput label="All cabling and outputs" checked={configuration.showCabling ?? true} onChange={(value) => onChange({ showCabling: value })} />
        <ToggleInput label="Confinement coils" checked={configuration.showCoils} onChange={(value) => onChange({ showCoils: value })} />
        <ToggleInput label="Excitation hardware" checked={configuration.showExcitationHardware ?? true} onChange={(value) => onChange({ showExcitationHardware: value })} />
        <ToggleInput label="Separatrix volume" checked={configuration.showFieldVolume} onChange={(value) => onChange({ showFieldVolume: value })} />
        <ToggleInput label="Field axis" checked={configuration.showAxis} onChange={(value) => onChange({ showAxis: value })} />
        <ToggleInput label="Performance readouts" checked={configuration.showKeyReadouts !== false} onChange={(value) => onChange({ showKeyReadouts: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">FLOW PARAMETERS</span>
        <RangeInput label="Nitrogen gas speed" value={configuration.gasFlowSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ gasFlowSpeed: value })} />
        <RangeInput label="Charge flow speed" value={configuration.chargeFlowSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ chargeFlowSpeed: value })} />
        <RangeInput label="Helium output speed" value={configuration.heliumFlowSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ heliumFlowSpeed: value })} />
        <RangeInput label="Neutron output speed" value={configuration.neutronFlowSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ neutronFlowSpeed: value })} />
        <RangeInput label="Input particle speed" value={configuration.inputParticleSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ inputParticleSpeed: value })} />
        <ToggleInput label="Nitrogen gas flow" swatch={FLOW_PARTICLE_STREAMS.gas.color} checked={(configuration.showGasFlow ?? true) && visualizationVisibility.ancillary.nitrogenGasFlow} disabled={!visualizationVisibility.ancillary.nitrogenGasFlow} onChange={(value) => onChange({ showGasFlow: value })} />
        <ToggleInput label="Charge flow" swatch={FLOW_PARTICLE_STREAMS.charge.color} checked={(configuration.showChargeFlow ?? true) && visualizationVisibility.ancillary.chargeFlow} disabled={!visualizationVisibility.ancillary.chargeFlow} onChange={(value) => onChange({ showChargeFlow: value })} />
        <ToggleInput label="Input particle streams" checked={(configuration.showInputParticles ?? true) && visualizationVisibility.ancillary.inputParticles} disabled={!visualizationVisibility.ancillary.inputParticles} onChange={(value) => onChange({ showInputParticles: value })} />
        {Object.entries(INPUT_PARTICLE_STREAMS).map(([input, stream]) => {
          const configurationKey = input === 'DHe_3' ? 'showDHe3Input' : `show${input}Input`;
          const active = activeInput === input;
          return <ToggleInput key={input} label={`${stream.label} particles`} swatch={stream.color} checked={visualizationVisibility.input[input] && (configuration[configurationKey] ?? true)} disabled={!active || !visualizationVisibility.ancillary.inputParticles} onChange={(value) => onChange({ [configurationKey]: value })} />;
        })}
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">HARNESS + OUTPUTS</span>
        <RangeInput label="Harness lift" value={configuration.harnessHeight} min={0.4} max={2.5} step={0.05} suffix=" m" onChange={(value) => onChange({ harnessHeight: value })} />
        <RangeInput label="Collector rings" value={configuration.harnessCollectorCount} min={3} max={11} step={1} onChange={(value) => onChange({ harnessCollectorCount: value })} />
        <RangeInput label="Output spread" value={configuration.outputSpread} min={0.8} max={3.2} step={0.1} suffix=" m" onChange={(value) => onChange({ outputSpread: value })} />
        <RangeInput label="Output tube radius" value={configuration.outputTubeRadius} min={0.04} max={0.18} step={0.005} suffix=" m" onChange={(value) => onChange({ outputTubeRadius: value })} />
        <ToggleInput label="Energy capture harness" checked={(configuration.showEnergyHarness ?? true) && visualizationVisibility.ancillary.energyHarness} disabled={!visualizationVisibility.ancillary.energyHarness} onChange={(value) => onChange({ showEnergyHarness: value })} />
        <ToggleInput label="Output manifold" checked={(configuration.showOutputManifold ?? true) && visualizationVisibility.ancillary.outputManifold} disabled={!visualizationVisibility.ancillary.outputManifold} onChange={(value) => onChange({ showOutputManifold: value })} />
        <ToggleInput label="Nitrogen purge" swatch="#77c9e9" checked={(configuration.showNitrogenOutput ?? true) && visualizationVisibility.output.nitrogen} disabled={!visualizationVisibility.output.nitrogen} onChange={(value) => onChange({ showNitrogenOutput: value })} />
        <ToggleInput label="Helium alpha product" swatch="#82e0c0" checked={(configuration.showHeliumOutput ?? true) && visualizationVisibility.output.helium} disabled={!visualizationVisibility.output.helium} onChange={(value) => onChange({ showHeliumOutput: value })} />
        <ToggleInput label="Neutron flux" swatch="#f3ad63" checked={(configuration.showNeutronOutput ?? true) && visualizationVisibility.output.neutrons} disabled={!visualizationVisibility.output.neutrons} onChange={(value) => onChange({ showNeutronOutput: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">ANNOTATIONS</span>
        <ToggleInput label="Turn off all annotations" checked={!annotationsEnabled} onChange={(value) => onChange({ showAnnotations: !value })} />
        <ToggleInput label="Plasma annotation" checked={annotationsEnabled && configuration.showPlasmaAnnotations !== false} disabled={!annotationsEnabled} onChange={(value) => onChange({ showPlasmaAnnotations: value })} />
        <ToggleInput label="Plasma metrics" checked={annotationsEnabled && configuration.showPlasmaAttributes !== false} disabled={!annotationsEnabled} onChange={(value) => onChange({ showPlasmaAttributes: value })} />
        <ToggleInput label="Input names" checked={annotationsEnabled && configuration.showInputAnnotations !== false} disabled={!annotationsEnabled} onChange={(value) => onChange({ showInputAnnotations: value })} />
        <ToggleInput label="Input attributes" checked={annotationsEnabled && configuration.showInputAttributes !== false} disabled={!annotationsEnabled} onChange={(value) => onChange({ showInputAttributes: value })} />
        <ToggleInput label="Device annotations" checked={annotationsEnabled && configuration.showDeviceAnnotations !== false} disabled={!annotationsEnabled} onChange={(value) => onChange({ showDeviceAnnotations: value })} />
        <ToggleInput label="Device attributes" checked={annotationsEnabled && configuration.showDeviceAttributes !== false} disabled={!annotationsEnabled} onChange={(value) => onChange({ showDeviceAttributes: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">ORIENTATION</span>
        <RangeInput label="Roll" value={configuration.deviceRoll ?? configuration.deviceRotationZ ?? 0} min={-180} max={180} step={1} suffix=" deg" ticks={ORIENTATION_TICKS} onChange={(value) => onChange({ deviceRoll: value })} />
        <RangeInput label="Pitch" value={configuration.devicePitch ?? configuration.deviceRotationX ?? 0} min={-180} max={180} step={1} suffix=" deg" ticks={ORIENTATION_TICKS} onChange={(value) => onChange({ devicePitch: value })} />
        <RangeInput label="Yaw" value={configuration.deviceYaw ?? configuration.deviceRotationY ?? 0} min={-180} max={180} step={1} suffix=" deg" ticks={ORIENTATION_TICKS} onChange={(value) => onChange({ deviceYaw: value })} />
        <button type="button" className="frc-reset-button" onClick={() => onChange({ deviceRoll: 0, devicePitch: 0, deviceYaw: 0 })}>Reset parallel to ground</button>
      </div>
      <button type="button" className="frc-reset-button" onClick={onReset}>Reset all parameters</button>
      </ParamEditingProvider>
    </aside>
  );
}

export default function FrcFusionSim({ onBack }) {
  const editor = useSimulationEditor(INITIAL_CONFIGURATION);
  const { value: configuration, commit, load, canUndo, canRedo, undo, redo } = editor;
  const [editing, setEditing] = useState(false);
  const [parametersVisible, setParametersVisible] = useState(true);
  const [gpuError, setGpuError] = useState('');
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);
  const [pinnedAnnotation, setPinnedAnnotation] = useState(null);
  const focusedAnnotation = hoveredAnnotation ?? pinnedAnnotation;
  const model = useMemo(() => calculateFrcModel(configuration), [configuration]);
  useUndoRedoShortcuts({ undo, redo, canUndo, canRedo, isTextEditing: (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) });
  const toggleAnnotationFocus = (annotationId) => {
    setHoveredAnnotation(null);
    setPinnedAnnotation((current) => current === annotationId ? null : annotationId);
  };
  const updateConfiguration = (change) => commit((current) => {
    if (change.input && change.input !== current.input) {
      const input = FRC_INPUTS[change.input] ? change.input : 'DT';
      return {
        ...current,
        ...change,
        input,
        plasmaColor: input === 'Argon' ? ARGON_PLASMA_COLOR : DEFAULT_PLASMA_COLOR,
        showDTInput: input === 'DT',
        showDHe3Input: input === 'DHe_3',
        showArgonInput: input === 'Argon'
      };
    }
    if (!change.configuration || change.configuration === current.configuration) return { ...current, ...change };
    const preset = FRC_CONFIGURATIONS[change.configuration];
    const leavingToroidalStudy = FRC_SHAPES[current.shape]?.geometry && !preset.deviceTopology;
    return {
      ...current,
      ...change,
      shape: change.shape ?? preset.shape ?? (leavingToroidalStudy ? 'elongated' : current.shape),
      magneticField: preset.magneticField,
      density: preset.density,
      ionTemperature: preset.ionTemperature,
      rotation: preset.rotation,
      auxiliaryHeatingMW: preset.auxiliaryHeatingMW ?? current.auxiliaryHeatingMW,
      piezoDriveFrequencyKHz: preset.piezoDriveFrequencyKHz ?? current.piezoDriveFrequencyKHz,
      piezoStrainPpm: preset.piezoStrainPpm ?? current.piezoStrainPpm,
      longitudinalDriveFrequencyKHz: preset.longitudinalDriveFrequencyKHz ?? current.longitudinalDriveFrequencyKHz,
      longitudinalDriveAmplitude: preset.longitudinalDriveAmplitude ?? current.longitudinalDriveAmplitude,
      wavePacketWidth: preset.wavePacketWidth ?? current.wavePacketWidth,
      driveCoupling: preset.driveCoupling ?? current.driveCoupling,
      excitationConfiguration: preset.excitationConfiguration ?? (leavingToroidalStudy ? 'axialReference' : current.excitationConfiguration)
    };
  });

  return (
    <main className="frc-app">
      <div className="frc-scene"><Canvas camera={{ position: [0, 0, 22], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><ReactorScene configuration={configuration} onGpuError={setGpuError} parametersVisible={parametersVisible} focusedAnnotation={focusedAnnotation} onHoverAnnotation={setHoveredAnnotation} onToggleAnnotation={toggleAnnotationFocus} /></Canvas></div>
      <header className="frc-topbar"><div className="frc-brand"><span className="frc-mark">FRC</span><span><b>FUSION DEVICE LAB</b><em>Field-reversed configuration / phase 02</em></span></div><div className="frc-top-meta"><span>PHYSICAL MODEL</span><span>GPGPU TRANSPORT ACTIVE</span></div><button type="button" className="frc-back-button" onClick={onBack}>Lab menu</button></header>
      <section className="frc-title"><p>Transparent reactor study</p><h1>Shape the vessel.<br />Read the field.</h1><span>GPU plasma transport is active inside the device. Kinetic solver dynamics work follows in phase 03.</span></section>
      <nav className="frc-view-toolbar"><button type="button" onClick={() => setParametersVisible((visible) => !visible)}>{parametersVisible ? 'Hide params' : 'Show params'}</button><span>ORBIT / DEVICE SCALE 1:{configuration.vesselScale.toFixed(2)}</span></nav>
      {configuration.showKeyReadouts !== false && <FrcKeyReadouts model={model} />}
      {parametersVisible && <FrcPanel configuration={configuration} model={model} gpuError={gpuError} onChange={updateConfiguration} onHide={() => setParametersVisible(false)} editing={editing} onEditing={setEditing} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} onReset={() => load(INITIAL_CONFIGURATION)} />}
      <div className="frc-footer"><span>GEOMETRY / COILS / SEPARATRIX</span><span>BETA {Math.round(model.beta * 100)}% / CONFINEMENT {Math.round(model.confinement * 100)}%</span></div>
    </main>
  );
}
