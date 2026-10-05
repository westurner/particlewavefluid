import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Object3D, ShaderMaterial } from 'three';
import { NumericParamControl, ParamSelect, SimulatorParameterControls } from './lib/ParamControls.jsx';
import { CameraPerspectiveToolbar, PerspectiveOrbitControls, SimulatorBase, SimulatorPresetControls, SimulatorViewParameters } from './lib/SimulatorBase.jsx';
import { createCameraViews, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, DEFAULT_SIMULATOR_3D_PARAMETERS, readPresetLibrary, writePresetLibrary } from './lib/simulator-base.js';
import { createRailHeatState, normalizedTensorGaussian, RAIL_HEAT_MODELS, stepRailHeatComparison, summarizeRailHeatState } from './railHeatModel.js';

const PRESET_KEY = 'sqgsim-rail-heat-snapshots';
const RAIL_LENGTH = 6;
const RAIL_NODES = 73;
const INITIAL_CONFIGURATION = {
  ...DEFAULT_SIMULATOR_3D_PARAMETERS,
  particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, sizeScale: 1.25, opacity: 0.8, splatterEnabled: true },
  cameraViewMode: 'ortho1',
  ambientTemperature: 20,
  heatPower: 500,
  sourcePosition: 0,
  sourceWidth: 0.16,
  diffusivityScale: 1,
  relaxationTime: 2,
  ddfStrength: 0.8,
  convection: 0.0003,
  timeScale: 60,
  particleCount: 1536,
  displayModel: 'comparison',
  gaussianSplatters: true
};

const MODEL_COLORS = { fourier: '#e5a653', cattaneo: '#67cad1', ddf: '#93cf8b' };
const LANE_X = { fourier: -1.65, cattaneo: 0, ddf: 1.65 };
const MODEL_NAMES = Object.fromEntries(RAIL_HEAT_MODELS.map(({ value, label }) => [value, label]));

function makeInitialStates(ambientTemperature) {
  return Object.fromEntries(['fourier', 'cattaneo', 'ddf'].map((model) => [model, createRailHeatState({ nodes: RAIL_NODES, length: RAIL_LENGTH, ambientTemperature })]));
}

function setTemperatureColor(color, temperature, ambientTemperature) {
  const normalized = Math.max(0, Math.min(1, (temperature - ambientTemperature) / 90));
  return color.setHSL(0.54 - normalized * 0.49, 0.82, 0.31 + normalized * 0.2);
}

function HeatRail({ model, statesRef, ambientTemperature, visible }) {
  const meshRef = useRef(null);
  const segmentGeometry = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const nodeCount = RAIL_NODES;
  const segmentLength = RAIL_LENGTH / (nodeCount - 1) * 1.04;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let index = 0; index < nodeCount; index += 1) {
      segmentGeometry.position.set(LANE_X[model], 0.26, (index / (nodeCount - 1) - 0.5) * RAIL_LENGTH);
      segmentGeometry.scale.set(1, 1, segmentLength / (RAIL_LENGTH / (nodeCount - 1) * 1.04));
      segmentGeometry.updateMatrix();
      mesh.setMatrixAt(index, segmentGeometry.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [model, segmentGeometry, segmentLength]);

  useFrame(() => {
    const mesh = meshRef.current;
    const state = statesRef.current?.[model];
    if (!mesh || !state) return;
    for (let index = 0; index < nodeCount; index += 1) mesh.setColorAt(index, setTemperatureColor(color, state.temperatures[index], ambientTemperature));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[undefined, undefined, nodeCount]} visible={visible}>
    <boxGeometry args={[0.17, 0.17, segmentLength]} />
    <meshStandardMaterial color="#ffffff" metalness={0.62} roughness={0.36} emissive="#27120a" emissiveIntensity={0.14} />
  </instancedMesh>;
}

function ThermalSplatters({ model, statesRef, settings, visible }) {
  const count = Math.max(1, Math.floor(settings.particleCount / 3));
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tensorValues = new Float32Array(count);
    const phases = new Float32Array(count);
    const color = new Color();
    for (let index = 0; index < count; index += 1) {
      const phase = index * 2.399963229728653;
      phases[index] = phase;
      color.set('#ffffff');
      colors.set([color.r, color.g, color.b], index * 3);
      tensorValues[index] = 0;
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    result.setAttribute('color', new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage));
    result.setAttribute('aTensorHeat', new BufferAttribute(tensorValues, 1).setUsage(DynamicDrawUsage));
    result.userData.phases = phases;
    return result;
  }, [count]);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uPointSize: { value: 0.14 }, uSizeScale: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: `
      attribute vec3 color;
      attribute float aTensorHeat;
      varying vec3 vColor;
      varying float vTensorHeat;
      uniform float uPointSize;
      uniform float uSizeScale;
      void main() {
        vColor = color;
        vTensorHeat = aTensorHeat;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = uPointSize * uSizeScale * (0.45 + 1.55 * aTensorHeat) * 280.0 / max(1.0, -viewPosition.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTensorHeat;
      uniform float uOpacity;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float gaussian = exp(-radius * radius * 24.0);
        float alpha = uOpacity * gaussian * smoothstep(0.02, 0.2, vTensorHeat);
        gl_FragColor = vec4(vColor, alpha);
      }
    `
  }), []);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ clock }) => {
    const state = statesRef.current?.[model];
    if (!state) return;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    const tensor = geometry.attributes.aTensorHeat.array;
    const phases = geometry.userData.phases;
    const color = new Color();
    const time = clock.elapsedTime;
    const maximum = Math.max(settings.ambientTemperature + 0.2, summarizeRailHeatState(state, settings.ambientTemperature).maximumTemperature);
    const customColor = settings.particleAppearance.colorMode === 'custom' ? new Color(settings.particleAppearance.color) : null;

    for (let index = 0; index < count; index += 1) {
      const phase = phases[index];
      const z = ((index / count * RAIL_LENGTH + time * 0.18) % RAIL_LENGTH) - RAIL_LENGTH / 2;
      const lateral = Math.sin(phase + time * 0.9) * 0.09;
      const node = Math.max(0, Math.min(RAIL_NODES - 1, Math.round((z / RAIL_LENGTH + 0.5) * (RAIL_NODES - 1))));
      const normalizedTemperature = Math.max(0, Math.min(1, (state.temperatures[node] - settings.ambientTemperature) / Math.max(1, maximum - settings.ambientTemperature)));
      const tensorWeight = normalizedTensorGaussian({ x: z, y: lateral, centerX: settings.sourcePosition, sigmaX: Math.max(0.08, settings.sourceWidth * 2.2), sigmaY: 0.12, correlation: 0.12 });
      const heatWeight = normalizedTemperature * (0.35 + tensorWeight * 0.65);
      positions[index * 3] = LANE_X[model] + lateral;
      positions[index * 3 + 1] = 0.39 + Math.cos(phase + time * 1.4) * 0.035;
      positions[index * 3 + 2] = z;
      if (customColor) color.copy(customColor);
      else setTemperatureColor(color, settings.ambientTemperature + normalizedTemperature * (maximum - settings.ambientTemperature), settings.ambientTemperature);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      tensor[index] = settings.gaussianSplatters ? heatWeight : normalizedTemperature;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aTensorHeat.needsUpdate = true;
    material.uniforms.uSizeScale.value = settings.particleAppearance.sizeScale;
    material.uniforms.uOpacity.value = settings.particleAppearance.opacity;
  });

  return <points geometry={geometry} material={material} visible={visible && settings.particleAppearance.splatterEnabled} />;
}

function HeatScene({ settings, statesRef, running, resetToken, viewMode, orbitPlaying, cameraViews, onTelemetry, onUserInteraction }) {
  const telemetryTime = useRef(0);
  const lastResetToken = useRef(resetToken);
  const ambientTemperatureRef = useRef(settings.ambientTemperature);
  useEffect(() => {
    if (!statesRef.current || lastResetToken.current !== resetToken) {
      statesRef.current = makeInitialStates(settings.ambientTemperature);
      lastResetToken.current = resetToken;
    } else {
      const temperatureDelta = settings.ambientTemperature - ambientTemperatureRef.current;
      for (const state of Object.values(statesRef.current)) {
        for (let index = 0; index < state.nodes; index += 1) state.temperatures[index] += temperatureDelta;
      }
    }
    ambientTemperatureRef.current = settings.ambientTemperature;
  }, [resetToken, settings.ambientTemperature, statesRef]);

  useFrame((_, frameDelta) => {
    if (!statesRef.current) statesRef.current = makeInitialStates(settings.ambientTemperature);
    const delta = Math.min(0.05, frameDelta);
    if (running) {
      stepRailHeatComparison(statesRef.current, delta * settings.timeScale, settings);
      telemetryTime.current += delta;
      if (telemetryTime.current >= 0.2) {
        telemetryTime.current = 0;
        onTelemetry(Object.fromEntries(['fourier', 'cattaneo', 'ddf'].map((model) => [model, summarizeRailHeatState(statesRef.current[model], settings.ambientTemperature)])));
      }
    }
  });

  const isVisible = (model) => settings.displayModel === 'comparison' || settings.displayModel === model;
  return <>
    <color attach="background" args={['#0a1519']} />
    <fog attach="fog" args={['#0a1519', 13, 27]} />
    <ambientLight intensity={0.72} color="#d7e6df" />
    <directionalLight intensity={1.4} position={[5, 9, 6]} color="#fff0d2" />
    <pointLight intensity={16} distance={8} position={[0, 1, 0]} color="#e6a256" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}><planeGeometry args={[12, 12]} /><meshStandardMaterial color="#19262a" roughness={1} /></mesh>
    {['fourier', 'cattaneo', 'ddf'].map((model) => <group key={model} visible={isVisible(model)}>
      <mesh position={[LANE_X[model], 0.04, 0]}><boxGeometry args={[0.82, 0.11, RAIL_LENGTH + 0.25]} /><meshStandardMaterial color="#394346" roughness={0.78} /></mesh>
      {Array.from({ length: 13 }, (_, index) => <mesh key={index} position={[LANE_X[model], -0.035, (index / 12 - 0.5) * (RAIL_LENGTH + 0.25)]}><boxGeometry args={[1, 0.08, 0.16]} /><meshStandardMaterial color="#485047" roughness={0.92} /></mesh>)}
      <HeatRail model={model} statesRef={statesRef} ambientTemperature={settings.ambientTemperature} visible={isVisible(model)} />
      <ThermalSplatters model={model} statesRef={statesRef} settings={settings} visible={isVisible(model)} />
    </group>)}
    <ContactShadows position={[0, -0.15, 0]} opacity={0.33} scale={13} blur={2.4} far={4} />
    <PerspectiveOrbitControls viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={settings} views={cameraViews} cameraParams={{ minDistance: 7, maxDistance: 26, target: [0, -0.42, 0] }} onUserInteraction={onUserInteraction} />
  </>;
}

function readInitialPresets() {
  return readPresetLibrary(typeof window === 'undefined' ? null : window.localStorage, PRESET_KEY, { Default: INITIAL_CONFIGURATION });
}

export default function RailHeatSim({ onBack }) {
  const [presetLibrary, setPresetLibrary] = useState(readInitialPresets);
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [presetName, setPresetName] = useState('');
  const [configuration, setConfiguration] = useState(() => readInitialPresets().Default ?? INITIAL_CONFIGURATION);
  const [panelVisible, setPanelVisible] = useState(true);
  const [running, setRunning] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [telemetry, setTelemetry] = useState({});
  const [cameraView, setCameraView] = useState(configuration.cameraViewMode ?? 'ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const statesRef = useRef(null);
  const cameraViews = useMemo(() => createCameraViews({ target: [0, -0.42, 0], distance: 14, frontDistance: 19, ortho1Offset: [10, 9, 13], ortho2Offset: [-10, 8, -13] }), []);
  const update = (patch) => setConfiguration((current) => ({ ...current, ...patch }));
  const updateAll = (next) => setConfiguration({ ...configuration, ...next, particleAppearance: { ...configuration.particleAppearance, ...next.particleAppearance } });
  const applyPreset = (name) => {
    const preset = presetLibrary[name] ?? INITIAL_CONFIGURATION;
    setConfiguration({ ...INITIAL_CONFIGURATION, ...preset, particleAppearance: { ...INITIAL_CONFIGURATION.particleAppearance, ...preset.particleAppearance } });
    setCameraView(preset.cameraViewMode ?? 'ortho1');
    setCurrentPreset(name);
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = { ...presetLibrary, [name]: { ...configuration, particleAppearance: { ...configuration.particleAppearance } } };
    setPresetLibrary(next);
    setCurrentPreset(name);
    setPresetName('');
    writePresetLibrary(window.localStorage, PRESET_KEY, next);
  };
  const resetSimulation = () => {
    setResetToken((value) => value + 1);
    setRunning(true);
  };
  const onCameraChange = (mode) => {
    setCameraView(mode);
    update({ cameraViewMode: mode });
    if (mode === 'orbital') setOrbitPlaying(true);
  };
  const currentPresetValue = presetLibrary[currentPreset] ?? INITIAL_CONFIGURATION;
  const parameterValue = configuration;
  const maxTemperature = Math.max(...['fourier', 'cattaneo', 'ddf'].map((model) => telemetry[model]?.maximumTemperature ?? configuration.ambientTemperature));

  useEffect(() => {
    if (cameraView !== configuration.cameraViewMode) update({ cameraViewMode: cameraView });
  }, [cameraView]);

  return <SimulatorBase className="thermal-app rail-heat-app" headerClassName="thermal-topbar rail-heat-topbar" mark="R / T" markClassName="thermal-mark" title="RAIL HEAT TRANSFER LAB" subtitle="Fourier / finite-speed transport / tensor-Gaussian fields" parameterValue={parameterValue} presetValue={currentPresetValue} onParameterChange={updateAll} actions={<div className="rail-heat-actions"><button type="button" onClick={() => setRunning((value) => !value)} aria-pressed={running}>{running ? 'Pause' : 'Run'}</button><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button></div>} onHome={onBack}>
    <div className="thermal-scene rail-heat-scene"><Canvas camera={{ position: [10, 9, 13], fov: 43, near: 0.1, far: 70 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><HeatScene settings={configuration} statesRef={statesRef} running={running} resetToken={resetToken} viewMode={cameraView} orbitPlaying={orbitPlaying} cameraViews={cameraViews} onTelemetry={setTelemetry} onUserInteraction={() => setCameraView(null)} /></Canvas></div>
    <CameraPerspectiveToolbar className="simulator-perspective-toolbar rail-heat-perspectives" modesClassName="simulator-perspective-modes" views={cameraViews} viewMode={cameraView} orbitPlaying={orbitPlaying} onViewChange={onCameraChange} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
    <div className="rail-heat-legend" aria-label="Model comparison key">{['fourier', 'cattaneo', 'ddf'].map((model, index) => <span key={model}><i style={{ background: MODEL_COLORS[model] }}>{String(index + 1).padStart(2, '0')}</i>{MODEL_NAMES[model]}</span>)}</div>
    <section className="thermal-title rail-heat-title"><span>TRANSIENT CONDUCTION / THREE CONSTITUTIVE MODELS</span><h1>Follow heat along the rail.</h1><p>Compare a classical diffusion baseline, finite-speed heat flux, and a clearly separated exploratory DDF response.</p></section>
    <aside className={`thermal-panel rail-heat-panel${panelVisible ? '' : ' is-hidden'}`}>
      <div className="thermal-panel-heading"><div><span>STEEL RAIL / IDENTICAL INITIAL CONDITIONS</span><h2>Heat transport</h2></div></div>
      <details className="rail-heat-presets" open><summary>Saved configurations</summary><SimulatorPresetControls name={presetName} onNameChange={setPresetName} presets={presetLibrary} currentPreset={currentPreset} onApply={applyPreset} onSave={savePreset} onReset={() => applyPreset('Default')} /></details>
      <ParamSelect className="thermal-select" label="Field display" value={configuration.displayModel} options={[{ value: 'comparison', label: 'Compare all three' }, ...RAIL_HEAT_MODELS]} onChange={(displayModel) => update({ displayModel })} />
      <details open><summary>Heat source and transport</summary>
        <NumericParamControl className="thermal-range" label="Ambient temperature" value={configuration.ambientTemperature} min={-20} max={45} step={1} suffix="°C" onChange={(ambientTemperature) => update({ ambientTemperature })} />
        <NumericParamControl className="thermal-range" label="Wheel / brake heat input" value={configuration.heatPower} min={0} max={12000} step={100} suffix="W" onChange={(heatPower) => update({ heatPower })} />
        <NumericParamControl className="thermal-range" label="Source position" value={configuration.sourcePosition} min={-3} max={3} step={0.05} suffix="m" onChange={(sourcePosition) => update({ sourcePosition })} />
        <NumericParamControl className="thermal-range" label="Source spread" value={configuration.sourceWidth} min={0.04} max={0.55} step={0.01} suffix="m" onChange={(sourceWidth) => update({ sourceWidth })} />
        <NumericParamControl className="thermal-range" label="Diffusivity scale" value={configuration.diffusivityScale} min={0.25} max={5} step={0.05} suffix="x" onChange={(diffusivityScale) => update({ diffusivityScale })} />
        <NumericParamControl className="thermal-range" label="Thermal relaxation time" value={configuration.relaxationTime} min={0.1} max={8} step={0.1} suffix="s" onChange={(relaxationTime) => update({ relaxationTime })} />
        <NumericParamControl className="thermal-range" label="DDF flux limitation" value={configuration.ddfStrength} min={0} max={4} step={0.05} onChange={(ddfStrength) => update({ ddfStrength })} />
        <NumericParamControl className="thermal-range" label="Convective cooling" value={configuration.convection * 1000} min={0} max={3} step={0.05} suffix="×10⁻³ /s" onChange={(convection) => update({ convection: convection / 1000 })} />
        <NumericParamControl className="thermal-range" label="Simulation clock" value={configuration.timeScale} min={60} max={1800} step={30} suffix="sim s / s" onChange={(timeScale) => update({ timeScale })} />
        <div className="thermal-readout"><span>Maximum rail temperature</span><strong>{maxTemperature.toFixed(1)} °C</strong></div>
        {['fourier', 'cattaneo', 'ddf'].map((model) => <div className="thermal-readout" key={model}><span>{MODEL_NAMES[model]}</span><strong>{(telemetry[model]?.maximumTemperature ?? configuration.ambientTemperature).toFixed(1)} °C</strong></div>)}
      </details>
      <details open><summary>Particles and field rendering</summary>
        <NumericParamControl className="thermal-range" label="Particle count" value={configuration.particleCount} min={384} max={6144} step={384} onChange={(particleCount) => update({ particleCount })} />
        <label className="amplitude-toggle"><input type="checkbox" checked={configuration.gaussianSplatters} onChange={(event) => update({ gaussianSplatters: event.target.checked })} /><span>Normalize tensor-Gaussian splatters</span></label>
        <SimulatorParameterControls configuration={configuration} onChange={updateAll} title="Field appearance" fields={[{ type: 'toggle', label: 'Show heat particles', path: 'particleAppearance.splatterEnabled', checked: configuration.particleAppearance.splatterEnabled }]} />
        <SimulatorViewParameters configuration={configuration} onChange={updateAll} cameraClassName="rail-heat-camera-settings" particleClassName="rail-heat-particle-settings" appearanceCapabilities={{ shape: false, derivativeOrder: false }} />
        <div className="quantum-actions"><button type="button" onClick={resetSimulation}>Reset all fields</button></div>
      </details>
      <p className="thermal-citation">Steel properties are representative inputs. The DDF/Fedi term is a bounded phenomenological flux-limiting hypothesis, not a validated rail material law. The tensor-Gaussian splatters are a normalized visualization layer, not a heat-transfer equation.</p>
    </aside>
  </SimulatorBase>;
}