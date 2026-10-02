import { useMemo, useState } from 'react';
import { correlateEvents, demodulateIq, detectSignalEvents, generateIqSignal, SIGNAL_EVENT_PRESETS } from './phaseSignalModel.js';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { SimulatorBase } from './lib/SimulatorBase.jsx';

function tracePoints(values, width, height, minimum, maximum) {
  const span = Math.max(maximum - minimum, 1e-9);
  const stride = Math.max(1, Math.floor(values.length / 700));
  const points = [];
  for (let index = 0; index < values.length; index += stride) {
    points.push(`${index / (values.length - 1) * width},${height - (values[index] - minimum) / span * height}`);
  }
  return points.join(' ');
}

function SignalTrace({ label, values, color, events, duration, symmetric = true }) {
  const width = 900;
  const height = 130;
  const maximum = Math.max(...values.map(Math.abs), 1e-9);
  const minimumValue = symmetric ? -maximum : Math.min(...values, 0);
  const maximumValue = symmetric ? maximum : Math.max(...values, 1e-9);
  return <section className="signal-trace">
    <div><span>{label}</span><strong>{minimumValue.toFixed(2)} / {maximumValue.toFixed(2)}</strong></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} trace`} preserveAspectRatio="none">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="signal-zero" />
      <polyline points={tracePoints(values, width, height, minimumValue, maximumValue)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {events.map((event, index) => <g key={`${event.type}:${index}`} transform={`translate(${event.time / duration * width} 0)`}><line y1="0" y2={height} className={`signal-event ${event.type}`} /><text x="4" y={14 + (index % 3) * 13}>{event.type}</text></g>)}
    </svg>
  </section>;
}

function Slider({ label, value, min, max, step, onChange }) {
  return <NumericParamControl className="signal-range" label={label} value={value} min={min} max={max} step={step} onChange={onChange} />;
}

export default function PhaseSignalSim({ onBack }) {
  const [settings, setSettings] = useState({ preset: 'coupled', carrierHz: 37, noise: 0.02, slipThreshold: 2.4, fractureThreshold: 0.35, analogyEnabled: false, analogyOffset: 0.018 });
  const [panelVisible, setPanelVisible] = useState(true);
  const signal = useMemo(() => generateIqSignal({ preset: settings.preset, carrierHz: settings.carrierHz, noise: settings.noise }), [settings.carrierHz, settings.noise, settings.preset]);
  const demodulated = useMemo(() => demodulateIq(signal), [signal]);
  const events = useMemo(() => detectSignalEvents(signal, demodulated, { slipThreshold: settings.slipThreshold, fractureThreshold: settings.fractureThreshold }), [demodulated, settings.fractureThreshold, settings.slipThreshold, signal]);
  const analogyEvents = useMemo(() => signal.truth.filter(({ type }) => type === 'phase-slip').map((event) => ({ type: 'vortex-crossing', time: event.time + settings.analogyOffset })), [settings.analogyOffset, signal.truth]);
  const correlation = useMemo(() => correlateEvents(events.filter(({ type }) => type === 'phase-slip'), analogyEvents, 0.05), [analogyEvents, events]);
  const update = (patch) => setSettings((current) => ({ ...current, ...patch }));
  return <SimulatorBase mode="non-3d" className="signal-app" headerClassName="signal-topbar" brandClassName="signal-brand" mark="I/Q" markClassName="signal-mark" title="FRACTURE + PHASE-SLIP SIGNAL LAB" subtitle="Demodulation / unwrapping / event detection" actions={<button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button>} onHome={onBack}>
    <section className="signal-workbench">
      <div className="signal-heading"><span>COMPLEX BASEBAND / {signal.sampleRate} SAMPLES·S⁻¹</span><h1>Resolve discontinuity.</h1><p>Detected events are signal-processing outputs. Cross-domain vortex correlation is available only as an explicit analogy.</p></div>
      <SignalTrace label="IN-PHASE I" values={Array.from(signal.inPhase)} color="#67d1c3" events={events} duration={signal.duration} />
      <SignalTrace label="QUADRATURE Q" values={Array.from(signal.quadrature)} color="#e9a65d" events={events} duration={signal.duration} />
      <SignalTrace label="AMPLITUDE" values={Array.from(demodulated.amplitude)} color="#e6d06a" events={events} duration={signal.duration} symmetric={false} />
      <SignalTrace label="UNWRAPPED RESIDUAL PHASE" values={Array.from(demodulated.unwrappedPhase)} color="#95a9ee" events={events} duration={signal.duration} />
    </section>
    <aside className={`signal-panel ${panelVisible ? '' : 'is-hidden'}`}>
      <div className="signal-panel-heading"><div><span>EVENT PIPELINE</span><h2>I/Q analysis</h2></div></div>
      <ParamSelect className="signal-select" label="Synthetic case" value={settings.preset} options={SIGNAL_EVENT_PRESETS} onChange={(preset) => update({ preset })} />
      <Slider label="Carrier frequency" value={settings.carrierHz} min={5} max={120} step={1} onChange={(carrierHz) => update({ carrierHz })} />
      <Slider label="Noise amplitude" value={settings.noise} min={0} max={0.2} step={0.005} onChange={(noise) => update({ noise })} />
      <Slider label="Slip threshold" value={settings.slipThreshold} min={0.5} max={3.14} step={0.01} onChange={(slipThreshold) => update({ slipThreshold })} />
      <Slider label="Fracture threshold" value={settings.fractureThreshold} min={0.05} max={1} step={0.01} onChange={(fractureThreshold) => update({ fractureThreshold })} />
      <details open><summary>Detected events</summary>
        <div className="signal-readout"><span>Phase slips</span><strong>{events.filter(({ type }) => type === 'phase-slip').length}</strong></div>
        <div className="signal-readout"><span>Fracture bursts</span><strong>{events.filter(({ type }) => type === 'fracture').length}</strong></div>
        <div className="signal-readout"><span>Total events</span><strong>{events.length}</strong></div>
        <div className="signal-event-list">{events.slice(0, 8).map((event, index) => <div key={index}><span>{event.type}</span><strong>{event.time.toFixed(3)} s</strong></div>)}</div>
      </details>
      <details open><summary>Quantum-fluid analogy</summary>
        <label className="signal-toggle"><input type="checkbox" checked={settings.analogyEnabled} onChange={(event) => update({ analogyEnabled: event.target.checked })} /><span>Correlate synthetic vortex events</span></label>
        {settings.analogyEnabled && <>
          <Slider label="Analogy time offset" value={settings.analogyOffset} min={-0.1} max={0.1} step={0.001} onChange={(analogyOffset) => update({ analogyOffset })} />
          <div className="signal-readout"><span>Matched fraction</span><strong>{(correlation.fraction * 100).toFixed(0)}%</strong></div>
          <div className="signal-readout"><span>Matched events</span><strong>{correlation.matches.length}</strong></div>
          <p className="signal-warning">This compares event timestamps only. It does not assert that material fracture and quantum-vortex phase slips share a physical mechanism.</p>
        </>}
      </details>
    </aside>
  </SimulatorBase>;
}