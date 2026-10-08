import { Fragment, useMemo, useState } from 'react';
import { ParamSelect } from './lib/ParamControls.jsx';
import { SimulatorBase } from './lib/SimulatorBase.jsx';
import { QUANTUM_CIRCUIT_GATES, sampleIntensityMeasurement, simulateIntensityCircuit } from './quantumCircuitModel.js';

const BELL_GATES = [{ type: 'H', target: 0 }, { type: 'CNOT', control: 0, target: 1 }];
const INTERFERENCE_GATES = [{ type: 'H', target: 0 }, { type: 'S', target: 0 }, { type: 'H', target: 0 }];

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

function IntensityReadout({ circuit, shotCounts }) {
  return <section className="qc-intensity-section" aria-label="Measurement intensities">
    <div className="qc-section-heading"><span>OUTPUT INTENSITY</span><strong>ΣI {circuit.totalIntensity.toFixed(3)}</strong></div>
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
  const circuit = useMemo(() => simulateIntensityCircuit({ qubitCount, initialState, gates }), [gates, initialState, qubitCount]);
  const qubitOptions = Array.from({ length: qubitCount }, (_, qubit) => ({ value: qubit, label: `Qubit ${qubit}` }));
  const availableGates = QUANTUM_CIRCUIT_GATES.filter(({ id }) => id !== 'CNOT' || qubitCount === 2)
    .map(({ id, label }) => ({ value: id, label: `${id} / ${label}` }));

  const clearMeasurements = () => {
    setShotCounts({});
    setLastMeasurement(null);
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
        <IntensityReadout circuit={circuit} shotCounts={shotCounts} />
        <section className="qc-measurement-section" aria-label="Circuit measurement">
          <div className="qc-section-heading"><span>MEASUREMENT</span><strong>{lastMeasurement ? `|${lastMeasurement}⟩` : 'NO SHOT'}</strong></div>
          <p>Each shot samples an outcome according to its normalized intensity.</p>
          <div className="qc-measurement-actions"><button type="button" onClick={() => measureShots(1)}>Measure one</button><button type="button" onClick={() => measureShots(100)}>Run 100 shots</button></div>
          {lastMeasurement && <div className="qc-last-shot" role="status">Last result <strong>|{lastMeasurement}⟩</strong></div>}
          {Object.keys(shotCounts).length > 0 && <button className="qc-clear-shots" type="button" onClick={clearMeasurements}>Clear shot counts</button>}
        </section>
      </div>
    </main>
    <aside className={`signal-panel qc-panel${panelVisible ? '' : ' is-hidden'}`} aria-label="Circuit controls">
      <div className="signal-panel-heading"><div><span>GATE EDITOR</span><h2>Quantum circuit</h2></div></div>
      <ParamSelect className="signal-select" label="Qubit count" value={qubitCount} options={[{ value: 1, label: '1 qubit' }, { value: 2, label: '2 qubits' }]} onChange={setWidth} />
      <ParamSelect className="signal-select" label="Initial basis state" value={initialState} options={basisStateOptions(qubitCount)} onChange={(state) => { setInitialState(state); clearMeasurements(); }} />
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
      <details className="qc-gate-key">
        <summary>Gate actions</summary>
        {QUANTUM_CIRCUIT_GATES.filter(({ id }) => id !== 'CNOT' || qubitCount === 2).map(({ id, label }) => <div className="qc-gate-description" key={id}><strong>{id}</strong><span>{label}</span></div>)}
        <button className="qc-reset-circuit" type="button" onClick={() => loadCircuit([], qubitCount)}>Clear circuit</button>
      </details>
    </aside>
  </SimulatorBase>;
}