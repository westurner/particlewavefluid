import { BooleanParamControl, ColorParamControl, ParamSelect, PresetParametersProvider, SimulatorParameterControls, YamlTextArea } from './ParamControls.jsx';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { NumericParamControl } from './ParamControls.jsx';
import { changedParameterPaths, cloneState, getAtPath, resetStatePaths, statesEqual } from './simulation-state.js';
import { appendJournalEntry, CAMERA_WHEEL_MODE_OPTIONS, createCameraViews, createOrbitCameraParams, DEFAULT_CAMERA_VIEWS, DEFAULT_ORBITAL_TRACKING_CONFIGURATION, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, easeCameraFocus, getCameraFocusPose, rewindJournal, snapshotAtJournalTime } from './simulator-base.js';
import { Euler, Vector3 } from 'three';
import ConfirmButton from './ConfirmButton.jsx';

export const OrbitCameraControls = forwardRef(function OrbitCameraControls({ cameraParams, ...props }, ref) {
  const cameraParamsKey = JSON.stringify(cameraParams);
  const stableCameraParams = useMemo(() => createOrbitCameraParams(cameraParams), [cameraParamsKey]);
  return <OrbitControls ref={ref} makeDefault enableDamping {...stableCameraParams} {...props} />;
});

export function CameraPerspectiveToolbar({ views = DEFAULT_CAMERA_VIEWS, viewMode, onViewChange, orbitPlaying = true, onToggleOrbit = () => {}, className = 'simulator-perspective-toolbar', modesClassName = 'simulator-perspective-modes', controls }) {
  const selectView = (id) => {
    onViewChange(id);
    if (id === 'orbital' && !orbitPlaying) onToggleOrbit();
  };
  return (
    <nav className={className} aria-label="Camera views">
      <div className={modesClassName} role="group" aria-label="Select camera perspective">
        {views.map((view) => <span className="camera-view-option" key={view.id}>
          <button type="button" className={viewMode === view.id ? 'active' : ''} aria-pressed={viewMode === view.id} onClick={() => selectView(view.id)}>{view.label}</button>
          {view.id === 'orbital' && viewMode === 'orbital' && <button type="button" className="camera-orbit-play-toggle" aria-label={orbitPlaying ? 'Pause orbit' : 'Play orbit'} title={orbitPlaying ? 'Pause orbital tracking' : 'Play orbital tracking'} onClick={onToggleOrbit}>{orbitPlaying ? 'Pause' : 'Play'}</button>}
        </span>)}
      </div>
      {controls}
    </nav>
  );
}

export function PerspectiveOrbitControls({ viewMode, orbitPlaying, views = DEFAULT_CAMERA_VIEWS, cameraParams = {}, orbitSettings = DEFAULT_ORBITAL_TRACKING_CONFIGURATION, focusRequest, onUserInteraction, controlsRef: forwardedControlsRef, children }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef(null);
  const focusTransitionRef = useRef(null);
  const focusClipRadiusRef = useRef(null);
  const cameraClipRangeRef = useRef(null);
  const assignControlsRef = useCallback((instance) => {
    controlsRef.current = instance;
    if (typeof forwardedControlsRef === 'function') forwardedControlsRef(instance);
    else if (forwardedControlsRef) forwardedControlsRef.current = instance;
  }, [forwardedControlsRef]);
  const controlsKey = JSON.stringify(cameraParams);
  const stableCameraParams = useMemo(() => createOrbitCameraParams(cameraParams), [controlsKey]);
  const viewKey = JSON.stringify(views);
  const stableViews = useMemo(() => views, [viewKey]);
  const orbitTargetKey = JSON.stringify(stableCameraParams.target);
  const orbitSettingsKey = JSON.stringify(orbitSettings);
  const updateFocusClipRange = useCallback((controls) => {
    const radius = focusClipRadiusRef.current;
    const baseRange = cameraClipRangeRef.current;
    if (!radius || !baseRange) return;
    const distance = camera.position.distanceTo(controls.target);
    const near = Math.max(1e-9, Math.min(baseRange.near, Math.max(radius * 0.1, distance * 0.01)));
    const far = Math.max(1e-6, distance * 8, radius * 100);
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useEffect(() => {
    if (!viewMode || viewMode === 'orbital') return;
    const view = stableViews.find((entry) => entry.id === viewMode);
    if (!view?.position) return;
    focusTransitionRef.current = null;
    focusClipRadiusRef.current = null;
    if (cameraClipRangeRef.current) {
      camera.near = cameraClipRangeRef.current.near;
      camera.far = cameraClipRangeRef.current.far;
      camera.updateProjectionMatrix();
    }
    camera.position.fromArray(view.position);
    const target = view.target ?? stableCameraParams.target;
    controlsRef.current?.target.fromArray(target);
    camera.lookAt(...target);
    controlsRef.current?.update();
  }, [camera, orbitTargetKey, stableCameraParams.target, stableViews, viewMode]);

  useEffect(() => {
    if (!focusRequest?.position) return undefined;
    const controls = controlsRef.current;
    if (!controls) return undefined;
    const radius = Math.max(Number(focusRequest.radius) || 0, 1e-9);
    const distance = Math.max(radius * 12, 1e-7);
    const pose = getCameraFocusPose(camera.position.toArray(), controls.target.toArray(), focusRequest.position, distance);
    focusClipRadiusRef.current = radius;
    focusTransitionRef.current = {
      startPosition: camera.position.clone(),
      endPosition: new Vector3(...pose.position),
      startTarget: controls.target.clone(),
      endTarget: new Vector3(...pose.target),
      elapsed: 0,
      duration: 0.9
    };
    return () => { focusTransitionRef.current = null; };
  }, [camera, focusRequest?.id]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const transition = focusTransitionRef.current;
    if (transition) {
      transition.elapsed = Math.min(1, transition.elapsed + Math.max(0, delta) / transition.duration);
      const amount = easeCameraFocus(transition.elapsed);
      camera.position.lerpVectors(transition.startPosition, transition.endPosition, amount);
      controls.target.lerpVectors(transition.startTarget, transition.endTarget, amount);
      camera.lookAt(controls.target);
      updateFocusClipRange(controls);
      controls.update();
      if (transition.elapsed >= 1) focusTransitionRef.current = null;
      return;
    }
    if (viewMode === 'orbital' && orbitPlaying && orbitSettings.cameraOrbitOn) {
      const target = controls.target;
      const offset = camera.position.clone().sub(target);
      const angle = Math.max(0, Number(orbitSettings.replayCameraOrbitSpeed) || 0) * delta;
      offset.applyEuler(new Euler(angle * (orbitSettings.replayCameraOrbitX || 0), angle * (orbitSettings.replayCameraOrbitY || 0), angle * (orbitSettings.replayCameraOrbitZ || 0)));
      camera.position.copy(target).add(offset);
      controls.update();
    }
    updateFocusClipRange(controls);
  });

  useEffect(() => {
    if (!camera.isPerspectiveCamera) return undefined;
    if (Number.isFinite(orbitSettings.cameraFov)) camera.fov = orbitSettings.cameraFov;
    if (Number.isFinite(orbitSettings.cameraNear)) camera.near = orbitSettings.cameraNear;
    if (Number.isFinite(orbitSettings.cameraFar)) camera.far = orbitSettings.cameraFar;
    if (Number.isFinite(orbitSettings.cameraZoom)) camera.zoom = orbitSettings.cameraZoomEnabled ? orbitSettings.cameraZoom : 1;
    camera.updateProjectionMatrix();
    cameraClipRangeRef.current = { near: camera.near, far: camera.far };
  }, [camera, orbitSettingsKey]);

  useEffect(() => {
    const handleWheel = (event) => {
      if (orbitSettings.cameraZoomEnabled && orbitSettings.cameraWheelMode === 'zoom') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (focusClipRadiusRef.current) {
          focusTransitionRef.current = null;
          onUserInteraction?.();
        }
        camera.zoom = Math.min(10, Math.max(0.1, camera.zoom * Math.pow(0.95, event.deltaY / 100)));
        camera.updateProjectionMatrix();
        controlsRef.current?.update();
        return;
      }
      onUserInteraction?.();
    };
    gl.domElement.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => gl.domElement.removeEventListener('wheel', handleWheel, { capture: true });
  }, [camera, gl, orbitSettings.cameraWheelMode, orbitSettings.cameraZoomEnabled, onUserInteraction]);

  const handleControlStart = useCallback(() => {
    focusTransitionRef.current = null;
    const clipRange = cameraClipRangeRef.current;
    if (clipRange && (camera.near !== clipRange.near || camera.far !== clipRange.far)) {
      camera.near = clipRange.near;
      camera.far = clipRange.far;
      camera.updateProjectionMatrix();
    }
    onUserInteraction?.();
  }, [camera, onUserInteraction]);

  return <>
    <OrbitCameraControls
      ref={assignControlsRef}
      cameraParams={{ ...stableCameraParams, autoRotate: false, enabled: (orbitSettings.cameraControlsEnabled ?? true) && (stableCameraParams.enabled ?? true), enableZoom: orbitSettings.cameraZoomEnabled && orbitSettings.cameraWheelMode === 'dolly' }}
      onStart={handleControlStart}
    />
    {children}
  </>;
}

export function OrbitCameraSettings({ configuration, onChange = () => {}, className = 'attractor-details', rangeClassName = 'attractor-control', selectClassName = 'attractor-select', pathPrefix = '', compact = false }) {
  const path = (field) => `${pathPrefix}${field}`;
  const fields = [
    { type: 'toggle', label: 'Enable camera controls', path: path('cameraControlsEnabled'), checked: configuration.cameraControlsEnabled ?? true },
    { type: 'select', label: 'Replay mode', path: path('replayCameraTrack'), value: configuration.replayCameraTrack ?? 'easing', options: ['false', 'exact', 'easing', 'orbit'], className: selectClassName },
    { type: 'toggle', label: 'Orbit on', path: path('cameraOrbitOn'), checked: configuration.cameraOrbitOn ?? true },
    { type: 'toggle', label: 'Enable zoom', path: path('cameraZoomEnabled'), checked: configuration.cameraZoomEnabled ?? true },
    { type: 'select', label: 'Scroll mode', path: path('cameraWheelMode'), value: configuration.cameraWheelMode ?? 'zoom', options: CAMERA_WHEEL_MODE_OPTIONS, className: selectClassName },
    { type: 'range', label: 'Orbit speed', path: path('replayCameraOrbitSpeed'), value: configuration.replayCameraOrbitSpeed ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.replayCameraOrbitSpeed, min: 0.01, max: 2, step: 0.01, className: rangeClassName },
    { type: 'range', label: 'Orbit X', path: path('replayCameraOrbitX'), value: configuration.replayCameraOrbitX ?? 0, min: -1, max: 1, step: 0.01, className: rangeClassName },
    { type: 'range', label: 'Orbit Y', path: path('replayCameraOrbitY'), value: configuration.replayCameraOrbitY ?? 1, min: -1, max: 1, step: 0.01, className: rangeClassName },
    { type: 'range', label: 'Orbit Z', path: path('replayCameraOrbitZ'), value: configuration.replayCameraOrbitZ ?? 0, min: -1, max: 1, step: 0.01, className: rangeClassName }
  ];
  if (!compact) fields.push(
    ...['cameraPosX', 'cameraPosY', 'cameraPosZ', 'cameraTargetX', 'cameraTargetY', 'cameraTargetZ'].map((field) => ({ type: 'range', label: field.replace('camera', 'Camera '), path: path(field), value: configuration[field] ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION[field] ?? 0, min: -50, max: 50, step: 0.01, className: rangeClassName })),
    { type: 'range', label: 'Zoom', path: path('cameraZoom'), value: configuration.cameraZoom ?? 1, min: 0.1, max: 10, step: 0.01, disabled: !(configuration.cameraZoomEnabled ?? true), className: rangeClassName },
    { type: 'range', label: 'FOV', path: path('cameraFov'), value: configuration.cameraFov ?? 42, min: 1, max: 179, step: 1, className: rangeClassName },
    { type: 'range', label: 'Near', path: path('cameraNear'), value: configuration.cameraNear ?? 0.1, min: 0.001, max: 10, step: 0.001, className: rangeClassName },
    { type: 'range', label: 'Far', path: path('cameraFar'), value: configuration.cameraFar ?? 100, min: 10, max: 10000, step: 1, className: rangeClassName }
  );
  return <SimulatorParameterControls title="Camera" className={className} configuration={configuration} fields={fields} onChange={onChange} />;
}

export function OrbitalTrackingParameters({ configuration, onChange = () => {}, className = 'parameter-group', pathPrefix = '' }) {
  return <SimulatorParameterControls title="Orbital tracking" className={className} configuration={configuration} onChange={onChange} fields={[
    { type: 'toggle', label: 'Enable camera controls', path: `${pathPrefix}cameraControlsEnabled`, checked: configuration.cameraControlsEnabled ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.cameraControlsEnabled },
    { type: 'toggle', label: 'Allow orbital camera motion', path: `${pathPrefix}cameraOrbitOn`, checked: configuration.cameraOrbitOn ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.cameraOrbitOn },
    { type: 'range', label: 'Orbit speed', path: `${pathPrefix}replayCameraOrbitSpeed`, value: configuration.replayCameraOrbitSpeed ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.replayCameraOrbitSpeed, min: 0.01, max: 2, step: 0.01 },
    { type: 'range', label: 'Orbit X axis', path: `${pathPrefix}replayCameraOrbitX`, value: configuration.replayCameraOrbitX ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.replayCameraOrbitX, min: -1, max: 1, step: 0.01 },
    { type: 'range', label: 'Orbit Y axis', path: `${pathPrefix}replayCameraOrbitY`, value: configuration.replayCameraOrbitY ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.replayCameraOrbitY, min: -1, max: 1, step: 0.01 },
    { type: 'range', label: 'Orbit Z axis', path: `${pathPrefix}replayCameraOrbitZ`, value: configuration.replayCameraOrbitZ ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.replayCameraOrbitZ, min: -1, max: 1, step: 0.01 },
    { type: 'toggle', label: 'Enable camera zoom', path: `${pathPrefix}cameraZoomEnabled`, checked: configuration.cameraZoomEnabled ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.cameraZoomEnabled },
    { type: 'select', label: 'Scroll mode', path: `${pathPrefix}cameraWheelMode`, value: configuration.cameraWheelMode ?? DEFAULT_ORBITAL_TRACKING_CONFIGURATION.cameraWheelMode, options: CAMERA_WHEEL_MODE_OPTIONS }
  ]} />;
}

export function ParticleAppearanceSettings({ configuration, onChange = () => {}, className = 'parameter-group', fields, pathPrefix = 'particleAppearance', capabilities = {} }) {
  const appearance = configuration?.[pathPrefix] ?? DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION;
  const support = { sizeScale: true, shape: true, derivativeOrder: true, colorMode: true, color: true, opacity: true, ...capabilities };
  const path = (field) => `${pathPrefix}.${field}`;
  const controls = (fields ?? [
    { key: 'sizeScale', type: 'range', label: 'Particle size scale', min: 0.25, max: 3, step: 0.05, suffix: 'x' },
    { key: 'shape', type: 'select', label: 'Particle shape', options: ['native', 'circle', 'square', 'sphere', 'vector'] },
    { key: 'derivativeOrder', type: 'range', label: 'Particle derivative order', min: 0, max: 4, step: 1 },
    { key: 'colorMode', type: 'select', label: 'Particle color mode', options: [{ value: 'native', label: 'Native / encoded' }, { value: 'custom', label: 'Custom color' }] },
    { key: 'color', type: 'color', label: 'Particle color', disabled: appearance.colorMode !== 'custom' },
    { key: 'opacity', type: 'range', label: 'Particle opacity', min: 0, max: 1, step: 0.01 }
  ]).map((field) => {
    const fieldPath = field.path ?? path(field.key);
    const fieldValue = getAtPath(configuration, fieldPath) ?? field.defaultValue ?? DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION[field.key];
    return { ...field, path: fieldPath, disabled: field.disabled || support[field.key] === false, value: field.value ?? fieldValue, checked: field.checked ?? fieldValue };
  });
  return <SimulatorParameterControls title="Particle appearance" className={className} configuration={configuration} fields={controls} onChange={onChange} />;
}

export function SimulatorViewParameters({ configuration, onChange, appearanceCapabilities, appearanceFields, cameraClassName, particleClassName }) {
  return <>
    <OrbitalTrackingParameters configuration={configuration} onChange={onChange} className={cameraClassName} />
    <ParticleAppearanceSettings configuration={configuration} onChange={onChange} capabilities={appearanceCapabilities} fields={appearanceFields} className={particleClassName} />
  </>;
}

export function useSimulatorJournal({ initialSnapshot, onApplySnapshot, playbackSpeed = 1 }) {
  const [journal, setJournal] = useState(() => [{ time: 0, snapshot: cloneState(initialSnapshot) }]);
  const [recording, setRecording] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const journalRef = useRef(journal);
  const startTimeRef = useRef(Date.now());
  const applySnapshotRef = useRef(onApplySnapshot);
  const skippedSnapshotRef = useRef(null);

  useEffect(() => {
    applySnapshotRef.current = onApplySnapshot;
  }, [onApplySnapshot]);

  const applyAt = (time) => {
    const snapshot = snapshotAtJournalTime(journalRef.current, time);
    if (snapshot === null) return;
    skippedSnapshotRef.current = snapshot;
    applySnapshotRef.current(cloneState(snapshot));
  };
  const record = (snapshot, path, value) => {
    if (skippedSnapshotRef.current) {
      const isReplay = statesEqual(skippedSnapshotRef.current, snapshot);
      skippedSnapshotRef.current = null;
      if (isReplay) return 'replay';
    }
    if (!recording || !path) return false;
    const entry = { time: Date.now() - startTimeRef.current, path, value, snapshot: cloneState(snapshot) };
    const nextJournal = appendJournalEntry(journalRef.current, entry);
    journalRef.current = nextJournal;
    setJournal(nextJournal);
    setPlaybackTime(entry.time);
    return true;
  };
  const seek = (time) => {
    setPlaybackTime(time);
    applyAt(time);
  };
  const stop = () => {
    setPlaying(false);
    seek(0);
  };
  const rewind = () => {
    const nextJournal = rewindJournal(journalRef.current);
    if (nextJournal === journalRef.current) return false;
    journalRef.current = nextJournal;
    setJournal(nextJournal);
    const time = nextJournal.at(-1).time;
    setPlaybackTime(time);
    applyAt(time);
    return true;
  };
  const reset = (snapshot = initialSnapshot) => {
    const nextJournal = [{ time: 0, snapshot: cloneState(snapshot) }];
    journalRef.current = nextJournal;
    startTimeRef.current = Date.now();
    skippedSnapshotRef.current = nextJournal[0].snapshot;
    setJournal(nextJournal);
    setPlaying(false);
    setPlaybackTime(0);
  };
  const replayJournal = (entries) => {
    if (!Array.isArray(entries) || entries.length < 2) return false;
    const nextJournal = entries.map((entry) => ({ ...entry, snapshot: cloneState(entry.snapshot) }));
    journalRef.current = nextJournal;
    skippedSnapshotRef.current = nextJournal[0].snapshot;
    setJournal(nextJournal);
    setPlaybackTime(0);
    setPlaying(true);
    applySnapshotRef.current(cloneState(nextJournal[0].snapshot));
    return true;
  };

  useEffect(() => {
    if (!playing) return undefined;
    let frameId;
    const tick = () => {
      const duration = journalRef.current.at(-1)?.time || 0;
      const nextTime = Math.min(duration, playbackTime + 16 * playbackSpeed);
      setPlaybackTime(nextTime);
      applyAt(nextTime);
      if (nextTime >= duration) setPlaying(false);
      else frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, playbackTime, playbackSpeed]);

  return { journal, recording, setRecording, playing, setPlaying, playbackTime, seek, stop, rewind, reset, record, replayJournal };
}

export function SimulatorBase({ children, className, headerClassName, title, subtitle, mark = 'PAS', meta, actions, homeUrl = '/', onHome, mode = '3d', parameterValue, presetValue, onParameterChange, brandClassName = '', markClassName = '', metaClassName = '', metaContentClassName = '', homeClassName = '' }) {
  const [subtitleDimmed, setSubtitleDimmed] = useState(false);
  const subtitleAutoHiddenRef = useRef(false);
  const subtitleActiveRef = useRef(false);

  useEffect(() => {
    subtitleAutoHiddenRef.current = false;
    subtitleActiveRef.current = false;
    setSubtitleDimmed(false);
    if (!subtitle) return undefined;
    const timeoutId = setTimeout(() => {
      subtitleAutoHiddenRef.current = true;
      if (!subtitleActiveRef.current) setSubtitleDimmed(true);
    }, 5200);
    return () => clearTimeout(timeoutId);
  }, [subtitle]);

  const revealSubtitle = () => {
    subtitleActiveRef.current = true;
    setSubtitleDimmed(false);
  };
  const concealSubtitle = () => {
    subtitleActiveRef.current = false;
    if (subtitleAutoHiddenRef.current) setSubtitleDimmed(true);
  };

  return (
    <main className={`simulator-base simulator-base-${mode} ${className || ''}`} data-simulator-mode={mode}>
      <header className={`simulator-base-topbar ${headerClassName || ''}`}>
        <div className={`simulator-base-brand ${brandClassName}`}>
          <span className={`simulator-base-mark ${markClassName}`}>{mark}</span>
          <span><b>{title}</b>{subtitle && <em className={`simulator-base-description${subtitleDimmed ? ' is-dimmed' : ''}`} tabIndex={0} onPointerEnter={revealSubtitle} onPointerLeave={concealSubtitle} onFocus={revealSubtitle} onBlur={concealSubtitle}>{subtitle}</em>}</span>
        </div>
        <div className={`simulator-base-meta ${metaClassName}`}>
          {meta && <span className={metaContentClassName}>{meta}</span>}
          {parameterValue && presetValue && onParameterChange && <PresetChangeSummary value={parameterValue} preset={presetValue} onChange={onParameterChange} />}
          {actions}
          <a className={`simulator-base-home ${homeClassName}`} href={homeUrl} onClick={(event) => {
            if (!onHome) return;
            event.preventDefault();
            onHome(event);
          }}>Lab menu</a>
        </div>
      </header>
      {parameterValue && presetValue && onParameterChange
        ? <PresetParametersProvider value={parameterValue} preset={presetValue} onChange={onParameterChange}>{children}</PresetParametersProvider>
        : children}
    </main>
  );
}

export function SimulatorPresetControls({ name, onNameChange, presets, currentPreset, onApply, onSave, onReset, className = '', selectClassName = '' }) {
  const presetOptions = Object.keys(presets);
  if (currentPreset && !Object.hasOwn(presets, currentPreset)) presetOptions.unshift(currentPreset);
  return (
    <section className={`simulator-preset-controls ${className}`}>
      <div className="simulator-preset-heading"><span>Saved snapshots</span>{onReset && <ConfirmButton className="simulator-preset-reset-trigger" actionName="Reset simulator settings" confirmationMessage="Reset simulator settings to the default preset?" onConfirm={onReset}>Reset</ConfirmButton>}</div>
      <ParamSelect className={selectClassName} ariaLabel="Saved snapshot" value={currentPreset} options={presetOptions} onChange={onApply} />
      <div className="simulator-preset-save"><input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Name this snapshot" aria-label="Snapshot name" /><button type="button" onClick={onSave} disabled={!name.trim()}>Save snapshot</button></div>
    </section>
  );
}

export function SimulatorIOJournal({
  currentValue,
  presets,
  jsonText,
  onJsonText,
  onLoad,
  onExport,
  onDeletePresets,
  showEditLog,
  onShowEditLog,
  editLogYaml,
  journal = [],
  recording = false,
  onRecording = () => {},
  playing = false,
  onTogglePlayback = () => {},
  onStop = () => {},
  playbackTime = 0,
  onPlaybackTime = () => {},
  playbackSpeed = 1,
  onPlaybackSpeed = () => {},
  onReplayLog = () => {},
  replayMessage = '',
  replaying = false,
  className = ''
}) {
  const [replayLogText, setReplayLogText] = useState(editLogYaml);
  const [ignoreVisualization, setIgnoreVisualization] = useState(false);
  const [ignoreCamera, setIgnoreCamera] = useState(false);
  useEffect(() => setReplayLogText(editLogYaml), [editLogYaml]);
  const maxTime = Math.max(1, journal.at(-1)?.time || 1);
  return (
    <details className={`attractor-details simulator-io-journal ${className}`}>
      <summary>I/O JOURNAL</summary>
      <textarea className="attractor-json" value={jsonText} onChange={(event) => onJsonText(event.target.value)} aria-label="Preset JSON" />
      <div className="attractor-actions"><button type="button" onClick={onLoad}>Load JSON</button><button type="button" onClick={() => onExport('current', currentValue)}>Export current</button></div>
      <div className="attractor-actions"><button type="button" onClick={() => onExport('all', presets)}>Export all</button><button type="button" onClick={() => onExport('saved', presets)}>Export saved</button></div>
      <label className="simulator-io-toggle"><input type="checkbox" checked={showEditLog} onChange={(event) => onShowEditLog(event.target.checked)} /><span>Show param edit log</span></label>
      {showEditLog && <YamlTextArea label="Parameter edit log YAML" value={editLogYaml} />}
      <details className="simulator-replay-log">
        <summary>Replay parameter log</summary>
        <label className="param-yaml-textarea"><span>Replay journal YAML</span><textarea aria-label="Parameter edit log YAML to replay" value={replayLogText} onChange={(event) => setReplayLogText(event.target.value)} /></label>
        <label className="simulator-io-toggle"><input type="checkbox" checked={ignoreVisualization} onChange={(event) => setIgnoreVisualization(event.target.checked)} /><span>Ignore visualization config</span></label>
        <label className="simulator-io-toggle"><input type="checkbox" checked={ignoreCamera} onChange={(event) => setIgnoreCamera(event.target.checked)} /><span>Ignore camera config</span></label>
        <button type="button" className="simulator-replay-button" disabled={replaying} onClick={() => onReplayLog(replayLogText, { ignoreVisualization, ignoreCamera })}>{replaying ? 'Replaying…' : 'Replay param log'}</button>
        {replayMessage && <output className="simulator-replay-status" role="status">{replayMessage}</output>}
      </details>
      <button type="button" className="attractor-danger" onClick={onDeletePresets}>Delete local presets</button>
      <label className="simulator-io-toggle"><input type="checkbox" checked={recording} onChange={(event) => onRecording(event.target.checked)} /><span>Record simulation</span></label>
      <div className="journal-controls"><button type="button" onClick={onTogglePlayback}>{playing ? 'Pause' : 'Play'}</button><button type="button" onClick={onStop}>Stop / reset</button></div>
      <label className="attractor-control"><span>Playback speed<strong>{playbackSpeed.toFixed(1)}x</strong></span><input type="range" min="0.1" max="10" step="0.1" value={playbackSpeed} onChange={(event) => onPlaybackSpeed(Number(event.target.value))} /></label>
      <label className="attractor-control"><span>Timeline<strong>{Math.round(playbackTime)} ms</strong></span><input type="range" min="0" max={maxTime} step="1" value={Math.min(playbackTime, maxTime)} onChange={(event) => onPlaybackTime(Number(event.target.value))} /></label>
    </details>
  );
}

export function SimulatorExportModal({ title, value, onClose }) {
  return <div className="attractor-modal-backdrop" onClick={onClose}><section className="attractor-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Close export">Close</button></header><textarea readOnly value={JSON.stringify(value, null, 2)} /></section></div>;
}

function displayParameterValue(value) {
  if (value === undefined) return 'unset';
  if (value === null || typeof value !== 'object') return String(value);
  const text = JSON.stringify(value);
  return text.length > 52 ? `${text.slice(0, 49)}...` : text;
}

export function PresetChangeSummary({ value, preset, onChange }) {
  const changedPaths = changedParameterPaths(value, preset);
  if (changedPaths.length === 0) return null;
  const visiblePaths = changedPaths.slice(0, 24);
  return <details className="simulator-preset-change-summary">
    <summary aria-label={`${changedPaths.length} parameters changed from preset`}>{changedPaths.length} changed</summary>
    <div className="simulator-preset-change-list">
      {visiblePaths.map((path) => <div className="simulator-preset-change" key={path}>
        <span><strong>{path || 'configuration'}</strong><small>{displayParameterValue(getAtPath(value, path))} / {displayParameterValue(getAtPath(preset, path))}</small></span>
        <ConfirmButton className="simulator-preset-field-reset" actionName={`Reset ${path || 'configuration'} to current preset`} confirmationMessage={`Reset ${path || 'configuration'} to the current preset?`} onConfirm={() => onChange(resetStatePaths(value, preset, [path]))}>Reset</ConfirmButton>
      </div>)}
      {changedPaths.length > visiblePaths.length && <p>{changedPaths.length - visiblePaths.length} more changed fields</p>}
      <ConfirmButton className="simulator-preset-reset-all" containerClassName="confirm-button-block" actionName="Reset all to preset" confirmationMessage="Reset all changed parameters to the current preset?" onConfirm={() => onChange(cloneState(preset))}>Reset all to preset</ConfirmButton>
    </div>
  </details>;
}