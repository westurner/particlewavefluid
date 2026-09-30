import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import {
  AMPLITUDE_GRAVITY_MODES,
  createPositiveGrassmannianCell,
  DEFAULT_AMPLITUDE_GRAVITY,
  evaluateAmplitudeChannels,
  evaluateNBodyAmplitudeGravity,
  sanitizeAmplitudeGravity
} from './amplitudeGravityModel.js';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';

const BODY_COLORS = ['#f5c65d', '#68d5cc', '#e98567', '#8f9ff2', '#d7e77b'];
const INITIAL_BODIES = [
  { name: 'Primary', mass: 12, charge: 1, position: [0, 0, 0], velocity: [0, 0, 0], radius: 0.5 },
  { name: 'A', mass: 0.35, charge: -1, position: [3.2, 0, 0], velocity: [0, 0, 1.86], radius: 0.18 },
  { name: 'B', mass: 0.22, charge: 1, position: [-4.8, 0.15, 0], velocity: [0, 0, -1.52], radius: 0.15 },
  { name: 'C', mass: 0.12, charge: 0, position: [0, -0.1, 6.4], velocity: [-1.32, 0, 0], radius: 0.13 },
  { name: 'D', mass: 0.08, charge: -1, position: [0, 0.2, -8], velocity: [1.16, 0, 0], radius: 0.11 }
];

function cloneBodies() {
  return INITIAL_BODIES.map((body) => ({
    ...body,
    position: [...body.position],
    velocity: [...body.velocity]
  }));
}

function CellGeometry({ cell }) {
  const geometry = useMemo(() => {
    const points = cell.matrix[1].map((parameter, index) => new Vector3(
      (parameter / cell.matrix[0][index] - 1.4) * 0.9,
      index % 2 === 0 ? 0.32 : -0.32,
      0
    ));
    const positions = [];
    for (let first = 0; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        positions.push(...points[first].toArray(), ...points[second].toArray());
      }
    }
    const next = new BufferGeometry();
    next.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    return next;
  }, [cell]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[-5.5, 4.1, -1.5]}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#f1b95c" transparent opacity={0.7} />
      </lineSegments>
      {cell.matrix[1].map((parameter, index) => (
        <mesh key={index} position={[(parameter / cell.matrix[0][index] - 1.4) * 0.9, index % 2 === 0 ? 0.32 : -0.32, 0]}>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshBasicMaterial color={BODY_COLORS[index]} />
        </mesh>
      ))}
    </group>
  );
}

function NBodyField({ configuration, running, resetToken, onTelemetry }) {
  const bodyRefs = useRef([]);
  const haloRefs = useRef([]);
  const bodiesRef = useRef(cloneBodies());
  const telemetryTimerRef = useRef(0);

  useEffect(() => {
    bodiesRef.current = cloneBodies();
  }, [resetToken]);

  useFrame((_, delta) => {
    const bodies = bodiesRef.current;
    const frameDelta = Math.min(delta, 1 / 45) * configuration.timeScale;
    const selected = evaluateNBodyAmplitudeGravity(bodies, configuration);
    const reference = evaluateNBodyAmplitudeGravity(bodies, { ...configuration, mode: 'newtonian' });
    const differences = selected.accelerations.map((acceleration, index) => {
      const absolute = Math.hypot(...acceleration.map((value, axis) => value - reference.accelerations[index][axis]));
      return absolute / Math.max(1e-9, Math.hypot(...reference.accelerations[index]));
    });

    if (running) {
      bodies.forEach((body, index) => {
        for (let axis = 0; axis < 3; axis += 1) {
          body.velocity[axis] += selected.accelerations[index][axis] * frameDelta;
          body.position[axis] += body.velocity[axis] * frameDelta;
        }
      });
    }

    bodies.forEach((body, index) => {
      bodyRefs.current[index]?.position.fromArray(body.position);
      const halo = haloRefs.current[index];
      if (halo) {
        halo.position.fromArray(body.position);
        const scale = 1.25 + Math.min(2.5, differences[index] * 5);
        halo.scale.setScalar(scale);
        halo.visible = configuration.showDifference && index > 0;
      }
    });

    telemetryTimerRef.current += delta;
    if (telemetryTimerRef.current > 0.2) {
      telemetryTimerRef.current = 0;
      onTelemetry({
        potential: selected.potential,
        photonDiagnostic: selected.photonDiagnostic,
        forceResidual: Math.hypot(...selected.forceResidual),
        maximumDifference: Math.max(...differences),
        bodyDifferences: differences
      });
    }
  });

  return (
    <group>
      {INITIAL_BODIES.map((body, index) => (
        <group key={body.name}>
          <mesh ref={(node) => { bodyRefs.current[index] = node; }} position={body.position}>
            <sphereGeometry args={[body.radius, 24, 16]} />
            <meshStandardMaterial color={BODY_COLORS[index]} emissive={BODY_COLORS[index]} emissiveIntensity={index === 0 ? 0.8 : 0.2} roughness={0.45} />
          </mesh>
          <mesh ref={(node) => { haloRefs.current[index] = node; }} position={body.position} visible={false}>
            <sphereGeometry args={[body.radius, 20, 12]} />
            <meshBasicMaterial color="#f7d84c" wireframe transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function AmplitudeScene({ configuration, running, resetToken, onTelemetry }) {
  const cell = useMemo(() => createPositiveGrassmannianCell(configuration), [configuration]);
  return (
    <>
      <color attach="background" args={['#071013']} />
      <fog attach="fog" args={['#071013', 16, 34]} />
      <ambientLight intensity={0.48} color="#8cb9c3" />
      <pointLight position={[0, 3, 0]} intensity={28} color="#f6c75f" distance={18} />
      <gridHelper args={[24, 24, '#244247', '#12272b']} position={[0, -1.4, 0]} />
      <NBodyField configuration={configuration} running={running} resetToken={resetToken} onTelemetry={onTelemetry} />
      <CellGeometry cell={cell} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={7} maxDistance={34} target={[0, 0, 0]} />
    </>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return <NumericParamControl className="amplitude-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} />;
}

export default function AmplitudeGravitySim({ onBack }) {
  const [configuration, setConfiguration] = useState(() => ({ ...DEFAULT_AMPLITUDE_GRAVITY, timeScale: 0.42 }));
  const [running, setRunning] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);
  const [telemetry, setTelemetry] = useState({ potential: 0, photonDiagnostic: 0, forceResidual: 0, maximumDifference: 0, bodyDifferences: [] });
  const settings = sanitizeAmplitudeGravity(configuration);
  const cell = useMemo(() => createPositiveGrassmannianCell(settings), [settings.cellGaps.join(','), settings.fourthColumnWeight]);
  const sampleChannels = useMemo(() => evaluateAmplitudeChannels({ distance: 3, massProduct: 1, chargeProduct: -1 }, settings), [settings]);
  const update = (patch) => setConfiguration((current) => ({ ...current, ...patch }));
  const updateGap = (index, value) => update({ cellGaps: settings.cellGaps.map((gap, gapIndex) => gapIndex === index ? value : gap) });

  return (
    <main className="amplitude-app">
      <div className="amplitude-scene"><Canvas camera={{ position: [10, 8, 12], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><AmplitudeScene configuration={{ ...settings, timeScale: configuration.timeScale }} running={running} resetToken={resetToken} onTelemetry={setTelemetry} /></Canvas></div>
      <header className="amplitude-topbar"><div><span className="amplitude-mark">AMP</span><span><b>AMPLITUDE GEOMETRY GRAVITY LAB</b><em>Positive geometry / EFT comparison</em></span></div><div><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button><button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></div></header>
      <section className="amplitude-title"><span>ACTIVE FIELD / N-BODY AMPLITUDE PROXY</span><h1>Geometry weights.<br />Conservative motion.</h1><p>Compare a Newtonian reference, spin-2 EFT proxy, and explicitly speculative gravituhedron modulation.</p></section>
      <aside className={`amplitude-panel ${panelVisible ? '' : 'is-hidden'}`}>
        <div className="amplitude-panel-heading"><div><span>GR(2,4) / TOP CELL</span><h2>Amplitude gravity</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
        <p className="amplitude-warning">QED photon exchange does not itself produce gravity. The gravity channel here is a spin-2 EFT proxy; “gravituhedron” is a testable visualization hypothesis.</p>
        <ParamSelect className="amplitude-select" label="Gravity model" value={settings.mode} options={AMPLITUDE_GRAVITY_MODES} onChange={(mode) => update({ mode })} />
        <label className="amplitude-toggle"><input type="checkbox" checked={settings.showDifference} onChange={(event) => update({ showDifference: event.target.checked })} /><span>Show acceleration difference from Newtonian</span></label>
        <Slider label="Geometric coupling" value={settings.coupling} min={0} max={4} step={0.01} onChange={(coupling) => update({ coupling })} />
        <Slider label="Correction range" value={settings.correctionRange} min={0.2} max={12} step={0.1} onChange={(correctionRange) => update({ correctionRange })} />
        <Slider label="Softening" value={settings.softening} min={0.01} max={1} step={0.01} onChange={(softening) => update({ softening })} />
        <Slider label="Time scale" value={configuration.timeScale} min={0} max={1.5} step={0.01} onChange={(timeScale) => update({ timeScale })} />
        <div className="amplitude-actions"><button type="button" onClick={() => setResetToken((value) => value + 1)}>Reset bodies</button></div>
        <details open>
          <summary>Positive cell</summary>
          {settings.cellGaps.map((gap, index) => <Slider key={index} label={`Gap ${index + 1}`} value={gap} min={0.05} max={3} step={0.01} onChange={(value) => updateGap(index, value)} />)}
          <Slider label="Column 4 weight" value={settings.fourthColumnWeight} min={0.05} max={3} step={0.01} onChange={(fourthColumnWeight) => update({ fourthColumnWeight })} />
          <div className="amplitude-minors">{Object.entries(cell.minors).map(([name, value]) => <div key={name}><span>Δ{name}</span><strong>{value.toFixed(3)}</strong></div>)}</div>
          <div className="amplitude-invariant"><span>Plücker residual</span><strong>{cell.pluckerResidual.toExponential(2)}</strong></div>
          <div className="amplitude-invariant"><span>Boundary proximity</span><strong>{cell.boundaryProximity.toFixed(3)}</strong></div>
        </details>
        <details open>
          <summary>Channel diagnostics</summary>
          <div className="amplitude-invariant"><span>Photon exchange sample</span><strong>{sampleChannels.photonExchange.toExponential(2)}</strong></div>
          <div className="amplitude-invariant"><span>Spin-2 tree sample</span><strong>{sampleChannels.spin2Tree.toExponential(2)}</strong></div>
          <div className="amplitude-invariant"><span>Max model delta</span><strong>{(telemetry.maximumDifference * 100).toFixed(2)}%</strong></div>
          <div className="amplitude-invariant"><span>Force residual</span><strong>{telemetry.forceResidual.toExponential(2)}</strong></div>
          <div className="amplitude-invariant"><span>Potential proxy</span><strong>{telemetry.potential.toFixed(3)}</strong></div>
          <p className="amplitude-note">The photon value is an electromagnetic comparison channel. It is never substituted for the spin-2 gravity kernel.</p>
        </details>
      </aside>
    </main>
  );
}