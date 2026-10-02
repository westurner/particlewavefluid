import { ParamSelect, YamlTextArea } from './ParamControls.jsx';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { NumericParamControl } from './ParamControls.jsx';
import { cloneState, statesEqual } from './simulation-state.js';
import { appendJournalEntry, CAMERA_WHEEL_MODE_OPTIONS, createOrbitCameraParams, rewindJournal, snapshotAtJournalTime } from './simulator-base.js';

export const OrbitCameraControls = forwardRef(function OrbitCameraControls({ cameraParams, ...props }, ref) {
  const cameraParamsKey = JSON.stringify(cameraParams);
  const stableCameraParams = useMemo(() => createOrbitCameraParams(cameraParams), [cameraParamsKey]);
  return <OrbitControls ref={ref} makeDefault enableDamping {...stableCameraParams} {...props} />;
});

export function CameraPerspectiveToolbar({ views, viewMode, onViewChange, className = 'attractor-view-toolbar', modesClassName = 'attractor-view-modes', controls }) {
  return (
    <nav className={className} aria-label="Camera views">
      <div className={modesClassName} role="group" aria-label="Select camera perspective">
        {views.map((view) => <button key={view.id} type="button" className={viewMode === view.id ? 'active' : ''} aria-pressed={viewMode === view.id} onClick={() => onViewChange(view.id)}>{view.label}</button>)}
      </div>
      {controls}
    </nav>
  );
}

export function OrbitCameraSettings({ configuration, onChange, className = 'attractor-details', rangeClassName = 'attractor-control', selectClassName = 'attractor-select' }) {
  const update = (field, value) => onChange({ [field]: value }, field);
  const range = (label, field, min, max, step, disabled = false) => <NumericParamControl key={field} className={rangeClassName} label={label} value={configuration[field]} min={min} max={max} step={step} disabled={disabled} onChange={(value) => update(field, value)} />;
  return (
    <details className={className}>
      <summary>Camera</summary>
      <ParamSelect className={selectClassName} label="Replay mode" value={configuration.replayCameraTrack} options={['false', 'exact', 'easing', 'orbit']} onChange={(value) => update('replayCameraTrack', value)} />
      <label className="simulator-camera-toggle"><input type="checkbox" checked={configuration.cameraOrbitOn} onChange={(event) => update('cameraOrbitOn', event.target.checked)} /><span>Orbit on</span></label>
      <label className="simulator-camera-toggle"><input type="checkbox" checked={configuration.cameraZoomEnabled} onChange={(event) => update('cameraZoomEnabled', event.target.checked)} /><span>Enable zoom</span></label>
      <ParamSelect className={selectClassName} label="Scroll mode" value={configuration.cameraWheelMode} options={CAMERA_WHEEL_MODE_OPTIONS} onChange={(value) => update('cameraWheelMode', value)} />
      {range('Orbit speed', 'replayCameraOrbitSpeed', 0.01, 2, 0.01)}
      {range('Orbit X', 'replayCameraOrbitX', -1, 1, 0.01)}
      {range('Orbit Y', 'replayCameraOrbitY', -1, 1, 0.01)}
      {range('Orbit Z', 'replayCameraOrbitZ', -1, 1, 0.01)}
      {['cameraPosX', 'cameraPosY', 'cameraPosZ', 'cameraTargetX', 'cameraTargetY', 'cameraTargetZ'].map((field) => range(field.replace('camera', 'Camera '), field, -50, 50, 0.01))}
      {range('Zoom', 'cameraZoom', 0.1, 10, 0.01, !configuration.cameraZoomEnabled)}
      {range('FOV', 'cameraFov', 1, 179, 1)}
      {range('Near', 'cameraNear', 0.001, 10, 0.001)}
      {range('Far', 'cameraFar', 10, 10000, 1)}
    </details>
  );
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

export function SimulatorBase({ children, className, headerClassName, title, subtitle, mark = 'PAS', meta, actions, homeUrl = '/', onHome, mode = '3d', brandClassName = '', markClassName = '', metaClassName = '', metaContentClassName = '', homeClassName = '' }) {
  return (
    <main className={`simulator-base simulator-base-${mode} ${className || ''}`} data-simulator-mode={mode}>
      <header className={`simulator-base-topbar ${headerClassName || ''}`}>
        <div className={`simulator-base-brand ${brandClassName}`}>
          <span className={`simulator-base-mark ${markClassName}`}>{mark}</span>
          <span><b>{title}</b><em>{subtitle}</em></span>
        </div>
        <div className={`simulator-base-meta ${metaClassName}`}>
          {meta && <span className={metaContentClassName}>{meta}</span>}
          {actions}
          <a className={`simulator-base-home ${homeClassName}`} href={homeUrl} onClick={(event) => {
            if (!onHome) return;
            event.preventDefault();
            onHome(event);
          }}>Lab menu</a>
        </div>
      </header>
      {children}
    </main>
  );
}

export function SimulatorPresetControls({ name, onNameChange, presets, currentPreset, onApply, onSave, onReset, className = '', selectClassName = '' }) {
  const presetOptions = Object.keys(presets);
  if (currentPreset && !Object.hasOwn(presets, currentPreset)) presetOptions.unshift(currentPreset);
  return (
    <section className={`simulator-preset-controls ${className}`}>
      <div className="simulator-preset-heading"><span>Saved snapshots</span>{onReset && <button type="button" onClick={onReset}>Reset</button>}</div>
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