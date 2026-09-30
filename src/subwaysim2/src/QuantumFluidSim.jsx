import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import {
  compareQuantumHydrodynamicDensity,
  createEulerKortewegState,
  createQuantumState,
  quantumDiagnostics,
  quantumObservables,
  QUANTUM_FLUID_PRESETS,
  stepEulerKorteweg,
  stepGrossPitaevskii
} from './quantumFluidModel.js';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';

const VIEW_OPTIONS = [
  { value: 'side-by-side', label: 'GPE / Euler-Korteweg' },
  { value: 'difference', label: 'Density difference' },
  { value: 'gpe', label: 'GPE only' },
  { value: 'euler-korteweg', label: 'Euler-Korteweg only' }
];

const FIELD_OPTIONS = [
  { value: 'density', label: 'Density' },
  { value: 'phase', label: 'Phase' },
  { value: 'current', label: 'Current magnitude' },
  { value: 'quantum-pressure', label: 'Quantum pressure' }
];

function createGridGeometry(size) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(size * size * 3), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(size * size * 3), 3));
  return geometry;
}

function updateFieldGeometry(geometry, size, observables, field, width = 8) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const color = new Color();
  let values;
  if (field === 'phase') values = observables.phase;
  else if (field === 'current') values = Float64Array.from(observables.currentX, (value, index) => Math.hypot(value, observables.currentY[index]));
  else if (field === 'quantum-pressure') values = observables.quantumPressure;
  else values = observables.density;
  const finiteValues = Array.from(values, (value) => Number.isFinite(value) ? value : 0);
  const maximumMagnitude = Math.max(1e-9, ...finiteValues.map(Math.abs));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const value = finiteValues[index];
      const normalized = field === 'phase'
        ? (value + Math.PI) / (2 * Math.PI)
        : Math.min(1, Math.abs(value) / maximumMagnitude);
      positions[index * 3] = (x / (size - 1) - 0.5) * width;
      positions[index * 3 + 1] = field === 'phase' ? 0.1 : normalized * 1.7;
      positions[index * 3 + 2] = (y / (size - 1) - 0.5) * width;
      if (field === 'phase') color.setHSL(normalized, 0.8, 0.52);
      else if (field === 'quantum-pressure') color.setHSL(value >= 0 ? 0.08 : 0.55, 0.82, 0.3 + normalized * 0.35);
      else color.setHSL(0.58 - normalized * 0.5, 0.82, 0.32 + normalized * 0.3);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function updateHydrodynamicGeometry(geometry, state, width = 8) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const maximumDensity = Math.max(1e-9, ...state.density);
  const color = new Color();
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const index = y * state.size + x;
      const normalized = Math.min(1, state.density[index] / maximumDensity);
      positions[index * 3] = (x / (state.size - 1) - 0.5) * width;
      positions[index * 3 + 1] = normalized * 1.7;
      positions[index * 3 + 2] = (y / (state.size - 1) - 0.5) * width;
      color.setHSL(0.32 - normalized * 0.24, 0.72, 0.3 + normalized * 0.32);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function updateDifferenceGeometry(geometry, size, comparison, width = 9) {
  const positions = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;
  const scale = Math.max(comparison.maximumDifference, 1e-9);
  const color = new Color();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const normalized = comparison.difference[index] / scale;
      positions[index * 3] = (x / (size - 1) - 0.5) * width;
      positions[index * 3 + 1] = Math.abs(normalized) * 1.8;
      positions[index * 3 + 2] = (y / (size - 1) - 0.5) * width;
      color.setHSL(normalized >= 0 ? 0.08 : 0.57, 0.88, 0.34 + Math.abs(normalized) * 0.3);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

function FieldPoints({ geometry, position, visible }) {
  return <points geometry={geometry} position={position} visible={visible}><pointsMaterial size={0.13} vertexColors sizeAttenuation transparent opacity={0.94} /></points>;
}

function QuantumEvolution({ settings, running, resetToken, onTelemetry }) {
  const gpeGeometry = useMemo(() => createGridGeometry(settings.size), [settings.size]);
  const hydrodynamicGeometry = useMemo(() => createGridGeometry(settings.size), [settings.size]);
  const differenceGeometry = useMemo(() => createGridGeometry(settings.size), [settings.size]);
  const stateRef = useRef(null);
  const initialDiagnosticsRef = useRef(null);
  const previousVortexCountRef = useRef(0);
  const phaseSlipsRef = useRef(0);
  const telemetryTimeRef = useRef(0);

  useEffect(() => {
    const quantum = createQuantumState({ size: settings.size, domainSize: settings.domainSize, preset: settings.preset, interaction: settings.interaction });
    const hydrodynamic = createEulerKortewegState(quantum);
    const initial = quantumDiagnostics(quantum);
    stateRef.current = { quantum, hydrodynamic };
    initialDiagnosticsRef.current = initial;
    previousVortexCountRef.current = initial.vortices.length;
    phaseSlipsRef.current = 0;
    const comparison = compareQuantumHydrodynamicDensity(quantum, hydrodynamic);
    updateFieldGeometry(gpeGeometry, settings.size, initial.observables, settings.field);
    updateHydrodynamicGeometry(hydrodynamicGeometry, hydrodynamic);
    updateDifferenceGeometry(differenceGeometry, settings.size, comparison);
  }, [differenceGeometry, gpeGeometry, hydrodynamicGeometry, resetToken, settings.domainSize, settings.field, settings.interaction, settings.preset, settings.size]);

  useEffect(() => () => {
    gpeGeometry.dispose();
    hydrodynamicGeometry.dispose();
    differenceGeometry.dispose();
  }, [differenceGeometry, gpeGeometry, hydrodynamicGeometry]);

  useFrame((_, frameDelta) => {
    const state = stateRef.current;
    if (!state) return;
    if (running) {
      const substeps = Math.max(1, Math.min(5, Math.round(settings.timeScale * 2)));
      const deltaTime = settings.stepSize * settings.timeScale / substeps;
      for (let step = 0; step < substeps; step += 1) {
        stepGrossPitaevskii(state.quantum, deltaTime, { potentialStrength: settings.potentialStrength });
        stepEulerKorteweg(state.hydrodynamic, deltaTime);
      }
    }
    const diagnostics = quantumDiagnostics(state.quantum, initialDiagnosticsRef.current);
    const comparison = compareQuantumHydrodynamicDensity(state.quantum, state.hydrodynamic);
    updateFieldGeometry(gpeGeometry, settings.size, diagnostics.observables, settings.field);
    updateHydrodynamicGeometry(hydrodynamicGeometry, state.hydrodynamic);
    updateDifferenceGeometry(differenceGeometry, settings.size, comparison);
    telemetryTimeRef.current += frameDelta;
    if (telemetryTimeRef.current >= 0.2) {
      telemetryTimeRef.current = 0;
      if (diagnostics.vortices.length !== previousVortexCountRef.current) {
        phaseSlipsRef.current += Math.abs(diagnostics.vortices.length - previousVortexCountRef.current);
        previousVortexCountRef.current = diagnostics.vortices.length;
      }
      onTelemetry({
        time: state.quantum.time,
        norm: diagnostics.norm,
        energy: diagnostics.energy,
        normDrift: diagnostics.normDrift,
        energyDrift: diagnostics.energyDrift,
        vortexCount: diagnostics.vortices.length,
        totalCharge: diagnostics.vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
        phaseSlips: phaseSlipsRef.current,
        rmsDifference: comparison.rmsDifference,
        maximumDifference: comparison.maximumDifference
      });
    }
  });

  const sideBySide = settings.view === 'side-by-side';
  return <group>
    <FieldPoints geometry={gpeGeometry} position={sideBySide ? [-4.6, 0, 0] : [0, 0, 0]} visible={sideBySide || settings.view === 'gpe'} />
    <FieldPoints geometry={hydrodynamicGeometry} position={sideBySide ? [4.6, 0, 0] : [0, 0, 0]} visible={sideBySide || settings.view === 'euler-korteweg'} />
    <FieldPoints geometry={differenceGeometry} position={[0, 0, 0]} visible={settings.view === 'difference'} />
  </group>;
}

function QuantumScene(props) {
  return <>
    <color attach="background" args={['#071117']} />
    <fog attach="fog" args={['#071117', 16, 34]} />
    <ambientLight intensity={0.65} color="#b8dcd5" />
    <directionalLight intensity={1.3} position={[5, 10, 5]} color="#ffe8b5" />
    <gridHelper args={[20, 40, '#244d55', '#112b31']} position={[0, -0.08, 0]} />
    <QuantumEvolution {...props} />
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={8} maxDistance={34} target={[0, 0.5, 0]} />
  </>;
}

function Slider({ label, value, min, max, step, onChange }) {
  return <NumericParamControl className="quantum-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} />;
}

export default function QuantumFluidSim({ onBack }) {
  const [settings, setSettings] = useState({
    size: 32,
    domainSize: 12,
    preset: 'vortex',
    view: 'side-by-side',
    field: 'density',
    interaction: 0.8,
    potentialStrength: 0,
    stepSize: 0.002,
    timeScale: 1
  });
  const [running, setRunning] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [telemetry, setTelemetry] = useState({ time: 0, norm: 0, energy: 0, normDrift: 0, energyDrift: 0, vortexCount: 0, totalCharge: 0, phaseSlips: 0, rmsDifference: 0, maximumDifference: 0 });
  const update = (patch) => setSettings((current) => ({ ...current, ...patch }));

  return <main className="quantum-app">
    <div className="quantum-scene"><Canvas camera={{ position: [11, 9, 13], fov: 43, near: 0.1, far: 90 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><QuantumScene settings={settings} running={running} resetToken={resetToken} onTelemetry={setTelemetry} /></Canvas></div>
    <header className="quantum-topbar"><div><span className="quantum-mark">QFL</span><span><b>QUANTUM FLUID LAB</b><em>Gross-Pitaevskii / Euler-Korteweg</em></span></div><div><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button><button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></div></header>
    <section className="quantum-title"><span>ACTIVE FIELD / COMPLEX ORDER PARAMETER</span><h1>Evolve phase.<br />Measure conservation.</h1><p>Split-step Fourier GPE and finite-difference Euler-Korteweg states advance from identical initial conditions.</p></section>
    <aside className={`quantum-panel ${panelVisible ? '' : 'is-hidden'}`}>
      <div className="quantum-panel-heading"><div><span>PERIODIC GRID / ℏ = m = 1</span><h2>Quantum fluid</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
      <p className="quantum-warning">The hydrodynamic map is singular at vacuum nodes; this implementation uses a declared density floor for finite diagnostics.</p>
      <ParamSelect className="quantum-select" label="Initial state" value={settings.preset} options={QUANTUM_FLUID_PRESETS} onChange={(preset) => update({ preset })} />
      <ParamSelect className="quantum-select" label="View" value={settings.view} options={VIEW_OPTIONS} onChange={(view) => update({ view })} />
      <ParamSelect className="quantum-select" label="GPE field" value={settings.field} options={FIELD_OPTIONS} onChange={(field) => update({ field })} />
      <Slider label="Interaction g" value={settings.interaction} min={0} max={3} step={0.05} onChange={(interaction) => update({ interaction })} />
      <Slider label="Harmonic potential" value={settings.potentialStrength} min={0} max={0.2} step={0.005} onChange={(potentialStrength) => update({ potentialStrength })} />
      <Slider label="Time scale" value={settings.timeScale} min={0.1} max={2} step={0.05} onChange={(timeScale) => update({ timeScale })} />
      <div className="quantum-actions"><button type="button" onClick={() => setResetToken((value) => value + 1)}>Reset identical states</button></div>
      <details open><summary>Conservation</summary>
        <div className="quantum-readout"><span>Simulation time</span><strong>{telemetry.time.toFixed(3)}</strong></div>
        <div className="quantum-readout"><span>Norm</span><strong>{telemetry.norm.toFixed(6)}</strong></div>
        <div className="quantum-readout"><span>Norm drift</span><strong>{telemetry.normDrift.toExponential(2)}</strong></div>
        <div className="quantum-readout"><span>Energy</span><strong>{telemetry.energy.toFixed(5)}</strong></div>
        <div className="quantum-readout"><span>Energy drift</span><strong>{telemetry.energyDrift.toExponential(2)}</strong></div>
      </details>
      <details open><summary>Topology and comparison</summary>
        <div className="quantum-readout"><span>Vortices</span><strong>{telemetry.vortexCount}</strong></div>
        <div className="quantum-readout"><span>Total winding</span><strong>{telemetry.totalCharge}</strong></div>
        <div className="quantum-readout"><span>Phase-slip events</span><strong>{telemetry.phaseSlips}</strong></div>
        <div className="quantum-readout"><span>Density RMS delta</span><strong>{telemetry.rmsDifference.toExponential(2)}</strong></div>
        <div className="quantum-readout"><span>Maximum delta</span><strong>{telemetry.maximumDifference.toExponential(2)}</strong></div>
      </details>
    </aside>
  </main>;
}