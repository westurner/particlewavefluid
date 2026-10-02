import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { FTLE_FLOW_PRESETS, integrateTrajectory, sampleFtleGrid, velocityAt } from './ftleModel.js';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { OrbitCameraControls, SimulatorBase } from './lib/SimulatorBase.jsx';

const METRIC_OPTIONS = [
  { value: 'ftle', label: 'FTLE' },
  { value: 'volume', label: 'Volume change |det F|' },
  { value: 'ridge', label: 'Ridge confidence' }
];

const DIRECTION_OPTIONS = [
  { value: 'forward', label: 'Forward-time repulsion' },
  { value: 'backward', label: 'Backward-time attraction' }
];

function flowBounds(flow) {
  return flow === 'double-gyre'
    ? { minX: 0, maxX: 2, minY: 0, maxY: 1 }
    : { minX: -2, maxX: 2, minY: -2, maxY: 2 };
}

function scenePoint(point, bounds, height = 0) {
  const x = ((point[0] - bounds.minX) / (bounds.maxX - bounds.minX) - 0.5) * 12;
  const z = ((point[1] - bounds.minY) / (bounds.maxY - bounds.minY) - 0.5) * 8;
  return [x, height, z];
}

function FtleField({ grid, bounds, metric }) {
  const { geometry, range } = useMemo(() => {
    const values = grid.samples.map((sample) => metric === 'volume'
      ? Math.abs(sample.volumeChange - 1)
      : metric === 'ridge' ? sample.ridgeConfidence : sample.ftle);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = Math.max(maximum - minimum, 1e-9);
    const positions = new Float32Array(grid.samples.length * 3);
    const colors = new Float32Array(grid.samples.length * 3);
    const color = new Color();
    grid.samples.forEach((sample, index) => {
      const normalized = (values[index] - minimum) / span;
      const [x, , z] = scenePoint(sample.point, bounds);
      positions[index * 3] = x;
      positions[index * 3 + 1] = 0.08 + normalized * 1.6;
      positions[index * 3 + 2] = z;
      color.setHSL(0.56 - normalized * 0.5, 0.78, 0.42 + normalized * 0.2);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    nextGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    return { geometry: nextGeometry, range: { minimum, maximum } };
  }, [bounds, grid, metric]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <points geometry={geometry}>
        <pointsMaterial size={0.16} vertexColors sizeAttenuation transparent opacity={0.92} />
      </points>
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12.4, 8.4]} />
        <meshBasicMaterial color="#0b2024" transparent opacity={0.72} />
      </mesh>
      <gridHelper args={[12, 24, '#315b5d', '#173638']} position={[0, 0, 0]} />
      <group userData={{ range }} />
    </group>
  );
}

function Trajectory({ trajectory, bounds }) {
  const points = useMemo(() => trajectory.points.map((point, index) => scenePoint(
    point,
    bounds,
    0.2 + index / Math.max(trajectory.points.length - 1, 1) * 0.65
  )), [bounds, trajectory]);
  return (
    <group>
      <Line points={points} color="#f6cf68" lineWidth={2} />
      <mesh position={points[0]}><sphereGeometry args={[0.14, 16, 12]} /><meshBasicMaterial color="#72d6cc" /></mesh>
      <mesh position={points.at(-1)}><sphereGeometry args={[0.17, 16, 12]} /><meshBasicMaterial color="#f6cf68" /></mesh>
    </group>
  );
}

function FtleScene({ grid, bounds, metric, trajectory }) {
  return (
    <>
      <color attach="background" args={['#071215']} />
      <fog attach="fog" args={['#071215', 14, 30]} />
      <ambientLight intensity={0.7} color="#a6d4d0" />
      <directionalLight position={[5, 9, 4]} intensity={1.4} color="#ffe7b1" />
      <FtleField grid={grid} bounds={bounds} metric={metric} />
      <Trajectory trajectory={trajectory} bounds={bounds} />
      <OrbitCameraControls cameraParams={{ minDistance: 7, maxDistance: 28, target: [0, 0.5, 0] }} />
    </>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return <NumericParamControl className="ftle-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} />;
}

export default function FtleLabSim({ onBack }) {
  const [flow, setFlow] = useState('double-gyre');
  const [direction, setDirection] = useState('forward');
  const [metric, setMetric] = useState('ftle');
  const [horizon, setHorizon] = useState(2.5);
  const [rate, setRate] = useState(0.65);
  const [resolution, setResolution] = useState(28);
  const [seedX, setSeedX] = useState(0.6);
  const [seedY, setSeedY] = useState(0.5);
  const [panelVisible, setPanelVisible] = useState(true);
  const bounds = flowBounds(flow);
  const duration = direction === 'backward' ? -horizon : horizon;
  const sampler = useMemo(() => (point, time) => velocityAt(flow, point, time, { rate }), [flow, rate]);
  const grid = useMemo(() => sampleFtleGrid(
    sampler,
    bounds,
    [resolution, Math.max(10, Math.round(resolution * 2 / 3))],
    0,
    duration,
    { steps: 54, epsilon: 0.002 }
  ), [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, duration, resolution, sampler]);
  const seed = [
    bounds.minX + (bounds.maxX - bounds.minX) * seedX,
    bounds.minY + (bounds.maxY - bounds.minY) * seedY
  ];
  const trajectory = useMemo(() => integrateTrajectory(sampler, seed, 0, duration, 120), [duration, sampler, seedX, seedY, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]);
  const ftleValues = grid.samples.map((sample) => sample.ftle);
  const determinantErrors = grid.samples.map((sample) => Math.abs(sample.determinantF - 1));
  const meanVolume = grid.samples.reduce((sum, sample) => sum + sample.volumeChange, 0) / grid.samples.length;
  const readout = {
    minimum: Math.min(...ftleValues),
    maximum: Math.max(...ftleValues),
    meanVolume,
    maximumDeterminantError: Math.max(...determinantErrors),
    maximumRidge: Math.max(...grid.samples.map((sample) => sample.ridgeConfidence))
  };

  return (
    <SimulatorBase className="ftle-app" headerClassName="ftle-topbar" mark="FTL" markClassName="ftle-mark" title="FINITE-TIME LYAPUNOV LAB" subtitle="Trajectory deformation / coherent structures" actions={<button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button>} onHome={onBack}>
      <div className="ftle-scene"><Canvas camera={{ position: [9, 9, 11], fov: 43, near: 0.1, far: 80 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><FtleScene grid={grid} bounds={bounds} metric={metric} trajectory={trajectory} /></Canvas></div>
      <section className="ftle-title"><span>ACTIVE FIELD / {direction.toUpperCase()} FTLE</span><h1>Trace deformation.<br />Reveal transport.</h1><p>Finite-time diagnostics describe the selected velocity field; they do not by themselves prove a singularity or event horizon.</p></section>
      <aside className={`ftle-panel ${panelVisible ? '' : 'is-hidden'}`}>
        <div className="ftle-panel-heading"><div><span>FLOW MAP / CAUCHY-GREEN</span><h2>FTLE and LCS</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
        <p className="ftle-warning">Forward FTLE highlights repelling material structures. Backward FTLE highlights attracting structures. Particle trajectories remain distinct from acoustic characteristics.</p>
        <ParamSelect className="ftle-select" label="Velocity field" value={flow} options={FTLE_FLOW_PRESETS} onChange={setFlow} />
        <ParamSelect className="ftle-select" label="Time direction" value={direction} options={DIRECTION_OPTIONS} onChange={setDirection} />
        <ParamSelect className="ftle-select" label="Displayed metric" value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
        <Slider label="Integration horizon" value={horizon} min={0.25} max={6} step={0.05} onChange={setHorizon} />
        <Slider label="Flow rate" value={rate} min={0.05} max={1.5} step={0.01} onChange={setRate} />
        <Slider label="Grid columns" value={resolution} min={12} max={42} step={1} onChange={setResolution} />
        <details open><summary>Seed trajectory</summary><Slider label="Seed X" value={seedX} min={0} max={1} step={0.01} onChange={setSeedX} /><Slider label="Seed Y" value={seedY} min={0} max={1} step={0.01} onChange={setSeedY} /></details>
        <details open><summary>Deformation telemetry</summary>
          <div className="ftle-readout"><span>FTLE range</span><strong>{readout.minimum.toFixed(3)} to {readout.maximum.toFixed(3)}</strong></div>
          <div className="ftle-readout"><span>Mean |det F|</span><strong>{readout.meanVolume.toFixed(4)}</strong></div>
          <div className="ftle-readout"><span>Max |det F - 1|</span><strong>{readout.maximumDeterminantError.toExponential(2)}</strong></div>
          <div className="ftle-readout"><span>Max ridge confidence</span><strong>{readout.maximumRidge.toFixed(3)}</strong></div>
          <div className="ftle-readout"><span>Trajectory samples</span><strong>{trajectory.points.length}</strong></div>
        </details>
      </aside>
    </SimulatorBase>
  );
}