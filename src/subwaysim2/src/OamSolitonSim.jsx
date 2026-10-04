import { useEffect, useMemo, useState } from 'react';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { SimulatorBase } from './lib/SimulatorBase.jsx';
import OamSolitonScene from './OamSolitonScene.jsx';
import { applyOamOperator, createOamInputState, getActiveOamModes, getOamOperatorMatrix, getQuantumOperatorMatrix, measureOamState, OAM_MODES, OAM_OPERATOR_OPTIONS, QUDIT_DIMENSIONS, QUANTUM_OPERATOR_SCHEMA } from './oamSolitonModel.js';

const MODE_OPTIONS = OAM_MODES.map((mode) => ({ value: mode, label: `ℓ = ${mode}` }));
const MODE_COLORS = ['#e69a5b', '#72b9e8', '#df789b', '#8dd59d', '#bd9be9', '#edca68', '#64d5ce'];
const OPERATOR_MARKS = { 'beam-splitter': 'BS', 'phase-shift': 'Pφ', hadamard: 'H', swap: 'X', 'pauli-x': 'X', 'pauli-y': 'Y', 'pauli-z': 'Z', 'rotation-x': 'Rx', 'rotation-y': 'Ry', 'rotation-z': 'Rz', 'phase-s': 'S', 'phase-t': 'T', 'oam-rotation': 'Rℓ', identity: 'I', 'controlled-oam-sum': 'Σ', 'controlled-oam-phase': 'Cφ', cnot: 'CX', cz: 'CZ', toffoli: 'CCX' };
const BUS_SIGNAL_START_X = 55;
const BUS_GATE_START_X = 434;
const BUS_GATE_END_X = 566;
const BUS_SIGNAL_END_X = 946;
const VIEW_OPTIONS = [
  { value: '3d', label: '3D soliton field' },
  { value: 'bus', label: '2D bus diagram' },
  { value: 'spectrum', label: 'OAM spectrum' }
];

function phaseText(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} rad`;
}

function smoothStep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function branchCoefficient(operator, matrix, mode, angleRadians, outputRail, inputRail, quditDimension) {
  if (['controlled-oam-sum', 'controlled-oam-phase', 'cnot', 'cz', 'toffoli'].includes(operator)) {
    if (outputRail !== inputRail) return { re: 0, im: 0 };
    const activeModes = getActiveOamModes(quditDimension);
    const level = activeModes.indexOf(mode);
    if (operator === 'controlled-oam-phase' && inputRail === 1 && level >= 0) {
      return { re: Math.cos(angleRadians * level), im: Math.sin(angleRadians * level) };
    }
    if (operator === 'cz' && inputRail === 1 && level === 1) return { re: -1, im: 0 };
    return { re: 1, im: 0 };
  }
  if (operator !== 'oam-rotation') return matrix[outputRail][inputRail];
  if (outputRail !== inputRail) return { re: 0, im: 0 };
  return { re: Math.cos(mode * angleRadians), im: Math.sin(mode * angleRadians) };
}

function wavePath(value, orbitalMode, outputOrbitalMode, inputY, outputY, coefficient, elapsed, pulseOffset) {
  const amplitude = Math.hypot(value.re, value.im);
  const coefficientMagnitude = Math.hypot(coefficient.re, coefficient.im);
  if (amplitude < 0.004 || coefficientMagnitude < 0.01) return '';
  const inputPhase = Math.atan2(value.im, value.re);
  const operatorPhase = Math.atan2(coefficient.im, coefficient.re);
  const travelLength = Math.max(BUS_SIGNAL_END_X - BUS_SIGNAL_START_X - 38, 1);
  const centerX = BUS_SIGNAL_START_X + 21 + (elapsed * 96 + pulseOffset) % travelLength;
  const points = [];
  for (let index = 0; index <= 76; index += 1) {
    const x = BUS_SIGNAL_START_X + (BUS_SIGNAL_END_X - BUS_SIGNAL_START_X) * index / 76;
    const envelope = 1 / Math.cosh((x - centerX) / 45);
    const gateProgress = smoothStep((x - BUS_GATE_START_X) / (BUS_GATE_END_X - BUS_GATE_START_X));
    const routeY = inputY + (outputY - inputY) * gateProgress;
    const routeAmplitude = 1 + (coefficientMagnitude - 1) * gateProgress;
    const currentOrbitalMode = orbitalMode + (outputOrbitalMode - orbitalMode) * gateProgress;
    const carrier = (x - BUS_SIGNAL_START_X) * 0.14 + inputPhase + currentOrbitalMode * 0.42 + operatorPhase * gateProgress - elapsed * 1.8;
    const y = routeY + Math.sin(carrier) * Math.min(amplitude * routeAmplitude, 1.45) * 25 * envelope;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M ${points.join(' L ')}`;
}

function targetOamMode(operator, inputRail, orbitalMode, quditDimension) {
  const activeModes = getActiveOamModes(quditDimension);
  const activeIndex = activeModes.indexOf(orbitalMode);
  if (activeIndex < 0) return orbitalMode;
  if (inputRail !== 1) return orbitalMode;
  if (operator === 'controlled-oam-sum') return activeModes[(activeIndex + 1) % activeModes.length];
  if (operator === 'cnot' && activeIndex < 2) return activeModes[1 - activeIndex];
  if (operator === 'toffoli' && (activeIndex === 2 || activeIndex === 3)) return activeModes[5 - activeIndex];
  return orbitalMode;
}

function WaveComponents({ state, inputRail, inputYs, outputYs, operator, matrix, angleRadians, quditDimension, elapsed, opacity, lineWidth }) {
  return OAM_MODES.flatMap((mode, modeIndex) => [0, 1].map((outputRail) => {
    const coefficient = branchCoefficient(operator, matrix, mode, angleRadians, outputRail, inputRail, quditDimension);
    const coefficientMagnitude = Math.hypot(coefficient.re, coefficient.im);
    const outputMode = targetOamMode(operator, inputRail, mode, quditDimension);
    const path = wavePath(state[modeIndex][inputRail], mode, outputMode, inputYs[inputRail], outputYs[outputRail], coefficient, elapsed, inputRail * 24 + modeIndex * 5);
    return path && <path
      key={`${inputRail}:${outputRail}:${mode}`}
      className="oam-signal-branch"
      data-input-rail={inputRail}
      data-output-rail={outputRail}
      data-oam-mode={mode}
      data-output-oam-mode={outputMode}
      d={path}
      stroke={MODE_COLORS[modeIndex]}
      strokeWidth={lineWidth}
      opacity={opacity * Math.min(1, coefficientMagnitude)}
    />;
  }));
}

function TravelingPackets({ input, inputYs, outputYs, operator, matrix, angleRadians, quditDimension, elapsed, opacity }) {
  const travelLength = BUS_SIGNAL_END_X - BUS_SIGNAL_START_X - 38;
  return input.flatMap((pair, modeIndex) => [0, 1].flatMap((inputRail) => [0, 1].map((outputRail) => {
    const coefficient = branchCoefficient(operator, matrix, OAM_MODES[modeIndex], angleRadians, outputRail, inputRail, quditDimension);
    const branchMagnitude = Math.hypot(coefficient.re, coefficient.im);
    const signalMagnitude = Math.hypot(pair[inputRail].re, pair[inputRail].im);
    if (branchMagnitude < 0.01 || signalMagnitude < 0.01) return null;
    const pulseOffset = inputRail * 24 + modeIndex * 5;
    const x = BUS_SIGNAL_START_X + 21 + (elapsed * 96 + pulseOffset) % travelLength;
    const gateProgress = smoothStep((x - BUS_GATE_START_X) / (BUS_GATE_END_X - BUS_GATE_START_X));
    const y = inputYs[inputRail] + (outputYs[outputRail] - inputYs[inputRail]) * gateProgress;
    return <circle
      key={`${inputRail}:${outputRail}:${OAM_MODES[modeIndex]}`}
      className="oam-moving-packet"
      data-input-rail={inputRail}
      data-output-rail={outputRail}
      data-oam-mode={OAM_MODES[modeIndex]}
      data-output-oam-mode={targetOamMode(operator, inputRail, OAM_MODES[modeIndex], quditDimension)}
      cx={x}
      cy={y}
      r={2 + Math.min(signalMagnitude * branchMagnitude, 1.5) * 1.6}
      fill={MODE_COLORS[modeIndex]}
      opacity={opacity * Math.min(1, signalMagnitude * branchMagnitude)}
    />;
  })));
}

function formatComplex({ re, im }) {
  const real = Math.abs(re) < 0.005 ? '0' : re.toFixed(2);
  const imaginary = Math.abs(im) < 0.005 ? '' : `${im >= 0 ? '+' : '−'}${Math.abs(im).toFixed(2)}i`;
  return `${real}${imaginary}`;
}

function operatorEquation(operator, matrix, angleRadians, orbitalMode, quditDimension = OAM_MODES.length) {
  if (operator === 'controlled-oam-sum') return `Q ⊗ OAM${quditDimension}: |1,m⟩ → |1,(m+1) mod ${quditDimension}⟩`;
  if (operator === 'controlled-oam-phase') return `Q ⊗ OAM${quditDimension}: |1,m⟩ → e^(imθ)|1,m⟩ · θ = ${phaseText(angleRadians)}`;
  if (operator === 'cnot') return `Q ⊗ OAM${quditDimension}: |1,0⟩ ↔ |1,1⟩`;
  if (operator === 'cz') return `Q ⊗ OAM${quditDimension}: |1,1⟩ → −|1,1⟩`;
  if (operator === 'toffoli') return `CCX: |1,2⟩ ↔ |1,3⟩ · m = ${quditDimension}`;
  if (operator === 'cnot') return `Q ⊗ OAM${quditDimension}: |1,0⟩ ↔ |1,1⟩`;
  if (operator === 'cz') return `Q ⊗ OAM${quditDimension}: |1,1⟩ → −|1,1⟩`;
  if (operator === 'toffoli') return `CCX: |1,2⟩ ↔ |1,3⟩ · m = ${quditDimension}`;
  if (operator === 'oam-rotation') return `Uℓ = e^(iℓφ) I₂ · φ = ${phaseText(angleRadians)} · active ℓ = ${orbitalMode}`;
  const entries = matrix.flat().map(formatComplex);
  return `U = [ ${entries[0]}  ${entries[1]} ; ${entries[2]}  ${entries[3]} ]`;
}

function formatOperatorAttribute(value) {
  if (value === null || value === undefined) return 'Fixed';
  if (Array.isArray(value)) return value.length ? value.join('; ') : 'None';
  if (typeof value === 'object') return `${value.name} (${value.symbol}), ${value.min} to ${value.max} ${value.unit}`;
  return String(value);
}

function matrixBasisLabel(index, quditDimension) {
  if (quditDimension === 1) return String(index);
  return `${Math.floor(index / quditDimension)}:${index % quditDimension}`;
}

function SelectedOperatorMatrix({ operator, angleRadians, quditDimension, orbitalMode }) {
  const matrix = useMemo(() => getQuantumOperatorMatrix(operator, { angleRadians, quditDimension, orbitalMode }), [angleRadians, operator, orbitalMode, quditDimension]);
  const metadata = OAM_OPERATOR_OPTIONS.find((entry) => entry.value === operator);
  const basisDimension = operator === 'toffoli' || metadata?.type === 'binary' ? quditDimension : 1;
  return <section className="oam-selected-matrix" aria-label={`${metadata?.label ?? operator} matrix representation`}>
    <div className="oam-matrix-heading"><span>SELECTED MATRIX</span><span>{matrix.length} × {matrix.length}</span></div>
    <div className="oam-matrix-scroll">
      <table className="oam-matrix-table">
        <thead><tr><th scope="col">out\in</th>{matrix.map((_, index) => <th key={index} scope="col">{matrixBasisLabel(index, basisDimension)}</th>)}</tr></thead>
        <tbody>{matrix.map((row, rowIndex) => <tr key={rowIndex}>
          <th scope="row">{matrixBasisLabel(rowIndex, basisDimension)}</th>
          {row.map((entry, columnIndex) => <td key={columnIndex}>{formatComplex(entry)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function OperatorCatalog() {
  const attributes = QUANTUM_OPERATOR_SCHEMA.required;
  return <details className="oam-operator-catalog">
    <summary>Operator table ({OAM_OPERATOR_OPTIONS.length})</summary>
    <div className="oam-catalog-scroll">
      <table className="oam-catalog-table">
        <thead><tr>{attributes.map((attribute) => <th key={attribute} scope="col">{attribute}</th>)}</tr></thead>
        <tbody>{OAM_OPERATOR_OPTIONS.map((operator) => <tr key={operator.value}>
          {attributes.map((attribute) => <td key={attribute}>{formatOperatorAttribute(operator[attribute])}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}

function BusDiagram({ input, output, operator, matrix, angleRadians, angleSymbol, quditDimension, elapsed, settings, signalOpacity, signalLineWidth }) {
  const inputYs = [177, 354];
  const outputYs = [177, 354];
  const operatorLabel = OPERATOR_MARKS[operator];
  const metadata = OAM_OPERATOR_OPTIONS.find(({ value }) => value === operator);
  const operatorType = metadata?.type === 'ternary' ? '3Q' : metadata?.type === 'binary' ? (operator.startsWith('controlled-oam-') ? 'Q×Qd' : '2Q') : '1Q';
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
    <WaveComponents state={input} inputRail={0} inputYs={inputYs} outputYs={outputYs} operator={operator} matrix={matrix} angleRadians={angleRadians} quditDimension={quditDimension} elapsed={elapsed} opacity={signalOpacity} lineWidth={signalLineWidth} />
    <WaveComponents state={input} inputRail={1} inputYs={inputYs} outputYs={outputYs} operator={operator} matrix={matrix} angleRadians={angleRadians} quditDimension={quditDimension} elapsed={elapsed} opacity={signalOpacity} lineWidth={signalLineWidth} />
    <rect x="419" y="212" width="162" height="108" rx="3" className="oam-gate" />
    <circle cx="500" cy="256" r="17" className="oam-gate-ring" />
    <text x="500" y="262" textAnchor="middle" className="oam-gate-mark">{operatorLabel}</text>
    <text x="500" y="291" textAnchor="middle" className="oam-gate-name">{operatorType} · {metadata?.shortName}</text>
    <text x="500" y="306" textAnchor="middle" className="oam-gate-angle">{angleSymbol ? `${angleSymbol} ${settings.angleDegrees}°` : ''}</text>
    <TravelingPackets input={input} inputYs={inputYs} outputYs={outputYs} operator={operator} matrix={matrix} angleRadians={angleRadians} quditDimension={quditDimension} elapsed={elapsed} opacity={signalOpacity} />
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
    quditDimension: OAM_MODES.length,
    simulationSpeed: 1,
    signalOpacity: 0.3,
    signalLineWidth: 2.5,
    amplitudeSizeVariation: 1,
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
  const output = useMemo(() => applyOamOperator(input, { operator: settings.operator, angleRadians, quditDimension: settings.quditDimension }), [angleRadians, input, settings.operator, settings.quditDimension]);
  const measurement = useMemo(() => measureOamState(output), [output]);
  const matrix = useMemo(() => getOamOperatorMatrix(settings.operator, angleRadians), [angleRadians, settings.operator]);
  const operatorMetadata = OAM_OPERATOR_OPTIONS.find(({ value }) => value === settings.operator);
  const angleSymbol = operatorMetadata?.parameter?.symbol;
  const binaryOperator = operatorMetadata?.type !== 'unary';
  const inputModes = binaryOperator ? getActiveOamModes(settings.quditDimension) : OAM_MODES;
  const modeOptions = inputModes.map((mode) => ({ value: mode, label: `ℓ = ${mode}` }));
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const updateOperator = (operator) => {
    const metadata = OAM_OPERATOR_OPTIONS.find((entry) => entry.value === operator);
    setSettings((current) => ({
      ...current,
      operator,
      quditDimension: Math.max(current.quditDimension, metadata?.minimumQuditDimension ?? 2)
    }));
  };
  const updateQuditDimension = (quditDimension) => {
    const activeModes = getActiveOamModes(quditDimension);
    const nearestMode = (currentMode) => activeModes.reduce((nearest, mode) => Math.abs(mode - currentMode) < Math.abs(nearest - currentMode) ? mode : nearest, activeModes[0]);
    setSettings((current) => ({
      ...current,
      quditDimension,
      modeA: activeModes.includes(current.modeA) ? current.modeA : nearestMode(current.modeA),
      modeB: activeModes.includes(current.modeB) ? current.modeB : nearestMode(current.modeB)
    }));
  };

  useEffect(() => {
    if (!running || settings.viewMode !== 'bus' || settings.simulationSpeed <= 0) return undefined;
    let frameId;
    let previousFrame = 0;
    const tick = (timestamp) => {
      const delta = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.08) : 0;
      if (delta > 0) setElapsed((current) => current + delta * settings.simulationSpeed);
      previousFrame = timestamp;
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [running, settings.simulationSpeed, settings.viewMode]);

  return <SimulatorBase mode={settings.viewMode === '3d' ? '3d' : 'non-3d'} className="signal-app oam-app" headerClassName="signal-topbar oam-topbar" brandClassName="signal-brand" mark="ℓ / OAM" markClassName="signal-mark oam-mark" title="OAM SOLITON OPERATOR LAB" subtitle="Orbital modes / dual-rail unitaries / photonic bus" actions={<div className="oam-top-actions">
    <button type="button" onClick={() => setRunning((value) => !value)} aria-pressed={running}>{running ? 'Pause propagation' : 'Resume propagation'}</button>
    <button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button>
  </div>} onHome={onBack}>
    {settings.viewMode === '3d' && <div className="oam-3d-field" role="img" aria-label="3D OAM soliton interference field" data-oam-simulation="3d">
      <OamSolitonScene input={input} output={output} operator={settings.operator} running={running} simulationSpeed={settings.simulationSpeed} signalOpacity={settings.signalOpacity} amplitudeSizeVariation={settings.amplitudeSizeVariation} modeA={settings.modeA} modeB={settings.modeB} angleRadians={angleRadians} quditDimension={settings.quditDimension} railProbabilities={measurement.railProbabilities} />
    </div>}
    <section className={`signal-workbench oam-workbench${settings.viewMode === '3d' ? ' is-3d' : ''}`}>
      <div className="signal-heading oam-heading"><span>DUAL-RAIL / OAM {-3}…+3 / COMPLEX AMPLITUDE</span><h1>Compose a soliton state.</h1><p>Set two coherent inputs, apply a unitary, and inspect the output mode probabilities.</p></div>
      {settings.viewMode !== '3d' && <div className="oam-stage">
        <div className="oam-stage-heading"><span>FIELD PROPAGATION</span><span className={running ? 'oam-live' : ''}>{running ? 'LIVE' : 'PAUSED'} <i /></span></div>
        {settings.viewMode === 'bus'
          ? <BusDiagram input={input} output={output} operator={settings.operator} matrix={matrix} angleRadians={angleRadians} angleSymbol={angleSymbol} quditDimension={settings.quditDimension} elapsed={elapsed} settings={settings} signalOpacity={settings.signalOpacity} signalLineWidth={settings.signalLineWidth} />
          : <SpectrumDiagram output={output} />}
        <div className="oam-stage-footer">
          <span>{operatorEquation(settings.operator, matrix, angleRadians, settings.modeA, settings.quditDimension)}</span>
          <span>‖ψ‖² {measurement.totalIntensity.toFixed(3)}</span>
        </div>
      </div>}
      {settings.viewMode === '3d' && <div className="oam-scene-readout"><span>{operatorEquation(settings.operator, matrix, angleRadians, settings.modeA, settings.quditDimension)}</span><strong>‖ψ‖² {measurement.totalIntensity.toFixed(3)}</strong></div>}
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
        <ParamSelect className="signal-select" label="Input A mode" value={settings.modeA} options={modeOptions} onChange={(value) => update('modeA', value)} />
        <ParamSelect className="signal-select" label="Input B mode" value={settings.modeB} options={modeOptions} onChange={(value) => update('modeB', value)} />
      </div>
      <div className="oam-control-pair">
        <NumericParamControl className="signal-range" label="Input A phase" value={settings.phaseA} min={-180} max={180} step={1} suffix="°" onChange={(value) => update('phaseA', value)} />
        <NumericParamControl className="signal-range" label="Input B phase" value={settings.phaseB} min={-180} max={180} step={1} suffix="°" onChange={(value) => update('phaseB', value)} />
      </div>
      <details className="oam-signal-controls" open>
        <summary>Signal motion and appearance</summary>
        <NumericParamControl className="signal-range" label="Simulation speed" value={settings.simulationSpeed} min={0} max={10} step={0.01} suffix="x" onChange={(value) => update('simulationSpeed', value)} />
        <NumericParamControl className="signal-range" label="Signal opacity" value={settings.signalOpacity} min={0} max={1} step={0.01} onChange={(value) => update('signalOpacity', value)} />
        <NumericParamControl className="signal-range" label="Signal line width (2D)" value={settings.signalLineWidth} min={0.5} max={8} step={0.1} suffix="px" onChange={(value) => update('signalLineWidth', value)} />
        <NumericParamControl className="signal-range" label="Beam width vs amplitude (3D)" value={settings.amplitudeSizeVariation} min={0} max={5} step={0.01} suffix="x" onChange={(value) => update('amplitudeSizeVariation', value)} />
      </details>
      <details className="oam-operator-controls" open>
        <summary>Quantum operator</summary>
        <ParamSelect className="signal-select" label="Visualization" value={settings.viewMode} options={VIEW_OPTIONS} onChange={(value) => update('viewMode', value)} />
        <ParamSelect className="signal-select" label="Apply operator" value={settings.operator} options={OAM_OPERATOR_OPTIONS} onChange={updateOperator} />
        {binaryOperator && <>
          <ParamSelect className="signal-select" label="OAM qudit dimension (m)" value={settings.quditDimension} options={QUDIT_DIMENSIONS.filter((dimension) => dimension >= operatorMetadata.minimumQuditDimension).map((dimension) => ({ value: dimension, label: `${dimension} levels` }))} onChange={updateQuditDimension} />
          <p className="oam-register-note">{operatorMetadata.arity}-register operation · dual-rail qubit × {settings.quditDimension}-level OAM qudit</p>
        </>}
        {operatorMetadata.parameter && <NumericParamControl className="signal-range" label={operatorMetadata.parameter.name} value={settings.angleDegrees} min={operatorMetadata.parameter.min} max={operatorMetadata.parameter.max} step={1} suffix="°" onChange={(value) => update('angleDegrees', value)} />}
        <div className="oam-operator-equation">{operatorEquation(settings.operator, matrix, angleRadians, settings.modeA, settings.quditDimension)}</div>
        <SelectedOperatorMatrix operator={settings.operator} angleRadians={angleRadians} quditDimension={settings.quditDimension} orbitalMode={settings.modeA} />
        <OperatorCatalog />
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