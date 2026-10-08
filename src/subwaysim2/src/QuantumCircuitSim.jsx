import { Fragment, useMemo, useState } from 'react';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { SimulatorBase } from './lib/SimulatorBase.jsx';
import {
  compareQuantumCircuitModels,
  DEFAULT_CLASSICAL_INTENSITY_SETTINGS,
  normalizeClassicalIntensitySettings,
  optimizeClassicalIntensitySettings,
  QUANTUM_CIRCUIT_GATES,
  QUANTUM_CIRCUIT_MODELS,
  sampleIntensityMeasurement,
  simulateClassicalIntensityDetector,
  simulateIntensityCircuit
} from './quantumCircuitModel.js';

const BELL_GATES = [{ type: 'H', target: 0 }, { type: 'CNOT', control: 0, target: 1 }];
const INTERFERENCE_GATES = [{ type: 'H', target: 0 }, { type: 'S', target: 0 }, { type: 'H', target: 0 }];
const DETECTOR_PARAMETER_LABELS = { wavelength: 'Wavelength', railSpacing: 'Basis rail spacing', detectorDistance: 'Detector distance', portWidth: 'Output port width', beamPhaseShift: 'Beam phase shift' };

function basisStateOptions(qubitCount) {
  return Array.from({ length: 1 << qubitCount }, (_, index) => {
    const value = index.toString(2).padStart(qubitCount, '0');
    return { value, label: `|${value}⟩` };
  });
}

function formatAmplitude({ real, imaginary }) {
  const sign = imaginary < 0 ? '-' : '+';
  return `${real.toFixed(3)} ${sign} ${Math.abs(imaginary).toFixed(3)}i`;
}

function CircuitDiagram({ qubitCount, gates, onRemoveGate }) {
  const columns = Math.max(gates.length, 1);
  const gridStyle = { gridTemplateColumns: `64px repeat(${columns}, 66px)`, gridTemplateRows: `34px repeat(${qubitCount}, 62px)` };
  return <div className="qc-circuit-scroll">
    <div className="qc-circuit-grid" style={gridStyle} role="group" aria-label={`${qubitCount}-qubit gate circuit with ${gates.length} gates`}>
      <span className="qc-grid-corner">INPUT</span>
      {gates.length ? gates.map((gate, gateIndex) => <div className="qc-gate-heading" key={`heading-${gateIndex}`}>
        <span>{gate.type}</span>
        <button type="button" aria-label={`Remove gate ${gateIndex + 1}`} title="Remove gate" onClick={() => onRemoveGate(gateIndex)}>×</button>
      </div>) : <span className="qc-empty-heading">OUTPUT</span>}
      {Array.from({ length: qubitCount }, (_, qubit) => <Fragment key={`wire-${qubit}`}>
        <strong className="qc-wire-label">Q{qubit}</strong>
        {gates.length ? gates.map((gate, gateIndex) => <div className="qc-gate-cell" key={`${gateIndex}-${qubit}`}>
          <span className="qc-wire-line" />
          {gate.type === 'CNOT' && gate.control === qubit && <span className="qc-control-dot" />}
          {gate.type === 'CNOT' && gate.target === qubit && <span className="qc-target-node">+</span>}
          {gate.type !== 'CNOT' && gate.target === qubit && <span className="qc-single-node">{gate.type}</span>}
          {gate.type === 'CNOT' && gate.control !== qubit && gate.target !== qubit && <span className="qc-wire-line qc-wire-spacer" />}
        </div>) : <div className="qc-gate-cell" key={`empty-${qubit}`}><span className="qc-wire-line" /></div>}
      </Fragment>)}
      {gates.map((gate, gateIndex) => gate.type === 'CNOT' && <span
        className="qc-cnot-connector"
        key={`connector-${gateIndex}`}
        style={{
          left: 97 + gateIndex * 66,
          top: 65 + Math.min(gate.control, gate.target) * 62,
          height: Math.abs(gate.control - gate.target) * 62
        }}
      />)}
    </div>
  </div>;
}

function IntensityReadout({ circuit, shotCounts, modelLabel }) {
  return <section className="qc-intensity-section" aria-label="Measurement intensities">
    <div className="qc-section-heading"><span>{modelLabel}</span><strong>ΣI {circuit.totalIntensity.toFixed(3)}</strong></div>
    <div className="qc-intensity-list">
      {circuit.outcomes.map(({ state, amplitude, intensity }) => {
        const probability = intensity / circuit.totalIntensity;
        const shots = shotCounts[state] ?? 0;
        const totalShots = Object.values(shotCounts).reduce((sum, count) => sum + count, 0);
        return <div className="qc-intensity-row" key={state}>
          <strong className="qc-ket">|{state}⟩</strong>
          <div className="qc-intensity-track" role="img" aria-label={`Intensity for state ${state}: ${(probability * 100).toFixed(1)} percent`}>
            <span style={{ width: `${Math.max(0, Math.min(100, probability * 100))}%` }} />
          </div>
          <strong className="qc-probability">{(probability * 100).toFixed(1)}%</strong>
          <code>{formatAmplitude(amplitude)}</code>
          {totalShots > 0 && <small>{shots} / {totalShots} shots</small>}
        </div>;
      })}
    </div>
  </section>;
}

export default function QuantumCircuitSim({ onBack }) {
  const [qubitCount, setQubitCount] = useState(2);
  const [initialState, setInitialState] = useState('00');
  const [gates, setGates] = useState(BELL_GATES);
  const [gateType, setGateType] = useState('H');
  const [targetQubit, setTargetQubit] = useState(0);
  const [controlQubit, setControlQubit] = useState(0);
  const [shotCounts, setShotCounts] = useState({});
  const [lastMeasurement, setLastMeasurement] = useState(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const [simulationModel, setSimulationModel] = useState('ideal');
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonReference, setComparisonReference] = useState('ideal');
  const [detectorSettings, setDetectorSettings] = useState(() => ({ ...DEFAULT_CLASSICAL_INTENSITY_SETTINGS }));
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [optimizationProgress, setOptimizationProgress] = useState(null);
  const [optimizationError, setOptimizationError] = useState('');
  const idealCircuit = useMemo(() => simulateIntensityCircuit({ qubitCount, initialState, gates }), [gates, initialState, qubitCount]);
  const detectorCircuit = useMemo(() => simulateClassicalIntensityDetector(idealCircuit, detectorSettings), [detectorSettings, idealCircuit]);
  const circuit = simulationModel === 'classical-detector' ? detectorCircuit : idealCircuit;
  const modelOutputs = { ideal: idealCircuit, 'classical-detector': detectorCircuit };
  const comparisonCandidate = comparisonReference === 'ideal' ? 'classical-detector' : 'ideal';
  const comparisonSummary = useMemo(() => comparisonEnabled
    ? compareQuantumCircuitModels(modelOutputs[comparisonReference], modelOutputs[comparisonCandidate])
    : null, [comparisonCandidate, comparisonEnabled, comparisonReference, idealCircuit, detectorCircuit]);
  const detectorInputSignature = JSON.stringify({ qubitCount, initialState, gates, detectorSettings });
  const optimizationIsStale = Boolean(optimizationResult && optimizationResult.inputSignature !== detectorInputSignature);
  const qubitOptions = Array.from({ length: qubitCount }, (_, qubit) => ({ value: qubit, label: `Qubit ${qubit}` }));
  const availableGates = QUANTUM_CIRCUIT_GATES.filter(({ id }) => id !== 'CNOT' || qubitCount === 2)
    .map(({ id, label }) => ({ value: id, label: `${id} / ${label}` }));

  const clearMeasurements = () => {
    setShotCounts({});
    setLastMeasurement(null);
  };
  const updateDetectorSettings = (parameter, value) => {
    setDetectorSettings((current) => normalizeClassicalIntensitySettings({ ...current, [parameter]: value }));
    clearMeasurements();
  };
  const setWidth = (nextCount) => {
    setQubitCount(nextCount);
    setInitialState('0'.repeat(nextCount));
    setGates([]);
    setGateType('H');
    setTargetQubit(0);
    setControlQubit(0);
    clearMeasurements();
  };
  const loadCircuit = (nextGates, nextQubitCount = 2) => {
    setQubitCount(nextQubitCount);
    setInitialState('0'.repeat(nextQubitCount));
    setGates(nextGates);
    setGateType('H');
    setTargetQubit(0);
    setControlQubit(0);
    clearMeasurements();
  };
  const appendGate = () => {
    if (gateType === 'CNOT') {
      const target = controlQubit === 0 ? 1 : 0;
      setGates((current) => [...current, { type: gateType, control: controlQubit, target }]);
    } else {
      setGates((current) => [...current, { type: gateType, target: targetQubit }]);
    }
    clearMeasurements();
  };
  const removeGate = (gateIndex) => {
    setGates((current) => current.filter((_, index) => index !== gateIndex));
    clearMeasurements();
  };
  const measureShots = (count) => {
    const nextCounts = { ...shotCounts };
    let last = null;
    for (let shot = 0; shot < count; shot += 1) {
      last = sampleIntensityMeasurement(circuit);
      nextCounts[last] = (nextCounts[last] ?? 0) + 1;
    }
    setShotCounts(nextCounts);
    setLastMeasurement(last);
  };
  const optimizeDetectorSettings = async () => {
    setOptimizationError('');
    setOptimizationProgress({ completed: 0, total: 0 });
    try {
      const result = await optimizeClassicalIntensitySettings(idealCircuit, detectorSettings, { onProgress: setOptimizationProgress });
      setOptimizationResult({ ...result, inputSignature: detectorInputSignature });
    } catch (error) {
      setOptimizationError(error instanceof Error ? error.message : String(error));
    } finally {
      setOptimizationProgress(null);
    }
  };
  const applyOptimizedSettings = () => {
    if (!optimizationIsStale && optimizationResult) {
      setDetectorSettings(optimizationResult.settings);
      setOptimizationResult((current) => current ? {
        ...current,
        inputSignature: JSON.stringify({ qubitCount, initialState, gates, detectorSettings: current.settings })
      } : current);
      clearMeasurements();
    }
  };

  return <SimulatorBase
    mode="non-3d"
    className="signal-app quantum-circuit-app"
    headerClassName="signal-topbar"
    brandClassName="signal-brand"
    mark="Q / I"
    markClassName="signal-mark"
    title="INTENSITY CIRCUIT LAB"
    subtitle="One- and two-qubit gate experiments"
    actions={<button type="button" onClick={() => setPanelVisible((visible) => !visible)}>{panelVisible ? 'Hide controls' : 'Show controls'}</button>}
    onHome={onBack}
  >
    <main className="signal-workbench qc-workbench">
      <div className="signal-heading qc-heading">
        <span>STATE VECTOR / BORN-RULE READOUT</span>
        <h1>Build a circuit. Read its intensity.</h1>
        <p>Complex amplitudes carry phase through each gate; displayed intensity is |amplitude|². This small state-vector model illustrates ideal one- and two-qubit circuits, not hardware noise or an intensity-only theory.</p>
      </div>
      <section className="qc-circuit-section">
        <div className="qc-section-heading"><span>CIRCUIT</span><strong>{gates.length} {gates.length === 1 ? 'gate' : 'gates'}</strong></div>
        <CircuitDiagram qubitCount={qubitCount} gates={gates} onRemoveGate={removeGate} />
      </section>
      <div className="qc-output-grid">
        <IntensityReadout circuit={circuit} shotCounts={shotCounts} modelLabel={simulationModel === 'ideal' ? 'IDEAL STATE-VECTOR INTENSITY' : 'CLASSICAL DETECTOR INTENSITY'} />
        <section className="qc-measurement-section" aria-label="Circuit measurement">
          <div className="qc-section-heading"><span>MEASUREMENT</span><strong>{lastMeasurement ? `|${lastMeasurement}⟩` : 'NO SHOT'}</strong></div>
          <p>Each shot samples an outcome according to its normalized intensity.</p>
          <div className="qc-measurement-actions"><button type="button" onClick={() => measureShots(1)}>Measure one</button><button type="button" onClick={() => measureShots(100)}>Run 100 shots</button></div>
          {lastMeasurement && <div className="qc-last-shot" role="status">Last result <strong>|{lastMeasurement}⟩</strong></div>}
          {Object.keys(shotCounts).length > 0 && <button className="qc-clear-shots" type="button" onClick={clearMeasurements}>Clear shot counts</button>}
        </section>
      </div>
      {comparisonEnabled && comparisonSummary && <section className="qc-model-comparison">
        <div className="qc-section-heading"><span>MODEL COMPARISON</span><strong>{comparisonSummary.scorePoints.toFixed(2)}% normalized RMS</strong></div>
        <p>Reference: {QUANTUM_CIRCUIT_MODELS.find(({ value }) => value === comparisonReference)?.label} · Compared: {QUANTUM_CIRCUIT_MODELS.find(({ value }) => value === comparisonCandidate)?.label}</p>
        <div className="qc-comparison-table-wrap"><table className="qc-comparison-table">
          <thead><tr><th>Output</th><th>Reference intensity</th><th>Compared intensity</th><th>Δ probability</th></tr></thead>
          <tbody>{idealCircuit.outcomes.map(({ state }, index) => {
            const referenceIntensity = modelOutputs[comparisonReference].outcomes[index].intensity / modelOutputs[comparisonReference].totalIntensity;
            const candidateIntensity = modelOutputs[comparisonCandidate].outcomes[index].intensity / modelOutputs[comparisonCandidate].totalIntensity;
            return <tr key={state}><th>|{state}⟩</th><td>{(referenceIntensity * 100).toFixed(2)}%</td><td>{(candidateIntensity * 100).toFixed(2)}%</td><td>{((candidateIntensity - referenceIntensity) * 100).toFixed(2)} pp</td></tr>;
          })}</tbody>
        </table></div>
      </section>}
    </main>
    <aside className={`signal-panel qc-panel${panelVisible ? '' : ' is-hidden'}`} aria-label="Circuit controls">
      <div className="signal-panel-heading"><div><span>GATE EDITOR</span><h2>Quantum circuit</h2></div></div>
      <ParamSelect className="signal-select" label="Qubit count" value={qubitCount} options={[{ value: 1, label: '1 qubit' }, { value: 2, label: '2 qubits' }]} onChange={setWidth} />
      <ParamSelect className="signal-select" label="Initial basis state" value={initialState} options={basisStateOptions(qubitCount)} onChange={(state) => { setInitialState(state); clearMeasurements(); }} />
      <ParamSelect className="signal-select" label="Circuit model" value={simulationModel} options={QUANTUM_CIRCUIT_MODELS} onChange={(model) => { setSimulationModel(model); clearMeasurements(); }} />
      <label className="signal-toggle qc-comparison-toggle"><input type="checkbox" checked={comparisonEnabled} onChange={(event) => setComparisonEnabled(event.target.checked)} /><span>Compare circuit models</span></label>
      {comparisonEnabled && <ParamSelect className="signal-select" label="Comparison reference" value={comparisonReference} options={QUANTUM_CIRCUIT_MODELS} onChange={setComparisonReference} />}
      <div className="qc-preset-row" aria-label="Circuit examples">
        <button type="button" onClick={() => loadCircuit(BELL_GATES)}>Bell pair</button>
        <button type="button" onClick={() => loadCircuit(INTERFERENCE_GATES, 1)}>Phase interference</button>
      </div>
      <details className="qc-gate-editor" open>
        <summary>Append a gate</summary>
        <ParamSelect className="signal-select" label="Gate" value={gateType} options={availableGates} onChange={setGateType} />
        {gateType === 'CNOT'
          ? <ParamSelect className="signal-select" label="Control qubit" value={controlQubit} options={qubitOptions} onChange={setControlQubit} />
          : <ParamSelect className="signal-select" label="Target qubit" value={targetQubit} options={qubitOptions} onChange={setTargetQubit} />}
        <button className="qc-append-gate" type="button" onClick={appendGate}>Append {gateType}</button>
      </details>
      {(simulationModel === 'classical-detector' || comparisonEnabled) && <details className="qc-detector-settings" open>
        <summary>Wave detector parameters</summary>
        <p className="qc-model-note">Basis-state amplitudes become coherent rail emitters; the Wave lab Classical-intensity detector samples and integrates their propagated electric-field intensity through finite output ports. Port gaps reduce cross-talk. Optimization fits this circuit, not a universal gate model.</p>
        <NumericParamControl className="qc-parameter" label="Wavelength" value={detectorSettings.wavelength} min={0.25} max={6} step={0.05} suffix=" λ" onChange={(value) => updateDetectorSettings('wavelength', value)} />
        <NumericParamControl className="qc-parameter" label="Basis rail spacing" value={detectorSettings.railSpacing} min={0.4} max={4} step={0.05} suffix=" u" onChange={(value) => updateDetectorSettings('railSpacing', value)} />
        <NumericParamControl className="qc-parameter" label="Detector distance" value={detectorSettings.detectorDistance} min={0.5} max={10} step={0.1} suffix=" u" onChange={(value) => updateDetectorSettings('detectorDistance', value)} />
        <NumericParamControl className="qc-parameter" label="Output port width" value={detectorSettings.portWidth} min={0.1} max={4} step={0.05} suffix=" u" onChange={(value) => updateDetectorSettings('portWidth', value)} />
        <NumericParamControl className="qc-parameter" label="Relative beam phase" value={detectorSettings.beamPhaseShift} min={-Math.PI} max={Math.PI} step={0.05} suffix=" rad" onChange={(value) => updateDetectorSettings('beamPhaseShift', value)} />
        <button className="qc-optimize" type="button" disabled={optimizationProgress !== null} onClick={optimizeDetectorSettings}>{optimizationProgress ? `Optimizing ${optimizationProgress.completed}/${optimizationProgress.total}` : 'Optimize detector parameters'}</button>
        {optimizationError && <p className="qc-optimization-error" role="alert">Optimization failed: {optimizationError}</p>}
        {optimizationResult && <div className="qc-optimization-result">
          {optimizationIsStale && <p className="qc-optimization-stale">Circuit or detector settings changed; rerun optimization to refresh these results.</p>}
          <div><span>Baseline RMS score</span><strong>{optimizationResult.baselineScorePoints.toFixed(2)}%</strong></div>
          <div><span>Best RMS score</span><strong>{optimizationResult.optimizedScorePoints.toFixed(2)}%</strong></div>
          <div><span>Improvement</span><strong>{optimizationResult.improvementPoints.toFixed(2)} pp</strong></div>
          <div><span>Parameter evaluations</span><strong>{optimizationResult.evaluations}</strong></div>
          {optimizationResult.parameterChanges.map(({ key, from, to }) => <div key={key}><span>{DETECTOR_PARAMETER_LABELS[key] ?? key}</span><strong>{from} → {to}</strong></div>)}
          <button className="qc-apply-optimization" type="button" disabled={optimizationIsStale} onClick={applyOptimizedSettings}>Apply best settings</button>
        </div>}
      </details>}
      <details className="qc-gate-key">
        <summary>Gate actions</summary>
        {QUANTUM_CIRCUIT_GATES.filter(({ id }) => id !== 'CNOT' || qubitCount === 2).map(({ id, label }) => <div className="qc-gate-description" key={id}><strong>{id}</strong><span>{label}</span></div>)}
        <button className="qc-reset-circuit" type="button" onClick={() => loadCircuit([], qubitCount)}>Clear circuit</button>
      </details>
    </aside>
  </SimulatorBase>;
}