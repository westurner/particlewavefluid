import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, FrontSide, ShaderMaterial, Vector3 } from 'three';
import { calculateOcclusionTransmission, calculateWaveDerivative, calculateWaveDisplacement, calculateWaveFrame, calculateWaveTensorGaussian, cloneWaveState, combineWaves, DEFAULT_BEAM_WAIST, DEFAULT_SIGNAL_DIRECTION, DEFAULT_SIGNAL_ORIGIN, DEFAULT_SIGNAL_ROTATION, DEFAULT_WAVE_STATES, INTERFERENCE_MODES, MAX_WAVES, OCCLUSION_PRESETS, PHASE_MODES, POLARIZATION_MODES, readSavedWaveStates, SIGNAL_SOURCE_PRESETS, writeSavedWaveStates } from './waveModel.js';

const FIELD_SIZE = 18;
const DEFAULT_PARTICLE_COUNT = 4096;
const MIN_PARTICLE_COUNT = 1024;
const MAX_PARTICLE_COUNT = 9216;
const WAVE_COLORS = ['#f4bf66', '#66d5d1', '#df7d8d', '#a899ed', '#d7e681', '#7da8ec', '#f28e5d', '#86d3a5'];
const PARTICLE_SHAPES = ['square', 'circle', 'vector'];

const WAVE_VERTEX_SHADER = `
  uniform float uParticleSize;
  uniform bool uTensorSplatters;
  attribute float aVectorAngle;
  attribute float aTensorGaussian;
  varying vec3 vColor;
  varying float vVectorAngle;
  varying float vTensorGaussian;
  attribute float aOcclusion;
  varying float vOcclusion;

  void main() {
    vColor = color;
    vVectorAngle = aVectorAngle;
    vTensorGaussian = aTensorGaussian;
    vOcclusion = aOcclusion;
    vec4 modelPosition = modelViewMatrix * vec4(position, 1.0);
    float tensorScale = uTensorSplatters ? mix(0.35, 1.8, aTensorGaussian) : 1.0;
    gl_PointSize = uParticleSize * tensorScale * 800.0 / max(-modelPosition.z, 1.0);
    gl_Position = projectionMatrix * modelPosition;
  }
`;

const WAVE_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform int uShape;
  uniform bool uTensorSplatters;
  varying vec3 vColor;
  varying float vVectorAngle;
  varying float vTensorGaussian;
  varying float vOcclusion;

  void main() {
    if (vOcclusion < 0.01) discard;
    vec2 point = gl_PointCoord - 0.5;
    float cosine = cos(vVectorAngle);
    float sine = sin(vVectorAngle);
    point = vec2(cosine * point.x - sine * point.y, sine * point.x + cosine * point.y);
    if (uShape == 1 && length(point) > 0.5) discard;
    if (uShape == 2) {
      point *= 0.74;
      float shaft = step(abs(point.x), 0.1) * step(abs(point.y), 0.3);
      float head = step(0.14, point.y) * step(abs(point.x), 0.23 - point.y * 0.24);
      if (max(shaft, head) < 0.5) discard;
    }
    float splatterAlpha = uTensorSplatters ? mix(0.35, 1.0, vTensorGaussian) : 1.0;
    gl_FragColor = vec4(vColor, uOpacity * splatterAlpha);
  }
`;

function createFieldGeometry(particleCount) {
  const columns = Math.ceil(Math.sqrt(particleCount * 1.4));
  const rows = Math.ceil(particleCount / columns);
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      positions[index * 3] = (column / Math.max(columns - 1, 1) - 0.5) * FIELD_SIZE;
      positions[index * 3 + 1] = 0;
      positions[index * 3 + 2] = (row / Math.max(rows - 1, 1) - 0.5) * FIELD_SIZE;
      colors[index * 3] = 0.25;
      colors[index * 3 + 1] = 0.6;
      colors[index * 3 + 2] = 0.62;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('aVectorAngle', new BufferAttribute(new Float32Array(particleCount), 1));
  geometry.setAttribute('aTensorGaussian', new BufferAttribute(new Float32Array(particleCount), 1));
  geometry.setAttribute('aOcclusion', new BufferAttribute(new Float32Array(particleCount).fill(1), 1));
  geometry.userData.basePositions = positions.slice();
  return geometry;
}

function WaveField({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, occlusionPreset }) {
  const geometry = useMemo(() => createFieldGeometry(particleCount), [particleCount]);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uParticleSize: { value: 0.075 },
      uOpacity: { value: 0.9 },
      uShape: { value: 1 },
      uTensorSplatters: { value: false }
    },
    vertexColors: true,
    vertexShader: WAVE_VERTEX_SHADER,
    fragmentShader: WAVE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  }), []);
  const timeRef = useRef(0);
  const color = useMemo(() => new Color(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.side = doubleSided ? DoubleSide : FrontSide;
    material.needsUpdate = true;
  }, [doubleSided, material]);
  useEffect(() => {
    material.uniforms.uParticleSize.value = particleSize;
    material.uniforms.uOpacity.value = particleOpacity;
    material.uniforms.uShape.value = PARTICLE_SHAPES.indexOf(particleShape);
  }, [material, particleOpacity, particleShape, particleSize]);
  useEffect(() => {
    material.uniforms.uTensorSplatters.value = waves.slice(0, waveCount).some((wave) => wave.polarization === 'EM-Tensor-Gaussian');
  }, [material, waveCount, waves]);

  useFrame((_, delta) => {
    if (running) timeRef.current += Math.min(delta, 0.05);
    const positions = geometry.attributes.position.array;
    const basePositions = geometry.userData.basePositions;
    const colors = geometry.attributes.color.array;
    const vectorAngles = geometry.attributes.aVectorAngle.array;
    const tensorGaussians = geometry.attributes.aTensorGaussian.array;
    const occlusions = geometry.attributes.aOcclusion.array;
    const activeWaves = waves.slice(0, waveCount);
    for (let index = 0; index < particleCount; index += 1) {
      const x = basePositions[index * 3];
      const z = basePositions[index * 3 + 2];
      const transmission = calculateOcclusionTransmission(occlusionPreset, x, z);
      const height = combineWaves(activeWaves, x, z, timeRef.current, interferenceModes) * transmission;
      const displacement = calculateWaveDisplacement(activeWaves, x, z, timeRef.current, interferenceModes);
      const tensorGaussian = calculateWaveTensorGaussian(activeWaves, x, z, timeRef.current, interferenceModes) * transmission;
      const derivative = particleShape === 'vector'
        ? calculateWaveDerivative(activeWaves, x, z, timeRef.current, particleDerivativeOrder, interferenceModes)
        : 0;
      const normalized = Math.min(1, Math.abs(height) / Math.max(1, activeWaves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0)));
      positions[index * 3] = x + displacement.x * transmission * 0.9;
      positions[index * 3 + 1] = basePositions[index * 3 + 1] + displacement.y * transmission * 0.9;
      positions[index * 3 + 2] = z + displacement.z * transmission * 0.9;
      occlusions[index] = transmission;
      vectorAngles[index] = Math.atan(derivative * 0.35);
      tensorGaussians[index] = tensorGaussian;
      const hue = height >= 0 ? 0.12 - normalized * 0.06 : 0.52 + normalized * 0.08;
      color.setHSL(hue, 0.72, 0.42 + normalized * 0.18);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aVectorAngle.needsUpdate = true;
    geometry.attributes.aTensorGaussian.needsUpdate = true;
    geometry.attributes.aOcclusion.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function SignalSourceArrows({ waves, waveCount, visible }) {
  const sources = useMemo(() => waves.slice(0, waveCount).map((wave, index) => {
    if (wave.enabled === false) return null;
    const frame = calculateWaveFrame(wave);
    return { index, origin: frame.origin, direction: frame.direction };
  }).filter(Boolean), [waveCount, waves]);
  if (!visible) return null;
  return (
    <group>
      {sources.map(({ index, origin, direction }) => <arrowHelper key={index} args={[new Vector3(direction.x, direction.y, direction.z), new Vector3(origin.x, origin.y, origin.z), 2.4, WAVE_COLORS[index], 0.38, 0.22]} />)}
    </group>
  );
}

function WaveScene({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, occlusionPreset, orbitControlsVisible, sourceVectorsVisible }) {
  return (
    <>
      <color attach="background" args={['#080d17']} />
      <fog attach="fog" args={['#080d17', 17, 34]} />
      <ambientLight intensity={0.7} color="#b5d8d1" />
      <gridHelper args={[FIELD_SIZE, 18, '#294555', '#142631']} position={[0, -1.35, 0]} />
      <SignalSourceArrows waves={waves} waveCount={waveCount} visible={sourceVectorsVisible} />
      <WaveField waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} occlusionPreset={occlusionPreset} />
      {orbitControlsVisible && <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={7} maxDistance={32} target={[0, 0, 0]} />}
    </>
  );
}

function RangeControl({ label, value, min, max, step, onChange, suffix = '' }) {
  const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <label className="wave-range-control">
      <span>{label}<strong>{Number(value).toFixed(precision)}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function VectorControl({ label, value, min, max, step, onChange }) {
  const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className="wave-vector-control">
      <span className="wave-vector-label">{label}</span>
      <div className="wave-vector-axes">
        {['x', 'y', 'z'].map((axis) => (
          <label key={axis}>
            <span>{axis.toUpperCase()}<strong>{Number(value?.[axis] ?? 0).toFixed(precision)}</strong></span>
            <input type="range" min={min} max={max} step={step} value={value?.[axis] ?? 0} onChange={(event) => onChange(axis, Number(event.target.value))} />
          </label>
        ))}
      </div>
    </div>
  );
}

function WaveEditor({ wave, index, onChange, onDuplicate, onRemove, canDuplicate, canRemove }) {
  const update = (field, value) => onChange(index, { ...wave, [field]: value });
  const updateVector = (field, axis, value, fallback) => update(field, { ...(wave[field] || fallback), [axis]: value });
  return (
    <details className="wave-editor" open={index < 3}>
      <summary><span className="wave-swatch" style={{ backgroundColor: WAVE_COLORS[index] }} />Wave {index + 1}<strong>{wave.enabled ? 'ON' : 'OFF'} / {wave.phaseMode}</strong></summary>
      <div className="wave-editor-actions">
        <label className="wave-toggle"><input type="checkbox" checked={wave.enabled} onChange={(event) => update('enabled', event.target.checked)} /><span>{wave.enabled ? 'Enabled' : 'Disabled'}</span></label>
        <div className="wave-editor-buttons"><button type="button" onClick={() => onDuplicate(index)} disabled={!canDuplicate}>Duplicate</button><button type="button" className="wave-remove-button" onClick={() => onRemove(index)} disabled={!canRemove}>Remove</button></div>
      </div>
      <RangeControl label="Wavelength" value={wave.wavelength} min={1} max={12} step={0.1} suffix=" u" onChange={(value) => update('wavelength', value)} />
      <RangeControl label="Amplitude" value={wave.amplitude} min={0} max={1.5} step={0.01} onChange={(value) => update('amplitude', value)} />
      <RangeControl label="Decay rate" value={wave.decayRate ?? 0} min={0} max={1} step={0.01} suffix=" /u" onChange={(value) => update('decayRate', value)} />
      <RangeControl label="Phase offset" value={wave.phaseOffset} min={-Math.PI} max={Math.PI} step={0.01} suffix=" rad" onChange={(value) => update('phaseOffset', value)} />
      <RangeControl label="Phase rate" value={wave.phaseRate} min={-2} max={2} step={0.01} suffix=" /s" onChange={(value) => update('phaseRate', value)} />
      <label className="wave-select"><span>Phase mode</span><select value={wave.phaseMode} onChange={(event) => update('phaseMode', event.target.value)}>{PHASE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
      <label className="wave-select"><span>Polarization</span><select value={wave.polarization ?? 'Scalar'} onChange={(event) => update('polarization', event.target.value)}>{POLARIZATION_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
      {(['Electromagnetic', 'EM-Tensor-Gaussian'].includes(wave.polarization)) && <RangeControl label="Beam waist" value={wave.beamWaist ?? DEFAULT_BEAM_WAIST} min={0.5} max={9} step={0.1} suffix=" u" onChange={(value) => update('beamWaist', value)} />}
      <VectorControl label="Signal origin" value={wave.origin} min={-9} max={9} step={0.1} onChange={(axis, value) => updateVector('origin', axis, value, DEFAULT_SIGNAL_ORIGIN)} />
      <VectorControl label="Signal direction" value={wave.direction} min={-1} max={1} step={0.05} onChange={(axis, value) => updateVector('direction', axis, value, DEFAULT_SIGNAL_DIRECTION)} />
      <VectorControl label="Signal rotation (XYZ)" value={wave.rotation} min={-3.15} max={3.15} step={0.05} onChange={(axis, value) => updateVector('rotation', axis, value, DEFAULT_SIGNAL_ROTATION)} />
    </details>
  );
}

function WavePanel({ waves, waveCount, interferenceModes, running, particleCount, doubleSided, particleSize, particleOpacity, particleShape, particleDerivativeOrder, orbitControlsVisible, sourceVectorsVisible, sourcePreset, occlusionPreset, stateOptions, selectedState, stateDescription, stateName, stateMessage, paramsVisible, onSourcePreset, onOcclusionPreset, onStateChange, onStateName, onSaveState, onChange, onWaveCountChange, onInterferenceChange, onRunning, onReset, onDuplicate, onRemove, onDoubleSided, onParticleCount, onParticleSize, onParticleOpacity, onParticleShape, onParticleDerivativeOrder, onOrbitControls, onSourceVectors, onBack }) {
  const enabledCount = waves.slice(0, waveCount).filter((wave) => wave.enabled).length;
  const activeModeLabels = Object.entries(INTERFERENCE_MODES).filter(([mode]) => interferenceModes[mode]).map(([, details]) => details.label);
  return (
    <aside className={`wave-panel ${paramsVisible ? '' : 'is-hidden'}`} aria-hidden={!paramsVisible} onPointerDown={(event) => event.stopPropagation()}>
      <div className="wave-panel-topline"><span className="wave-panel-kicker"><i /> WAVE FIELD / PHASE 01</span><button type="button" className="wave-hide-button" onClick={onBack}>Lab menu</button></div>
      <h2>Wave interference</h2>
      <p className="wave-intro">Compose one or more travelling, circular, and helical waves across a live field.</p>
      <div className="wave-status"><span><i /> {enabledCount} enabled / {waveCount} {waveCount === 1 ? 'wave slot' : 'wave slots'}</span><strong>{running ? 'RUNNING' : 'PAUSED'}</strong></div>
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">WAVE STATES</span>
        <label className="wave-select wave-state-select"><span>Named state</span><select value={selectedState} onChange={(event) => onStateChange(event.target.value)}>{selectedState === '' && <option value="">Current field / unsaved</option>}{stateOptions.map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}</select></label>
        {stateDescription && <p className="wave-description wave-state-description">{stateDescription}</p>}
        <div className="wave-state-save"><input value={stateName} onChange={(event) => onStateName(event.target.value)} placeholder="Name this wave state" aria-label="Name this wave state" /><button type="button" onClick={onSaveState} disabled={!stateName.trim()}>Save state</button></div>
        {stateMessage && <p className="wave-state-message" role="status">{stateMessage}</p>}
      </section>
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">SIGNAL SOURCE PRESETS</span>
        <label className="wave-select wave-state-select"><span>Source preset</span><select value={sourcePreset} onChange={(event) => onSourcePreset(event.target.value)}><option value="">Current field</option>{SIGNAL_SOURCE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
        {sourcePreset && <p className="wave-description wave-state-description">{SIGNAL_SOURCE_PRESETS.find((preset) => preset.id === sourcePreset)?.description}</p>}
      </section>
      <section className="wave-control-section">
        <span className="wave-section-label">FIELD RESPONSE</span>
        <RangeControl label="Wave slots" value={waveCount} min={1} max={MAX_WAVES} step={1} onChange={onWaveCountChange} />
        <div className="wave-interference-modes">{Object.entries(INTERFERENCE_MODES).map(([mode, details]) => <label className="wave-toggle wave-interference-mode" key={mode}><input type="checkbox" checked={interferenceModes[mode]} onChange={(event) => onInterferenceChange(mode, event.target.checked)} /><span>{details.label}</span></label>)}</div>
        <p className="wave-description">{activeModeLabels.length > 0 ? activeModeLabels.join(' + ') : 'No interference layers are active; the field is flat.'}</p>
        <div className="wave-actions"><button type="button" onClick={onRunning}>{running ? 'Pause field' : 'Run field'}</button><button type="button" onClick={onReset}>Reset waves</button></div>
      </section>
      <section className="wave-control-section">
        <span className="wave-section-label">WAVE PARAMETERS</span>
        {waves.slice(0, waveCount).map((wave, index) => <WaveEditor key={index} wave={wave} index={index} onChange={onChange} onDuplicate={onDuplicate} onRemove={onRemove} canDuplicate={waveCount < MAX_WAVES} canRemove={waveCount > 1} />)}
      </section>
      <section className="wave-control-section">
        <span className="wave-section-label">VISUALIZATION</span>
        <RangeControl label="Particle count" value={particleCount} min={MIN_PARTICLE_COUNT} max={MAX_PARTICLE_COUNT} step={512} onChange={onParticleCount} />
        <RangeControl label="Particle size" value={particleSize} min={0.02} max={0.4} step={0.005} suffix=" u" onChange={onParticleSize} />
        <RangeControl label="Particle opacity" value={particleOpacity} min={0.05} max={1} step={0.01} onChange={onParticleOpacity} />
        <label className="wave-select"><span>Particle shape</span><select value={particleShape} onChange={(event) => onParticleShape(event.target.value)}>{PARTICLE_SHAPES.map((shape) => <option key={shape} value={shape}>{shape}</option>)}</select></label>
        {particleShape === 'vector' && <><RangeControl label="Vector derivative n" value={particleDerivativeOrder} min={0} max={4} step={1} onChange={onParticleDerivativeOrder} /><p className="wave-description">Vector direction follows the n-th spatial derivative of particle motion.</p></>}
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={doubleSided} onChange={(event) => onDoubleSided(event.target.checked)} /><span>Double-sided field</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={orbitControlsVisible} onChange={(event) => onOrbitControls(event.target.checked)} /><span>Orbit controls visible</span></label>
        <label className="wave-toggle wave-visualization-toggle"><input type="checkbox" checked={sourceVectorsVisible} onChange={(event) => onSourceVectors(event.target.checked)} /><span>Source vectors visible</span></label>
      </section>
      <section className="wave-control-section wave-state-section">
        <span className="wave-section-label">OCCLUSION MAP PRESETS</span>
        <label className="wave-select wave-state-select"><span>Occlusion map</span><select value={occlusionPreset} onChange={(event) => onOcclusionPreset(event.target.value)}>{OCCLUSION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
        <p className="wave-description wave-state-description">{OCCLUSION_PRESETS.find((preset) => preset.id === occlusionPreset)?.description}</p>
      </section>
    </aside>
  );
}

export default function WaveInterferenceSim({ onBack }) {
  const initialState = DEFAULT_WAVE_STATES.at(-1);
  const [waves, setWaves] = useState(() => cloneWaveState(initialState).waves);
  const [waveCount, setWaveCount] = useState(initialState.waveCount);
  const [interferenceModes, setInterferenceModes] = useState(initialState.interferenceModes);
  const [sourcePreset, setSourcePreset] = useState('');
  const [occlusionPreset, setOcclusionPreset] = useState('none');
  const [particleCount, setParticleCount] = useState(DEFAULT_PARTICLE_COUNT);
  const [savedStates, setSavedStates] = useState(() => readSavedWaveStates());
  const [selectedState, setSelectedState] = useState(initialState.name);
  const [stateModified, setStateModified] = useState(false);
  const [stateName, setStateName] = useState('');
  const [stateMessage, setStateMessage] = useState('');
  const [running, setRunning] = useState(true);
  const [doubleSided, setDoubleSided] = useState(true);
  const [particleSize, setParticleSize] = useState(0.075);
  const [particleOpacity, setParticleOpacity] = useState(0.9);
  const [particleShape, setParticleShape] = useState('circle');
  const [particleDerivativeOrder, setParticleDerivativeOrder] = useState(1);
  const [orbitControlsVisible, setOrbitControlsVisible] = useState(true);
  const [sourceVectorsVisible, setSourceVectorsVisible] = useState(true);
  const [paramsVisible, setParamsVisible] = useState(true);
  const sourceFrame = calculateWaveFrame(waves.slice(0, waveCount).find((wave) => wave.enabled !== false) || waves[0]);

  const markStateModified = () => {
    setSourcePreset('');
    setStateModified(true);
    setStateMessage('Current field has unsaved changes.');
  };
  const updateWave = (index, wave) => {
    setWaves((current) => current.map((item, itemIndex) => itemIndex === index ? wave : item));
    markStateModified();
  };
  const updateWaveCount = (nextCount) => {
    setWaveCount(nextCount);
    markStateModified();
  };
  const duplicateWave = (index) => {
    if (waveCount >= MAX_WAVES) return;
    setWaves((current) => [...current.slice(0, index + 1), { ...current[index] }, ...current.slice(index + 1, MAX_WAVES - 1)]);
    setWaveCount((current) => current + 1);
    markStateModified();
  };
  const removeWave = (index) => {
    if (waveCount <= 1) return;
    if (!window.confirm(`Remove Wave ${index + 1}? This cannot be undone.`)) return;
    setWaves((current) => [...current.slice(0, index), ...current.slice(index + 1, waveCount), { ...current[index], enabled: false }, ...current.slice(waveCount, MAX_WAVES)]);
    setWaveCount((current) => current - 1);
    markStateModified();
  };
  const applyState = (state) => {
    const next = cloneWaveState(state);
    setWaves(next.waves);
    setWaveCount(next.waveCount);
    setInterferenceModes(next.interferenceModes);
  };
  const onSourcePreset = (id) => {
    if (!id) {
      setSourcePreset('');
      return;
    }
    const next = SIGNAL_SOURCE_PRESETS.find((preset) => preset.id === id);
    if (!next) return;
    applyState(next);
    setSourcePreset(id);
    setSelectedState('');
    setStateModified(false);
    setStateMessage(`Loaded ${next.name}.`);
  };
  const stateOptions = [...DEFAULT_WAVE_STATES, ...Object.values(savedStates)];
  const selectedStateValue = stateModified ? '' : selectedState;
  const selectedStateDetails = stateOptions.find((state) => state.name === selectedState);
  const onStateChange = (name) => {
    const next = stateOptions.find((state) => state.name === name);
    if (!next) return;
    applyState(next);
    setSourcePreset('');
    setSelectedState(name);
    setStateModified(false);
    setStateMessage(`Loaded ${name}.`);
  };
  const onSaveState = () => {
    const name = stateName.trim();
    if (!name) return;
    if (DEFAULT_WAVE_STATES.some((state) => state.name === name)) {
      setStateMessage('Choose a name that is not a built-in state.');
      return;
    }
    const nextState = cloneWaveState({ name, description: '', waves, waveCount, interferenceModes });
    const nextSavedStates = { ...savedStates, [name]: nextState };
    setSavedStates(nextSavedStates);
    setSelectedState(name);
    setStateModified(false);
    setStateName('');
    setStateMessage(`Saved ${name}.`);
    try {
      writeSavedWaveStates(nextSavedStates);
    } catch {
      setStateMessage('State is available for this session but could not be saved locally.');
    }
  };
  const reset = () => {
    applyState(initialState);
    setSourcePreset('');
    setSelectedState(initialState.name);
    setStateModified(false);
    setStateMessage(`Loaded ${initialState.name}.`);
    setParticleCount(DEFAULT_PARTICLE_COUNT);
    setDoubleSided(true);
    setParticleSize(0.075);
    setParticleOpacity(0.9);
    setParticleShape('circle');
    setParticleDerivativeOrder(1);
    setOrbitControlsVisible(true);
    setSourceVectorsVisible(true);
    setParamsVisible(true);
    setOcclusionPreset('none');
  };

  return (
    <main className="wave-app">
      <div className="wave-scene" data-particle-count={particleCount} data-occlusion-preset={occlusionPreset} data-orbit-controls={orbitControlsVisible} data-source-vectors={sourceVectorsVisible} data-source-frame={JSON.stringify({ origin: sourceFrame.origin, direction: sourceFrame.direction })}><Canvas camera={{ position: [11, 8, 12], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><WaveScene waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} occlusionPreset={occlusionPreset} orbitControlsVisible={orbitControlsVisible} sourceVectorsVisible={sourceVectorsVisible} /></Canvas></div>
      <header className="wave-topbar"><div className="wave-brand"><span className="wave-mark">WAV</span><span><b>WAVE FIELD LAB</b><em>Phase geometry / interference study</em></span></div><div className="wave-top-meta"><span>WEBGL / FIELD SYNTHESIS</span><button type="button" className="wave-params-toggle" aria-pressed={paramsVisible} onClick={() => setParamsVisible((value) => !value)}>{paramsVisible ? 'Hide params' : 'Show params'}</button><button type="button" className="wave-run-toggle" onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : 'Run'}</button></div></header>
      <section className="wave-title"><p>Animated phase experiment</p><h1>Shape the interference.</h1><span>Independent wavelength, amplitude, phase mode, and phase parameters for every active wave.</span></section>
      <WavePanel waves={waves} waveCount={waveCount} interferenceModes={interferenceModes} running={running} particleCount={particleCount} doubleSided={doubleSided} particleSize={particleSize} particleOpacity={particleOpacity} particleShape={particleShape} particleDerivativeOrder={particleDerivativeOrder} orbitControlsVisible={orbitControlsVisible} sourceVectorsVisible={sourceVectorsVisible} sourcePreset={sourcePreset} occlusionPreset={occlusionPreset} stateOptions={stateOptions} selectedState={selectedStateValue} stateDescription={stateModified ? '' : selectedStateDetails?.description} stateName={stateName} stateMessage={stateMessage} paramsVisible={paramsVisible} onSourcePreset={onSourcePreset} onOcclusionPreset={setOcclusionPreset} onStateChange={onStateChange} onStateName={setStateName} onSaveState={onSaveState} onChange={updateWave} onWaveCountChange={updateWaveCount} onInterferenceChange={(mode, value) => { setInterferenceModes((current) => ({ ...current, [mode]: value })); markStateModified(); }} onRunning={() => setRunning((value) => !value)} onReset={reset} onDuplicate={duplicateWave} onRemove={removeWave} onDoubleSided={setDoubleSided} onParticleCount={setParticleCount} onParticleSize={setParticleSize} onParticleOpacity={setParticleOpacity} onParticleShape={setParticleShape} onParticleDerivativeOrder={setParticleDerivativeOrder} onOrbitControls={setOrbitControlsVisible} onSourceVectors={setSourceVectorsVisible} onBack={onBack} />
      <footer className="wave-footer"><span>n WAVES / {Object.entries(INTERFERENCE_MODES).filter(([mode]) => interferenceModes[mode]).map(([, details]) => details.label.toUpperCase()).join(' + ') || 'NO INTERFERENCE'}</span><span>DRAG TO ORBIT / SCROLL TO ZOOM</span></footer>
    </main>
  );
}
