import { useEffect, useMemo, useState } from 'react';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { SimulatorBase } from './lib/SimulatorBase.jsx';
import OamSolitonScene from './OamSolitonScene.jsx';
import { applyOamOperator, createOamInputState, getOamOperatorMatrix, measureOamState, OAM_MODES, OAM_OPERATOR_OPTIONS } from './oamSolitonModel.js';

const MODE_OPTIONS = OAM_MODES.map((mode) => ({ value: mode, label: `ℓ = ${mode}` }));
const MODE_COLORS = ['#e69a5b', '#72b9e8', '#df789b', '#8dd59d', '#bd9be9', '#edca68', '#64d5ce'];
const OPERATOR_MARKS = { 'beam-splitter': 'BS', 'phase-shift': 'Rφ', hadamard: 'H', swap: 'X', 'oam-rotation': 'Rℓ', identity: 'I' };
const VIEW_OPTIONS = [
  { value: '3d', label: '3D soliton field' },
  { value: 'bus', label: '2D bus diagram' },
  { value: 'spectrum', label: 'OAM spectrum' }
];

function phaseText(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} rad`;
}

function wavePath(value, orbitalMode, centerY, startX, endX, elapsed) {
  const amplitude = Math.hypot(value.re, value.im);
  if (amplitude < 0.004) return '';
  const phase = Math.atan2(value.im, value.re);
  const centerX = (startX + endX) * 0.5 + Math.sin(elapsed * 0.7) * 12;
  const points = [];
  for (let index = 0; index <= 76; index += 1) {
    const x = startX + (endX - startX) * index / 76;
    const envelope = 1 / Math.cosh((x - centerX) / 45);
    const carrier = (x - startX) * 0.14 + phase + orbitalMode * 0.42 + elapsed * 1.8;
    const y = centerY + Math.sin(carrier) * Math.min(amplitude, 1.45) * 25 * envelope;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M ${points.join(' L ')}`;
}

function WaveComponents({ state, rail, y, startX, endX, elapsed, className = '' }) {
  return OAM_MODES.map((mode, index) => {
    const path = wavePath(state[index][rail], mode, y, startX, endX, elapsed);
    return path && <path key={`${rail}:${mode}`} d={path} className={className} stroke={MODE_COLORS[index]} />;
  });
}

function formatComplex({ re, im }) {
  const real = Math.abs(re) < 0.005 ? '0' : re.toFixed(2);
  const imaginary = Math.abs(im) < 0.005 ? '' : `${im >= 0 ? '+' : '−'}${Math.abs(im).toFixed(2)}i`;
  return `${real}${imaginary}`;
}

function operatorEquation(operator, matrix, angleRadians, orbitalMode) {
  if (operator === 'oam-rotation') return `Uℓ = e^(iℓφ) I₂ · φ = ${phaseText(angleRadians)} · active ℓ = ${orbitalMode}`;
  const entries = matrix.flat().map(formatComplex);
  return `U = [ ${entries[0]}  ${entries[1]} ; ${entries[2]}  ${entries[3]} ]`;
}

function BusDiagram({ input, output, operator, matrix, elapsed, settings }) {
  const inputYs = [177, 354];
  const outputYs = [177, 354];
  const operatorLabel = OPERATOR_MARKS[operator];
  return <svg className="oam-diagram" viewBox="0 0 1000 490" role="img" aria-label="Two adjacent OAM soliton signals passing through a quantum operator on a photonic bus" preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern id="oam-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(137,190,184,.09)" strokeWidth="1" /></pattern>
      <filter id="oam-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <rect width="1000" height="490" fill="url(#oam-grid)" />
    <text x="54" y="52" className="oam-diagram-kicker">INPUT PAIR</text>
    <text x="500" y="52" textAnchor="middle" className="oam-diagram-kicker">UNITARY OPERATOR</text>
    <text x="946" y="52" textAnchor="end" className="oam-diagram-kicker">OUTPUT STATE</text>
    {inputYs.map((y, rail) => <g key={rail}>
      <line x1="48" x2="952" y1={y} y2={y} className="oam-bus-rail" />
      <text x="54" y={y - 37} className="oam-lane-label">SIGNAL {rail === 0 ? 'A' : 'B'} · ℓ {rail === 0 ? settings.modeA : settings.modeB}</text>
      <text x="946" y={y - 37} textAnchor="end" className="oam-lane-output">P{rail === 0 ? 'A' : 'B'} {(measureOamState(output).railProbabilities[rail] * 100).toFixed(1)}%</text>
    </g>)}
    {matrix.map((row, outputRail) => row.map((coefficient, inputRail) => {
      if (operator === 'oam-rotation' && outputRail !== inputRail) return null;
      const magnitude = Math.hypot(coefficient.re, coefficient.im);
      if (magnitude < 0.01) return null;
      const startY = inputYs[inputRail];
      const endY = outputYs[outputRail];
      return <path key={`${inputRail}:${outputRail}`} d={`M 434 ${startY} C 470 ${startY}, 530 ${endY}, 566 ${endY}`} className="oam-coupling" stroke={inputRail === outputRail ? '#72c7c0' : '#e6a45d'} strokeWidth={1 + magnitude * 2.4} opacity={0.2 + magnitude * 0.46} />;
    }))}
    <WaveComponents state={input} rail={0} y={inputYs[0]} startX={55} endX={430} elapsed={elapsed} />
    <WaveComponents state={input} rail={1} y={inputYs[1]} startX={55} endX={430} elapsed={elapsed} />
    <WaveComponents state={output} rail={0} y={outputYs[0]} startX={570} endX={946} elapsed={elapsed} />
    <WaveComponents state={output} rail={1} y={outputYs[1]} startX={570} endX={946} elapsed={elapsed} />
    <rect x="449" y="222" width="102" height="88" rx="3" className="oam-gate" />
    <circle cx="500" cy="256" r="17" className="oam-gate-ring" />
    <text x="500" y="262" textAnchor="middle" className="oam-gate-mark">{operatorLabel}</text>
    <text x="500" y="291" textAnchor="middle" className="oam-gate-name">{OAM_OPERATOR_OPTIONS.find(({ value }) => value === operator)?.label.toUpperCase()}</text>
    <circle cx={76 + (elapsed * 96) % 337} cy={inputYs[0]} r="3" className="oam-travel-dot" />
    <circle cx={591 + (elapsed * 96) % 337} cy={outputYs[1]} r="3" className="oam-travel-dot secondary" />
    <text x="54" y="441" className="oam-axis-label">SOLITON ENVELOPE · SECH PROFILE</text>
    <text x="946" y="441" textAnchor="end" className="oam-axis-label">IDEAL LOSSLESS PROPAGATION</text>
  </svg>;
}

function SpectrumDiagram({ output }) {
  const perMode = OAM_MODES.map((mode, index) => ({
    mode,
    power: output[index].reduce((sum, value) => sum + value.re ** 2 + value.im ** 2, 0)
  }));
  const total = perMode.reduce((sum, item) => sum + item.power, 0);
  return <svg className="oam-diagram oam-spectrum-diagram" viewBox="0 0 1000 490" role="img" aria-label="Output probability distribution by orbital angular momentum mode">
    <defs><pattern id="oam-spectrum-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(137,190,184,.09)" strokeWidth="1" /></pattern></defs>
    <rect width="1000" height="490" fill="url(#oam-spectrum-grid)" />
    <text x="58" y="54" className="oam-diagram-kicker">MODE-RESOLVED OUTPUT</text>
    <text x="942" y="54" textAnchor="end" className="oam-diagram-kicker">NORMALIZED PROBABILITY</text>
    {perMode.map(({ mode, power }, index) => {
      const probability = total > 0 ? power / total : 0;
      const y = 116 + index * 49;
      return <g key={mode}>
        <text x="72" y={y + 5} className="oam-spectrum-mode">ℓ {mode}</text>
        <line x1="160" x2="852" y1={y} y2={y} className="oam-spectrum-track" />
        <rect x="160" y={y - 8} width={692 * probability} height="16" fill={MODE_COLORS[index]} className="oam-spectrum-bar" />
        <text x="930" y={y + 5} textAnchor="end" className="oam-spectrum-value">{(probability * 100).toFixed(1)}%</text>
      </g>;
    })}
    <text x="72" y="459" className="oam-axis-label">PER-MODE POWER IS SUMMED ACROSS BOTH OUTPUT RAILS</text>
  </svg>;
}

export default function OamSolitonSim({ onBack }) {
  const [settings, setSettings] = useState({
    amplitudeA: 1,
    amplitudeB: 0.7,
    phaseA: 0,
    phaseB: 90,
    modeA: 1,
    modeB: -1,
    operator: 'beam-splitter',
    angleDegrees: 45,
    viewMode: '3d'
  });
  const [panelVisible, setPanelVisible] = useState(true);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const angleRadians = settings.angleDegrees * Math.PI / 180;
  const input = useMemo(() => createOamInputState({
    amplitudeA: settings.amplitudeA,
    amplitudeB: settings.amplitudeB,
    phaseA: settings.phaseA * Math.PI / 180,
    phaseB: settings.phaseB * Math.PI / 180,
    modeA: settings.modeA,
    modeB: settings.modeB
  }), [settings.amplitudeA, settings.amplitudeB, settings.modeA, settings.modeB, settings.phaseA, settings.phaseB]);
  const output = useMemo(() => applyOamOperator(input, { operator: settings.operator, angleRadians }), [angleRadians, input, settings.operator]);
  const measurement = useMemo(() => measureOamState(output), [output]);
  const matrix = useMemo(() => getOamOperatorMatrix(settings.operator, angleRadians), [angleRadians, settings.operator]);
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!running || settings.viewMode !== 'bus') return undefined;
    let frameId;
    let previousFrame = 0;
    let lastUpdate = 0;
    const tick = (timestamp) => {
      if (timestamp - lastUpdate >= 48) {
        const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.08) : 0;
        setElapsed((current) => current + delta);
        previousFrame = timestamp;
        lastUpdate = timestamp;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [running, settings.viewMode]);

  return <SimulatorBase mode={settings.viewMode === '3d' ? '3d' : 'non-3d'} className="signal-app oam-app" headerClassName="signal-topbar oam-topbar" brandClassName="signal-brand" mark="ℓ / OAM" markClassName="signal-mark oam-mark" title="OAM SOLITON OPERATOR LAB" subtitle="Orbital modes / dual-rail unitaries / photonic bus" actions={<div className="oam-top-actions">
    <button type="button" onClick={() => setRunning((value) => !value)} aria-pressed={running}>{running ? 'Pause propagation' : 'Resume propagation'}</button>
    <button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button>
  </div>} onHome={onBack}>
    {settings.viewMode === '3d' && <div className="oam-3d-field" role="img" aria-label="3D OAM soliton interference field" data-oam-simulation="3d">
      <OamSolitonScene input={input} output={output} operator={settings.operator} running={running} modeA={settings.modeA} modeB={settings.modeB} angleRadians={angleRadians} railProbabilities={measurement.railProbabilities} />
    </div>}
    <section className={`signal-workbench oam-workbench${settings.viewMode === '3d' ? ' is-3d' : ''}`}>
      <div className="signal-heading oam-heading"><span>DUAL-RAIL / OAM {-3}…+3 / COMPLEX AMPLITUDE</span><h1>Compose a soliton state.</h1><p>Set two coherent inputs, apply a unitary, and inspect the output mode probabilities.</p></div>
      {settings.viewMode !== '3d' && <div className="oam-stage">
        <div className="oam-stage-heading"><span>FIELD PROPAGATION</span><span className={running ? 'oam-live' : ''}>{running ? 'LIVE' : 'PAUSED'} <i /></span></div>
        {settings.viewMode === 'bus'
          ? <BusDiagram input={input} output={output} operator={settings.operator} matrix={matrix} elapsed={elapsed} settings={settings} />
          : <SpectrumDiagram output={output} />}
        <div className="oam-stage-footer">
          <span>{operatorEquation(settings.operator, matrix, angleRadians, settings.modeA)}</span>
          <span>‖ψ‖² {measurement.totalIntensity.toFixed(3)}</span>
        </div>
      </div>}
      {settings.viewMode === '3d' && <div className="oam-scene-readout"><span>{operatorEquation(settings.operator, matrix, angleRadians, settings.modeA)}</span><strong>‖ψ‖² {measurement.totalIntensity.toFixed(3)}</strong></div>}
      <div className="oam-mode-legend" aria-label="OAM mode colors">
        {OAM_MODES.map((mode, index) => <span key={mode}><i style={{ background: MODE_COLORS[index] }} />ℓ {mode}</span>)}
      </div>
    </section>
    <aside className={`signal-panel oam-panel${panelVisible ? '' : ' is-hidden'}`}>
      <div className="signal-panel-heading"><div><span>INPUT STATE</span><h2>Soliton pair</h2></div></div>
      <div className="oam-control-pair">
        <NumericParamControl className="signal-range" label="Signal A amplitude" value={settings.amplitudeA} min={0} max={1} step={0.01} onChange={(value) => update('amplitudeA', value)} />
        <NumericParamControl className="signal-range" label="Signal B amplitude" value={settings.amplitudeB} min={0} max={1} step={0.01} onChange={(value) => update('amplitudeB', value)} />
      </div>
      <div className="oam-control-pair">
        <ParamSelect className="signal-select" label="Input A mode" value={settings.modeA} options={MODE_OPTIONS} onChange={(value) => update('modeA', value)} />
        <ParamSelect className="signal-select" label="Input B mode" value={settings.modeB} options={MODE_OPTIONS} onChange={(value) => update('modeB', value)} />
      </div>
      <div className="oam-control-pair">
        <NumericParamControl className="signal-range" label="Input A phase" value={settings.phaseA} min={-180} max={180} step={1} suffix="°" onChange={(value) => update('phaseA', value)} />
        <NumericParamControl className="signal-range" label="Input B phase" value={settings.phaseB} min={-180} max={180} step={1} suffix="°" onChange={(value) => update('phaseB', value)} />
      </div>
      <details className="oam-operator-controls" open>
        <summary>Quantum operator</summary>
        <ParamSelect className="signal-select" label="Visualization" value={settings.viewMode} options={VIEW_OPTIONS} onChange={(value) => update('viewMode', value)} />
        <ParamSelect className="signal-select" label="Apply operator" value={settings.operator} options={OAM_OPERATOR_OPTIONS} onChange={(value) => update('operator', value)} />
        <NumericParamControl className="signal-range" label={settings.operator === 'beam-splitter' ? 'Coupling angle' : 'Operator angle'} value={settings.angleDegrees} min={-180} max={180} step={1} suffix="°" disabled={settings.operator === 'identity' || settings.operator === 'swap' || settings.operator === 'hadamard'} onChange={(value) => update('angleDegrees', value)} />
        <div className="oam-operator-equation">{operatorEquation(settings.operator, matrix, angleRadians, settings.modeA)}</div>
      </details>
      <details className="oam-output-details" open>
        <summary>Output measurement</summary>
        <div className="signal-readout"><span>Rail A probability</span><strong>{(measurement.railProbabilities[0] * 100).toFixed(1)}%</strong></div>
        <div className="signal-readout"><span>Rail B probability</span><strong>{(measurement.railProbabilities[1] * 100).toFixed(1)}%</strong></div>
        <div className="signal-readout"><span>Total intensity</span><strong>{measurement.totalIntensity.toFixed(3)}</strong></div>
        <div className="oam-mode-readout">{OAM_MODES.map((mode, index) => <div key={mode}>
          <span style={{ color: MODE_COLORS[index] }}>ℓ {mode}</span><div><i style={{ width: `${measurement.modeProbabilities[index] * 100}%`, background: MODE_COLORS[index] }} /></div><strong>{(measurement.modeProbabilities[index] * 100).toFixed(1)}%</strong>
        </div>)}</div>
      </details>
      <p className="oam-model-note">Ideal lossless dual-rail model. Soliton envelopes visualize the complex amplitudes; this is not a device-level optical solver or a claim of fault-tolerant gate performance.</p>
    </aside>
  </SimulatorBase>;
}