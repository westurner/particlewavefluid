import { Html, Line } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, ShaderMaterial, Uint16BufferAttribute } from 'three';
import { PerspectiveOrbitControls } from './lib/SimulatorBase.jsx';
import { getOamOperatorMatrix, OAM_MODES, OAM_OPERATOR_OPTIONS } from './oamSolitonModel.js';
import { sampleColorPalette } from './lib/color-palettes.js';
import { getSolitonGateProgress, getSolitonPulseCenter, getSolitonSurfaceRadius } from './solitonMotion.js';

const LONGITUDINAL_SEGMENTS = 112;
const ANGULAR_SEGMENTS = 40;
const RAIL_HEIGHTS = [1.15, -1.15];
const RAIL_STARTS = [-4.6, 0.48];
const RAIL_ENDS = [-0.48, 4.6];
const TAU = Math.PI * 2;
const SPLATTER_PARTICLE_COUNT = 192;
const PARTICLE_SHAPE_IDS = { native: 0, circle: 1, square: 2, sphere: 3, vector: 4 };

const SPLATTER_VERTEX_SHADER = `
  uniform float uPointSize;
  uniform float uSizeScale;
  uniform float uDerivativeOrder;
  attribute float aTensorGaussian;
  attribute float aVectorAngle;
  varying vec3 vColor;
  varying float vTensorGaussian;
  varying float vVectorAngle;

  void main() {
    vColor = color;
    vTensorGaussian = aTensorGaussian;
    vVectorAngle = aVectorAngle + uDerivativeOrder * 0.18;
    vec4 modelPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize * uSizeScale * mix(0.35, 1.35, aTensorGaussian) * 520.0 / max(-modelPosition.z, 1.0);
    gl_Position = projectionMatrix * modelPosition;
  }
`;

const SPLATTER_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform int uShape;
  uniform vec3 uTint;
  uniform bool uTintEnabled;
  varying vec3 vColor;
  varying float vTensorGaussian;
  varying float vVectorAngle;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float cosine = cos(vVectorAngle);
    float sine = sin(vVectorAngle);
    point = vec2(cosine * point.x - sine * point.y, sine * point.x + cosine * point.y);
    float radius = length(point);
    if ((uShape == 1 || uShape == 3) && radius > 0.5) discard;
    if (uShape == 4) {
      float shaft = step(abs(point.x), 0.1) * step(abs(point.y), 0.32);
      float head = step(0.12, point.y) * step(abs(point.x), 0.24 - point.y * 0.28);
      if (max(shaft, head) < 0.5) discard;
    }
    float gaussian = exp(-radius * radius * 8.0);
    float opacity = uOpacity * mix(0.2, 1.0, vTensorGaussian);
    if (uShape == 0) opacity *= gaussian;
    vec3 particleColor = mix(vColor, uTint, float(uTintEnabled));
    if (uShape == 3) particleColor *= 1.15 - radius * 0.7;
    gl_FragColor = vec4(particleColor, opacity);
  }
`;

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

function coefficientAmplitude(coefficients) {
  return coefficients.reduce((sum, value) => sum + Math.hypot(value.re, value.im), 0);
}

function SolitonBeam({ inputCoefficients, outputCoefficients, inputRail, outputRail, branchOpacity, splatterOpacityScale, startX, endX, running, timeRef, waveOpacity, amplitudeSizeVariation, particleAppearance, waveRepresentationVisible, wavePalette, splatterPalette, pulseOffset = 0 }) {
  const geometry = useMemo(createSolitonGeometry, []);
  const phaseColor = useMemo(() => new Color(), []);
  const coefficientScratch = useMemo(() => OAM_MODES.map(() => ({ re: 0, im: 0 })), []);
  const totalAmplitude = Math.max(coefficientAmplitude(inputCoefficients), coefficientAmplitude(outputCoefficients));
  const amplitudeScale = Math.min(1.5, totalAmplitude) * amplitudeSizeVariation;

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (!running || totalAmplitude < 0.001) return;
    const positionAttribute = geometry.getAttribute('position');
    const colorAttribute = geometry.getAttribute('color');
    const positions = positionAttribute.array;
    const colors = colorAttribute.array;
    const span = endX - startX;
    const pulseCenter = getSolitonPulseCenter(startX, endX, timeRef.current, pulseOffset);

    for (let longitudinal = 0; longitudinal <= LONGITUDINAL_SEGMENTS; longitudinal += 1) {
      const progress = longitudinal / LONGITUDINAL_SEGMENTS;
      const x = startX + span * progress;
      const envelope = 1 / Math.cosh((x - pulseCenter) / 0.68);
      const carrierPhase = (x - startX) * 5.4 - timeRef.current * 7.2;
      const gateProgress = getSolitonGateProgress(x);
      const laneY = RAIL_HEIGHTS[inputRail] + (RAIL_HEIGHTS[outputRail] - RAIL_HEIGHTS[inputRail]) * gateProgress;
      let localAmplitude = 0;
      for (let modeIndex = 0; modeIndex < OAM_MODES.length; modeIndex += 1) {
        const inputCoefficient = inputCoefficients[modeIndex];
        const outputCoefficient = outputCoefficients[modeIndex];
        const coefficient = coefficientScratch[modeIndex];
        coefficient.re = inputCoefficient.re + (outputCoefficient.re - inputCoefficient.re) * gateProgress;
        coefficient.im = inputCoefficient.im + (outputCoefficient.im - inputCoefficient.im) * gateProgress;
        localAmplitude += Math.hypot(coefficient.re, coefficient.im);
      }

      for (let angular = 0; angular <= ANGULAR_SEGMENTS; angular += 1) {
        const theta = angular / ANGULAR_SEGMENTS * TAU;
        let fieldReal = 0;
        let fieldImaginary = 0;
        for (let modeIndex = 0; modeIndex < OAM_MODES.length; modeIndex += 1) {
          const coefficient = coefficientScratch[modeIndex];
          const modePhase = carrierPhase + OAM_MODES[modeIndex] * theta;
          const cosine = Math.cos(modePhase);
          const sine = Math.sin(modePhase);
          fieldReal += coefficient.re * cosine - coefficient.im * sine;
          fieldImaginary += coefficient.re * sine + coefficient.im * cosine;
        }

        const phase = Math.atan2(fieldImaginary, fieldReal);
        const localIntensity = localAmplitude > 0 ? Math.min(1, Math.hypot(fieldReal, fieldImaginary) / localAmplitude) * envelope : 0;
        const radius = getSolitonSurfaceRadius(localIntensity, phase, amplitudeScale);
        const vertex = (longitudinal * (ANGULAR_SEGMENTS + 1) + angular) * 3;
        positions[vertex] = x;
        positions[vertex + 1] = laneY + Math.cos(theta) * radius;
        positions[vertex + 2] = Math.sin(theta) * radius;

        if (wavePalette === 'native') phaseColor.setHSL((phase / TAU + 1) % 1, 0.88, 0.13 + localIntensity * 0.43);
        else sampleColorPalette(wavePalette, (phase / TAU + 1) % 1, phaseColor);
        colors[vertex] = phaseColor.r;
        colors[vertex + 1] = phaseColor.g;
        colors[vertex + 2] = phaseColor.b;
      }
    }
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
  });

  if (totalAmplitude < 0.001) return null;
  return <>
    {waveRepresentationVisible && <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial vertexColors side={DoubleSide} transparent opacity={waveOpacity * branchOpacity} blending={AdditiveBlending} depthWrite={false} />
    </mesh>}
    {particleAppearance.splatterEnabled && <SolitonSplatter inputCoefficients={inputCoefficients} outputCoefficients={outputCoefficients} inputRail={inputRail} outputRail={outputRail} startX={startX} endX={endX} running={running} timeRef={timeRef} appearance={particleAppearance} amplitudeSizeVariation={amplitudeSizeVariation} opacityScale={splatterOpacityScale} palette={splatterPalette} pulseOffset={pulseOffset} />}
  </>;
}

function SolitonSplatter({ inputCoefficients, outputCoefficients, inputRail, outputRail, startX, endX, running, timeRef, appearance, amplitudeSizeVariation, opacityScale, palette, pulseOffset }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    const positions = new Float32Array(SPLATTER_PARTICLE_COUNT * 3);
    const colors = new Float32Array(SPLATTER_PARTICLE_COUNT * 3);
    result.setAttribute('position', new Float32BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    result.setAttribute('color', new Float32BufferAttribute(colors, 3).setUsage(DynamicDrawUsage));
    result.setAttribute('aTensorGaussian', new Float32BufferAttribute(new Float32Array(SPLATTER_PARTICLE_COUNT), 1).setUsage(DynamicDrawUsage));
    result.setAttribute('aVectorAngle', new Float32BufferAttribute(new Float32Array(SPLATTER_PARTICLE_COUNT), 1).setUsage(DynamicDrawUsage));
    return result;
  }, []);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uPointSize: { value: 0.075 },
      uSizeScale: { value: appearance.sizeScale },
      uDerivativeOrder: { value: appearance.derivativeOrder },
      uOpacity: { value: appearance.opacity * opacityScale },
      uShape: { value: PARTICLE_SHAPE_IDS[appearance.shape] ?? 0 },
      uTint: { value: new Color(appearance.color) },
      uTintEnabled: { value: appearance.colorMode === 'custom' }
    },
    vertexShader: SPLATTER_VERTEX_SHADER,
    fragmentShader: SPLATTER_FRAGMENT_SHADER,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  }), []);
  const phaseColor = useMemo(() => new Color(), []);
  const coefficientScratch = useMemo(() => OAM_MODES.map(() => ({ re: 0, im: 0 })), []);
  const totalAmplitude = Math.max(coefficientAmplitude(inputCoefficients), coefficientAmplitude(outputCoefficients));
  const amplitudeScale = Math.min(1.5, totalAmplitude) * amplitudeSizeVariation;

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useEffect(() => {
    material.uniforms.uSizeScale.value = appearance.sizeScale;
    material.uniforms.uDerivativeOrder.value = appearance.derivativeOrder;
    material.uniforms.uOpacity.value = appearance.opacity * opacityScale;
    material.uniforms.uShape.value = PARTICLE_SHAPE_IDS[appearance.shape] ?? 0;
    material.uniforms.uTint.value.set(appearance.color);
    material.uniforms.uTintEnabled.value = appearance.colorMode === 'custom';
  }, [appearance, material, opacityScale]);

  useFrame(() => {
    if (!running || totalAmplitude < 0.001) return;
    const positions = geometry.getAttribute('position').array;
    const colors = geometry.getAttribute('color').array;
    const tensorGaussians = geometry.getAttribute('aTensorGaussian').array;
    const vectorAngles = geometry.getAttribute('aVectorAngle').array;
    const pulseCenter = getSolitonPulseCenter(startX, endX, timeRef.current, pulseOffset);
    for (let index = 0; index < SPLATTER_PARTICLE_COUNT; index += 1) {
      const spread = ((index * 0.61803398875) % 1 - 0.5) * 1.2;
      const x = Math.max(startX + 0.02, Math.min(endX - 0.02, pulseCenter + spread));
      const theta = (index * 2.39996322973) % TAU;
      const envelope = 1 / Math.cosh((x - pulseCenter) / 0.68);
      const carrierPhase = (x - startX) * 5.4 - timeRef.current * 7.2;
      const gateProgress = getSolitonGateProgress(x);
      const laneY = RAIL_HEIGHTS[inputRail] + (RAIL_HEIGHTS[outputRail] - RAIL_HEIGHTS[inputRail]) * gateProgress;
      let localAmplitude = 0;
      for (let modeIndex = 0; modeIndex < OAM_MODES.length; modeIndex += 1) {
        const inputCoefficient = inputCoefficients[modeIndex];
        const outputCoefficient = outputCoefficients[modeIndex];
        const coefficient = coefficientScratch[modeIndex];
        coefficient.re = inputCoefficient.re + (outputCoefficient.re - inputCoefficient.re) * gateProgress;
        coefficient.im = inputCoefficient.im + (outputCoefficient.im - inputCoefficient.im) * gateProgress;
        localAmplitude += Math.hypot(coefficient.re, coefficient.im);
      }
      let fieldReal = 0;
      let fieldImaginary = 0;
      for (let modeIndex = 0; modeIndex < OAM_MODES.length; modeIndex += 1) {
        const coefficient = coefficientScratch[modeIndex];
        const phase = carrierPhase + OAM_MODES[modeIndex] * theta;
        fieldReal += coefficient.re * Math.cos(phase) - coefficient.im * Math.sin(phase);
        fieldImaginary += coefficient.re * Math.sin(phase) + coefficient.im * Math.cos(phase);
      }
      const fieldPhase = Math.atan2(fieldImaginary, fieldReal);
      const gaussian = localAmplitude > 0 ? Math.min(1, Math.hypot(fieldReal, fieldImaginary) / localAmplitude) * envelope : 0;
      const radius = getSolitonSurfaceRadius(gaussian, fieldPhase, amplitudeScale);
      positions[index * 3] = x;
      positions[index * 3 + 1] = laneY + Math.cos(theta) * radius;
      positions[index * 3 + 2] = Math.sin(theta) * radius;
      if (palette === 'native') phaseColor.setHSL((fieldPhase / TAU + 1) % 1, 0.88, 0.13 + gaussian * 0.43);
      else sampleColorPalette(palette, (fieldPhase / TAU + 1) % 1, phaseColor);
      colors[index * 3] = phaseColor.r;
      colors[index * 3 + 1] = phaseColor.g;
      colors[index * 3 + 2] = phaseColor.b;
      tensorGaussians[index] = gaussian;
      vectorAngles[index] = fieldPhase + appearance.derivativeOrder * 0.18;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aTensorGaussian.needsUpdate = true;
    geometry.attributes.aVectorAngle.needsUpdate = true;
  });

  return totalAmplitude > 0.001 ? <points geometry={geometry} material={material} frustumCulled={false} /> : null;
}

function SignalRails() {
  return RAIL_HEIGHTS.map((height, rail) => <mesh key={rail} position={[0, height, 0]} rotation={[0, 0, Math.PI / 2]}>
    <cylinderGeometry args={[0.014, 0.014, 9.2, 8]} />
    <meshBasicMaterial color="#3c7377" transparent opacity={0.5} />
  </mesh>);
}

function SolitonField({ branches, operator, running, simulationSpeed, waveOpacity, amplitudeSizeVariation, particleAppearance, waveRepresentationVisible, wavePalette, splatterPalette, modeA, modeB, angleRadians, quditDimension, viewMode, orbitPlaying, orbitSettings, cameraViews, onCameraInteraction, railProbabilities }) {
  const timeRef = useRef(0);
  const matrix = useMemo(() => getOamOperatorMatrix(operator, angleRadians), [angleRadians, operator]);
  const operatorMetadata = OAM_OPERATOR_OPTIONS.find(({ value }) => value === operator);
  const operatorType = operatorMetadata?.type === 'ternary' ? '3Q' : operatorMetadata?.type === 'binary' ? 'Q×Qd' : '1Q';
  const operatorName = operatorMetadata ? `${operatorType} · ${operatorMetadata.shortName}${operatorMetadata.type === 'binary' || operatorMetadata.type === 'ternary' ? ` · m=${quditDimension}` : ''}` : 'OPERATOR';

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
    {branches.map((branch) => <SolitonBeam
      key={`${branch.branchKind}:${branch.inputRail}:${branch.outputRail}`}
      {...branch}
      startX={RAIL_STARTS[0]}
      endX={RAIL_ENDS[1]}
      running={running}
      timeRef={timeRef}
      waveOpacity={waveOpacity}
      amplitudeSizeVariation={amplitudeSizeVariation}
      particleAppearance={particleAppearance}
      waveRepresentationVisible={waveRepresentationVisible}
      wavePalette={wavePalette}
      splatterPalette={splatterPalette}
      pulseOffset={branch.inputRail * 0.24}
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
      <boxGeometry args={[0.68, 1.8, 0.58]} />
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
    <PerspectiveOrbitControls views={cameraViews} viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={orbitSettings} cameraParams={{ target: [0.2, 0, 0], minDistance: 7, maxDistance: 40 }} onUserInteraction={onCameraInteraction} />
  </>;
}

export default function OamSolitonScene(props) {
  return <Canvas camera={{ position: [0.2, 3.4, 12], fov: 38, near: 0.1, far: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} fallback={<div className="oam-canvas-fallback">WebGL is required to render the soliton field.</div>}>
    <SolitonField {...props} />
  </Canvas>;
}