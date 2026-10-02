import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import {
  AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY,
  AMPLITUDE_GRAVITY_PATH_SAMPLE_RATE,
  AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS,
  AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY,
  AMPLITUDE_GRAVITY_MODES,
  calculateSystemInvariants,
  calculateWeakFieldObservables,
  compareSystemInvariants,
  createPositiveGrassmannianCell,
  DEFAULT_AMPLITUDE_GRAVITY,
  appendAmplitudeGravityPathSample,
  evaluateAmplitudeChannels,
  evaluateNBodyAmplitudeGravity,
  sanitizeAmplitudeGravity,
  writeAmplitudeGravityPathSegments,
  updateAmplitudeGravityStreamlines
} from './amplitudeGravityModel.js';
import { ColorParamControl, NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { OrbitCameraControls, SimulatorBase } from './lib/SimulatorBase.jsx';

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
  const invariantBaselineRef = useRef(null);
  const telemetryTimerRef = useRef(0);
  const pathHistoryRef = useRef(new Float32Array(INITIAL_BODIES.length * AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY * 3));
  const pathNextIndexRef = useRef(0);
  const pathSampleCountRef = useRef(0);
  const pathSampleTimerRef = useRef(0);
  const pathNeedsUpdateRef = useRef(true);
  const streamlineRefreshRef = useRef(0);
  const streamlineNeedsUpdateRef = useRef(true);
  const pathGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const maximumSegments = INITIAL_BODIES.length * (AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY - 1);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(maximumSegments * 6), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const streamlineGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const positionCount = INITIAL_BODIES.length * AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY * AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS * 2;
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positionCount * 3), 3));
    return geometry;
  }, []);

  useEffect(() => {
    bodiesRef.current = cloneBodies();
    invariantBaselineRef.current = null;
    pathHistoryRef.current.fill(0);
    pathNextIndexRef.current = 0;
    pathSampleCountRef.current = 0;
    pathSampleTimerRef.current = 0;
    pathNeedsUpdateRef.current = true;
  }, [configuration.coupling, configuration.mode, configuration.softening, resetToken]);

  useEffect(() => {
    streamlineNeedsUpdateRef.current = true;
  }, [configuration.coupling, configuration.mode, configuration.softening, configuration.cellGaps[0], configuration.cellGaps[1], configuration.cellGaps[2], configuration.fourthColumnWeight, configuration.streamlineLength, configuration.showStreamlines, resetToken]);

  useEffect(() => {
    if (configuration.showAttractorPaths) {
      pathHistoryRef.current.fill(0);
      pathNextIndexRef.current = 0;
      pathSampleCountRef.current = 0;
      pathSampleTimerRef.current = 0;
    }
    pathNeedsUpdateRef.current = true;
  }, [configuration.showAttractorPaths, resetToken]);

  useEffect(() => {
    pathNeedsUpdateRef.current = true;
  }, [configuration.attractorPathLength]);

  useEffect(() => () => {
    pathGeometry.dispose();
    streamlineGeometry.dispose();
  }, [pathGeometry, streamlineGeometry]);

  useFrame((_, delta) => {
    const bodies = bodiesRef.current;
    const frameDelta = Math.min(delta, 1 / 45) * configuration.timeScale;
    const selected = evaluateNBodyAmplitudeGravity(bodies, configuration);
    const invariants = calculateSystemInvariants(bodies, selected.potential);
    if (!invariantBaselineRef.current) invariantBaselineRef.current = invariants;
    const invariantResiduals = compareSystemInvariants(invariants, invariantBaselineRef.current);
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

    if (configuration.showStreamlines) {
      streamlineRefreshRef.current += delta;
      if (streamlineNeedsUpdateRef.current || (running && streamlineRefreshRef.current >= 0.12)) {
        updateAmplitudeGravityStreamlines(streamlineGeometry.attributes.position.array, bodies, configuration);
        streamlineGeometry.attributes.position.needsUpdate = true;
        streamlineRefreshRef.current = 0;
        streamlineNeedsUpdateRef.current = false;
      }
    }

    if (configuration.showAttractorPaths) {
      pathSampleTimerRef.current += delta;
      let sampled = false;
      if (pathSampleCountRef.current === 0 || (running && pathSampleTimerRef.current >= 1 / AMPLITUDE_GRAVITY_PATH_SAMPLE_RATE)) {
        pathNextIndexRef.current = appendAmplitudeGravityPathSample(pathHistoryRef.current, bodies, pathNextIndexRef.current);
        pathSampleCountRef.current = Math.min(pathSampleCountRef.current + 1, AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY);
        pathSampleTimerRef.current = 0;
        sampled = true;
      }
      if (pathNeedsUpdateRef.current || sampled) {
        const visiblePointCount = Math.round(configuration.attractorPathLength * AMPLITUDE_GRAVITY_PATH_SAMPLE_RATE) + 1;
        const vertexCount = writeAmplitudeGravityPathSegments(
          pathGeometry.attributes.position.array,
          pathHistoryRef.current,
          pathNextIndexRef.current,
          pathSampleCountRef.current,
          bodies.length,
          visiblePointCount
        );
        pathGeometry.setDrawRange(0, vertexCount);
        pathGeometry.attributes.position.needsUpdate = true;
        pathNeedsUpdateRef.current = false;
      }
    }

    telemetryTimerRef.current += delta;
    if (telemetryTimerRef.current > 0.2) {
      telemetryTimerRef.current = 0;
      onTelemetry({
        potential: selected.potential,
        photonDiagnostic: selected.photonDiagnostic,
        forceResidual: Math.hypot(...selected.forceResidual),
        maximumDifference: Math.max(...differences),
        bodyDifferences: differences,
        ...invariantResiduals
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
      <lineSegments name="amplitude-gravity-streamlines" geometry={streamlineGeometry} visible={configuration.showStreamlines} frustumCulled={false}>
        <lineBasicMaterial color={configuration.streamlineColor} transparent opacity={configuration.streamlineOpacity} depthWrite={false} />
      </lineSegments>
      <lineSegments name="amplitude-gravity-attractor-paths" geometry={pathGeometry} visible={configuration.showAttractorPaths} frustumCulled={false}>
        <lineBasicMaterial color={configuration.streamlineColor} transparent opacity={configuration.streamlineOpacity} depthWrite={false} />
      </lineSegments>
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
      <OrbitCameraControls cameraParams={{ minDistance: 7, maxDistance: 34 }} />
    </>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix = '' }) {
  return <NumericParamControl className="amplitude-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} suffix={suffix} />;
}

export default function AmplitudeGravitySim({ onBack }) {
  const [configuration, setConfiguration] = useState(() => ({ ...DEFAULT_AMPLITUDE_GRAVITY, timeScale: 0.42 }));
  const [running, setRunning] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);
  const [telemetry, setTelemetry] = useState({ potential: 0, photonDiagnostic: 0, forceResidual: 0, maximumDifference: 0, bodyDifferences: [], energyDrift: 0, momentumResidual: 0, angularMomentumResidual: 0 });
  const settings = sanitizeAmplitudeGravity(configuration);
  const cell = useMemo(() => createPositiveGrassmannianCell(settings), [settings.cellGaps.join(','), settings.fourthColumnWeight]);
  const sampleChannels = useMemo(() => evaluateAmplitudeChannels({ distance: 3, massProduct: 1, chargeProduct: -1 }, settings), [settings]);
  const weakField = useMemo(() => calculateWeakFieldObservables({ centralMass: 12, semiMajorAxis: 3.2, eccentricity: 0.2, impactParameter: 4, asymptoticSpeed: 2 }, settings), [settings]);
  const update = (patch) => setConfiguration((current) => ({ ...current, ...patch }));
  const updateGap = (index, value) => update({ cellGaps: settings.cellGaps.map((gap, gapIndex) => gapIndex === index ? value : gap) });

  return (
    <SimulatorBase className="amplitude-app" headerClassName="amplitude-topbar" mark="AMP" markClassName="amplitude-mark" title="AMPLITUDE GEOMETRY GRAVITY LAB" subtitle="Positive geometry / EFT comparison" actions={<><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button><button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></>} onHome={onBack}>
      <div className="amplitude-scene"><Canvas camera={{ position: [10, 8, 12], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><AmplitudeScene configuration={{ ...settings, timeScale: configuration.timeScale }} running={running} resetToken={resetToken} onTelemetry={setTelemetry} /></Canvas></div>
      <section className="amplitude-title"><span>ACTIVE FIELD / N-BODY AMPLITUDE PROXY</span><h1>Geometric gravity.<br />Conservation of motion.</h1><p>Compare a Newtonian reference, spin-2 EFT proxy, and an explicitly speculative QED derived scattering gravituhedron modulation.</p></section>
      <aside className={`amplitude-panel ${panelVisible ? '' : 'is-hidden'}`}>
        <div className="amplitude-panel-heading"><div><span>GR(2,4) / TOP CELL</span><h2>Amplitude gravity</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
        <p className="amplitude-warning">QED photon exchange does not itself produce gravity. The gravity channel here is a spin-2 EFT proxy; “gravituhedron” is a testable visualization hypothesis.</p>
        <ParamSelect className="amplitude-select" label="Gravity model" value={settings.mode} options={AMPLITUDE_GRAVITY_MODES} onChange={(mode) => update({ mode })} />
        <label className="amplitude-toggle"><input type="checkbox" checked={settings.showDifference} onChange={(event) => update({ showDifference: event.target.checked })} /><span>Show acceleration difference from Newtonian</span></label>
        <label className="amplitude-toggle"><input type="checkbox" checked={settings.showStreamlines} onChange={(event) => update({ showStreamlines: event.target.checked })} /><span>Show gravitational streamlines</span></label>
        <Slider label="Streamline length" value={settings.streamlineLength} min={1} max={24} step={0.1} onChange={(streamlineLength) => update({ streamlineLength })} />
        <label className="amplitude-toggle"><input type="checkbox" checked={settings.showAttractorPaths} onChange={(event) => update({ showAttractorPaths: event.target.checked })} /><span>Show attractor paths</span></label>
        <Slider label="Attractor path duration" value={settings.attractorPathLength} min={1} max={12} step={0.1} onChange={(attractorPathLength) => update({ attractorPathLength })} suffix="s" />
        <ColorParamControl label="Field and path color" value={settings.streamlineColor} onChange={(streamlineColor) => update({ streamlineColor })} />
        <Slider label="Field and path opacity" value={settings.streamlineOpacity} min={0} max={1} step={0.01} onChange={(streamlineOpacity) => update({ streamlineOpacity })} />
        <Slider label="Geometric coupling" value={settings.coupling} min={0} max={4} step={0.01} onChange={(coupling) => update({ coupling })} />
        <Slider label="Correction range" value={settings.correctionRange} min={0.2} max={12} step={0.1} onChange={(correctionRange) => update({ correctionRange })} />
        <Slider label="Softening" value={settings.softening} min={0.01} max={1} step={0.01} onChange={(softening) => update({ softening })} />
        <Slider label="Relativistic scale c" value={settings.speedOfLight} min={5} max={100} step={1} onChange={(speedOfLight) => update({ speedOfLight })} />
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
          <div className="amplitude-invariant"><span>Energy drift</span><strong>{telemetry.energyDrift.toExponential(2)}</strong></div>
          <div className="amplitude-invariant"><span>Momentum residual</span><strong>{telemetry.momentumResidual.toExponential(2)}</strong></div>
          <div className="amplitude-invariant"><span>Angular momentum residual</span><strong>{telemetry.angularMomentumResidual.toExponential(2)}</strong></div>
          <p className="amplitude-note">The photon value is an electromagnetic comparison channel. It is never substituted for the spin-2 gravity kernel.</p>
        </details>
        <details open>
          <summary>Sourced weak-field observables</summary>
          <div className="amplitude-invariant"><span>1PN periapsis / orbit</span><strong>{weakField.periapsisAdvanceRadians.toExponential(2)} rad</strong></div>
          <div className="amplitude-invariant"><span>1PM scattering estimate</span><strong>{weakField.scatteringAngleRadians.toExponential(2)} rad</strong></div>
          <p className="amplitude-note">{weakField.sources.periapsis}</p>
          <p className="amplitude-note">{weakField.sources.scattering}</p>
        </details>
      </aside>
    </SimulatorBase>
  );
}