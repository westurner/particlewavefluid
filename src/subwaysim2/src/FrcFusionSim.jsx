import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, MathUtils, ShaderMaterial, Vector3 } from 'three';
import { calculateFrcModel, FRC_CONFIGURATIONS, FRC_INPUTS, FRC_SHAPES, getFrcVisualizationVisibility } from './frcModel.js';
import { advanceFlowProgress, createFlowPathPoints, createInputParticlePathPoints, FLOW_PARTICLE_STREAMS, getFlowParticleVisibility, getInputParticleVisibility, INPUT_PARTICLE_STREAMS } from './flowParticles.js';
import { createGpuParticleField, createSimulationUvs } from './simulations/gpuParticleRuntime.js';

const INITIAL_CONFIGURATION = {
  shape: 'elongated',
  configuration: 'thetaPinch',
  input: 'DT',
  magneticField: 2.8,
  density: 1.8,
  ionTemperature: 1.6,
  rotation: 0.18,
  vesselScale: 1,
  vesselOpacity: 0.18,
  fieldTilt: 0,
  transportSpeed: 1,
  plasmaOpacity: 0.85,
  plasmaRunning: true,
  showPlasma: true,
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
  inputParticleSpeed: 1,
  showInputParticles: true,
  showDTInput: true,
  showDHe3Input: false,
  showArgonInput: false,
  showInputAnnotations: true,
  showInputAttributes: true,
  showDeviceAnnotations: true,
  showDeviceAttributes: true,
  showCoils: true,
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
const PLASMA_RESOLUTION = Math.ceil(Math.sqrt(PLASMA_PARTICLE_COUNT));

const plasmaPositionShader = `
  uniform float uDt;
  uniform float uHalfLength;
  uniform float uRadius;
  uniform bool uRunning;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    if (uRunning) positionData.xyz += velocityData.xyz * uDt;

    float radialDistance = length(positionData.yz);
    if (radialDistance > uRadius) {
      positionData.yz *= (uRadius * 0.985) / radialDistance;
      velocityData.yz *= -0.45;
    }
    if (positionData.x > uHalfLength) positionData.x = -uHalfLength + 0.02;
    if (positionData.x < -uHalfLength) positionData.x = uHalfLength - 0.02;
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
  uniform float uRotation;
  uniform float uTemperature;
  uniform float uDensity;
  uniform float uTransportSpeed;
  uniform bool uRunning;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 position = positionData.xyz;
    vec3 velocity = velocityData.xyz;
    float radialDistance = max(length(position.yz), 0.001);
    vec3 radial = vec3(0.0, position.y, position.z) / radialDistance;
    vec3 azimuthal = vec3(0.0, -position.z, position.y) / radialDistance;
    float normalizedRadius = clamp(radialDistance / uRadius, 0.0, 1.0);
    float edgePressure = smoothstep(0.45, 1.0, normalizedRadius);
    float axialProfile = cos(position.x / max(uHalfLength, 0.1) * 1.5708);
    vec3 acceleration = -radial * edgePressure * (uField * 0.72 + uDensity * 0.18);
    acceleration += azimuthal * uRotation * uField * (0.3 + 0.7 * axialProfile);
    acceleration.x += uTransportSpeed * (0.16 + 0.28 * axialProfile) * sign(uAxialField);
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
  varying float vEnergy;

  void main() {
    vec2 simulationUv = aSimulationUv;
    vec4 positionData = texture2D(uPositionTex, simulationUv);
    vec4 velocityData = texture2D(uVelocityTex, simulationUv);
    vec4 mvPosition = modelViewMatrix * vec4(positionData.xyz, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = max(1.5, uPointSize * (1.0 + velocityData.w * 0.9) / max(-mvPosition.z, 1.0));
    vEnergy = clamp(positionData.w * 0.72 + velocityData.w * 0.28, 0.0, 1.0) * uOpacity;
  }
`;

const plasmaFragmentShader = `
  varying float vEnergy;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceFromCenter = length(point);
    if (distanceFromCenter > 0.5) discard;
    float glow = pow(1.0 - smoothstep(0.0, 0.5, distanceFromCenter), 1.7);
    vec3 cool = vec3(0.16, 0.78, 0.82);
    vec3 hot = vec3(1.0, 0.68, 0.26);
    vec3 color = mix(cool, hot, vEnergy);
    gl_FragColor = vec4(color, glow * (0.35 + vEnergy * 0.65));
  }
`;

function ReactorVessel({ model, scale, opacity, showCoils }) {
  const vesselLength = model.wallHalfLength * 2 * scale;
  const vesselRadius = model.wallRadius * scale;
  const coilPositions = Array.from({ length: 9 }, (_, index) => (
    -model.plasmaHalfLength + (index / 8) * model.plasmaHalfLength * 2
  ));

  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[vesselRadius, vesselRadius, vesselLength, 64, 1, true]} />
        <meshPhysicalMaterial color="#a9d9dd" transparent opacity={opacity} roughness={0.2} metalness={0.35} side={DoubleSide} depthWrite={false} />
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

function FieldVolume({ model, scale, tilt }) {
  const plasmaScale = [model.plasmaHalfLength * scale, model.plasmaRadius * scale, model.plasmaRadius * scale];
  const lobeShape = model.shape === 'doubleLobed';
  return (
    <group rotation={[0, MathUtils.degToRad(tilt), 0]}>
      <mesh scale={plasmaScale}>
        {lobeShape ? <capsuleGeometry args={[0.72, 1.35, 12, 32]} rotation={[0, 0, Math.PI / 2]} /> : <sphereGeometry args={[1, 48, 24]} />}
        <meshPhysicalMaterial color="#72d8ce" emissive="#145b60" emissiveIntensity={0.55} transparent opacity={0.16} roughness={0.16} metalness={0.05} side={DoubleSide} depthWrite={false} />
      </mesh>
      {lobeShape && [-1, 1].map((side) => (
        <mesh key={side} position={[side * model.plasmaHalfLength * 0.43 * scale, 0, 0]} scale={[model.plasmaHalfLength * 0.48 * scale, model.plasmaRadius * 0.82 * scale, model.plasmaRadius * 0.82 * scale]}>
          <sphereGeometry args={[1, 36, 20]} />
          <meshBasicMaterial color="#8ce9d4" transparent opacity={0.13} depthWrite={false} />
        </mesh>
      ))}
      <mesh scale={[model.plasmaHalfLength * scale, model.plasmaRadius * 0.28 * scale, model.plasmaRadius * 0.28 * scale]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color="#ffd18a" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FieldAxis({ model, scale, tilt }) {
  const length = model.wallHalfLength * 2.15 * scale;
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

function EnergyHarness({ model, scale, visible, harnessHeight = 1.15, harnessCollectorCount = 7 }) {
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
          <meshBasicMaterial color="#f5c16c" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
      {cableCurves.map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 24, 0.055, 8, false]} />
          <meshBasicMaterial color="#f5c16c" transparent opacity={0.9} depthWrite={false} />
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

function OutputManifold({ model, scale, visible, outputSpread = 1.8, outputTubeRadius = 0.085, showNitrogenOutput = true, showHeliumOutput = true, showNeutronOutput = true }) {
  const halfLength = model.wallHalfLength * scale;
  const radius = model.wallRadius * scale;
  const outputs = [
    { id: 'nitrogen', color: '#77c9e9', y: Number(outputSpread), visible: showNitrogenOutput },
    { id: 'helium', color: '#82e0c0', y: 0, visible: showHeliumOutput },
    { id: 'neutrons', color: '#f3ad63', y: -Number(outputSpread), visible: showNeutronOutput }
  ];
  return (
    <group name="output-manifold" visible={visible}>
      {outputs.map((output) => {
        const curve = new CatmullRomCurve3([
          new Vector3(halfLength * 0.92, 0, radius * 0.82),
          new Vector3(halfLength + 0.7, output.y * 0.3, radius + 0.45),
          new Vector3(halfLength + 1.45, output.y, radius + 0.85),
          new Vector3(halfLength + 2.35, output.y, radius + 0.85)
        ]);
        return (
          <group key={output.id} visible={output.visible}>
            <mesh>
              <tubeGeometry args={[curve, 20, Number(outputTubeRadius), 10, false]} />
              <meshBasicMaterial color={output.color} transparent opacity={0.85} depthWrite={false} />
            </mesh>
            <mesh position={[halfLength + 2.35, output.y, radius + 0.85]}>
              <sphereGeometry args={[0.2, 16, 12]} />
              <meshBasicMaterial color={output.color} transparent opacity={0.95} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function DeviceAnnotations({ model, scale, outputSpread, harnessHeight, harnessCollectorCount, showNames, showAttributes, showEnergyHarness, showOutputManifold, showNitrogenOutput, showHeliumOutput, showNeutronOutput }) {
  if (!showNames && !showAttributes) return null;
  const halfLength = model.wallHalfLength * scale;
  const radius = model.wallRadius * scale;
  const outputY = Number(outputSpread);
  const outputAnnotations = [
    { id: 'nitrogen', position: [halfLength + 1.45, outputY, radius + 0.92], color: '#77c9e9', value: `${model.nitrogenOutputSLM.toFixed(1)} SLM`, visible: showNitrogenOutput },
    { id: 'helium', position: [halfLength + 1.45, 0, radius + 0.92], color: '#82e0c0', value: `${model.heliumOutputGPerHour.toFixed(3)} g/h`, visible: showHeliumOutput },
    { id: 'neutrons', position: [halfLength + 1.45, -outputY, radius + 0.92], color: '#f3ad63', value: `${model.neutronFlux.toExponential(2)} /m2/s`, visible: showNeutronOutput }
  ];
  return (
    <group name="device-annotations">
      {showEnergyHarness && (
        <Html position={[0, radius + Number(harnessHeight) + 0.45, 0]} center distanceFactor={8} className="frc-device-label">
          <div style={{ '--frc-input-color': '#ffd990' }}>
            {showNames && <strong>Energy capture harness</strong>}
            {showAttributes && <span>{harnessCollectorCount} collector rings / conversion bus</span>}
          </div>
        </Html>
      )}
      {showOutputManifold && outputAnnotations.filter((output) => output.visible).map((output) => (
        <Html key={output.id} position={output.position} center distanceFactor={8} className="frc-device-label">
          <div style={{ '--frc-input-color': output.color }}>
            {showNames && <strong>{OUTPUT_COMPONENTS[output.id].label}</strong>}
            {showAttributes && <span>{OUTPUT_COMPONENTS[output.id].detail} / {output.value}</span>}
          </div>
        </Html>
      ))}
    </group>
  );
}

function FlowParticles({ model, scale, showGasFlow, showChargeFlow, gasFlowSpeed = 1, chargeFlowSpeed = 1, showCabling }) {
  const pointsRef = useRef(null);
  const particleVisibility = getFlowParticleVisibility({ showCabling, showGasFlow, showChargeFlow });
  const gasMaterial = useMemo(() => new ShaderMaterial({
    uniforms: { uColor: { value: new Color(FLOW_PARTICLE_STREAMS.gas.color) } },
    vertexShader: `
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = max(8.0, 120.0 / max(-mvPosition.z, 1.0));
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distanceFromCenter = length(point);
        if (distanceFromCenter > 0.5) discard;
        float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
        gl_FragColor = vec4(uColor, glow * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  }), []);
  const chargeMaterial = useMemo(() => new ShaderMaterial({
    uniforms: { uColor: { value: new Color(FLOW_PARTICLE_STREAMS.charge.color) } },
    vertexShader: gasMaterial.vertexShader,
    fragmentShader: gasMaterial.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  }), [gasMaterial.fragmentShader, gasMaterial.vertexShader]);
  const paths = useMemo(() => {
    const flowPathPoints = createFlowPathPoints({ wallHalfLength: model.wallHalfLength, wallRadius: model.wallRadius, scale });
    return {
      nitrogenPath: new CatmullRomCurve3(flowPathPoints.nitrogenPath.map((point) => new Vector3(...point))),
      chargePath: new CatmullRomCurve3(flowPathPoints.chargePath.map((point) => new Vector3(...point)))
    };
  }, [model.wallHalfLength, model.wallRadius, scale]);
  const gasGeometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new BufferAttribute(new Float32Array(32 * 3), 3));
    return nextGeometry;
  }, []);
  const chargeGeometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new BufferAttribute(new Float32Array(32 * 3), 3));
    return nextGeometry;
  }, []);

  useEffect(() => () => {
    gasGeometry.dispose();
    chargeGeometry.dispose();
    gasMaterial.dispose();
    chargeMaterial.dispose();
  }, [chargeGeometry, chargeMaterial, gasGeometry, gasMaterial]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const gasPositions = gasGeometry.attributes.position.array;
    const chargePositions = chargeGeometry.attributes.position.array;
    const gasCycle = clock.elapsedTime;
    const chargeCycle = clock.elapsedTime;
    for (let index = 0; index < 32; index += 1) {
      const gasProgress = advanceFlowProgress(index / 32, FLOW_PARTICLE_STREAMS.gas.speed * gasFlowSpeed, gasCycle);
      const chargeProgress = advanceFlowProgress(index / 32, FLOW_PARTICLE_STREAMS.charge.speed * chargeFlowSpeed, chargeCycle);
      const gasPoint = paths.nitrogenPath.getPointAt(gasProgress);
      const chargePoint = paths.chargePath.getPointAt(chargeProgress);
      const gasOffset = index * 3;
      gasPositions[gasOffset] = gasPoint.x;
      gasPositions[gasOffset + 1] = gasPoint.y;
      gasPositions[gasOffset + 2] = gasPoint.z;
      chargePositions[gasOffset] = chargePoint.x;
      chargePositions[gasOffset + 1] = chargePoint.y;
      chargePositions[gasOffset + 2] = chargePoint.z;
    }
    gasGeometry.attributes.position.needsUpdate = true;
    chargeGeometry.attributes.position.needsUpdate = true;
  });

  return (
    <group ref={pointsRef} name="flow-particles" visible={showCabling}>
      <points name="gas-flow-particles" geometry={gasGeometry} material={gasMaterial} visible={particleVisibility.gas} frustumCulled={false} />
      <points name="charge-flow-particles" geometry={chargeGeometry} material={chargeMaterial} visible={particleVisibility.charge} frustumCulled={false} />
    </group>
  );
}

const INPUT_PARTICLE_COUNT = 24;

function InputParticles({ model, scale, activeInput, showInputParticles, showDTInput, showDHe3Input, showArgonInput, inputParticleSpeed = 1, showCabling }) {
  const pointsRef = useRef(null);
  const particleVisibility = getInputParticleVisibility({ activeInput, showCabling, showInputParticles, showDTInput, showDHe3Input, showArgonInput });
  const paths = useMemo(() => {
    const inputPathPoints = createInputParticlePathPoints({ plasmaHalfLength: model.plasmaHalfLength, plasmaRadius: model.plasmaRadius, scale });
    return Object.fromEntries(Object.entries(inputPathPoints).map(([input, points]) => [
      input,
      new CatmullRomCurve3(points.map((point) => new Vector3(...point)))
    ]));
  }, [model.plasmaHalfLength, model.plasmaRadius, scale]);
  const geometries = useMemo(() => Object.fromEntries(Object.keys(INPUT_PARTICLE_STREAMS).map((input) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(INPUT_PARTICLE_COUNT * 3), 3));
    return [input, geometry];
  })), []);
  const materials = useMemo(() => Object.fromEntries(Object.entries(INPUT_PARTICLE_STREAMS).map(([input, stream]) => [
    input,
    new ShaderMaterial({
      uniforms: { uColor: { value: new Color(stream.color) } },
      vertexShader: `
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = max(7.0, 92.0 / max(-mvPosition.z, 1.0));
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float distanceFromCenter = length(point);
          if (distanceFromCenter > 0.5) discard;
          float glow = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
          gl_FragColor = vec4(uColor, glow * 0.92);
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

function InputAnnotations({ model, scale, activeInput, showNames, showAttributes }) {
  if (!showNames && !showAttributes) return null;
  const halfLength = model.plasmaHalfLength * scale;
  const radius = model.plasmaRadius * scale;
  const annotationPositions = {
    DT: [-halfLength * 0.74, -radius * 0.9, radius * 0.28],
    DHe_3: [0, radius * 0.92, radius * 0.2],
    Argon: [halfLength * 0.74, -radius * 0.9, radius * 0.28]
  };
  return Object.entries(INPUT_PARTICLE_STREAMS).filter(([input]) => input === activeInput).map(([input, stream]) => {
    const inputModel = FRC_INPUTS[input];
    return (
      <Html key={input} position={annotationPositions[input]} center distanceFactor={8} className="frc-input-label">
        <div style={{ '--frc-input-color': stream.color }}>
          {showNames && <strong>{stream.label}</strong>}
          {showAttributes && <span>{stream.channel} / {inputModel.description}</span>}
        </div>
      </Html>
    );
  });
}

function PlasmaParticles({ configuration, model, onGpuError }) {
  const { gl } = useThree();
  const computeRef = useRef(null);
  const positionVariableRef = useRef(null);
  const velocityVariableRef = useRef(null);
  const stateRef = useRef({ configuration, model });
  stateRef.current = { configuration, model };
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new BufferAttribute(new Float32Array(PLASMA_PARTICLE_COUNT * 3), 3));
    nextGeometry.setAttribute('aSimulationUv', new BufferAttribute(createSimulationUvs(PLASMA_RESOLUTION, PLASMA_PARTICLE_COUNT), 2));
    return nextGeometry;
  }, []);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uPositionTex: { value: null },
      uVelocityTex: { value: null },
      uPointSize: { value: 260 },
      uOpacity: { value: configuration.plasmaOpacity }
    },
    vertexShader: plasmaVertexShader,
    fragmentShader: plasmaFragmentShader,
    transparent: true,
    depthWrite: false,
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
      positionUniforms.uHalfLength = { value: stateRef.current.model.plasmaHalfLength };
      positionUniforms.uRadius = { value: stateRef.current.model.plasmaRadius };
      positionUniforms.uRunning = { value: true };
      const velocityUniforms = simulation.velocityVariable.material.uniforms;
      velocityUniforms.uDt = { value: 1 / 60 };
      velocityUniforms.uField = { value: stateRef.current.model.magneticField };
      velocityUniforms.uAxialField = { value: stateRef.current.model.axialField };
      velocityUniforms.uRadius = { value: stateRef.current.model.plasmaRadius };
      velocityUniforms.uHalfLength = { value: stateRef.current.model.plasmaHalfLength };
      velocityUniforms.uRotation = { value: stateRef.current.model.rotation };
      velocityUniforms.uTemperature = { value: stateRef.current.model.ionTemperature };
      velocityUniforms.uDensity = { value: stateRef.current.model.density };
      velocityUniforms.uTransportSpeed = { value: stateRef.current.configuration.transportSpeed };
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
    positionUniforms.uHalfLength.value = currentModel.plasmaHalfLength;
    positionUniforms.uRadius.value = currentModel.plasmaRadius;
    positionUniforms.uRunning.value = currentConfiguration.plasmaRunning;
    velocityUniforms.uDt.value = frameDelta * currentConfiguration.transportSpeed;
    velocityUniforms.uField.value = currentModel.magneticField;
    velocityUniforms.uAxialField.value = currentModel.axialField;
    velocityUniforms.uRadius.value = currentModel.plasmaRadius;
    velocityUniforms.uHalfLength.value = currentModel.plasmaHalfLength;
    velocityUniforms.uRotation.value = currentModel.rotation;
    velocityUniforms.uTemperature.value = currentModel.ionTemperature;
    velocityUniforms.uDensity.value = currentModel.density;
    velocityUniforms.uTransportSpeed.value = currentConfiguration.transportSpeed;
    velocityUniforms.uRunning.value = currentConfiguration.plasmaRunning;
    compute.compute();
    material.uniforms.uPositionTex.value = compute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.uVelocityTex.value = compute.getCurrentRenderTarget(velocityVariable).texture;
    material.uniforms.uOpacity.value = currentConfiguration.plasmaOpacity;
  });

  return <points geometry={geometry} material={material} rotation={[0, MathUtils.degToRad(configuration.fieldTilt ?? 0), 0]} visible={configuration.showPlasma} frustumCulled={false} />;
}

function ReactorScene({ configuration, onGpuError }) {
  const deviceGroupRef = useRef();
  const model = useMemo(() => calculateFrcModel(configuration), [configuration]);
  const scale = configuration.vesselScale;
  const visualizationVisibility = getFrcVisualizationVisibility(configuration);
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
        <ReactorVessel model={model} scale={scale} opacity={configuration.vesselOpacity} showCoils={configuration.showCoils} />
        <PlasmaParticles configuration={configuration} model={model} onGpuError={onGpuError} />
        <EnergyHarness model={model} scale={scale} visible={(configuration.showCabling ?? true) && (configuration.showEnergyHarness ?? true)} harnessHeight={configuration.harnessHeight} harnessCollectorCount={configuration.harnessCollectorCount} />
        <OutputManifold model={model} scale={scale} visible={(configuration.showCabling ?? true) && (configuration.showOutputManifold ?? true)} outputSpread={configuration.outputSpread} outputTubeRadius={configuration.outputTubeRadius} showNitrogenOutput={(configuration.showNitrogenOutput ?? true) && visualizationVisibility.output.nitrogen} showHeliumOutput={(configuration.showHeliumOutput ?? true) && visualizationVisibility.output.helium} showNeutronOutput={(configuration.showNeutronOutput ?? true) && visualizationVisibility.output.neutrons} />
        <FlowParticles
          model={model}
          scale={scale}
          showGasFlow={configuration.showGasFlow ?? true}
          showChargeFlow={configuration.showChargeFlow ?? true}
          gasFlowSpeed={configuration.gasFlowSpeed ?? 1}
          chargeFlowSpeed={configuration.chargeFlowSpeed ?? 1}
          showCabling={configuration.showCabling ?? true}
        />
        <group rotation={[0, MathUtils.degToRad(configuration.fieldTilt ?? 0), 0]}>
          <InputParticles
            model={model}
            scale={scale}
            activeInput={model.input}
            showInputParticles={configuration.showInputParticles ?? true}
            showDTInput={configuration.showDTInput ?? true}
            showDHe3Input={configuration.showDHe3Input ?? true}
            showArgonInput={configuration.showArgonInput ?? true}
            inputParticleSpeed={configuration.inputParticleSpeed ?? 1}
            showCabling={configuration.showCabling ?? true}
          />
          {(configuration.showInputAnnotations !== false || configuration.showInputAttributes !== false) && (
            <InputAnnotations model={model} scale={scale} activeInput={model.input} showNames={configuration.showInputAnnotations !== false} showAttributes={configuration.showInputAttributes !== false} />
          )}
        </group>
        {(configuration.showDeviceAnnotations !== false || configuration.showDeviceAttributes !== false) && (
          <DeviceAnnotations
            model={model}
            scale={scale}
            outputSpread={configuration.outputSpread}
            harnessHeight={configuration.harnessHeight}
            harnessCollectorCount={configuration.harnessCollectorCount}
            showNames={configuration.showDeviceAnnotations !== false}
            showAttributes={configuration.showDeviceAttributes !== false}
            showEnergyHarness={(configuration.showCabling ?? true) && (configuration.showEnergyHarness ?? true)}
            showOutputManifold={(configuration.showCabling ?? true) && (configuration.showOutputManifold ?? true)}
            showNitrogenOutput={configuration.showNitrogenOutput !== false && visualizationVisibility.output.nitrogen}
            showHeliumOutput={configuration.showHeliumOutput !== false && visualizationVisibility.output.helium}
            showNeutronOutput={configuration.showNeutronOutput !== false && visualizationVisibility.output.neutrons}
          />
        )}
        {configuration.showFieldVolume && <FieldVolume model={model} scale={scale} tilt={configuration.fieldTilt} />}
        {configuration.showAxis && <FieldAxis model={model} scale={scale} tilt={configuration.fieldTilt} />}
      </group>
      <gridHelper args={[36, 18, '#2b5b5a', '#153434']} position={[0, -5.2, 0]} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={9} maxDistance={38} target={[0, 0, 0]} />
    </>
  );
}

function RangeInput({ label, value, min, max, step, onChange, suffix = '', ticks = [] }) {
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
  return (
    <label className="frc-range-control">
      <span className="frc-control-label"><span>{label}</span><strong>{Number(value).toFixed(step < 0.1 ? 2 : 1)}{suffix}</strong></span>
      <span className="frc-range-slider">
        <input type="range" min={min} max={max} step={step} value={value} onChange={handleChange} />
        {ticks.length > 0 && <span className="frc-range-ticks" aria-hidden="true">{ticks.map((tick) => <i key={tick} style={{ left: `${((tick - min) / (max - min)) * 100}%` }} />)}</span>}
      </span>
    </label>
  );
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

function FrcPanel({ configuration, model, gpuError, onChange, onHide }) {
  const visualizationVisibility = getFrcVisualizationVisibility(configuration);
  const activeInput = model.input;
  return (
    <aside className="frc-panel">
      <div className="frc-panel-topline"><span className="frc-panel-kicker"><i /> DEVICE + PLASMA / PHASE 02</span><button type="button" className="frc-hide-button" onClick={onHide}>Hide params</button></div>
      <div className="frc-status"><span>FIELD-REVERSED CONFIGURATION</span><strong>{model.reversedField ? 'STABLE AXIAL BIAS' : 'OPEN AXIAL BIAS'}</strong></div>
      {gpuError && <p className="frc-gpu-error">GPU OFFLINE / {gpuError}</p>}
      <div className="frc-select-grid">
        <label><span>Vessel shape</span><select value={configuration.shape} onChange={(event) => onChange({ shape: event.target.value })}>{Object.entries(FRC_SHAPES).map(([id, shape]) => <option key={id} value={id}>{shape.label}</option>)}</select></label>
        <label><span>Device configuration</span><select value={configuration.configuration} onChange={(event) => onChange({ configuration: event.target.value })}>{Object.entries(FRC_CONFIGURATIONS).map(([id, config]) => <option key={id} value={id}>{config.label}</option>)}</select></label>
        <label><span>Plasma input</span><select value={configuration.input ?? 'DT'} onChange={(event) => onChange({ input: event.target.value })}>{Object.entries(FRC_INPUTS).map(([id, input]) => <option key={id} value={id}>{input.label}</option>)}</select></label>
      </div>
      <p className="frc-description">{FRC_SHAPES[configuration.shape].description} {FRC_CONFIGURATIONS[configuration.configuration].description} {FRC_INPUTS[configuration.input ?? 'DT'].description}</p>
      <section className="frc-readout-grid" aria-label="Calculated reactor values">
        <div><span>PLASMA BETA</span><strong>{(model.beta * 100).toFixed(1)}%</strong></div>
        <div><span>FIELD REVERSAL</span><strong>{model.axialField.toFixed(2)} T</strong></div>
        <div><span>PLASMA CURRENT</span><strong>{model.plasmaCurrentMA.toFixed(2)} MA</strong></div>
        <div><span>PLASMA VOLUME</span><strong>{model.plasmaVolume.toFixed(1)} m3</strong></div>
      </section>
      <section className="frc-output-section" aria-label="Fusion outputs">
        <div className="frc-section-label">OUTPUTS / ENGINEERING ESTIMATE</div>
        <div className="frc-output-grid">
          <div><span>CAPTURED ENERGY</span><strong>{model.capturedPowerMW.toFixed(2)} MW</strong><small>{Math.round(model.energyCaptureEfficiency * 100)}% harness efficiency</small></div>
          <div><span>GRID FREQUENCY</span><strong>{model.outputFrequencyHz.toFixed(0)} Hz</strong><small>conversion-stage grid interface</small></div>
          <div><span>PLASMA FREQUENCY</span><strong>{(model.plasmaFrequencyHz / 1e9).toFixed(1)} GHz</strong><small>density-derived electron mode</small></div>
          <div><span>PLASMA CYCLE</span><strong>{model.plasmaPeriodSeconds.toExponential(2)} s</strong><small>one full electron oscillation</small></div>
          <div><span>ELECTRICITY</span><strong>{model.electricPowerMW.toFixed(2)} MW</strong><small>converted output power</small></div>
          <div><span>CONVERSION EFFICIENCY</span><strong>{Math.round(model.electricConversionEfficiency * 100)}%</strong><small>captured energy to electricity</small></div>
          <div><span>NITROGEN OUTPUT</span><strong>{model.nitrogenOutputSLM.toFixed(1)} SLM</strong><small>N2 purge / blanket stream</small></div>
          <div><span>HELIUM OUTPUT</span><strong>{model.heliumOutputGPerHour.toFixed(3)} g/h</strong><small>fusion alpha product</small></div>
          <div><span>NEUTRONS PRODUCED</span><strong>{model.neutronProductionRate.toExponential(2)} /s</strong><small>{model.neutronFlux.toExponential(2)} /m2/s estimated flux</small></div>
        </div>
      </section>
      <div className="frc-control-group">
        <span className="frc-section-label">PHYSICAL INPUTS</span>
        <RangeInput label="Applied magnetic field" value={configuration.magneticField} min={1} max={4.5} step={0.1} suffix=" T" onChange={(value) => onChange({ magneticField: value })} />
        <RangeInput label="Particle density" value={configuration.density} min={0.5} max={3} step={0.05} suffix="e20 m-3" onChange={(value) => onChange({ density: value })} />
        <RangeInput label="Ion temperature" value={configuration.ionTemperature} min={0.5} max={5} step={0.1} suffix=" keV" onChange={(value) => onChange({ ionTemperature: value })} />
        <RangeInput label="Field-axis tilt" value={configuration.fieldTilt} min={-18} max={18} step={1} suffix=" deg" onChange={(value) => onChange({ fieldTilt: value })} />
        <RangeInput label="Transport speed" value={configuration.transportSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ transportSpeed: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">DEVICE LAYERS</span>
        <RangeInput label="Vessel scale" value={configuration.vesselScale} min={0.8} max={1.2} step={0.01} onChange={(value) => onChange({ vesselScale: value })} />
        <RangeInput label="Vessel transparency" value={configuration.vesselOpacity} min={0.06} max={0.34} step={0.01} onChange={(value) => onChange({ vesselOpacity: value })} />
        <RangeInput label="Plasma opacity" value={configuration.plasmaOpacity} min={0.15} max={1} step={0.05} onChange={(value) => onChange({ plasmaOpacity: value })} />
        <ToggleInput label="Run plasma transport" checked={configuration.plasmaRunning} onChange={(value) => onChange({ plasmaRunning: value })} />
        <ToggleInput label="Plasma particles" checked={configuration.showPlasma} onChange={(value) => onChange({ showPlasma: value })} />
        <ToggleInput label="All cabling and outputs" checked={configuration.showCabling ?? true} onChange={(value) => onChange({ showCabling: value })} />
        <ToggleInput label="Confinement coils" checked={configuration.showCoils} onChange={(value) => onChange({ showCoils: value })} />
        <ToggleInput label="Separatrix volume" checked={configuration.showFieldVolume} onChange={(value) => onChange({ showFieldVolume: value })} />
        <ToggleInput label="Field axis" checked={configuration.showAxis} onChange={(value) => onChange({ showAxis: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">FLOW PARAMETERS</span>
        <RangeInput label="Nitrogen gas speed" value={configuration.gasFlowSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ gasFlowSpeed: value })} />
        <RangeInput label="Charge flow speed" value={configuration.chargeFlowSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ chargeFlowSpeed: value })} />
        <RangeInput label="Input particle speed" value={configuration.inputParticleSpeed} min={0} max={2} step={0.05} suffix=" x" onChange={(value) => onChange({ inputParticleSpeed: value })} />
        <ToggleInput label="Nitrogen gas flow" swatch={FLOW_PARTICLE_STREAMS.gas.color} checked={configuration.showGasFlow ?? true} onChange={(value) => onChange({ showGasFlow: value })} />
        <ToggleInput label="Charge flow" swatch={FLOW_PARTICLE_STREAMS.charge.color} checked={configuration.showChargeFlow ?? true} onChange={(value) => onChange({ showChargeFlow: value })} />
        <ToggleInput label="Input particle streams" checked={configuration.showInputParticles ?? true} onChange={(value) => onChange({ showInputParticles: value })} />
        {Object.entries(INPUT_PARTICLE_STREAMS).map(([input, stream]) => {
          const configurationKey = input === 'DHe_3' ? 'showDHe3Input' : `show${input}Input`;
          const active = activeInput === input;
          return <ToggleInput key={input} label={`${stream.label} particles`} swatch={stream.color} checked={active && (configuration[configurationKey] ?? true)} disabled={!active} onChange={(value) => onChange({ [configurationKey]: value })} />;
        })}
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">HARNESS + OUTPUTS</span>
        <RangeInput label="Harness lift" value={configuration.harnessHeight} min={0.4} max={2.5} step={0.05} suffix=" m" onChange={(value) => onChange({ harnessHeight: value })} />
        <RangeInput label="Collector rings" value={configuration.harnessCollectorCount} min={3} max={11} step={1} onChange={(value) => onChange({ harnessCollectorCount: value })} />
        <RangeInput label="Output spread" value={configuration.outputSpread} min={0.8} max={3.2} step={0.1} suffix=" m" onChange={(value) => onChange({ outputSpread: value })} />
        <RangeInput label="Output tube radius" value={configuration.outputTubeRadius} min={0.04} max={0.18} step={0.005} suffix=" m" onChange={(value) => onChange({ outputTubeRadius: value })} />
        <ToggleInput label="Energy capture harness" checked={configuration.showEnergyHarness ?? true} onChange={(value) => onChange({ showEnergyHarness: value })} />
        <ToggleInput label="Output manifold" checked={configuration.showOutputManifold ?? true} onChange={(value) => onChange({ showOutputManifold: value })} />
        <ToggleInput label="Nitrogen purge" swatch="#77c9e9" checked={(configuration.showNitrogenOutput ?? true) && visualizationVisibility.output.nitrogen} disabled={!visualizationVisibility.output.nitrogen} onChange={(value) => onChange({ showNitrogenOutput: value })} />
        <ToggleInput label="Helium alpha product" swatch="#82e0c0" checked={(configuration.showHeliumOutput ?? true) && visualizationVisibility.output.helium} disabled={!visualizationVisibility.output.helium} onChange={(value) => onChange({ showHeliumOutput: value })} />
        <ToggleInput label="Neutron flux" swatch="#f3ad63" checked={(configuration.showNeutronOutput ?? true) && visualizationVisibility.output.neutrons} disabled={!visualizationVisibility.output.neutrons} onChange={(value) => onChange({ showNeutronOutput: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">ANNOTATIONS</span>
        <ToggleInput label="Input names" checked={configuration.showInputAnnotations !== false} onChange={(value) => onChange({ showInputAnnotations: value })} />
        <ToggleInput label="Input attributes" checked={configuration.showInputAttributes !== false} onChange={(value) => onChange({ showInputAttributes: value })} />
        <ToggleInput label="Device annotations" checked={configuration.showDeviceAnnotations !== false} onChange={(value) => onChange({ showDeviceAnnotations: value })} />
        <ToggleInput label="Device attributes" checked={configuration.showDeviceAttributes !== false} onChange={(value) => onChange({ showDeviceAttributes: value })} />
      </div>
      <div className="frc-control-group">
        <span className="frc-section-label">ORIENTATION</span>
        <RangeInput label="Roll" value={configuration.deviceRoll ?? configuration.deviceRotationZ ?? 0} min={-180} max={180} step={1} suffix=" deg" ticks={ORIENTATION_TICKS} onChange={(value) => onChange({ deviceRoll: value })} />
        <RangeInput label="Pitch" value={configuration.devicePitch ?? configuration.deviceRotationX ?? 0} min={-180} max={180} step={1} suffix=" deg" ticks={ORIENTATION_TICKS} onChange={(value) => onChange({ devicePitch: value })} />
        <RangeInput label="Yaw" value={configuration.deviceYaw ?? configuration.deviceRotationY ?? 0} min={-180} max={180} step={1} suffix=" deg" ticks={ORIENTATION_TICKS} onChange={(value) => onChange({ deviceYaw: value })} />
        <button type="button" className="frc-reset-button" onClick={() => onChange({ deviceRoll: 0, devicePitch: 0, deviceYaw: 0 })}>Reset parallel to ground</button>
      </div>
    </aside>
  );
}

export default function FrcFusionSim({ onBack }) {
  const [configuration, setConfiguration] = useState(INITIAL_CONFIGURATION);
  const [parametersVisible, setParametersVisible] = useState(true);
  const [gpuError, setGpuError] = useState('');
  const model = useMemo(() => calculateFrcModel(configuration), [configuration]);
  const updateConfiguration = (change) => setConfiguration((current) => {
    if (change.input && change.input !== current.input) {
      const input = FRC_INPUTS[change.input] ? change.input : 'DT';
      return {
        ...current,
        ...change,
        input,
        showDTInput: input === 'DT',
        showDHe3Input: input === 'DHe_3',
        showArgonInput: input === 'Argon'
      };
    }
    if (!change.configuration || change.configuration === current.configuration) return { ...current, ...change };
    const preset = FRC_CONFIGURATIONS[change.configuration];
    return {
      ...current,
      ...change,
      magneticField: preset.magneticField,
      density: preset.density,
      ionTemperature: preset.ionTemperature,
      rotation: preset.rotation
    };
  });

  return (
    <main className="frc-app">
      <div className="frc-scene"><Canvas camera={{ position: [0, 0, 22], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><ReactorScene configuration={configuration} onGpuError={setGpuError} /></Canvas></div>
      <header className="frc-topbar"><div className="frc-brand"><span className="frc-mark">FRC</span><span><b>FUSION DEVICE LAB</b><em>Field-reversed configuration / phase 02</em></span></div><div className="frc-top-meta"><span>PHYSICAL MODEL</span><span>GPGPU TRANSPORT ACTIVE</span></div><button type="button" className="frc-back-button" onClick={onBack}>Lab menu</button></header>
      <section className="frc-title"><p>Transparent reactor study</p><h1>Shape the vessel.<br />Read the field.</h1><span>GPU plasma transport is active inside the device. Kinetic solver work follows in phase 03.</span></section>
      <nav className="frc-view-toolbar"><button type="button" onClick={() => setParametersVisible((visible) => !visible)}>{parametersVisible ? 'Hide params' : 'Show params'}</button><span>ORBIT / DEVICE SCALE 1:{configuration.vesselScale.toFixed(2)}</span></nav>
      {parametersVisible && <FrcPanel configuration={configuration} model={model} gpuError={gpuError} onChange={updateConfiguration} onHide={() => setParametersVisible(false)} />}
      <div className="frc-footer"><span>GEOMETRY / COILS / SEPARATRIX</span><span>BETA {Math.round(model.beta * 100)}% / CONFINEMENT {Math.round(model.confinement * 100)}%</span></div>
    </main>
  );
}
