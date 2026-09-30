import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CatmullRomCurve3, Color, Vector3 } from 'three';
import { calculateThermalLoop, compareThermalFluids, THERMAL_FLUIDS, THERMAL_FLUID_OPTIONS } from './thermalLoopModel.js';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';

const LOOP_POINTS = [
  new Vector3(-5.2, -1.1, 0), new Vector3(-5.2, 1.2, 0), new Vector3(-2.4, 2.2, 0),
  new Vector3(2.4, 2.2, 0), new Vector3(5.2, 1.2, 0), new Vector3(5.2, -1.1, 0),
  new Vector3(2.4, -2.2, 0), new Vector3(-2.4, -2.2, 0)
];

function FlowParticles({ curve, speed, color }) {
  const refs = useRef([]);
  useFrame((state) => {
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const progress = (state.clock.elapsedTime * speed * 0.08 + index / refs.current.length) % 1;
      mesh.position.copy(curve.getPointAt(progress));
    });
  });
  return <group>{Array.from({ length: 18 }, (_, index) => <mesh key={index} ref={(node) => { refs.current[index] = node; }}><sphereGeometry args={[0.075, 10, 8]} /><meshBasicMaterial color={color} /></mesh>)}</group>;
}

function ThermalLoopScene({ model }) {
  const curve = useMemo(() => new CatmullRomCurve3(LOOP_POINTS, true, 'catmullrom', 0.16), []);
  const pipeColor = model.fluidId === 'hbnFarnesane' ? '#e7c95f' : model.fluidId === 'glycol30' ? '#77cbbf' : '#62aee8';
  const flowSpeed = Math.min(3, 0.4 + model.velocityMS * 0.8);
  return <>
    <color attach="background" args={['#081316']} />
    <fog attach="fog" args={['#081316', 16, 34]} />
    <ambientLight intensity={0.62} color="#b9d7ce" />
    <directionalLight position={[4, 9, 6]} intensity={1.6} color="#ffe8bb" />
    <mesh><tubeGeometry args={[curve, 128, 0.13, 12, true]} /><meshStandardMaterial color={pipeColor} metalness={0.35} roughness={0.38} transparent opacity={0.72} /></mesh>
    <FlowParticles curve={curve} speed={flowSpeed} color={pipeColor} />
    <group position={[-4.2, 0, 0]}>{[-0.8, 0, 0.8].map((z) => <mesh key={z} position={[0, 0, z]}><boxGeometry args={[1.2, 2.8, 0.55]} /><meshStandardMaterial color="#283d42" emissive="#e95d45" emissiveIntensity={0.18 + model.itLoadMW * 0.03} /></mesh>)}</group>
    <mesh position={[0, 2.2, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.52, 0.52, 0.55, 28]} /><meshStandardMaterial color="#6ebbc5" metalness={0.5} roughness={0.3} /></mesh>
    <group position={[4.2, 0, 0]}>{[-0.65, 0.65].map((z) => <mesh key={z} position={[0, 0, z]}><boxGeometry args={[1.15, 3.2, 0.48]} /><meshStandardMaterial color={model.economizerAvailable ? '#4f8977' : '#546069'} emissive={model.economizerAvailable ? '#4fc691' : '#e7a35c'} emissiveIntensity={0.28} /></mesh>)}</group>
    <mesh position={[0, -2.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.42, 0.18, 14, 28]} /><meshStandardMaterial color="#d2a65e" metalness={0.62} roughness={0.28} /></mesh>
    <gridHelper args={[14, 28, '#27484a', '#132d30']} position={[0, -2.65, 0]} />
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={8} maxDistance={28} target={[0, 0, 0]} />
  </>;
}

function Slider({ label, value, min, max, step, suffix = '', onChange }) {
  return <NumericParamControl className="thermal-range" label={label} value={value} min={min} max={max} step={step} suffix={suffix} onChange={onChange} />;
}

export default function ThermalLoopSim({ onBack }) {
  const [scenario, setScenario] = useState({
    fluidId: 'water', itLoadMW: 1, temperatureRiseC: 10, pipeLengthM: 120, pipeDiameterM: 0.15,
    pumpEfficiency: 0.72, chillerCop: 5.5, ambientC: 20, supplyC: 30,
    economizerApproachC: 5, economizerHoursFraction: 0.55, facilityBasePue: 1.08
  });
  const [panelVisible, setPanelVisible] = useState(true);
  const selectedFluid = THERMAL_FLUIDS[scenario.fluidId];
  const model = calculateThermalLoop({ ...scenario, ...selectedFluid });
  const comparison = compareThermalFluids(scenario, 'water', scenario.fluidId);
  const update = (patch) => setScenario((current) => ({ ...current, ...patch }));
  return <main className="thermal-app">
    <div className="thermal-scene"><Canvas camera={{ position: [10, 8, 12], fov: 44, near: 0.1, far: 80 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><ThermalLoopScene model={model} /></Canvas></div>
    <header className="thermal-topbar"><div><span className="thermal-mark">THM</span><span><b>DATACENTER THERMAL LOOP</b><em>Energy / pressure / economizer balance</em></span></div><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button></header>
    <section className="thermal-title"><span>ACTIVE LOOP / {model.fluid.label.toUpperCase()}</span><h1>Move heat.<br />Account for power.</h1><p>Cooling outcomes follow fluid properties, piping, climate, and equipment assumptions with uncertainty shown.</p></section>
    <aside className={`thermal-panel ${panelVisible ? '' : 'is-hidden'}`}>
      <div className="thermal-panel-heading"><div><span>CLOSED LOOP / STEADY STATE</span><h2>Thermal balance</h2></div><button type="button" onClick={onBack}>Lab menu</button></div>
      <ParamSelect className="thermal-select" label="Fluid" value={scenario.fluidId} options={THERMAL_FLUID_OPTIONS} onChange={(fluidId) => update({ fluidId })} />
      <p className={`thermal-provenance ${selectedFluid.status}`}>{selectedFluid.status.toUpperCase()} / {selectedFluid.source}</p>
      {selectedFluid.citation && <p className="thermal-citation">{selectedFluid.citation} Validity used here: {selectedFluid.temperatureRangeC[0]}–{selectedFluid.temperatureRangeC[1]} C.</p>}
      <Slider label="IT load" value={scenario.itLoadMW} min={0.1} max={20} step={0.1} suffix=" MW" onChange={(itLoadMW) => update({ itLoadMW })} />
      <Slider label="Loop temperature rise" value={scenario.temperatureRiseC} min={2} max={30} step={0.5} suffix=" C" onChange={(temperatureRiseC) => update({ temperatureRiseC })} />
      <Slider label="Pipe diameter" value={scenario.pipeDiameterM} min={0.04} max={0.4} step={0.005} suffix=" m" onChange={(pipeDiameterM) => update({ pipeDiameterM })} />
      <Slider label="Pipe length" value={scenario.pipeLengthM} min={10} max={1000} step={5} suffix=" m" onChange={(pipeLengthM) => update({ pipeLengthM })} />
      <Slider label="Pump efficiency" value={scenario.pumpEfficiency} min={0.2} max={0.95} step={0.01} onChange={(pumpEfficiency) => update({ pumpEfficiency })} />
      <Slider label="Chiller COP" value={scenario.chillerCop} min={1.5} max={10} step={0.1} onChange={(chillerCop) => update({ chillerCop })} />
      <Slider label="Ambient" value={scenario.ambientC} min={-20} max={50} step={0.5} suffix=" C" onChange={(ambientC) => update({ ambientC })} />
      <Slider label="Supply" value={scenario.supplyC} min={10} max={55} step={0.5} suffix=" C" onChange={(supplyC) => update({ supplyC })} />
      <details open><summary>Energy and hydraulic balance</summary>
        <div className="thermal-readout"><span>Required mass flow</span><strong>{model.massFlowKgS.toFixed(2)} kg/s</strong></div>
        <div className="thermal-readout"><span>Loop velocity</span><strong>{model.velocityMS.toFixed(2)} m/s</strong></div>
        <div className="thermal-readout"><span>Reynolds number</span><strong>{model.reynolds.toExponential(2)}</strong></div>
        <div className="thermal-readout"><span>Pressure drop</span><strong>{(model.pressureDropPa / 1000).toFixed(1)} kPa</strong></div>
        <div className="thermal-readout"><span>Pump power</span><strong>{(model.pumpPowerW / 1000).toFixed(2)} kW</strong></div>
        <div className="thermal-readout"><span>Chiller power</span><strong>{(model.chillerPowerW / 1000).toFixed(1)} kW</strong></div>
        <div className="thermal-readout"><span>Energy residual</span><strong>{model.energyResidualW.toExponential(2)} W</strong></div>
      </details>
      <details open><summary>Facility result</summary>
        <div className="thermal-readout"><span>Economizer</span><strong>{model.economizerAvailable ? `${(model.freeCoolingFraction * 100).toFixed(0)}% hours` : 'Unavailable'}</strong></div>
        <div className="thermal-readout"><span>Modeled PUE</span><strong>{model.pue.toFixed(3)}</strong></div>
        <div className="thermal-readout"><span>PUE uncertainty</span><strong>{model.uncertainty.pueLow.toFixed(3)}–{model.uncertainty.pueHigh.toFixed(3)}</strong></div>
        <div className="thermal-readout"><span>vs water cooling power</span><strong>{(comparison.coolingPowerDifferenceW / 1000).toFixed(2)} kW</strong></div>
        <div className="thermal-readout"><span>vs water PUE</span><strong>{comparison.pueDifference >= 0 ? '+' : ''}{comparison.pueDifference.toFixed(4)}</strong></div>
      </details>
    </aside>
  </main>;
}