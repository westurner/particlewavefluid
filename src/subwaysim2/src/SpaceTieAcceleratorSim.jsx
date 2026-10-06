import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DynamicDrawUsage, DoubleSide, Object3D, TubeGeometry, Vector3 } from 'three';
import { NumericParamControl, ParamSelect, SimulatorParameterControls } from './lib/ParamControls.jsx';
import { CameraPerspectiveToolbar, PerspectiveOrbitControls, SimulatorBase, SimulatorPresetControls, SimulatorViewParameters } from './lib/SimulatorBase.jsx';
import { createCameraViews, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, DEFAULT_SIMULATOR_3D_PARAMETERS, readPresetLibrary, writePresetLibrary } from './lib/simulator-base.js';
import {
  calculateBatteryOperatingPoint,
  calculateCoilgunStage,
  calculateEdtTug,
  calculateElectromagneticMassDriver,
  calculateHalbachAlignment,
  calculateHalbachQED,
  calculatePayloadEnergy,
  calculateRecoilHarvest,
  calculateSpaceEnergyBudget,
  calculateVortexBeamIntensity,
  calculateRotatingTracerAngle,
  createHelixNodes,
  evaluateSpaceTieOperator,
  routeLengthKm,
  sanitizeSpaceTieSettings,
  SPACE_TIE_DEFAULTS,
  SPACE_TIE_DESTINATIONS,
  SPACE_TIE_OPERATOR_OPTIONS,
  SPACE_TIE_WIDGETS
} from './spaceTieModel.js';

const PRESET_KEY = 'sqgsim-space-tie-accelerator-presets';
const SCENE_WIDGETS = new Set(SPACE_TIE_WIDGETS.filter((entry) => entry.type === 'scene').map((entry) => entry.value));
const STRAND_OPTIONS = [{ value: 2, label: 'Double helix' }, { value: 3, label: 'Triple helix' }];
const HALBACH_OPTIONS = [{ value: 2, label: 'Quadrupole' }, { value: 3, label: 'Sextupole' }, { value: 4, label: 'Octupole' }];
const STRAND_COLORS = ['#e5a653', '#70e6c3', '#72b9e8'];
const INITIAL_SETTINGS = sanitizeSpaceTieSettings({
  ...DEFAULT_SIMULATOR_3D_PARAMETERS,
  ...SPACE_TIE_DEFAULTS,
  pulseSequenceSeconds: 18,
  meshPulsesPerHour: 1,
  particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, sizeScale: 1.5, opacity: 0.84 }
});

function useSimulationTime(simulationSpeed) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += Math.min(0.05, delta) * simulationSpeed;
  });
  return elapsed;
}

function readPresets() {
  const library = readPresetLibrary(typeof window === 'undefined' ? null : window.localStorage, PRESET_KEY, { Default: INITIAL_SETTINGS });
  return Object.fromEntries(Object.entries(library).map(([name, value]) => [name, sanitizeSpaceTieSettings({ ...INITIAL_SETTINGS, ...value, particleAppearance: { ...INITIAL_SETTINGS.particleAppearance, ...value?.particleAppearance } })]));
}

function formatEnergy(joules) {
  const value = Math.max(0, Number(joules) || 0);
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)} TJ`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GJ`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MJ`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} kJ`;
  return `${value.toFixed(0)} J`;
}

function formatPower(watts) {
  const value = Math.max(0, Number(watts) || 0);
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GW`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MW`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} kW`;
  return `${value.toFixed(1)} W`;
}

function Metric({ label, value }) {
  return <div className="space-tie-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function WorkspaceParameterControls({ widget, settings, onChange }) {
  return <details className="space-tie-mode-parameters" open>
    <summary>Mode parameters</summary>
    {widget.parameters.map((parameter) => parameter.type === 'select'
      ? <ParamSelect key={parameter.key} className="space-tie-select" label={parameter.label} value={settings[parameter.key]} options={parameter.options} onChange={(value) => onChange({ [parameter.key]: value })} />
      : <NumericParamControl key={parameter.key} className="space-tie-range" label={parameter.label} value={settings[parameter.key]} min={parameter.min} max={parameter.max} step={parameter.step} suffix={parameter.suffix} onChange={(value) => onChange({ [parameter.key]: value })} />)}
  </details>;
}

function ProfileChart({ title, values, color, labels = ['0', '25', '50', '75', '100'] }) {
  const maximum = Math.max(1e-12, ...values);
  const minimum = Math.min(0, ...values);
  const points = values.map((value, index) => {
    const x = 42 + index / Math.max(1, values.length - 1) * 628;
    const y = 180 - (value - minimum) / Math.max(1e-12, maximum - minimum) * 142;
    return `${x},${y}`;
  }).join(' ');
  return <section className="space-tie-profile"><span>{title}</span><svg viewBox="0 0 700 220" role="img" aria-label={title}>
    {[0, 1, 2, 3].map((index) => <line key={index} x1="42" x2="670" y1={38 + index * 42} y2={38 + index * 42} className="space-tie-chart-grid" />)}
    <polyline points={points} fill="none" stroke={color} strokeWidth="3" />
    {labels.map((label, index) => <text key={`${label}-${index}`} x={42 + index / Math.max(1, labels.length - 1) * 628} y="210" textAnchor="middle">{label}</text>)}
  </svg></section>;
}

function TieLattice({ settings, layout, activeStage }) {
  const ringsRef = useRef(null);
  const coresRef = useRef(null);
  const dummy = useMemo(() => new Object3D(), []);
  const colors = useMemo(() => STRAND_COLORS.map((hex) => new Color(hex)), []);
  const activeColor = useMemo(() => new Color('#fff0a6'), []);
  const simulationTime = useSimulationTime(settings.simulationSpeed);
  const count = layout.nodes.length;
  const radius = Math.max(1.1, Math.min(8, settings.helixRadiusM / 8));

  useFrame(() => {
    const rings = ringsRef.current;
    const cores = coresRef.current;
    if (!rings || !cores) return;
    for (let index = 0; index < count; index += 1) {
      const node = layout.nodes[index];
      const strandPhase = Math.PI * 2 * node.strand / settings.strandCount;
      const turns = Math.max(2, layout.renderCountPerStrand / 2);
      const angle = node.progress * Math.PI * 2 * turns + strandPhase + simulationTime.current * settings.swirlRate + Math.sin(simulationTime.current * 0.35 + index * 0.22) * settings.nodeMotion * 0.3;
      const radial = radius * (1 + settings.nodeMotion * 0.06 * Math.sin(simulationTime.current * 0.6 + index * 0.51));
      dummy.position.set(Math.cos(angle) * radial, Math.sin(angle) * radial, (node.progress - 0.5) * 24);
      dummy.rotation.set(0, 0, angle + Math.PI / 2);
      const active = activeStage >= 0 && node.strandIndex === activeStage;
      dummy.scale.setScalar(active ? 1.28 : 1);
      dummy.updateMatrix();
      rings.setMatrixAt(index, dummy.matrix);
      cores.setMatrixAt(index, dummy.matrix);
      const color = active ? activeColor : colors[node.strand % colors.length];
      rings.setColorAt(index, color);
      cores.setColorAt(index, color);
    }
    rings.instanceMatrix.needsUpdate = true;
    cores.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
  });

  return <group>
    <instancedMesh ref={ringsRef} args={[undefined, undefined, count]}><torusGeometry args={[0.44, 0.055, 6, 18]} /><meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.25} emissive="#1b5a63" emissiveIntensity={0.55} /></instancedMesh>
    <instancedMesh ref={coresRef} args={[undefined, undefined, count]}><sphereGeometry args={[0.14, 8, 8]} /><meshStandardMaterial color="#ffffff" emissive="#f0a653" emissiveIntensity={0.55} roughness={0.35} /></instancedMesh>
  </group>;
}

function FieldSplats({ settings, telemetry }) {
  const count = settings.particleCount;
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const radii = new Float32Array(count);
    const white = new Color('#ffffff');
    for (let index = 0; index < count; index += 1) {
      const progress = index / count;
      const angle = index * 2.399963229728653;
      const radial = settings.helixRadiusM / 8 * Math.sqrt(((index * 17) % count) / count);
      positions[index * 3] = Math.cos(angle) * radial;
      positions[index * 3 + 1] = Math.sin(angle) * radial;
      positions[index * 3 + 2] = (progress - 0.5) * 24;
      radii[index] = radial;
      colors.set([white.r, white.g, white.b], index * 3);
      seeds[index] = angle;
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    result.setAttribute('color', new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage));
    result.userData.seeds = seeds;
    result.userData.radii = radii;
    return result;
  }, [count, settings.helixRadiusM]);
  const color = useMemo(() => new Color(), []);
  const accumulator = useRef(0);
  const simulationTime = useSimulationTime(settings.simulationSpeed);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    accumulator.current += delta;
    if (!settings.showFieldSplats || accumulator.current < 0.08) return;
    accumulator.current = 0;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    const seeds = geometry.userData.seeds;
    const radii = geometry.userData.radii;
    for (let index = 0; index < count; index += 1) {
      const radiusM = radii[index] * 8;
      const response = evaluateSpaceTieOperator({ operator: settings.operator, radiusM, speedMS: telemetry.velocityMS, axialPosition: positions[index * 3 + 2], time: simulationTime.current, settings });
      const angle = calculateRotatingTracerAngle({ baseAngle: seeds[index], simulationTime: simulationTime.current, swirlRate: settings.swirlRate, accelerationScale: response.accelerationScale, splatWeight: response.splatWeight });
      positions[index * 3] = Math.cos(angle) * radii[index];
      positions[index * 3 + 1] = Math.sin(angle) * radii[index];
      const vortex = settings.widget === 'vortex-sail' ? calculateVortexBeamIntensity({ radiusM, beamWaistM: settings.tensorGaussianWaistM, topologicalCharge: settings.vortexCharge }) : 1;
      const strength = Math.min(1, response.splatWeight * vortex * (0.55 + 0.45 * Math.sin(simulationTime.current * 1.3 + seeds[index]) ** 2));
      color.setHSL(0.54 - strength * 0.42, 0.84, 0.26 + strength * 0.36);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });
  return <points geometry={geometry} visible={settings.showFieldSplats}><pointsMaterial size={0.045 * settings.particleAppearance.sizeScale} sizeAttenuation transparent opacity={settings.particleAppearance.opacity} vertexColors blending={AdditiveBlending} depthWrite={false} /></points>;
}

function SpaceTieSail({ settings, progress }) {
  const charge = Math.max(-3, Math.min(3, Math.round(Number(settings.vortexCharge) || 0)));
  const lineCount = Math.max(1, Math.abs(charge));
  const beamRadius = Math.max(0.2, Math.min(7, settings.tensorGaussianWaistM / 8 * Math.sqrt(lineCount / 2)));
  const outerRadius = Math.max(0.2, Math.min(7, settings.sailOuterRadiusM / 8));
  const innerRadius = Math.min(Math.max(0, settings.sailInnerRadiusM / 8), outerRadius * 0.9);
  const sailZ = -12 + Math.max(0, Math.min(1, progress)) * 24;
  const filaments = useMemo(() => Array.from({ length: lineCount }, (_, filament) => {
    const points = Array.from({ length: 97 }, (_, index) => {
      const axialProgress = index / 96;
      const angle = axialProgress * Math.PI * 2 * charge + filament * Math.PI * 2 / lineCount;
      const radius = charge === 0 ? 0.08 : beamRadius;
      return new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -12 + axialProgress * 24);
    });
    return new TubeGeometry(new CatmullRomCurve3(points), 96, 0.025, 5, false);
  }), [beamRadius, charge, lineCount]);

  useEffect(() => () => filaments.forEach((geometry) => geometry.dispose()), [filaments]);

  return <>
    {filaments.map((geometry, index) => <mesh key={`${charge}-${index}`} geometry={geometry}><meshBasicMaterial color={index % 2 === 0 ? '#70e6c3' : '#72b9e8'} transparent opacity={0.58} blending={AdditiveBlending} depthWrite={false} /></mesh>)}
    <group position={[0, 0, sailZ]}>
      <mesh><ringGeometry args={[innerRadius, outerRadius, 72]} /><meshBasicMaterial color="#e5a653" side={DoubleSide} transparent opacity={0.32} /></mesh>
      <mesh><torusGeometry args={[outerRadius, 0.05, 8, 72]} /><meshStandardMaterial color="#f0c875" metalness={0.55} roughness={0.3} emissive="#e5a653" emissiveIntensity={0.6} /></mesh>
      <mesh><torusGeometry args={[Math.max(0.03, innerRadius), 0.028, 6, 48]} /><meshBasicMaterial color="#70e6c3" transparent opacity={0.72} /></mesh>
    </group>
  </>;
}

function CoilStageVisual({ settings, activeStage, stageCount }) {
  const visibleStages = 12;
  const activeVisibleStage = activeStage < 0 ? -1 : Math.floor(activeStage / Math.max(1, stageCount) * visibleStages);
  const radius = Math.max(1.5, settings.helixRadiusM / 8 + 0.8);
  return <group>{Array.from({ length: visibleStages }, (_, index) => <mesh key={index} position={[0, 0, -10.5 + index * 21 / (visibleStages - 1)]}>
    <torusGeometry args={[radius, 0.065, 8, 48]} />
    <meshStandardMaterial color={index === activeVisibleStage ? '#fff0a6' : '#e5a653'} emissive={index === activeVisibleStage ? '#fff0a6' : '#8c5127'} emissiveIntensity={index === activeVisibleStage ? 1.4 : 0.35} metalness={0.55} roughness={0.32} />
  </mesh>)}</group>;
}

function HelixRailVisual({ layout, settings }) {
  const groupRef = useRef(null);
  const simulationTime = useSimulationTime(settings.simulationSpeed);
  const tracks = useMemo(() => Array.from({ length: layout.nodes.length / layout.renderCountPerStrand }, (_, strand) => {
    const start = strand * layout.renderCountPerStrand;
    const nodes = layout.nodes.slice(start, start + layout.renderCountPerStrand);
    const curve = new CatmullRomCurve3(nodes.map((node) => new Vector3(node.x, node.y, node.z)));
    return new TubeGeometry(curve, Math.max(48, nodes.length * 2), 0.035, 6, false);
  }), [layout]);
  useEffect(() => () => tracks.forEach((geometry) => geometry.dispose()), [tracks]);
  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.z = simulationTime.current * settings.swirlRate;
  });
  return <group ref={groupRef}>{tracks.map((geometry, index) => <mesh key={index} geometry={geometry}><meshBasicMaterial color={STRAND_COLORS[index % STRAND_COLORS.length]} transparent opacity={0.82} /></mesh>)}</group>;
}

function TieSpacingVisual({ settings, layout }) {
  const halfGap = 12 / Math.max(1, layout.renderCountPerStrand - 1);
  const radius = Math.max(1.5, settings.helixRadiusM / 8 + 1.1);
  return <group position={[0, -radius, 0]}>
    <mesh><boxGeometry args={[0.035, 0.035, halfGap * 2]} /><meshBasicMaterial color="#f0c875" transparent opacity={0.72} /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[0, 0, side * halfGap]}><boxGeometry args={[0.34, 0.08, 0.08]} /><meshStandardMaterial color="#f0c875" emissive="#8c5127" emissiveIntensity={0.55} /></mesh>)}
  </group>;
}

function DynamicMeshVisual({ settings, layout }) {
  const groupRef = useRef(null);
  const simulationTime = useSimulationTime(settings.simulationSpeed);
  const geometry = useMemo(() => {
    const positions = new Float32Array(layout.renderCountPerStrand * settings.strandCount * 6);
    let offset = 0;
    for (let strand = 0; strand < settings.strandCount; strand += 1) {
      const nextStrand = (strand + 1) % settings.strandCount;
      for (let index = 0; index < layout.renderCountPerStrand; index += 1) {
        const first = layout.nodes[strand * layout.renderCountPerStrand + index];
        const second = layout.nodes[nextStrand * layout.renderCountPerStrand + index];
        positions.set([first.x, first.y, first.z, second.x, second.y, second.z], offset);
        offset += 6;
      }
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3));
    return result;
  }, [layout, settings.strandCount]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z = Math.sin(simulationTime.current * 0.35) * settings.swirlRate * 0.12;
    const pulse = 1 + Math.sin(simulationTime.current * 1.7) * settings.nodeMotion * 0.035;
    groupRef.current.scale.set(pulse, pulse, 1);
  });
  return <group ref={groupRef}><lineSegments geometry={geometry}><lineBasicMaterial color="#72b9e8" transparent opacity={0.72} /></lineSegments></group>;
}

function TunnelEnvelopeVisual({ settings }) {
  const radius = Math.max(0.2, settings.tunnelRadiusM / 8);
  return <group>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[radius, radius, 24, 48, 1, true]} /><meshBasicMaterial color="#5bb7c4" wireframe transparent opacity={0.12} side={DoubleSide} /></mesh>
    {[-1, 1].map((end) => <mesh key={end} position={[0, 0, end * 12]}><torusGeometry args={[radius, 0.055, 8, 48]} /><meshBasicMaterial color="#70e6c3" transparent opacity={0.82} /></mesh>)}
  </group>;
}

function VacuumChannelVisual({ settings }) {
  const radius = Math.max(0.2, settings.tunnelRadiusM / 8);
  const opacity = 0.1 + settings.vacuumChannelContrast * 0.5;
  return <group>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[radius, radius, 24, 40, 1, true]} /><meshBasicMaterial color="#9e8aff" wireframe transparent opacity={opacity} side={DoubleSide} /></mesh>
    {Array.from({ length: 9 }, (_, index) => <mesh key={index} position={[0, 0, -10 + index * 2.5]}><torusGeometry args={[radius * (0.72 + 0.08 * Math.sin(index)), 0.025, 6, 40]} /><meshBasicMaterial color={index % 2 === 0 ? '#b7a9ff' : '#72b9e8'} transparent opacity={opacity} blending={AdditiveBlending} /></mesh>)}
  </group>;
}

function SpaceTieScene({ settings, massDriver, cameraViews, viewMode, orbitPlaying, launchToken, sequenceRunning, flightTelemetry, onTelemetry, onSequenceComplete, onUserInteraction }) {
  const layout = useMemo(() => createHelixNodes({ destination: settings.destination, spacingKm: settings.tieSpacingKm, strands: settings.strandCount, radius: settings.helixRadiusM / 8, motion: settings.nodeMotion, swirlRate: settings.swirlRate }), [settings.destination, settings.helixRadiusM, settings.nodeMotion, settings.strandCount, settings.swirlRate, settings.tieSpacingKm]);
  const payloadRef = useRef(null);
  const flightRef = useRef(null);
  const tokenRef = useRef(-1);
  const reportTimeRef = useRef(0);
  const isTug = settings.widget === 'edt-tug';
  const energyBudget = calculateSpaceEnergyBudget(settings);

  if (tokenRef.current !== launchToken) {
    tokenRef.current = launchToken;
    flightRef.current = { progress: 0, elapsed: 0, velocityMS: settings.initialVelocityMS, kineticEnergyJ: 0.5 * settings.payloadMassKg * settings.initialVelocityMS ** 2, energyUsedJ: 0, energyDeliveredJ: 0, energyLossJ: 0, batteryEnergyJ: calculateBatteryOperatingPoint({ settings }).availableJ, nextStage: 0, activeStage: -1, done: false };
  }

  useFrame((_, frameDelta) => {
    const flight = flightRef.current;
    if (!flight) return;
    const delta = Math.min(0.05, frameDelta) * settings.simulationSpeed;
    if (sequenceRunning && launchToken > 0 && !flight.done) {
      flight.elapsed += delta;
      flight.progress = Math.min(1, flight.elapsed / Math.max(0.5, settings.pulseSequenceSeconds));
      if (settings.widget === 'mass-driver') {
        const targetKineticEnergyJ = massDriver.kineticEnergyJ * flight.progress;
        flight.energyUsedJ = Math.min(massDriver.availableBatteryEnergyJ, targetKineticEnergyJ / massDriver.efficiency);
        flight.energyDeliveredJ = Math.min(targetKineticEnergyJ, flight.energyUsedJ * massDriver.efficiency);
        flight.kineticEnergyJ = flight.energyDeliveredJ;
        flight.velocityMS = Math.sqrt(2 * flight.kineticEnergyJ / settings.payloadMassKg);
        flight.energyLossJ = Math.max(0, flight.energyUsedJ - flight.energyDeliveredJ);
        flight.batteryEnergyJ = Math.max(0, massDriver.availableBatteryEnergyJ - flight.energyUsedJ);
        flight.activeStage = Math.min(layout.renderCountPerStrand - 1, Math.floor(flight.progress * layout.renderCountPerStrand));
      } else {
        while (flight.nextStage < layout.renderCountPerStrand && flight.progress >= (flight.nextStage + 1) / layout.renderCountPerStrand) {
          const response = evaluateSpaceTieOperator({ operator: settings.operator, radiusM: 0, speedMS: flight.velocityMS, axialPosition: flight.progress, time: flight.elapsed, settings });
          const pulse = calculateCoilgunStage({ payloadMassKg: settings.payloadMassKg, currentVelocityMS: flight.velocityMS, batteryEnergyJ: flight.batteryEnergyJ, pulseEnergyMJ: settings.coilPulseEnergyMJ, pulseEfficiency: settings.pulseEfficiency, payloadCoupling: settings.payloadCoupling, operator: settings.operator, accelerationScale: response.accelerationScale });
          flight.velocityMS = pulse.nextVelocityMS;
          flight.kineticEnergyJ += pulse.payloadEnergyJ;
          flight.energyUsedJ += pulse.availablePulseJ;
          flight.energyDeliveredJ += pulse.payloadEnergyJ;
          flight.energyLossJ += pulse.lossEnergyJ;
          flight.batteryEnergyJ = Math.max(0, flight.batteryEnergyJ - pulse.availablePulseJ);
          flight.activeStage = flight.nextStage;
          flight.nextStage += 1;
        }
      }
      if (flight.progress >= 1) { flight.done = true; onSequenceComplete(); }
    }
    if (payloadRef.current) payloadRef.current.position.z = -12 + flight.progress * 24;
    reportTimeRef.current += frameDelta;
    if (reportTimeRef.current >= 0.15) {
      reportTimeRef.current = 0;
      onTelemetry({ progress: flight.progress, velocityMS: flight.velocityMS, kineticEnergyJ: flight.kineticEnergyJ, energyUsedJ: flight.energyUsedJ, energyDeliveredJ: flight.energyDeliveredJ, energyLossJ: flight.energyLossJ, batteryRemainingJ: flight.batteryEnergyJ, activeStage: flight.activeStage, done: flight.done, solarPowerW: energyBudget.totalSupplyW });
    }
  });

  return <>
    <color attach="background" args={['#050b17']} />
    <fog attach="fog" args={['#050b17', 28, 68]} />
    <ambientLight intensity={0.68} color="#a9c7da" />
    <directionalLight intensity={1.25} position={[7, 8, -4]} color="#ffe4ab" />
    <pointLight intensity={35} distance={38} position={[-7, 6, -14]} color="#f2aa55" />
    <mesh position={[0, 0, -14]}><sphereGeometry args={[1.45, 24, 20]} /><meshStandardMaterial color="#28658a" emissive="#123d58" emissiveIntensity={0.22} roughness={0.92} /></mesh>
    <mesh position={[0, 0, 14]}><sphereGeometry args={[settings.destination === 'mars' ? 0.9 : 0.62, 20, 16]} /><meshStandardMaterial color={settings.destination === 'mars' ? '#a65841' : '#a8bdc4'} roughness={0.9} /></mesh>
    {!isTug && <>
      {settings.widget === 'mass-driver' && <CoilStageVisual settings={settings} activeStage={flightTelemetry.activeStage} stageCount={layout.renderCountPerStrand} />}
      {settings.widget === 'tunnel-envelope' && <TunnelEnvelopeVisual settings={settings} />}
      {settings.widget === 'helical-formation' && <HelixRailVisual layout={layout} settings={settings} />}
      {settings.widget === 'tie-spacing' && <TieSpacingVisual settings={settings} layout={layout} />}
      {settings.widget === 'dynamic-mesh' && <DynamicMeshVisual settings={settings} layout={layout} />}
      {settings.widget === 'vacuum-channel' && <VacuumChannelVisual settings={settings} />}
      <TieLattice settings={settings} layout={layout} activeStage={flightTelemetry.activeStage} />
      <FieldSplats settings={settings} telemetry={flightTelemetry} />
      {settings.widget === 'vortex-sail' && <SpaceTieSail settings={settings} progress={flightTelemetry.progress} />}
      <group ref={payloadRef} position={[0, 0, -12]}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.32, 0.32, 1.25, 12]} /><meshStandardMaterial color="#d7e1dc" metalness={0.65} roughness={0.25} emissive="#173342" emissiveIntensity={0.2} /></mesh><mesh position={[0, 0, -0.42]}><coneGeometry args={[0.32, 0.45, 12]} /><meshStandardMaterial color="#d8a45f" metalness={0.35} roughness={0.4} /></mesh></group>
    </>}
    {isTug && <group><mesh position={[0, 0, -10]}><sphereGeometry args={[2.2, 24, 20]} /><meshStandardMaterial color="#28658a" emissive="#123d58" emissiveIntensity={0.24} /></mesh><mesh position={[0, 0, -5]}><boxGeometry args={[0.7, 0.5, 0.8]} /><meshStandardMaterial color="#e4a458" metalness={0.5} /></mesh><mesh position={[0, 0, -7.5]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.018, 0.018, 4, 6]} /><meshStandardMaterial color="#70e6c3" emissive="#70e6c3" emissiveIntensity={0.8} /></mesh><mesh position={[0, 2.3, -5]}><boxGeometry args={[3, 0.04, 1.6]} /><meshStandardMaterial color="#9dcfc7" emissive="#397b78" emissiveIntensity={0.35} /></mesh></group>}
    <ContactShadows position={[0, -3, 0]} opacity={0.2} scale={32} blur={3} far={12} />
    <PerspectiveOrbitControls viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={settings} views={cameraViews} cameraParams={{ minDistance: 8, maxDistance: 70, target: [0, 0, 0] }} onUserInteraction={onUserInteraction} />
  </>;
}

function EnergyBudgetView({ budget, pulse }) {
  const reserveJ = Math.max(1, pulse.availablePulseJ);
  const flows = [{ label: 'BAT reserve / pulse', value: reserveJ, color: '#e5a653' }, { label: 'Payload kinetic increment', value: pulse.payloadEnergyJ, color: '#70e6c3' }, { label: 'Pulse conversion loss', value: pulse.lossEnergyJ, color: '#df789b' }];
  return <div className="space-tie-energy-flow" aria-label="Space tie energy flow">{flows.map((flow) => <div key={flow.label} className="space-tie-flow-row"><span>{flow.label}</span><div><i style={{ width: `${Math.max(1, 100 * flow.value / reserveJ)}%`, background: flow.color }} /></div><strong>{formatEnergy(flow.value)}</strong></div>)}<div className="space-tie-metrics-grid"><Metric label="Solar array scenario" value={formatPower(budget.solar.electricalPowerW)} /><Metric label="SBSP received scenario" value={formatPower(budget.solarBeamCaptureW)} /><Metric label="Mesh recoil recovery" value={formatPower(budget.meshHarvestW)} /></div><p>Solar and mesh inputs are separate scenario rates; they are not credited to the BAT pulse unless stored. Vacuum-channel hypotheses are excluded from this balance.</p></div>;
}

function PropellantLogisticsView({ settings }) {
  const cartridgeMassKg = Math.max(1, settings.logisticsCartridgeMassKg);
  const depotLoads = Math.floor(settings.logisticsDepotCapacityKg / cartridgeMassKg);
  const annualThroughputKg = cartridgeMassKg * settings.logisticsTugFleetCount * 365 / Math.max(1, settings.logisticsTransferDays);
  const phases = [['01', 'Terrestrial processing', `${cartridgeMassKg.toLocaleString()} kg / cartridge`], ['02', 'Bulk launch', `${settings.destination.toUpperCase()} manifest`], ['03', 'Orbital depot', `${settings.logisticsDepotCapacityKg.toLocaleString()} kg capacity`], ['04', 'Reusable tug', `${settings.logisticsTugFleetCount} tugs / ${settings.logisticsTransferDays} days`], ['05', 'Space tie', 'Dock / refill / inspect']];
  return <div className="space-tie-analysis"><div className="space-tie-logistics">{phases.map(([index, title, text], phase) => <div className="space-tie-logistics-step" key={index}><span>{index}</span><strong>{title}</strong><small>{text}</small>{phase < phases.length - 1 && <i aria-hidden="true">→</i>}</div>)}</div><div className="space-tie-metrics-grid"><Metric label="Cartridges staged" value={depotLoads.toLocaleString()} /><Metric label="Annual transfer capacity" value={`${Math.round(annualThroughputKg).toLocaleString()} kg / yr`} /><Metric label="Tug fleet" value={`${settings.logisticsTugFleetCount}`} /><Metric label="Turnaround" value={`${settings.logisticsTransferDays} days`} /></div><p className="space-tie-caveat">Throughput is a scheduling scenario from entered cartridge mass, tug count, and turnaround; launch windows, propellant consumption, and transfer losses are not modeled.</p></div>;
}

function SpaceTieAnalysis({ settings, budget, pulse, payload, recoil, edt, alignment, layout }) {
  if (settings.widget === 'energy-budget') return <EnergyBudgetView budget={budget} pulse={pulse} />;
  if (settings.widget === 'propellant-logistics') return <PropellantLogisticsView settings={settings} />;
  if (settings.widget === 'recoil-harvesting') return <div className="space-tie-analysis"><div className="space-tie-metrics-grid"><Metric label="Reduced mass" value={`${recoil.reducedMassKg.toFixed(1)} kg`} /><Metric label="Available recoil energy" value={formatEnergy(recoil.availableEnergyJ)} /><Metric label="Piezo recovery" value={formatEnergy(recoil.piezoEnergyJ)} /><Metric label="TENG recovery" value={formatEnergy(recoil.tengEnergyJ)} /><Metric label="Recovered fraction" value={`${(100 * recoil.harvestedEnergyJ / Math.max(1, recoil.availableEnergyJ)).toFixed(1)}%`} /></div><p className="space-tie-caveat">A floating tie has no external track to deform against; this scenario only accounts for an internal proof mass lagging inside its housing. Yield is bounded by recoil energy.</p></div>;
  if (settings.widget === 'payload-energy') return <div className="space-tie-analysis"><div className="space-tie-metrics-grid"><Metric label="Payload kinetic energy" value={formatEnergy(payload.kineticEnergyJ)} /><Metric label="Input energy at selected coupling" value={formatEnergy(payload.inputEnergyJ)} /><Metric label="Thermal / conversion loss" value={formatEnergy(payload.thermalLossJ)} /><Metric label="Selected launch velocity" value={`${settings.launchVelocityKmS.toFixed(1)} km/s`} /></div><div className="space-tie-architecture-list">{[{ label: 'Metasurface sail', efficiency: 0.9 }, { label: 'Synchronous EM craft', efficiency: 0.87 }, { label: 'Passive induction craft', efficiency: 0.35 }].map((architecture) => { const result = calculatePayloadEnergy({ massKg: settings.payloadMassKg, velocityKmS: settings.launchVelocityKmS, couplingEfficiency: architecture.efficiency }); return <div key={architecture.label}><span>{architecture.label}</span><strong>{formatEnergy(result.inputEnergyJ)}</strong><i style={{ width: `${100 * architecture.efficiency}%` }} /><small>{(100 * architecture.efficiency).toFixed(0)}% assumed coupling</small></div>; })}</div>{payload.thermalLossJ > 50e9 && <p className="space-tie-caveat is-warning">Thermal-load threshold exceeded under this scenario. Passive induction heating is not modeled as survivable.</p>}</div>;
  if (settings.widget === 'halbach-alignment') {
    const gaps = Array.from({ length: 21 }, (_, index) => index * Math.max(0.1, settings.halbachGapM) * 4 / 20);
    return <div className="space-tie-analysis"><ProfileChart title="Idealized Halbach force envelope" values={gaps.map((gap) => calculateHalbachAlignment({ fieldT: settings.halbachArrayFluxT, activeAreaM2: settings.halbachActiveAreaM2, gapM: gap, characteristicLengthM: settings.halbachCharacteristicLengthM, polePairs: settings.halbachPolePairs }).forceN)} color="#70e6c3" /><div className="space-tie-metrics-grid"><Metric label="Alignment force estimate" value={`${alignment.forceN.toExponential(2)} N`} /><Metric label="Envelope remaining" value={`${(alignment.distanceEnvelope * 100).toFixed(2)}%`} /><Metric label="Pole pairs" value={`${settings.halbachPolePairs}`} /></div><p className="space-tie-caveat">Illustrative magnetic-pressure and spatial-envelope model, not a finite Halbach-array force solution.</p></div>;
  }
  if (settings.widget === 'qed-profile') {
    const radii = Array.from({ length: 21 }, (_, index) => settings.tunnelRadiusM * index / 20);
    const profile = radii.map((radius) => calculateHalbachQED({ radiusM: radius, tunnelRadiusM: settings.tunnelRadiusM, edgeFluxT: settings.edgeFluxT, multipoleOrder: settings.multipoleOrder }));
    return <div className="space-tie-analysis"><ProfileChart title="Ideal multipole flux profile (T)" values={profile.map((point) => point.fieldT)} color="#72b9e8" /><div className="space-tie-metrics-grid"><Metric label="Center field" value={`${profile[0].fieldT.toFixed(3)} T`} /><Metric label="Edge field" value={`${profile.at(-1).fieldT.toFixed(3)} T`} /><Metric label="Weak-field birefringence proxy" value={profile.at(-1).deltaNApprox.toExponential(2)} /></div><p className="space-tie-caveat">Weak-field QED birefringence scaling only; not vacuum viscosity, Proca confinement, or thrust.</p></div>;
  }
  return <div className="space-tie-analysis"><div className="space-tie-metrics-grid"><Metric label="Rendered ties / strand" value={`${layout.renderCountPerStrand}`} /><Metric label="Conceptual ties / strand" value={layout.physicalCountPerStrand.toLocaleString()} /><Metric label="Solar electrical input" value={formatPower(budget.solar.electricalPowerW)} /><Metric label="SBSP received power" value={formatPower(budget.solarBeamCaptureW)} /><Metric label="Coil pulse input" value={formatEnergy(pulse.availablePulseJ)} /><Metric label="Payload kinetic increment" value={formatEnergy(pulse.payloadEnergyJ)} /></div><p className="space-tie-caveat">The visible node count is capped for rendering. Physical route length and tie spacing are scenario inputs; no flight-ready structure or propulsion efficiency is implied.</p></div>;
}

function SpaceTieAcceleratorSim({ onBack }) {
  const [presetLibrary, setPresetLibrary] = useState(() => readPresets());
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [presetName, setPresetName] = useState('');
  const [settings, setSettings] = useState(() => sanitizeSpaceTieSettings(presetLibrary.Default ?? INITIAL_CONFIGURATION));
  const [panelVisible, setPanelVisible] = useState(true);
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [launchToken, setLaunchToken] = useState(0);
  const [flightTelemetry, setFlightTelemetry] = useState({ progress: 0, velocityMS: 0, kineticEnergyJ: 0, energyUsedJ: 0, energyDeliveredJ: 0, energyLossJ: 0, batteryRemainingJ: 0, activeStage: -1, done: false, solarPowerW: 0 });
  const [cameraView, setCameraView] = useState(settings.cameraViewMode ?? 'ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const cameraViews = useMemo(() => createCameraViews({ target: [0, 0, 0], distance: 22, frontDistance: 28, ortho1Offset: [18, 13, 24], ortho2Offset: [-18, 14, -22] }), []);
  const layout = useMemo(() => createHelixNodes({ destination: settings.destination, spacingKm: settings.tieSpacingKm, strands: settings.strandCount, radius: settings.helixRadiusM / 8, motion: settings.nodeMotion, swirlRate: settings.swirlRate }), [settings.destination, settings.helixRadiusM, settings.nodeMotion, settings.strandCount, settings.swirlRate, settings.tieSpacingKm]);
  const budget = calculateSpaceEnergyBudget(settings);
  const massDriver = calculateElectromagneticMassDriver(settings);
  const field = evaluateSpaceTieOperator({ operator: settings.operator, radiusM: 0, speedMS: flightTelemetry.velocityMS, settings });
  const pulse = calculateCoilgunStage({ payloadMassKg: settings.payloadMassKg, currentVelocityMS: flightTelemetry.velocityMS, batteryEnergyJ: calculateBatteryOperatingPoint({ settings }).availableJ, pulseEnergyMJ: settings.coilPulseEnergyMJ, pulseEfficiency: settings.pulseEfficiency, payloadCoupling: settings.payloadCoupling, operator: settings.operator, accelerationScale: field.accelerationScale });
  const payload = calculatePayloadEnergy({ massKg: settings.payloadMassKg, velocityKmS: settings.launchVelocityKmS, couplingEfficiency: settings.payloadCoupling });
  const recoil = calculateRecoilHarvest({ internalMassKg: settings.recoilInternalMassKg, hullMassKg: settings.recoilHullMassKg, recoilVelocityMS: settings.recoilVelocityMS, piezoSplit: settings.piezoSplit, piezoCoupling: settings.piezoCoupling, tengEfficiency: settings.tengEfficiency });
  const edt = calculateEdtTug({ currentA: settings.edtCurrentA, tetherLengthM: settings.edtTetherLengthM, magneticFieldT: settings.edtFieldTesla, angleDeg: settings.edtAngleDeg, solarPowerKW: settings.edtSolarPowerKW });
  const alignment = calculateHalbachAlignment({ fieldT: settings.halbachArrayFluxT, activeAreaM2: settings.halbachActiveAreaM2, gapM: settings.halbachGapM, characteristicLengthM: settings.halbachCharacteristicLengthM, polePairs: settings.halbachPolePairs });
  const widget = SPACE_TIE_WIDGETS.find((entry) => entry.value === settings.widget) ?? SPACE_TIE_WIDGETS[0];
  const isSceneView = SCENE_WIDGETS.has(settings.widget);
  const update = (patch) => setSettings((current) => sanitizeSpaceTieSettings({ ...current, ...patch, particleAppearance: { ...current.particleAppearance, ...(patch.particleAppearance ?? {}) } }));
  const updateWorkspace = (patch) => update(patch.massDriverLocation ? { ...patch, massDriverTrackLengthKm: patch.massDriverLocation === 'moon' ? 4 : 130 } : patch);
  const applyPreset = (name) => {
    const next = sanitizeSpaceTieSettings(presetLibrary[name] ?? INITIAL_CONFIGURATION);
    setSettings(next);
    setCameraView(next.cameraViewMode ?? 'ortho1');
    setCurrentPreset(name);
    setSequenceRunning(false);
    setLaunchToken((value) => value + 1);
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = { ...presetLibrary, [name]: { ...settings, particleAppearance: { ...settings.particleAppearance } } };
    setPresetLibrary(next);
    setCurrentPreset(name);
    setPresetName('');
    writePresetLibrary(window.localStorage, PRESET_KEY, next);
  };
  const startOrPause = () => {
    if (sequenceRunning) { setSequenceRunning(false); return; }
    if (flightTelemetry.done || launchToken === 0) setLaunchToken((value) => value + 1);
    setSequenceRunning(true);
  };
  const resetSequence = () => {
    setSequenceRunning(false);
    setLaunchToken((value) => value + 1);
    setFlightTelemetry({ progress: 0, velocityMS: settings.initialVelocityMS, kineticEnergyJ: 0, energyUsedJ: 0, energyDeliveredJ: 0, energyLossJ: 0, batteryRemainingJ: 0, activeStage: -1, done: false, solarPowerW: budget.totalSupplyW });
  };
  const updateAll = (next) => setSettings(sanitizeSpaceTieSettings({ ...settings, ...next, particleAppearance: { ...settings.particleAppearance, ...next.particleAppearance } }));
  const currentPresetValue = presetLibrary[currentPreset] ?? INITIAL_CONFIGURATION;
  const workspaceOptions = SPACE_TIE_WIDGETS.map(({ value, label }) => ({ value, label }));
  const handleDestination = (destination) => update({ destination, solarDistanceAU: SPACE_TIE_DESTINATIONS.find((entry) => entry.value === destination)?.distanceAU ?? 1 });
  const panel = <aside className={`space-tie-panel${panelVisible ? '' : ' is-hidden'}`}>
    <div className="space-tie-panel-heading"><div><span>SPACE TIE / 14 EXPERIMENTS</span><h2>{widget.label}</h2><p>{widget.description}</p></div></div>
    <details className="space-tie-presets" open><summary>Saved configurations</summary><SimulatorPresetControls name={presetName} onNameChange={setPresetName} presets={presetLibrary} currentPreset={currentPreset} onApply={applyPreset} onSave={savePreset} onReset={() => applyPreset('Default')} /></details>
    <details open><summary>Experiment selection</summary>
      <ParamSelect className="space-tie-select" label="Experiment mode" value={settings.widget} options={workspaceOptions} onChange={(selectedWidget) => update({ widget: selectedWidget })} />
      <ParamSelect className="space-tie-select" label="Destination" value={settings.destination} options={SPACE_TIE_DESTINATIONS.map(({ value, label }) => ({ value, label }))} onChange={handleDestination} />
    </details>
    <WorkspaceParameterControls widget={widget} settings={settings} onChange={updateWorkspace} />
    <details><summary>Shared formation geometry</summary>
      <ParamSelect className="space-tie-select" label="Helix strands" value={settings.strandCount} options={STRAND_OPTIONS} onChange={(strandCount) => update({ strandCount })} />
      <NumericParamControl className="space-tie-range" label="Tie spacing" value={settings.tieSpacingKm} min={500} max={50000} step={500} suffix="km" onChange={(tieSpacingKm) => update({ tieSpacingKm })} />
      <NumericParamControl className="space-tie-range" label="Interior tunnel width" value={settings.helixRadiusM * 2} min={10} max={500} step={5} suffix="m" onChange={(diameter) => update({ helixRadiusM: diameter / 2 })} />
      <NumericParamControl className="space-tie-range" label="Dynamic inter-strand motion" value={settings.nodeMotion} min={0} max={1} step={0.01} onChange={(nodeMotion) => update({ nodeMotion })} />
      <NumericParamControl className="space-tie-range" label="Swirl rate" value={settings.swirlRate} min={0} max={2} step={0.01} suffix="rad/s" onChange={(swirlRate) => update({ swirlRate })} />
      <NumericParamControl className="space-tie-range" label="Simulation speed" value={settings.simulationSpeed} min={0} max={20} step={0.1} suffix="x" onChange={(simulationSpeed) => update({ simulationSpeed })} />
      <div className="space-tie-readout"><span>Route span</span><strong>{routeLengthKm(settings.destination).toLocaleString()} km</strong></div>
      <div className="space-tie-readout"><span>Physical tie count / strand</span><strong>{layout.physicalCountPerStrand.toLocaleString()}</strong></div>
    </details>
    <details><summary>Shared launch and BAT energy</summary>
      <NumericParamControl className="space-tie-range" label="Payload mass" value={settings.payloadMassKg} min={1} max={20000} step={1} suffix="kg" onChange={(payloadMassKg) => update({ payloadMassKg })} />
      <NumericParamControl className="space-tie-range" label="Target velocity" value={settings.launchVelocityKmS} min={0} max={30} step={0.1} suffix="km/s" onChange={(launchVelocityKmS) => update({ launchVelocityKmS })} />
      <NumericParamControl className="space-tie-range" label="BAT capacity" value={settings.batteryCapacityMWh} min={0.01} max={1000} step={0.1} suffix="MWh" onChange={(batteryCapacityMWh) => update({ batteryCapacityMWh })} />
      <NumericParamControl className="space-tie-range" label="BAT charge" value={settings.batteryChargePercent} min={0} max={100} step={1} suffix="%" onChange={(batteryChargePercent) => update({ batteryChargePercent })} />
      <NumericParamControl className="space-tie-range" label="Coil pulse energy" value={settings.coilPulseEnergyMJ} min={0} max={50000} step={10} suffix="MJ" onChange={(coilPulseEnergyMJ) => update({ coilPulseEnergyMJ })} />
      <NumericParamControl className="space-tie-range" label="Coil flux density" value={settings.coilFluxT} min={0} max={30} step={0.1} suffix="T" onChange={(coilFluxT) => update({ coilFluxT })} />
      <NumericParamControl className="space-tie-range" label="Pulse efficiency assumption" value={settings.pulseEfficiency} min={0} max={1} step={0.01} onChange={(pulseEfficiency) => update({ pulseEfficiency })} />
      <NumericParamControl className="space-tie-range" label="Payload coupling assumption" value={settings.payloadCoupling} min={0} max={1} step={0.01} onChange={(payloadCoupling) => update({ payloadCoupling })} />
      <NumericParamControl className="space-tie-range" label="Sequence duration" value={settings.pulseSequenceSeconds} min={2} max={120} step={1} suffix="s" onChange={(pulseSequenceSeconds) => update({ pulseSequenceSeconds })} />
      <div className="space-tie-readout"><span>Payload target kinetic energy</span><strong>{formatEnergy(payload.kineticEnergyJ)}</strong></div>
      <div className="space-tie-readout"><span>Current BAT energy</span><strong>{formatEnergy(calculateBatteryOperatingPoint({ settings }).availableJ)}</strong></div>
    </details>
    <details><summary>Solar, beam, and mesh harvest</summary>
      <NumericParamControl className="space-tie-range" label="Solar distance" value={settings.solarDistanceAU} min={0.3} max={2.5} step={0.01} suffix="AU" onChange={(solarDistanceAU) => update({ solarDistanceAU })} />
      <NumericParamControl className="space-tie-range" label="Solar collector area" value={settings.solarArrayAreaM2} min={0} max={100000} step={100} suffix="m²" onChange={(solarArrayAreaM2) => update({ solarArrayAreaM2 })} />
      <NumericParamControl className="space-tie-range" label="Solar conversion efficiency" value={settings.solarConversionEfficiency} min={0} max={1} step={0.01} onChange={(solarConversionEfficiency) => update({ solarConversionEfficiency })} />
      <NumericParamControl className="space-tie-range" label="SBSP beam power" value={settings.solarBeamPowerMW} min={0} max={100000} step={10} suffix="MW" onChange={(solarBeamPowerMW) => update({ solarBeamPowerMW })} />
      <NumericParamControl className="space-tie-range" label="Transmitter aperture" value={settings.beamApertureM} min={0.1} max={200} step={0.1} suffix="m" onChange={(beamApertureM) => update({ beamApertureM })} />
      <NumericParamControl className="space-tie-range" label="Receiver radius" value={settings.receiverRadiusM} min={0.1} max={250} step={0.1} suffix="m" onChange={(receiverRadiusM) => update({ receiverRadiusM })} />
      <NumericParamControl className="space-tie-range" label="Tether current" value={settings.edtCurrentA} min={-1000} max={1000} step={1} suffix="A" onChange={(edtCurrentA) => update({ edtCurrentA })} />
      <div className="space-tie-readout"><span>Solar electric power</span><strong>{formatPower(budget.solar.electricalPowerW)}</strong></div>
      <div className="space-tie-readout"><span>SBSP captured power</span><strong>{formatPower(budget.solarBeamCaptureW)}</strong></div>
      <div className="space-tie-readout"><span>Mesh recoil recovery estimate</span><strong>{formatPower(budget.meshHarvestW)}</strong></div>
      <div className="space-tie-readout"><span>EDT thrust estimate</span><strong>{edt.thrustN.toExponential(2)} N</strong></div>
    </details>
    <details><summary>Operator and field visualization</summary>
      <ParamSelect className="space-tie-select" label="Acceleration / splat model" value={settings.operator} options={SPACE_TIE_OPERATOR_OPTIONS} onChange={(operator) => update({ operator })} />
      <NumericParamControl className="space-tie-range" label="DDF dilatancy" value={settings.ddfStrength} min={0} max={20} step={0.1} onChange={(ddfStrength) => update({ ddfStrength })} />
      <NumericParamControl className="space-tie-range" label="DDF speed limit" value={settings.ddfSpeedLimitMS} min={100} max={100000} step={100} suffix="m/s" onChange={(ddfSpeedLimitMS) => update({ ddfSpeedLimitMS })} />
      <NumericParamControl className="space-tie-range" label="Grassmannian geometry coupling (hypothesis)" value={settings.geometryAccelerationCoupling} min={0} max={0.25} step={0.005} onChange={(geometryAccelerationCoupling) => update({ geometryAccelerationCoupling })} />
      {['A', 'B', 'C'].map((name, index) => <NumericParamControl key={name} className="space-tie-range" label={`Gr(2,4) cell gap ${name}`} value={settings.grassmannianCellGaps[index]} min={0.1} max={5} step={0.05} onChange={(value) => update({ grassmannianCellGaps: settings.grassmannianCellGaps.map((current, cellIndex) => cellIndex === index ? value : current) })} />)}
      <NumericParamControl className="space-tie-range" label="Fourth-column weight" value={settings.grassmannianFourthWeight} min={0.1} max={5} step={0.05} onChange={(grassmannianFourthWeight) => update({ grassmannianFourthWeight })} />
      <NumericParamControl className="space-tie-range" label="Tensor-Gaussian beam waist" value={settings.tensorGaussianWaistM} min={0.2} max={100} step={0.2} suffix="m" onChange={(tensorGaussianWaistM) => update({ tensorGaussianWaistM })} />
      <NumericParamControl className="space-tie-range" label="Tensor-Gaussian topological charge" value={settings.tensorGaussianCharge} min={-3} max={3} step={1} onChange={(tensorGaussianCharge) => update({ tensorGaussianCharge })} />
      <NumericParamControl className="space-tie-range" label="Vacuum-channel contrast (visual hypothesis only)" value={settings.vacuumChannelContrast} min={0} max={1} step={0.01} onChange={(vacuumChannelContrast) => update({ vacuumChannelContrast })} />
      <ParamSelect className="space-tie-select" label="Halbach multipole" value={settings.multipoleOrder} options={HALBACH_OPTIONS} onChange={(multipoleOrder) => update({ multipoleOrder })} />
      <NumericParamControl className="space-tie-range" label="Halbach edge flux" value={settings.edgeFluxT} min={0} max={1000} step={1} suffix="T" onChange={(edgeFluxT) => update({ edgeFluxT })} />
      <label className="amplitude-toggle"><input type="checkbox" checked={settings.showFieldSplats} onChange={(event) => update({ showFieldSplats: event.target.checked })} /><span>Show normalized field splats</span></label>
      <SimulatorParameterControls title="Scene particle count" configuration={settings} onChange={updateAll} fields={[{ type: 'range', path: 'particleCount', label: 'Particle samples', value: settings.particleCount, min: 512, max: 16384, step: 512 }]} />
      <SimulatorViewParameters configuration={settings} onChange={updateAll} cameraClassName="space-tie-camera-settings" particleClassName="space-tie-particle-settings" appearanceCapabilities={{ shape: false, derivativeOrder: false, colorMode: false, color: false }} appearanceFields={[{ key: 'sizeScale', type: 'range', label: 'Particle size', min: 0.25, max: 8, step: 0.05, suffix: 'x' }, { key: 'opacity', type: 'range', label: 'Particle opacity', min: 0, max: 1, step: 0.01 }]} />
    </details>
    <p className="space-tie-caveat">Normal coilgun mode conserves pulse energy. DDF, Grassmannian/twistor, amplituhedron-style coupling, and vacuum-fracture concepts are bounded visualization hypotheses, not established propulsion or energy-transfer physics.</p>
  </aside>;

  return <SimulatorBase className="space-tie-app" headerClassName="space-tie-topbar" mark="ST / ORBIT" title="SPACE TIE ACCELERATOR" subtitle="Discrete helical formation / coilgun energy studies" parameterValue={settings} presetValue={currentPresetValue} onParameterChange={updateAll} actions={<div className="space-tie-top-actions"><button type="button" disabled={!isSceneView} onClick={startOrPause}>{sequenceRunning ? 'Pause sequence' : flightTelemetry.done ? 'Run again' : 'Fire sequence'}</button><button type="button" disabled={!isSceneView} onClick={resetSequence}>Reset</button><button type="button" onClick={() => setPanelVisible((visible) => !visible)}>{panelVisible ? 'Hide params' : 'Show params'}</button></div>} onHome={onBack}>
    {isSceneView ? <div className="space-tie-scene"><Canvas camera={{ position: [13, 10, 24], fov: 42, near: 0.1, far: 120 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><SpaceTieScene settings={settings} massDriver={massDriver} cameraViews={cameraViews} viewMode={cameraView} orbitPlaying={orbitPlaying} launchToken={launchToken} sequenceRunning={sequenceRunning} flightTelemetry={flightTelemetry} onTelemetry={setFlightTelemetry} onSequenceComplete={() => setSequenceRunning(false)} onUserInteraction={() => { setCameraView(null); update({ cameraViewMode: null }); }} /></Canvas></div> : <div className="space-tie-workspace"><header className="space-tie-workspace-heading"><span>{widget.presentation.toUpperCase()} / {widget.type.toUpperCase()}</span><h2>{widget.label}</h2><p>{widget.description}</p></header><SpaceTieAnalysis settings={settings} budget={budget} pulse={pulse} payload={payload} recoil={recoil} edt={edt} alignment={alignment} layout={layout} /></div>}
    {isSceneView && <CameraPerspectiveToolbar className="simulator-perspective-toolbar space-tie-perspectives" modesClassName="simulator-perspective-modes" views={cameraViews} viewMode={cameraView} orbitPlaying={orbitPlaying} onViewChange={(cameraViewMode) => { setCameraView(cameraViewMode); update({ cameraViewMode }); }} onToggleOrbit={() => setOrbitPlaying((playing) => !playing)} />}
    {isSceneView && <div className="space-tie-view-heading"><span>{widget.label.toUpperCase()}</span><strong>{SPACE_TIE_DESTINATIONS.find((entry) => entry.value === settings.destination)?.label}</strong></div>}
    {isSceneView && <div className="space-tie-scene-readout"><Metric label="Payload speed" value={`${(flightTelemetry.velocityMS / 1000).toFixed(3)} km/s`} /><Metric label="Kinetic energy" value={formatEnergy(flightTelemetry.kineticEnergyJ)} /><Metric label="Sequence" value={flightTelemetry.done ? 'Complete' : sequenceRunning ? `${(flightTelemetry.progress * 100).toFixed(0)}%` : flightTelemetry.progress > 0 ? `Paused ${(flightTelemetry.progress * 100).toFixed(0)}%` : 'Ready'} /><Metric label="Rendered ties" value={`${layout.nodes.length} / ${settings.strandCount} strands`} />{settings.widget === 'mass-driver' && <><Metric label="Predicted exit" value={`${(massDriver.exitVelocityMS / 1000).toFixed(2)} km/s`} /><Metric label="Peak acceleration" value={`${massDriver.peakG.toFixed(1)} g`} /><Metric label="Escape velocity" value={massDriver.reachesEscapeVelocity ? 'Met' : 'Shortfall'} /><Metric label="Payload g-limit" value={massDriver.withinPayloadTolerance ? 'Met' : 'Exceeded'} /><Metric label="Electrical energy" value={formatEnergy(massDriver.electricalEnergyRequiredJ)} /></>}{settings.widget === 'edt-tug' && <><Metric label="Tether thrust estimate" value={`${edt.thrustN.toExponential(2)} N`} /><Metric label="Tether electrical input" value={formatPower(edt.electricalInputW)} /></>}</div>}
    {isSceneView && <div className="space-tie-view-caveat"><span>{widget.label}</span><p>{settings.widget === 'mass-driver' ? massDriver.status : settings.widget === 'vacuum-channel' ? 'The “superfluid fracture” is unvalidated. This view changes only the visual field envelope; its gain is excluded from solar power and coilgun calculations.' : settings.widget === 'qed-profile' ? 'Weak-field QED birefringence is not a vacuum-viscosity force law.' : 'Discrete nodes are a visualization subset. Route lengths and efficiencies are scenario inputs, not mission design values.'}</p></div>}
    {panel}
  </SimulatorBase>;
}

export default SpaceTieAcceleratorSim;
