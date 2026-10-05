import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Vector3 } from 'three';
import { NumericParamControl, ParamSelect, SimulatorParameterControls } from './lib/ParamControls.jsx';
import { CameraPerspectiveToolbar, PerspectiveOrbitControls, SimulatorBase, SimulatorPresetControls, SimulatorViewParameters } from './lib/SimulatorBase.jsx';
import { createCameraViews, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, DEFAULT_SIMULATOR_3D_PARAMETERS, readPresetLibrary, writePresetLibrary } from './lib/simulator-base.js';
import { SIMULATION_MECHANICS_REGIMES } from './lib/simulationMechanics.js';
import { calculateHalbachMotorState, createHalbachFieldLineVertices, DEFAULT_HALBACH_MOTOR_SETTINGS, HALBACH_ARRANGEMENT_OPTIONS, sanitizeHalbachMotorSettings } from './halbachMotorModel.js';

const PRESET_KEY = 'sqgsim-halbach-linear-motor-presets';
const INITIAL_SETTINGS = sanitizeHalbachMotorSettings({
  ...DEFAULT_SIMULATOR_3D_PARAMETERS,
  ...DEFAULT_HALBACH_MOTOR_SETTINGS,
  particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, sizeScale: 0.9, opacity: 0.9 }
});

function readPresets() {
  const library = readPresetLibrary(typeof window === 'undefined' ? null : window.localStorage, PRESET_KEY, { Default: INITIAL_SETTINGS });
  return Object.fromEntries(Object.entries(library).map(([name, value]) => [name, sanitizeHalbachMotorSettings({ ...INITIAL_SETTINGS, ...value })]));
}

function HalbachFieldLines({ settings }) {
  const geometry = useMemo(() => {
    const positions = createHalbachFieldLineVertices(settings);
    const colors = new Float32Array(positions.length);
    const facing = new Color('#70e6c3');
    const shielded = new Color('#667c9c');
    for (let offset = 0; offset < positions.length; offset += 3) {
      const color = positions[offset + 1] >= 0 ? facing : shielded;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3));
    result.setAttribute('color', new BufferAttribute(colors, 3));
    return result;
  }, [settings.arrangement, settings.arraySpacingM, settings.coilGapM, settings.magnetCount]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial vertexColors transparent opacity={0.66} blending={AdditiveBlending} depthWrite={false} /></lineSegments>;
}

function HalbachMotorScene({ settings, running, orbitPlaying, onMetrics }) {
  const carrierRef = useRef(null);
  const coilRefs = useRef([]);
  const motionRef = useRef({ position: 0, velocity: 0 });
  const reportTimeRef = useRef(0);
  const colors = useMemo(() => [new Color('#e5a653'), new Color('#72b9e8'), new Color('#df789b'), new Color('#70e6c3')], []);
  const lineLength = Math.max(4, (settings.magnetCount - 1) * settings.arraySpacingM + 2);

  useFrame(({ clock }, delta) => {
    if (!running) return;
    const state = calculateHalbachMotorState(settings, clock.elapsedTime);
    state.coils.forEach((coil, index) => {
      const material = coilRefs.current[index]?.material;
      if (!material) return;
      material.color.copy(coil.currentFraction >= 0 ? colors[0] : colors[2]);
      material.emissive.copy(coil.currentFraction >= 0 ? colors[1] : colors[2]);
      material.emissiveIntensity = 0.12 + Math.abs(coil.currentFraction) * 0.9;
    });
    const motion = motionRef.current;
    const acceleration = Math.max(-8, Math.min(8, state.accelerationMS2));
    motion.velocity = (motion.velocity + acceleration * delta) * Math.exp(-delta * 1.3);
    motion.position += motion.velocity * delta;
    const limit = lineLength * 0.18;
    if (motion.position > limit || motion.position < -limit) {
      motion.position = Math.max(-limit, Math.min(limit, motion.position));
      motion.velocity *= -0.18;
    }
    if (carrierRef.current) carrierRef.current.position.x = motion.position;
    reportTimeRef.current += delta;
    if (reportTimeRef.current >= 0.15) {
      reportTimeRef.current = 0;
      onMetrics(state);
    }
  });

  return <>
    <color attach="background" args={['#071019']} />
    <fog attach="fog" args={['#071019', 18, 45]} />
    <ambientLight intensity={0.72} color="#a9c7da" />
    <directionalLight intensity={1.35} position={[4, 8, 6]} color="#ffe4ab" />
    <pointLight intensity={18} distance={22} position={[0, 3, 1]} color="#70e6c3" />
    <gridHelper args={[lineLength + 4, Math.max(8, settings.magnetCount * 2), '#38616a', '#182d38']} position={[0, -0.48, 0]} />
    <mesh position={[0, -0.42, 0]}><boxGeometry args={[lineLength + 2, 0.18, 1.5]} /><meshStandardMaterial color="#182833" metalness={0.58} roughness={0.46} /></mesh>
    <group ref={carrierRef}>
      <HalbachFieldLines settings={settings} />
      {settings.magnetCount > 0 && Array.from({ length: settings.magnetCount }, (_, index) => {
        const magnet = calculateHalbachMotorState(settings, 0).magnets[index];
        return <group key={`magnet-${index}`} position={[magnet.x, 0.1, 0]} rotation={[0, 0, magnet.angle]}>
          <mesh><boxGeometry args={[settings.arraySpacingM * 0.72, 0.34, 0.42]} /><meshStandardMaterial color={colors[index % colors.length]} metalness={0.34} roughness={0.36} /></mesh>
          <mesh position={[0, 0.19, 0]}><boxGeometry args={[0.18, 0.045, 0.06]} /><meshBasicMaterial color="#f5f2dc" /></mesh>
        </group>;
      })}
    </group>
    {Array.from({ length: settings.magnetCount }, (_, index) => <mesh key={`coil-${index}`} ref={(element) => { coilRefs.current[index] = element; }} position={[(index - (settings.magnetCount - 1) / 2) * settings.arraySpacingM, settings.coilGapM + 0.42, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[0.31, 0.07, 8, 28]} /><meshStandardMaterial color="#e5a653" emissive="#72b9e8" emissiveIntensity={0.2} metalness={0.5} roughness={0.3} />
    </mesh>)}
    <mesh position={[0, settings.coilGapM + 0.08, 0]}><boxGeometry args={[lineLength + 2, 0.08, 1.2]} /><meshStandardMaterial color="#274451" metalness={0.5} roughness={0.42} transparent opacity={0.78} side={DoubleSide} /></mesh>
    <PerspectiveOrbitControls viewMode={settings.cameraViewMode} orbitPlaying={orbitPlaying} orbitSettings={settings} views={createCameraViews({ target: [0, 0.35, 0], distance: 12, frontDistance: 16, ortho1Offset: [9, 6, 10], ortho2Offset: [-9, 6, -10] })} cameraParams={{ minDistance: 5, maxDistance: 36, target: [0, 0.3, 0] }} />
  </>;
}

function HalbachLinearMotorSim({ onBack }) {
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [presetLibrary, setPresetLibrary] = useState(() => readPresets());
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [presetName, setPresetName] = useState('');
  const [running, setRunning] = useState(true);
  const [cameraView, setCameraView] = useState(settings.cameraViewMode);
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [motorState, setMotorState] = useState(() => calculateHalbachMotorState(INITIAL_SETTINGS));
  const cameraViews = useMemo(() => createCameraViews({ target: [0, 0.3, 0], distance: 12, frontDistance: 16, ortho1Offset: [9, 6, 10], ortho2Offset: [-9, 6, -10] }), []);
  const update = (patch) => setSettings((current) => sanitizeHalbachMotorSettings({ ...current, ...patch }));
  const currentPresetValue = presetLibrary[currentPreset] ?? INITIAL_SETTINGS;
  const applyPreset = (name) => {
    const next = sanitizeHalbachMotorSettings(presetLibrary[name] ?? INITIAL_SETTINGS);
    setSettings(next);
    setCameraView(next.cameraViewMode);
    setCurrentPreset(name);
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = { ...presetLibrary, [name]: { ...settings } };
    setPresetLibrary(next);
    setCurrentPreset(name);
    setPresetName('');
    writePresetLibrary(window.localStorage, PRESET_KEY, next);
  };

  return <SimulatorBase className="halbach-app" headerClassName="halbach-topbar" mark="H / LSM" title="HALBACH ARRAY & LINEAR MOTOR" subtitle="Field shaping / traveling-coil phase" parameterValue={settings} presetValue={currentPresetValue} onParameterChange={(next) => update(next)} onHome={onBack} actions={<button type="button" onClick={() => setRunning((value) => !value)}>{running ? 'Pause coils' : 'Play coils'}</button>}>
    <div className="halbach-scene"><Canvas camera={{ position: [8, 5, 9], fov: 42, near: 0.1, far: 80 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><HalbachMotorScene settings={settings} running={running} orbitPlaying={orbitPlaying} onMetrics={setMotorState} /></Canvas></div>
    <CameraPerspectiveToolbar className="simulator-perspective-toolbar halbach-perspectives" views={cameraViews} viewMode={cameraView} orbitPlaying={orbitPlaying} onViewChange={(view) => { setCameraView(view); update({ cameraViewMode: view }); }} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
    <aside className="halbach-panel">
      <h2>{settings.arrangement === 'halbach' ? 'One-sided flux concentration' : 'Alternating pole reference'}</h2>
      <details className="halbach-presets" open><summary>Saved configurations</summary><SimulatorPresetControls name={presetName} onNameChange={setPresetName} presets={presetLibrary} currentPreset={currentPreset} onApply={applyPreset} onSave={savePreset} onReset={() => applyPreset('Default')} /></details>
      <details open><summary>Array geometry</summary>
        <ParamSelect className="halbach-select" label="Magnet arrangement" value={settings.arrangement} options={HALBACH_ARRANGEMENT_OPTIONS} onChange={(arrangement) => update({ arrangement })} />
        <NumericParamControl className="halbach-range" label="Magnet count" value={settings.magnetCount} min={4} max={16} step={2} onChange={(magnetCount) => update({ magnetCount })} />
        <NumericParamControl className="halbach-range" label="Array spacing" value={settings.arraySpacingM} min={0.1} max={5} step={0.05} suffix="m" onChange={(arraySpacingM) => update({ arraySpacingM })} />
        <NumericParamControl className="halbach-range" label="Coil gap" value={settings.coilGapM} min={0.1} max={5} step={0.05} suffix="m" onChange={(coilGapM) => update({ coilGapM })} />
        <NumericParamControl className="halbach-range" label="Permanent array flux" value={settings.magnetFluxT} min={0} max={5} step={0.05} suffix="T" onChange={(magnetFluxT) => update({ magnetFluxT })} />
      </details>
      <details open><summary>Linear motor drive</summary>
        <NumericParamControl className="halbach-range" label="Coil current phase" value={settings.coilPhaseDegrees} min={0} max={360} step={1} suffix="deg" onChange={(coilPhaseDegrees) => update({ coilPhaseDegrees })} />
        <NumericParamControl className="halbach-range" label="Coil current amplitude" value={settings.coilCurrentA} min={-10000} max={10000} step={50} suffix="A" onChange={(coilCurrentA) => update({ coilCurrentA })} />
        <NumericParamControl className="halbach-range" label="Traveling wave frequency" value={settings.coilFrequencyHz} min={0.01} max={20} step={0.01} suffix="Hz" onChange={(coilFrequencyHz) => update({ coilFrequencyHz })} />
        <NumericParamControl className="halbach-range" label="Active conductor length" value={settings.coilConductorLengthM} min={0.05} max={10} step={0.05} suffix="m" onChange={(coilConductorLengthM) => update({ coilConductorLengthM })} />
        <NumericParamControl className="halbach-range" label="Armature mass" value={settings.armatureMassKg} min={1} max={10000} step={1} suffix="kg" onChange={(armatureMassKg) => update({ armatureMassKg })} />
      </details>
      <details><summary>Shared mechanics mode</summary>
        <ParamSelect className="halbach-select" label="Mechanics regime" value={settings.mechanicsRegime} options={SIMULATION_MECHANICS_REGIMES} onChange={(mechanicsRegime) => update({ mechanicsRegime })} />
        {settings.mechanicsRegime === 'ddf-tensor-gaussian' && <>
          <NumericParamControl className="halbach-range" label="DDF dilatancy" value={settings.ddfStrength} min={0} max={20} step={0.1} onChange={(ddfStrength) => update({ ddfStrength })} />
          <NumericParamControl className="halbach-range" label="DDF speed limit" value={settings.ddfSpeedLimitMS} min={0.1} max={1000} step={0.1} suffix="m/s" onChange={(ddfSpeedLimitMS) => update({ ddfSpeedLimitMS })} />
          <NumericParamControl className="halbach-range" label="Tensor-Gaussian waist" value={settings.tensorGaussianWaistM} min={0.1} max={100} step={0.1} suffix="m" onChange={(tensorGaussianWaistM) => update({ tensorGaussianWaistM })} />
        </>}
        {settings.mechanicsRegime === 'grassmannian-amplituhedron' && <>
          <NumericParamControl className="halbach-range" label="Positive-cell pole weight" value={settings.grassmannianPoleWeight} min={0} max={1} step={0.01} onChange={(grassmannianPoleWeight) => update({ grassmannianPoleWeight })} />
          <NumericParamControl className="halbach-range" label="Amplituhedron coupling" value={settings.geometryCoupling} min={0} max={0.25} step={0.005} onChange={(geometryCoupling) => update({ geometryCoupling })} />
          <NumericParamControl className="halbach-range" label="Tensor-Gaussian waist" value={settings.tensorGaussianWaistM} min={0.1} max={100} step={0.1} suffix="m" onChange={(tensorGaussianWaistM) => update({ tensorGaussianWaistM })} />
        </>}
      </details>
      <SimulatorViewParameters configuration={settings} onChange={update} cameraClassName="halbach-camera-settings" particleClassName="halbach-particle-settings" appearanceCapabilities={{ shape: false, derivativeOrder: false, colorMode: false, color: false }} />
    </aside>
    <div className="halbach-readouts"><Metric label="Coil-facing flux" value={`${motorState.coilSideFluxT.toFixed(3)} T`} /><Metric label="Shield-side flux" value={`${motorState.shieldSideFluxT.toFixed(3)} T`} /><Metric label="Concentration ratio" value={`${motorState.fluxConcentrationRatio.toFixed(2)}×`} /><Metric label="Instantaneous force estimate" value={`${motorState.forceN.toFixed(1)} N`} /><Metric label="Maxwell magnetic pressure" value={`${(motorState.maxwellMagneticPressurePa / 1e6).toFixed(2)} MPa`} /><Metric label="Mechanics scale" value={motorState.mechanics.accelerationScale.toFixed(3)} /><Metric label="Normed tensor-Gaussian splat" value={motorState.tensorGaussianWeight.toFixed(3)} /></div>
    <p className="halbach-caveat">{motorState.status} Field lines are a visualization of a softened dipole array, not a finite-element field solution.</p>
  </SimulatorBase>;
}

function Metric({ label, value }) {
  return <div className="halbach-metric"><span>{label}</span><strong>{value}</strong></div>;
}

export default HalbachLinearMotorSim;