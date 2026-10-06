import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Quaternion, Vector3 } from 'three';
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
  integrateNBodyVelocityVerlet,
  sanitizeAmplitudeGravity,
  writeAmplitudeGravityPathSegments,
  updateAmplitudeGravityStreamlines
} from './amplitudeGravityModel.js';
import { ColorParamControl, NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { TelemetryHud } from './lib/TelemetryHud.jsx';
import { CameraPerspectiveToolbar, OrbitalTrackingParameters, ParticleAppearanceSettings, PerspectiveOrbitControls, SimulatorBase } from './lib/SimulatorBase.jsx';
import { DEFAULT_CAMERA_VIEWS, DEFAULT_ORBITAL_TRACKING_CONFIGURATION, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION } from './lib/simulator-base.js';
import {
  ORBIT_VALIDATION_DATASET_CITATIONS,
  JPL_DE441_ORBIT_INTERVAL,
  MERCURY_PERIHELION_REFERENCE,
  ORBIT_VALIDATION_MODEL_EXTENSION_PLAN,
  ORBIT_VALIDATION_DESCRIPTION,
  scoreObservedOrbits
} from './orbitalValidationModel.js';
import {
  createHistoricMissionTrajectory,
  createSolarSystemBodies,
  createSolarSystemOrbitPaths,
  createSpacecraftLaunchBody,
  HISTORIC_MISSIONS,
  PLANET_DIAMETER_MODES,
  SOLAR_SYSTEM_DATASET_CITATIONS,
  propagateKeplerOrbit,
  SOLAR_SYSTEM_ATTRACTOR_MODELS,
  SOLAR_SYSTEM_GRAVITATIONAL_CONSTANT,
  SOLAR_SYSTEM_SCENE_SCALE
} from './solarSystemModel.js';

const BODY_COLORS = ['#f5c65d', '#68d5cc', '#e98567', '#8f9ff2', '#d7e77b'];
const INITIAL_BODIES = [
  { name: 'Primary', mass: 12, charge: 1, position: [0, 0, 0], velocity: [0, 0, 0], radius: 0.5 },
  { name: 'A', mass: 0.35, charge: -1, position: [3.2, 0, 0], velocity: [0, 0, 1.86], radius: 0.18 },
  { name: 'B', mass: 0.22, charge: 1, position: [-4.8, 0.15, 0], velocity: [0, 0, -1.52], radius: 0.15 },
  { name: 'C', mass: 0.12, charge: 0, position: [0, -0.1, 6.4], velocity: [-1.32, 0, 0], radius: 0.13 },
  { name: 'D', mass: 0.08, charge: -1, position: [0, 0.2, -8], velocity: [1.16, 0, 0], radius: 0.11 }
];

function cloneBodies() {
  return INITIAL_BODIES.map((body, index) => ({
    ...body,
    id: body.name,
    color: BODY_COLORS[index],
    position: [...body.position],
    velocity: [...body.velocity]
  }));
}

function cloneBodySet(bodies) {
  return bodies.map((body) => ({ ...body, position: [...body.position], displayPosition: [...(body.displayPosition ?? body.position)], velocity: [...body.velocity] }));
}

function createStaticLineGeometry(points) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => positions.set(point, index * 3));
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

function PlanetaryOrbitTracks({ paths }) {
  return paths.map((path) => <PlanetaryOrbitLine key={path.id} path={path} />);
}

function PlanetaryOrbitLine({ path }) {
  const geometry = useMemo(() => createStaticLineGeometry(path.positions), [path]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <line geometry={geometry} frustumCulled={false}><lineBasicMaterial color={path.color} transparent opacity={0.34} depthWrite={false} /></line>;
}

function HistoricMissionPath({ trajectory }) {
  const geometry = useMemo(() => createStaticLineGeometry(trajectory?.waypoints.map(({ position }) => position) ?? []), [trajectory]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!trajectory) return null;
  return <group>
    <line geometry={geometry} frustumCulled={false}><lineBasicMaterial color="#f4b85c" transparent opacity={0.9} /></line>
    {trajectory.waypoints.map((waypoint, index) => <mesh key={`${waypoint.body}-${waypoint.date}`} position={waypoint.position}>
      <sphereGeometry args={[index === 0 ? 0.09 : 0.075, 12, 8]} />
      <meshBasicMaterial color={index === 0 ? '#fff1a7' : '#f4b85c'} />
    </mesh>)}
  </group>;
}

function ValidationTrackLine({ bodyId, points, color, opacity }) {
  const geometry = useMemo(() => createStaticLineGeometry(points.map(([x, y, z]) => [
    x * SOLAR_SYSTEM_SCENE_SCALE,
    z * SOLAR_SYSTEM_SCENE_SCALE,
    -y * SOLAR_SYSTEM_SCENE_SCALE
  ])), [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <line name={`validation-${bodyId}`} geometry={geometry} frustumCulled={false}>
    <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
  </line>;
}

function ValidationTrackOverlay({ tracks }) {
  return <group>
    {tracks.map((track, index) => <group key={track.bodyId}>
      <ValidationTrackLine bodyId={`${track.bodyId}-jpl`} points={track.observed} color="#a6dce0" opacity={0.8} />
      <ValidationTrackLine bodyId={`${track.bodyId}-model`} points={track.predicted} color={BODY_COLORS[index % BODY_COLORS.length]} opacity={0.95} />
    </group>)}
  </group>;
}

function formatMass(mass) {
  return `${(mass * 1.98847e30).toExponential(3)} kg`;
}

function formatDistanceFromSun(position) {
  return `${(Math.hypot(...position) / SOLAR_SYSTEM_SCENE_SCALE).toFixed(3)} AU`;
}

function formatVector(values) {
  return `[${values.map((value) => value.toFixed(6)).join(', ')}]`;
}

function updateMoonPositions(bodies, epochMs) {
  const bodiesById = new Map(bodies.map((body) => [body.id, body]));
  bodies.forEach((body) => {
    if (!body.moonOrbit) return;
    const parent = bodiesById.get(body.parentId);
    const relative = propagateKeplerOrbit(body.moonOrbit, epochMs);
    if (!parent || !relative) return;
    const displayScale = body.moonOrbit.displayScale ?? 1;
    body.position[0] = parent.position[0] + relative.x * SOLAR_SYSTEM_SCENE_SCALE;
    body.position[1] = parent.position[1] + relative.z * SOLAR_SYSTEM_SCENE_SCALE;
    body.position[2] = parent.position[2] - relative.y * SOLAR_SYSTEM_SCENE_SCALE;
    body.displayPosition = [
      parent.position[0] + relative.x * SOLAR_SYSTEM_SCENE_SCALE * displayScale,
      parent.position[1] + relative.z * SOLAR_SYSTEM_SCENE_SCALE * displayScale,
      parent.position[2] - relative.y * SOLAR_SYSTEM_SCENE_SCALE * displayScale
    ];
    body.velocity[0] = parent.velocity[0] + relative.vx * 365.25 * SOLAR_SYSTEM_SCENE_SCALE;
    body.velocity[1] = parent.velocity[1] + relative.vz * 365.25 * SOLAR_SYSTEM_SCENE_SCALE;
    body.velocity[2] = parent.velocity[2] - relative.vy * 365.25 * SOLAR_SYSTEM_SCENE_SCALE;
  });
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

function NBodyField({ configuration, running, resetToken, initialBodies, onTelemetry }) {
  const bodyRefs = useRef([]);
  const spinRefs = useRef([]);
  const haloRefs = useRef([]);
  const bodiesRef = useRef(cloneBodySet(initialBodies));
  const simulationYearsRef = useRef(0);
  const invariantBaselineRef = useRef(null);
  const telemetryTimerRef = useRef(0);
  const pathHistoryRef = useRef(new Float32Array(initialBodies.length * AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY * 3));
  const pathNextIndexRef = useRef(0);
  const pathSampleCountRef = useRef(0);
  const pathSampleTimerRef = useRef(0);
  const pathNeedsUpdateRef = useRef(true);
  const streamlineRefreshRef = useRef(0);
  const streamlineNeedsUpdateRef = useRef(true);
  const fixedBodyIndices = useMemo(() => new Set(initialBodies.flatMap((body, index) => body.moonOrbit ? [index] : [])), [initialBodies]);
  const moonEpochMs = initialBodies.find((body) => body.moonOrbit)?.moonOrbit.epochMs ?? 0;
  const pathGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const maximumSegments = initialBodies.length * (AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY - 1);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(maximumSegments * 6), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, [initialBodies.length]);
  const streamlineGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const positionCount = initialBodies.length * AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY * AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS * 2;
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positionCount * 3), 3));
    return geometry;
  }, [initialBodies.length]);

  useEffect(() => {
    bodiesRef.current = cloneBodySet(initialBodies);
    simulationYearsRef.current = 0;
    invariantBaselineRef.current = null;
    pathHistoryRef.current.fill(0);
    pathNextIndexRef.current = 0;
    pathSampleCountRef.current = 0;
    pathSampleTimerRef.current = 0;
    pathNeedsUpdateRef.current = true;
  }, [configuration.coupling, configuration.mode, configuration.softening, initialBodies, resetToken]);

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

    if (running && frameDelta > 0) {
      const startYears = simulationYearsRef.current;
      integrateNBodyVelocityVerlet(bodies, frameDelta, configuration, {
        fixedBodyIndices,
        initialAccelerations: selected.accelerations,
        afterDrift: (elapsedYears) => updateMoonPositions(bodies, moonEpochMs + (startYears + elapsedYears) * 365.25 * 86400000)
      });
      simulationYearsRef.current += frameDelta;
      bodies.forEach((body) => {
        if (!body.moonOrbit) body.displayPosition = body.position;
      });
    }

    bodies.forEach((body, index) => {
      bodyRefs.current[index]?.position.fromArray(body.displayPosition ?? body.position);
      const rotationPeriodHours = initialBodies[index]?.rotationPeriodHours;
      if (running && rotationPeriodHours) {
        spinRefs.current[index].rotation.y += frameDelta * 24 * 365.25 * 2 * Math.PI / Math.abs(rotationPeriodHours);
      }
      const halo = haloRefs.current[index];
      if (halo) {
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
        selectedBody: bodies.find(({ id }) => id === configuration.selectedBodyId) ?? null,
        ...invariantResiduals
      });
    }
  });

  return (
    <group>
      {initialBodies.map((body, index) => {
        const pole = body.rotation?.pole;
        const orientation = pole
          ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...pole).normalize()).toArray()
          : undefined;
        const color = body.color ?? BODY_COLORS[index % BODY_COLORS.length];
        const baseSpin = (body.rotation?.primeMeridianDeg ?? 0) * Math.PI / 180;
        return <group key={body.id ?? body.name} ref={(node) => { bodyRefs.current[index] = node; }} position={body.position} quaternion={orientation}>
          <mesh ref={(node) => { spinRefs.current[index] = node; }} rotation={[0, baseSpin, 0]}>
            <sphereGeometry args={[body.radius * (configuration.planetDiameterMode === 'actual' ? 1 : configuration.particleAppearance.sizeScale), 24, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={body.id === 'Sun' || index === 0 ? 0.8 : 0.12} roughness={0.45} transparent={configuration.particleAppearance.opacity < 1} opacity={configuration.particleAppearance.opacity} />
          </mesh>
          {pole && <mesh position={[0, body.radius * 1.25, 0]}>
            <cylinderGeometry args={[0.009, 0.009, body.radius * 1.1, 6]} />
            <meshBasicMaterial color="#fff1a7" transparent opacity={0.72} />
          </mesh>}
          <mesh ref={(node) => { haloRefs.current[index] = node; }} visible={false}>
            <sphereGeometry args={[body.radius * (configuration.planetDiameterMode === 'actual' ? 1 : configuration.particleAppearance.sizeScale), 20, 12]} />
            <meshBasicMaterial color="#f7d84c" wireframe transparent opacity={0.75} />
          </mesh>
        </group>;
      })}
      <lineSegments name="amplitude-gravity-streamlines" geometry={streamlineGeometry} visible={configuration.showStreamlines} frustumCulled={false}>
        <lineBasicMaterial color={configuration.streamlineColor} transparent opacity={configuration.streamlineOpacity} depthWrite={false} />
      </lineSegments>
      <lineSegments name="amplitude-gravity-attractor-paths" geometry={pathGeometry} visible={configuration.showAttractorPaths} frustumCulled={false}>
        <lineBasicMaterial color={configuration.streamlineColor} transparent opacity={configuration.streamlineOpacity} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function AmplitudeScene({ configuration, running, resetToken, initialBodies, orbitPaths, historicTrajectory, validationTracks, onTelemetry, viewMode, orbitPlaying, focusRequest, onUserInteraction }) {
  const cell = useMemo(() => createPositiveGrassmannianCell(configuration), [configuration]);
  return (
    <>
      <color attach="background" args={['#071013']} />
      {/* <fog attach="fog" args={['#071013', 16, 34]} /> */}
      <ambientLight intensity={0.48} color="#8cb9c3" />
      <pointLight position={[0, 3, 0]} intensity={28} color="#f6c75f" distance={18} />
      {configuration.attractorModel === 'illustrative' && <gridHelper args={[24, 24, '#244247', '#12272b']} position={[0, -1.4, 0]} />}
      {configuration.showPlanetaryOrbits && configuration.attractorModel !== 'illustrative' && <PlanetaryOrbitTracks paths={orbitPaths} />}
      <HistoricMissionPath trajectory={historicTrajectory} />
      {configuration.showValidationTracks && validationTracks?.length > 0 && <ValidationTrackOverlay tracks={validationTracks} />}
      <NBodyField key={`${initialBodies.length}:${configuration.fieldEpoch ?? 0}`} configuration={configuration} running={running} resetToken={resetToken} initialBodies={initialBodies} onTelemetry={onTelemetry} />
      {configuration.attractorModel === 'illustrative' && <CellGeometry cell={cell} />}
      <PerspectiveOrbitControls viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={configuration} cameraParams={{ minDistance: 1e-8, maxDistance: 34 }} focusRequest={focusRequest} onUserInteraction={onUserInteraction} />
    </>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix = '' }) {
  return <NumericParamControl className="amplitude-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} suffix={suffix} />;
}

function validationBodyLabel(id) {
  return ({
    EarthMoonBarycenter: 'Earth–Moon barycenter',
    MarsBarycenter: 'Mars system',
    JupiterBarycenter: 'Jupiter system',
    SaturnBarycenter: 'Saturn system',
    UranusBarycenter: 'Uranus system',
    NeptuneBarycenter: 'Neptune system'
  })[id] ?? id;
}

function OrbitalValidationPanel({ configuration, selectedResult, scores, onChange, onRun, isRunning, isStale, report, reports, selectedReportId, onSelectReport, error }) {
  const setOption = (key, value) => onChange({ ...configuration, [key]: value });
  return <details className="orbital-validation-panel" open>
    <summary>Observed orbit validation</summary>
    <p className="amplitude-note">{ORBIT_VALIDATION_DESCRIPTION} Reference: JPL Horizons DE441, 2026-10-06 to 2026-11-05.</p>
    <button type="button" className="amplitude-validation-run" onClick={onRun} disabled={isRunning}>{isRunning ? 'Running model tests…' : 'Run all model tests'}</button>
    {reports.length > 0 && <ParamSelect
      className="amplitude-select"
      label="Validation report"
      value={selectedReportId ?? reports[0].id}
      options={reports.map((entry) => ({ value: entry.id, label: `${new Date(entry.runAt).toLocaleString()} · best ${Math.min(...entry.scores.map((score) => score.scorePoints)).toFixed(1)} pts` }))}
      onChange={onSelectReport}
    />}
    {report && <p className={`amplitude-note${isStale ? ' is-warning' : ''}`}>{isStale ? 'Settings changed since this report ran; rerun the model tests to refresh it.' : `Report completed ${new Date(report.runAt).toLocaleString()}.`}</p>}
    {error && <p className="amplitude-note is-warning">Validation failed: {error}</p>}
    {!report && !isRunning && <p className="amplitude-note">Run the suite to create a report for every registered gravity model.</p>}
    <div className="orbital-validation-readout">
      <span>Selected model score</span>
      <strong>{selectedResult ? `${selectedResult.scorePoints.toFixed(1)} pts` : report ? 'Unavailable' : 'Not run'}</strong>
    </div>
    {selectedResult && <>
      <div className="amplitude-invariant"><span>Planet-system position RMS</span><strong>{selectedResult.positionRmsKm.toFixed(0)} km</strong></div>
      <div className="amplitude-invariant"><span>Planet-system velocity RMS</span><strong>{selectedResult.velocityRmsMetersPerSecond.toFixed(3)} m/s</strong></div>
      <div className="amplitude-invariant"><span>Pair-distance RMS</span><strong>{selectedResult.pairDistanceRmsKm.toFixed(0)} km</strong></div>
      <div className="amplitude-invariant"><span>Mercury perihelion excess</span><strong>{selectedResult.mercuryPerihelionArcsecondsPerCentury == null ? 'Not resolved' : `${selectedResult.mercuryPerihelionArcsecondsPerCentury.toFixed(3)}″/century`}</strong></div>
    </>}
    <p className="amplitude-note">Reference: {MERCURY_PERIHELION_REFERENCE.valueArcsecondsPerCentury.toFixed(3)}″/century relativistic residual from MESSENGER ranging. Source: <a className="amplitude-source-link" href={MERCURY_PERIHELION_REFERENCE.source} target="_blank" rel="noreferrer">Park et al. 2017</a>. Vectors: <a className="amplitude-source-link" href={JPL_DE441_ORBIT_INTERVAL.source} target="_blank" rel="noreferrer">JPL Horizons</a>.</p>
    <label className="amplitude-toggle"><input type="checkbox" checked={configuration.showModelDifferences} onChange={(event) => setOption('showModelDifferences', event.target.checked)} /><span>Show differences between gravity models</span></label>
    {configuration.showModelDifferences && report && <div className="orbit-validation-table-wrap">
      <table className="orbit-validation-table">
        <thead><tr><th>Model</th><th>Score pts</th><th>Pos RMS km</th><th>Vel RMS m/s</th><th>Distance RMS km</th><th>Mercury″/cy</th></tr></thead>
        <tbody>{scores.map((result) => <tr key={result.mode} className={result.mode === selectedResult?.mode ? 'is-selected' : ''}>
          <th>{result.label}</th><td>{result.scorePoints.toFixed(1)}</td><td>{result.positionRmsKm.toFixed(0)}</td><td>{result.velocityRmsMetersPerSecond.toFixed(3)}</td><td>{result.pairDistanceRmsKm.toFixed(0)}</td><td>{result.mercuryPerihelionArcsecondsPerCentury == null ? 'N/A' : result.mercuryPerihelionArcsecondsPerCentury.toFixed(3)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <label className="amplitude-toggle"><input type="checkbox" checked={configuration.showValidationTracks} onChange={(event) => setOption('showValidationTracks', event.target.checked)} /><span>Show JPL and predicted tracks together</span></label>
    {configuration.showValidationTracks && <div className="orbit-validation-legend"><span><i className="is-observed" />JPL observations</span><span><i className="is-predicted" />Selected model</span></div>}
    <label className="amplitude-toggle"><input type="checkbox" checked={configuration.showPairDistanceContributions} onChange={(event) => setOption('showPairDistanceContributions', event.target.checked)} /><span>Show pair distances contributing to score</span></label>
    {configuration.showPairDistanceContributions && selectedResult && <div className="orbit-validation-table-wrap">
      <table className="orbit-validation-table orbit-validation-distance-table">
        <thead><tr><th>Attractor pair</th><th>Start JPL AU</th><th>End JPL AU</th><th>End model AU</th><th>RMS Δ km</th><th>Samples</th></tr></thead>
        <tbody>{selectedResult.pairDistances.map((distance) => <tr key={`${distance.firstId}-${distance.secondId}`}>
          <th>{validationBodyLabel(distance.firstId)} / {validationBodyLabel(distance.secondId)}</th><td>{distance.observedStartAU.toFixed(6)}</td><td>{distance.observedEndAU.toFixed(6)}</td><td>{distance.predictedEndAU.toFixed(6)}</td><td>{distance.residualRmsKm.toFixed(1)}</td>
          <td><details><summary>{distance.samples.length} intervals</summary><div className="orbit-validation-distance-samples">{distance.samples.map((sample) => <p key={sample.day}>D+{sample.day}: JPL {sample.observedAU.toFixed(6)} AU / model {sample.predictedAU.toFixed(6)} AU / Δ {sample.residualKm.toFixed(1)} km</p>)}</div></details></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </details>;
}

export default function AmplitudeGravitySim({ onBack }) {
  const [configuration, setConfiguration] = useState(() => ({
    ...DEFAULT_AMPLITUDE_GRAVITY,
    ...DEFAULT_ORBITAL_TRACKING_CONFIGURATION,
    mode: 'newtonian',
    attractorModel: 'solar-system',
    flightMode: 'explore',
    ephemerisDate: new Date().toISOString().slice(0, 10),
    selectedBodyId: 'Earth',
    planetDiameterMode: 'illustrative',
    illustrativePlanetScale: 1,
    showPlanetaryOrbits: true,
    historicMissionId: 'none',
    launchOriginId: 'Earth',
    launchSpeedKmPerSecond: 12,
    launchHeadingDeg: 0,
    launchInclinationDeg: 0,
    showModelDifferences: true,
    showValidationTracks: false,
    showPairDistanceContributions: false,
    particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION },
    timeScale: 0.42
  }));
  const presetConfiguration = useRef(configuration);
  const validationRunSequence = useRef(0);
  const focusRequestSequence = useRef(0);
  const [running, setRunning] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [launchRequest, setLaunchRequest] = useState(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const [viewMode, setViewMode] = useState('ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [focusRequest, setFocusRequest] = useState(null);
  const [validationReports, setValidationReports] = useState([]);
  const [selectedValidationReportId, setSelectedValidationReportId] = useState(null);
  const [validationRunning, setValidationRunning] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [telemetry, setTelemetry] = useState({ potential: 0, photonDiagnostic: 0, forceResidual: 0, maximumDifference: 0, bodyDifferences: [], energyDrift: 0, momentumResidual: 0, angularMomentumResidual: 0 });
  const settings = sanitizeAmplitudeGravity(configuration);
  const cell = useMemo(() => createPositiveGrassmannianCell(settings), [settings.cellGaps.join(','), settings.fourthColumnWeight]);
  const sampleChannels = useMemo(() => evaluateAmplitudeChannels({ distance: 3, massProduct: 1, chargeProduct: -1 }, settings), [settings]);
  const weakField = useMemo(() => calculateWeakFieldObservables({ centralMass: 12, semiMajorAxis: 3.2, eccentricity: 0.2, impactParameter: 4, asymptoticSpeed: 2 }, settings), [settings]);
  const update = (patch) => setConfiguration((current) => ({ ...current, ...patch }));
  const updateGap = (index, value) => update({ cellGaps: settings.cellGaps.map((gap, gapIndex) => gapIndex === index ? value : gap) });
  const physicalModel = configuration.attractorModel !== 'illustrative';
  const initialBodies = useMemo(() => {
    if (!physicalModel) return cloneBodies();
    const bodies = createSolarSystemBodies(new Date(`${configuration.ephemerisDate}T12:00:00Z`), {
      includeMajorMoons: configuration.attractorModel === 'solar-system-moons',
      diameterMode: configuration.planetDiameterMode,
      diameterExaggeration: configuration.illustrativePlanetScale
    });
    if (launchRequest) {
      const spacecraft = createSpacecraftLaunchBody(bodies, launchRequest);
      if (spacecraft) bodies.push(spacecraft);
    }
    return bodies;
  }, [physicalModel, configuration.attractorModel, configuration.ephemerisDate, configuration.planetDiameterMode, configuration.illustrativePlanetScale, launchRequest]);
  const activeBodyId = initialBodies.some(({ id }) => id === configuration.selectedBodyId)
    ? configuration.selectedBodyId
    : initialBodies[0]?.id;
  const catalogBody = initialBodies.find(({ id }) => id === activeBodyId) ?? initialBodies[0];
  const selectedBody = telemetry.selectedBody?.id === catalogBody?.id
    ? { ...catalogBody, ...telemetry.selectedBody }
    : catalogBody;
  const orbitPaths = useMemo(() => physicalModel
    ? createSolarSystemOrbitPaths(new Date(`${configuration.ephemerisDate}T12:00:00Z`))
    : [], [physicalModel, configuration.ephemerisDate]);
  const historicTrajectory = useMemo(() => configuration.historicMissionId === 'none'
    ? null
    : createHistoricMissionTrajectory(configuration.historicMissionId), [configuration.historicMissionId]);
  const validationInputSignature = JSON.stringify([
    settings.coupling,
    settings.correctionRange,
    settings.tensorGaussianWaist,
    settings.ddfStrength,
    settings.ddfSpeedLimitMS,
    settings.ddfBaseViscosity,
    settings.grTensorGaussianWaist
  ]);
  const validationReport = validationReports.find(({ id }) => id === selectedValidationReportId) ?? validationReports[0] ?? null;
  const validationScores = validationReport?.scores ?? [];
  const validationReportIsStale = Boolean(validationReport && validationReport.inputSignature !== validationInputSignature);
  const selectedValidationResult = validationScores.find(({ mode }) => mode === settings.mode) ?? validationScores[0] ?? null;
  const runValidation = async () => {
    if (validationRunning) return;
    setValidationRunning(true);
    setValidationError('');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const scores = scoreObservedOrbits({ configuration: settings });
      const report = {
        id: ++validationRunSequence.current,
        runAt: new Date().toISOString(),
        inputSignature: validationInputSignature,
        scores
      };
      setValidationReports((existing) => [report, ...existing].slice(0, 10));
      setSelectedValidationReportId(report.id);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : String(error));
    } finally {
      setValidationRunning(false);
    }
  };
  const sceneConfiguration = {
    ...DEFAULT_ORBITAL_TRACKING_CONFIGURATION,
    ...configuration,
    ...settings,
    selectedBodyId: activeBodyId,
    gravitationalConstant: physicalModel ? SOLAR_SYSTEM_GRAVITATIONAL_CONSTANT : settings.gravitationalConstant,
    softening: physicalModel ? 1e-6 : settings.softening,
    grSpeedOfLight: physicalModel ? settings.grSpeedOfLight * SOLAR_SYSTEM_SCENE_SCALE : settings.grSpeedOfLight,
    particleAppearance: configuration.particleAppearance,
    timeScale: configuration.timeScale
  };
  const bodyOptions = initialBodies.map(({ id, name, parentId }) => ({ value: id, label: parentId ? `${name} / ${parentId}` : name }));
  const flightModeOptions = [
    { value: 'explore', label: 'Explore Solar System' },
    { value: 'orbital-path', label: 'Model an orbital path through the Solar System' },
    { value: 'validation', label: 'Observed-orbit validation' }
  ];
  const missionOptions = [{ value: 'none', label: 'No historic trajectory' }, ...HISTORIC_MISSIONS.map(({ id, label }) => ({ value: id, label }))];
  const departureOptions = initialBodies
    .filter(({ id }) => ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(id))
    .map(({ id, name }) => ({ value: id, label: name }));
  const selectedDistance = selectedBody?.position ? formatDistanceFromSun(selectedBody.position) : '—';
  const selectedSpeedKmPerSecond = selectedBody?.velocity
    ? Math.hypot(...selectedBody.velocity) / SOLAR_SYSTEM_SCENE_SCALE * 149597870.7 / (365.25 * 86400)
    : 0;

  return (
    <SimulatorBase className="amplitude-app" headerClassName="amplitude-topbar" mark="AMP" markClassName="amplitude-mark" title="AMPLITUDE GEOMETRY GRAVITY LAB" subtitle="Positive geometry / EFT comparison" parameterValue={configuration} presetValue={presetConfiguration.current} onParameterChange={setConfiguration} actions={<><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button><button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></>} onHome={onBack}>
      <div className="amplitude-scene"><Canvas camera={{ position: [10, 8, 12], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><AmplitudeScene configuration={sceneConfiguration} running={running} resetToken={resetToken} initialBodies={initialBodies} orbitPaths={orbitPaths} historicTrajectory={historicTrajectory} validationTracks={selectedValidationResult?.tracks} onTelemetry={setTelemetry} viewMode={viewMode} orbitPlaying={orbitPlaying} focusRequest={focusRequest} onUserInteraction={() => { setViewMode(null); setFocusRequest(null); }} /></Canvas></div>
      <CameraPerspectiveToolbar className="simulator-perspective-toolbar" modesClassName="simulator-perspective-modes" views={DEFAULT_CAMERA_VIEWS} viewMode={viewMode} orbitPlaying={orbitPlaying} onViewChange={(nextViewMode) => { setViewMode(nextViewMode); setFocusRequest(null); }} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
      {physicalModel && selectedBody && <TelemetryHud className="amplitude-astronomy-hud" label="Live astronomical body metrics" items={[
        { label: 'SELECTED BODY', value: selectedBody.name },
        { label: 'MASS', value: formatMass(selectedBody.mass) },
        { label: 'DISTANCE FROM SUN', value: selectedDistance },
        { label: 'ORBITAL SPEED', value: `${selectedSpeedKmPerSecond.toFixed(2)} km/s` }
      ]} />}
      <section className="amplitude-title"><span>{configuration.flightMode === 'validation' ? 'MODEL VALIDATION / OBSERVED ORBITS' : physicalModel ? 'EPHEMERIS / SOLAR SYSTEM EXPLORER' : 'ILLUSTRATIVE / N-BODY AMPLITUDE PROXY'}</span><h1>{configuration.flightMode === 'orbital-path' ? 'Plot a path through the Solar System.' : configuration.flightMode === 'validation' ? 'Score the orbit predictions.' : 'Eight planets. One moving system.'}</h1><p>{configuration.flightMode === 'validation' ? 'Compare every gravity model to a JPL Horizons DE441 interval and the measured relativistic Mercury perihelion residual.' : physicalModel ? 'Dated positions, velocities, and rotation axes come from Astronomy Engine; displayed sizes and the interactive gravity integration are educational approximations.' : 'Compare the Newtonian reference with spin-2 EFT and explicitly speculative amplitude-kernel variants.'}</p></section>
      <aside className={`amplitude-panel ${panelVisible ? '' : 'is-hidden'}`}>
        <div className="amplitude-panel-heading"><div><span>{physicalModel ? 'ASTRONOMY / LIVE EPHEMERIS' : 'GR(2,4) / TOP CELL'}</span><h2>{physicalModel ? 'Solar System' : 'Amplitude gravity'}</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
        <ParamSelect className="amplitude-select" label="Attractor model" value={configuration.attractorModel} options={SOLAR_SYSTEM_ATTRACTOR_MODELS} onChange={(attractorModel) => {
          setLaunchRequest(null);
          update({ attractorModel, selectedBodyId: attractorModel === 'illustrative' ? 'Primary' : 'Earth' });
        }} />
        {physicalModel && <>
          <ParamSelect className="amplitude-select" label="Planet diameter scale" value={configuration.planetDiameterMode} options={PLANET_DIAMETER_MODES} onChange={(planetDiameterMode) => update({ planetDiameterMode })} />
          {configuration.planetDiameterMode === 'illustrative' && <Slider label="Illustrative planet size" value={configuration.illustrativePlanetScale} min={0.5} max={4} step={0.05} onChange={(illustrativePlanetScale) => update({ illustrativePlanetScale })} suffix="×" />}
        </>}
        <ParamSelect className="amplitude-select" label="Study mode" value={configuration.flightMode} options={flightModeOptions} onChange={(flightMode) => update({ flightMode })} />
        {physicalModel && <>
          <label className="amplitude-date-control"><span>Ephemeris date (UTC)</span><input type="date" value={configuration.ephemerisDate} onChange={(event) => update({ ephemerisDate: event.target.value })} /></label>
          <ParamSelect className="amplitude-select" label="Inspect body" value={activeBodyId} options={bodyOptions} onChange={(selectedBodyId) => update({ selectedBodyId })} />
          <div className="amplitude-focus-action"><button type="button" aria-pressed={focusRequest?.bodyId === activeBodyId} onClick={() => {
            const focusPosition = selectedBody?.displayPosition ?? selectedBody?.position;
            if (!focusPosition) return;
            const radius = configuration.planetDiameterMode === 'actual'
              ? selectedBody.actualRadius
              : selectedBody.radius;
            setViewMode(null);
            setFocusRequest({ id: ++focusRequestSequence.current, bodyId: activeBodyId, position: [...focusPosition], radius: radius ?? 0.02 });
          }}>Focus</button></div>
          <details className="amplitude-body-facts" open>
            <summary>Body facts / {selectedBody?.name ?? 'Solar System'}</summary>
            {selectedBody && <>
              <p>{selectedBody.fact}</p>
              <div className="amplitude-invariant"><span>Mass</span><strong>{formatMass(selectedBody.mass)}</strong></div>
              {selectedBody.gmKm3PerS2 != null && <div className="amplitude-invariant"><span>JPL GM</span><strong>{selectedBody.gmKm3PerS2.toPrecision(7)} km³/s²</strong></div>}
              {selectedBody.moonOrbit && <div className="amplitude-invariant"><span>Moon orbit display scale</span><strong>{selectedBody.moonOrbit.displayScale.toFixed(2)}×</strong></div>}
              <div className="amplitude-invariant"><span>Mean radius</span><strong>{selectedBody.radiusKm?.toLocaleString() ?? '—'} km</strong></div>
              <div className="amplitude-invariant"><span>Axial tilt</span><strong>{selectedBody.axialTiltDeg == null ? '—' : `${selectedBody.axialTiltDeg.toFixed(3)}°`}</strong></div>
              <div className="amplitude-invariant"><span>Rotation period</span><strong>{selectedBody.rotationPeriodHours == null ? '—' : `${Math.abs(selectedBody.rotationPeriodHours).toFixed(2)} h${selectedBody.rotationPeriodHours < 0 ? ' retrograde' : ''}`}</strong></div>
              {selectedBody.positionAU && <div className="amplitude-invariant"><span>Epoch position / J2000 EQJ</span><strong>{formatVector(selectedBody.positionAU)} AU</strong></div>}
              {selectedBody.velocityAUPerDay && <div className="amplitude-invariant"><span>Epoch velocity / J2000 EQJ</span><strong>{formatVector(selectedBody.velocityAUPerDay)} AU/day</strong></div>}
              {selectedBody.rotation && <>
                <div className="amplitude-invariant"><span>North pole / J2000 EQJ</span><strong>{formatVector(selectedBody.rotation.pole)}</strong></div>
                <div className="amplitude-invariant"><span>Prime meridian / IAU</span><strong>{(selectedBody.rotation.primeMeridianDeg % 360).toFixed(2)}°</strong></div>
                {selectedBody.rotation.librationLongitudeDeg != null && <>
                  <div className="amplitude-invariant"><span>Libration longitude</span><strong>{selectedBody.rotation.librationLongitudeDeg.toFixed(2)}°</strong></div>
                  <div className="amplitude-invariant"><span>Libration latitude</span><strong>{selectedBody.rotation.librationLatitudeDeg.toFixed(2)}°</strong></div>
                </>}
              </>}
              <p className="amplitude-note">{selectedBody.magneticField}</p>
              <p className="amplitude-note">{selectedBody.chargeField}</p>
              <p className="amplitude-note">{selectedBody.dataQuality}</p>
              <p className="amplitude-note">{selectedBody.massSource}</p>
              {selectedBody.moonOrbit?.displayScale > 1 && <p className="amplitude-note">Moon orbit spacing is visually expanded; actual-diameter mode restores true scale. This does not change the gravitational or Kepler state.</p>}
              <a className="amplitude-source-link" href={selectedBody.source} target="_blank" rel="noreferrer">NASA planetary fact sheets</a>
              {selectedBody.massSourceUrl && <> · <a className="amplitude-source-link" href={selectedBody.massSourceUrl} target="_blank" rel="noreferrer">JPL satellite GM table</a></>}
              {selectedBody.rotation && <> · <a className="amplitude-source-link" href={selectedBody.rotationSource} target="_blank" rel="noreferrer">IAU rotation model</a></>}
            </>}
          </details>
          <label className="amplitude-toggle"><input type="checkbox" checked={configuration.showPlanetaryOrbits} onChange={(event) => update({ showPlanetaryOrbits: event.target.checked })} /><span>Show planetary orbit tracks</span></label>
          <ParamSelect className="amplitude-select" label="Historic mission path" value={configuration.historicMissionId} options={missionOptions} onChange={(historicMissionId) => update({ historicMissionId })} />
          {historicTrajectory && <p className="amplitude-note amplitude-mission-note">{historicTrajectory.note} <a className="amplitude-source-link" href={historicTrajectory.source} target="_blank" rel="noreferrer">Mission source</a></p>}
          {configuration.flightMode === 'validation' && <OrbitalValidationPanel
            configuration={configuration}
            selectedResult={selectedValidationResult}
            scores={validationScores}
            onChange={update}
            onRun={runValidation}
            isRunning={validationRunning}
            isStale={validationReportIsStale}
            report={validationReport}
            reports={validationReports}
            selectedReportId={selectedValidationReportId}
            onSelectReport={setSelectedValidationReportId}
            error={validationError}
          />}
          {configuration.flightMode === 'orbital-path' && <section className="amplitude-launch-controls">
            <h3>Launch conditions</h3>
            <ParamSelect className="amplitude-select" label="Departure body" value={configuration.launchOriginId} options={departureOptions} onChange={(launchOriginId) => update({ launchOriginId })} />
            <Slider label="Launch speed relative to body" value={configuration.launchSpeedKmPerSecond} min={1} max={40} step={0.1} onChange={(launchSpeedKmPerSecond) => update({ launchSpeedKmPerSecond })} suffix="km/s" />
            <Slider label="Prograde / retrograde heading" value={configuration.launchHeadingDeg} min={-180} max={180} step={1} onChange={(launchHeadingDeg) => update({ launchHeadingDeg })} suffix="°" />
            <Slider label="Out-of-plane inclination" value={configuration.launchInclinationDeg} min={-90} max={90} step={1} onChange={(launchInclinationDeg) => update({ launchInclinationDeg })} suffix="°" />
            <button type="button" className="amplitude-launch-button" onClick={() => {
              setLaunchRequest({ originId: configuration.launchOriginId, speedKmPerSecond: configuration.launchSpeedKmPerSecond, headingDeg: configuration.launchHeadingDeg, inclinationDeg: configuration.launchInclinationDeg });
              update({ showAttractorPaths: true });
              setRunning(true);
            }}>Launch</button>
            <p className="amplitude-note">The spacecraft is a zero-charge test particle integrated by the lab’s softened Newtonian N-body solver. This is not a mission design or navigation solution.</p>
          </section>}
        </>}
        <details className="amplitude-about-sim">
          <summary>About this sim</summary>
          <p className="amplitude-note">An educational visualization and model-comparison tool. Orbit scores are relative benchmark metrics; they are not probabilities, independent discoveries, or mission-navigation products.</p>
          <h3>Datasets and citations</h3>
          <ul className="amplitude-citation-list">
            {[...SOLAR_SYSTEM_DATASET_CITATIONS, ...ORBIT_VALIDATION_DATASET_CITATIONS].map((citation) => <li key={citation.id}>
              <strong>{citation.label}</strong>
              <p>{citation.description ?? citation.usage}</p>
              {citation.publication && <p>{citation.publication} {citation.publicationSource && <a className="amplitude-source-link" href={citation.publicationSource} target="_blank" rel="noreferrer">Publication</a>}</p>}
              <p>{citation.limitations ?? citation.limitation}</p>
              <a className="amplitude-source-link" href={citation.source} target="_blank" rel="noreferrer">Source</a>
            </li>)}
            {HISTORIC_MISSIONS.map((mission) => <li key={mission.id}>
              <strong>{mission.label}</strong>
              <p>{mission.note}</p>
              <a className="amplitude-source-link" href={mission.source} target="_blank" rel="noreferrer">NASA mission source</a>
            </li>)}
          </ul>
          <h3>Validation report</h3>
          <p className="amplitude-note">The embedded JPL Horizons DE441 barycentric sample covers {JPL_DE441_ORBIT_INTERVAL.startDate} through {JPL_DE441_ORBIT_INTERVAL.endDate} at {JPL_DE441_ORBIT_INTERVAL.sampleStepDays}-day spacing. The score is a weighted RMS of normalized position, velocity, pair-distance, and (where supported) Mercury perihelion residuals. Model versions and this short reference interval are not independent validation data.</p>
          <p className="amplitude-note">Astronomical validation fixes the physical-unit constants, including gravitational softening and speed of light, regardless of their visualization control values. Configurable model terms that do affect scores are included in the stale-report check.</p>
          <h3>Adding a future model</h3>
          <ol className="amplitude-extension-list">{ORBIT_VALIDATION_MODEL_EXTENSION_PLAN.map((step) => <li key={step}>{step}</li>)}</ol>
        </details>
        <OrbitalTrackingParameters configuration={configuration} onChange={setConfiguration} className="amplitude-control-section" />
        <ParticleAppearanceSettings configuration={configuration} onChange={setConfiguration} className="amplitude-control-section" capabilities={{ shape: false, derivativeOrder: false, colorMode: false, color: false }} />
        <p className="amplitude-warning">{settings.mode === 'general-relativity' ? 'GR mode uses pairwise two-body 1PN acceleration in harmonic coordinates. It captures leading weak-field relativistic effects, including periapsis advance; it omits full N-body EIH cross-body terms.' : settings.mode === 'gr-normed-tensor-gaussian' ? 'Research variant: a trace-normalized velocity tensor and bounded Gaussian window modulate the pairwise 1PN correction. This is a visualization hypothesis, not a solution of Einstein’s field equations.' : physicalModel ? 'The ephemeris state vectors are observationally grounded; planetary motion uses an educational N-body integrator and moon motion uses parent-relative Kepler propagation. The selectable non-Newtonian models are explicitly approximate.' : 'QED photon exchange does not itself produce gravity. The gravity channel here is a spin-2 EFT proxy; “gravituhedron” is a testable visualization hypothesis.'}</p>
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
        {settings.mode === 'ddf-tensor-gaussian' && <>
          <Slider label="Tensor-Gaussian waist" value={settings.tensorGaussianWaist} min={0.1} max={20} step={0.1} onChange={(tensorGaussianWaist) => update({ tensorGaussianWaist })} />
          <Slider label="DDF dilatancy" value={settings.ddfStrength} min={0} max={20} step={0.1} onChange={(ddfStrength) => update({ ddfStrength })} />
          <Slider label="DDF speed limit" value={settings.ddfSpeedLimitMS} min={0.1} max={1000} step={0.1} onChange={(ddfSpeedLimitMS) => update({ ddfSpeedLimitMS })} suffix="m/s" />
          <Slider label="DDF base viscosity" value={settings.ddfBaseViscosity} min={0} max={1} step={0.01} onChange={(ddfBaseViscosity) => update({ ddfBaseViscosity })} />
        </>}
        {settings.mode === 'gr-normed-tensor-gaussian' && <Slider label="GR splatter Gaussian waist" value={settings.grTensorGaussianWaist} min={0.01} max={5} step={0.01} onChange={(grTensorGaussianWaist) => update({ grTensorGaussianWaist })} suffix="scene units" />}
        <Slider label="Softening" value={settings.softening} min={0.01} max={1} step={0.01} onChange={(softening) => update({ softening })} />
        <Slider label="Relativistic scale c" value={settings.speedOfLight} min={5} max={100} step={1} onChange={(speedOfLight) => update({ speedOfLight })} />
        <Slider label="Time scale" value={configuration.timeScale} min={0} max={1.5} step={0.01} onChange={(timeScale) => update({ timeScale })} />
        <div className="amplitude-actions"><button type="button" onClick={() => { setLaunchRequest(null); setResetToken((value) => value + 1); }}>Reset bodies</button></div>
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