import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { getOamOperatorMatrix, OAM_MODES, OAM_OPERATOR_OPTIONS } from './oamSolitonModel.js';

const LONGITUDINAL_SEGMENTS = 112;
const ANGULAR_SEGMENTS = 40;
const RAIL_HEIGHTS = [1.15, -1.15];
const RAIL_STARTS = [-4.6, 0.48];
const RAIL_ENDS = [-0.48, 4.6];
const TAU = Math.PI * 2;

function createSolitonGeometry() {
  const rowLength = ANGULAR_SEGMENTS + 1;
  const vertexCount = (LONGITUDINAL_SEGMENTS + 1) * rowLength;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(LONGITUDINAL_SEGMENTS * ANGULAR_SEGMENTS * 6);
  let index = 0;
  for (let longitudinal = 0; longitudinal < LONGITUDINAL_SEGMENTS; longitudinal += 1) {
    for (let angular = 0; angular < ANGULAR_SEGMENTS; angular += 1) {
      const first = longitudinal * rowLength + angular;
      const next = first + rowLength;
      indices[index++] = first;
      indices[index++] = next;
      indices[index++] = first + 1;
      indices[index++] = next;
      indices[index++] = next + 1;
      indices[index++] = first + 1;
    }
  }
  const geometry = new BufferGeometry();
  const positionAttribute = new Float32BufferAttribute(positions, 3);
  const colorAttribute = new Float32BufferAttribute(colors, 3);
  positionAttribute.setUsage(DynamicDrawUsage);
  colorAttribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  return geometry;
}

function SolitonBeam({ coefficients, rail, startX, endX, running, timeRef, signalOpacity, amplitudeSizeVariation, pulseOffset = 0 }) {
  const geometry = useMemo(createSolitonGeometry, []);
  const phaseColor = useMemo(() => new Color(), []);
  const totalAmplitude = coefficients.reduce((sum, value) => sum + Math.hypot(value.re, value.im), 0);
  const amplitudeScale = Math.min(1.5, totalAmplitude) * amplitudeSizeVariation;
  const laneY = RAIL_HEIGHTS[rail];

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (!running || totalAmplitude < 0.001) return;
    const positionAttribute = geometry.getAttribute('position');
    const colorAttribute = geometry.getAttribute('color');
    const positions = positionAttribute.array;
    const colors = colorAttribute.array;
    const span = endX - startX;
    const travelLength = Math.max(span - 38, 1);
    const pulseCenter = startX + 0.7 + ((timeRef.current * 0.82 + pulseOffset) % travelLength);

    for (let longitudinal = 0; longitudinal <= LONGITUDINAL_SEGMENTS; longitudinal += 1) {
      const progress = longitudinal / LONGITUDINAL_SEGMENTS;
      const x = startX + span * progress;
      const envelope = 1 / Math.cosh((x - pulseCenter) / 0.68);
      const carrierPhase = (x - startX) * 5.4 - timeRef.current * 7.2;

      for (let angular = 0; angular <= ANGULAR_SEGMENTS; angular += 1) {
        const theta = angular / ANGULAR_SEGMENTS * TAU;
        let fieldReal = 0;
        let fieldImaginary = 0;
        for (let modeIndex = 0; modeIndex < OAM_MODES.length; modeIndex += 1) {
          const coefficient = coefficients[modeIndex];
          const modePhase = carrierPhase + OAM_MODES[modeIndex] * theta;
          const cosine = Math.cos(modePhase);
          const sine = Math.sin(modePhase);
          fieldReal += coefficient.re * cosine - coefficient.im * sine;
          fieldImaginary += coefficient.re * sine + coefficient.im * cosine;
        }

        const phase = Math.atan2(fieldImaginary, fieldReal);
        const localIntensity = Math.min(1, Math.hypot(fieldReal, fieldImaginary) / totalAmplitude) * envelope;
        const radius = Math.max(0.025, 0.13 + localIntensity * amplitudeScale * (0.055 + 0.025 * Math.cos(phase)));
        const vertex = (longitudinal * (ANGULAR_SEGMENTS + 1) + angular) * 3;
        positions[vertex] = x;
        positions[vertex + 1] = laneY + Math.cos(theta) * radius;
        positions[vertex + 2] = Math.sin(theta) * radius;

        phaseColor.setHSL((phase / TAU + 1) % 1, 0.88, 0.13 + localIntensity * 0.43);
        colors[vertex] = phaseColor.r;
        colors[vertex + 1] = phaseColor.g;
        colors[vertex + 2] = phaseColor.b;
      }
    }
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  });

  if (totalAmplitude < 0.001) return null;
  return <mesh geometry={geometry} frustumCulled={false}>
    <meshBasicMaterial vertexColors side={DoubleSide} transparent opacity={signalOpacity} blending={AdditiveBlending} depthWrite={false} />
  </mesh>;
}

function SignalRails() {
  return RAIL_HEIGHTS.map((height, rail) => <mesh key={rail} position={[0, height, 0]} rotation={[0, 0, Math.PI / 2]}>
    <cylinderGeometry args={[0.014, 0.014, 9.2, 8]} />
    <meshBasicMaterial color="#3c7377" transparent opacity={0.5} />
  </mesh>);
}

function SolitonField({ input, output, operator, running, simulationSpeed, signalOpacity, amplitudeSizeVariation, modeA, modeB, angleRadians, railProbabilities }) {
  const timeRef = useRef(0);
  const { camera, size } = useThree();
  const compactViewport = size.width < 650;
  const matrix = useMemo(() => getOamOperatorMatrix(operator, angleRadians), [angleRadians, operator]);
  const operatorName = OAM_OPERATOR_OPTIONS.find(({ value }) => value === operator)?.label.toUpperCase() ?? 'OPERATOR';

  useEffect(() => {
    if (!camera.isPerspectiveCamera) return;
    camera.position.set(0.2, 3.4, compactViewport ? 32 : 12);
    camera.updateProjectionMatrix();
  }, [camera, compactViewport]);

  useFrame((_, delta) => {
    if (running) timeRef.current += Math.min(delta, 0.05) * simulationSpeed;
  });

  return <>
    <color attach="background" args={['#061116']} />
    <fog attach="fog" args={['#061116', 13, 24]} />
    <ambientLight intensity={0.9} color="#a8d8d1" />
    <pointLight position={[0, 4, 4]} intensity={28} color="#58cfc1" distance={18} />
    <pointLight position={[0, -1, 5]} intensity={18} color="#e6a45d" distance={13} />
    <gridHelper args={[12, 24, '#24515b', '#132930']} position={[0, -2.1, 0]} />
    <SignalRails />
    {RAIL_HEIGHTS.map((_, rail) => <SolitonBeam
      key={`input:${rail}`}
      coefficients={input.map((pair) => pair[rail])}
      rail={rail}
      startX={RAIL_STARTS[0]}
      endX={RAIL_ENDS[0]}
      running={running}
      timeRef={timeRef}
      signalOpacity={signalOpacity}
      amplitudeSizeVariation={amplitudeSizeVariation}
      pulseOffset={rail * 0.16}
    />)}
    {RAIL_HEIGHTS.map((_, rail) => <SolitonBeam
      key={`output:${rail}`}
      coefficients={output.map((pair) => pair[rail])}
      rail={rail}
      startX={RAIL_STARTS[1]}
      endX={RAIL_ENDS[1]}
      running={running}
      timeRef={timeRef}
      signalOpacity={signalOpacity}
      amplitudeSizeVariation={amplitudeSizeVariation}
      pulseOffset={rail * 0.16}
    />)}
    {matrix.map((row, outputRail) => row.map((coefficient, inputRail) => {
      const strength = Math.hypot(coefficient.re, coefficient.im);
      if (strength < 0.02) return null;
      return <Line
        key={`coupling:${inputRail}:${outputRail}`}
        points={inputRail === outputRail
          ? [[-0.46, RAIL_HEIGHTS[inputRail], 0], [0.46, RAIL_HEIGHTS[outputRail], 0]]
          : [[-0.46, RAIL_HEIGHTS[inputRail], 0], [-0.18, RAIL_HEIGHTS[inputRail], 0], [0, 0, 0], [0.18, RAIL_HEIGHTS[outputRail], 0], [0.46, RAIL_HEIGHTS[outputRail], 0]]}
        color={inputRail === outputRail ? '#72c7c0' : '#e6a45d'}
        lineWidth={1 + strength * 1.8}
        transparent
        opacity={0.28 + strength * 0.5}
      />;
    }))}
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.68, 2.8, 0.58]} />
      <meshBasicMaterial color="#72c7c0" wireframe transparent opacity={0.22} />
    </mesh>
    <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[0.42, 0.018, 8, 48]} />
      <meshBasicMaterial color="#e6a45d" transparent opacity={0.85} />
    </mesh>
    <Html position={[0, 1.72, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="oam-three-gate-label">{operatorName}</div>
    </Html>
    <Html position={[-3.2, 1.45, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="oam-three-rail-label">INPUT A · ℓ {modeA}</div>
    </Html>
    <Html position={[-3.2, -0.86, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="oam-three-rail-label">INPUT B · ℓ {modeB}</div>
    </Html>
    <Html position={[3.45, 1.45, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="oam-three-rail-label output">OUTPUT A · {(railProbabilities[0] * 100).toFixed(0)}%</div>
    </Html>
    <Html position={[3.45, -0.86, 0]} center style={{ pointerEvents: 'none' }}>
      <div className="oam-three-rail-label output">OUTPUT B · {(railProbabilities[1] * 100).toFixed(0)}%</div>
    </Html>
    <OrbitControls makeDefault enableDamping enablePan={false} minDistance={7} maxDistance={40} minPolarAngle={0.35} maxPolarAngle={1.42} target={[0.2, 0, 0]} />
  </>;
}

export default function OamSolitonScene(props) {
  return <Canvas camera={{ position: [0.2, 3.4, 12], fov: 38, near: 0.1, far: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} fallback={<div className="oam-canvas-fallback">WebGL is required to render the soliton field.</div>}>
    <SolitonField {...props} />
  </Canvas>;
}