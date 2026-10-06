import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { AdditiveBlending, BufferAttribute, BufferGeometry } from 'three';
import { NumericParamControl, ParamSelect } from './lib/ParamControls.jsx';
import { TelemetryHud } from './lib/TelemetryHud.jsx';
import { CameraPerspectiveToolbar, PerspectiveOrbitControls, SimulatorBase, SimulatorPresetControls, SimulatorViewParameters } from './lib/SimulatorBase.jsx';
import { createCameraViews, DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, DEFAULT_SIMULATOR_3D_PARAMETERS, readPresetLibrary, writePresetLibrary } from './lib/simulator-base.js';
import { calculateRailHarvestYield, calculateRailTieEconomics, estimateRailTieResponse, getRailTieFormulation, RAIL_HARVEST_MODES, RAIL_TIE_FORMULATIONS, RAIL_TIE_SCREENING_LIMITS } from './railTieModel.js';

const PRESET_KEY = 'sqgsim-rail-tie-snapshots';
const MATERIAL_COLORS = {
  'creosote-oak': '#665849',
  'prestressed-opc': '#7a817e',
  'glass-lignin': '#476f63',
  'lvcf-carbon': '#38444d',
  'lvh-hemp': '#69764d',
  'hybrid-lvh-lvcf': '#4a6259',
  'recycled-polyolefin': '#596b53',
  'basalt-geopolymer': '#797e77'
};
const INITIAL_CONFIGURATION = {
  ...DEFAULT_SIMULATOR_3D_PARAMETERS,
  particleAppearance: { ...DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION, sizeScale: 1.2, opacity: 0.72 },
  cameraViewMode: 'ortho1',
  material: 'hybrid-lvh-lvcf',
  hempVolume: 60,
  carbonSkinWtPercent: 15,
  harvestingMode: 'hybrid',
  railSeatLoadKN: 30,
  bucklingLoad: 1.15,
  ligCurrent: 5,
  grapheneLoadingWtPercent: 0,
  percolationThresholdWtPercent: RAIL_TIE_SCREENING_LIMITS.grapheneLoadingWtPercent,
  dielectricBarrierIntact: true,
  measuredRailToRailResistanceOhm: 500000,
  structuralCostPerTie: 464.33,
  batteryCostPerTie: 250,
  harvesterCostPerTie: 45,
  wirelessTransferCostPerTie: 75,
  telemetryCostPerTie: 25,
  integrationCostPerTie: 60,
  batteryCapacityKWhPerTie: 5,
  batteryVolumeL: 10,
  batteryEnergyDensityWhPerL: 500,
  batteryCycleLife: 50000,
  storageCyclesPerYear: 500,
  piezoJoulesPerAxleTie: 2,
  tengJoulesPerAxleTie: 0.5,
  axlesPerTrain: 424,
  trainsPerDay: 40,
  transferEfficiencyPercent: 0,
  gridValuePerMWhYear: 0,
  annualMaintenanceSavings: 0,
  grantSharePercent: 0,
  productionCreditPerKWh: 0,
  creditTransferRatePercent: 90,
  ambientTemperatureC: 20,
  showTelemetryTable: true,
  telemetryDock: 'auto',
  telemetryOpacity: 0.88,
  telemetryHeight: 180,
  tieCount: 7,
  particleCount: 896,
  axlePassSpeed: 0.8,
  xrayMode: true,
  axlePassing: true,
  selfHealing: false
};

function savedRailTiePresets() {
  return readPresetLibrary(typeof window === 'undefined' ? null : window.localStorage, PRESET_KEY, { Default: INITIAL_CONFIGURATION });
}

function normalizeRailTieConfiguration(preset = {}) {
  const configuration = { ...INITIAL_CONFIGURATION, ...preset, particleAppearance: { ...INITIAL_CONFIGURATION.particleAppearance, ...preset.particleAppearance } };
  if (!RAIL_TIE_FORMULATIONS.some((formulation) => formulation.value === configuration.material)) configuration.material = INITIAL_CONFIGURATION.material;
  if (!RAIL_HARVEST_MODES.some((mode) => mode.value === configuration.harvestingMode)) configuration.harvestingMode = INITIAL_CONFIGURATION.harvestingMode;
  return configuration;
}

function readNormalizedRailTiePresets() {
  return Object.fromEntries(Object.entries(savedRailTiePresets()).map(([name, preset]) => [name, normalizeRailTieConfiguration(preset)]));
}

function SleeperParticles({ count, tieCount, appearance, active }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const seed = index * 2.399963229728653;
      const tieIndex = index % tieCount;
      positions[index * 3] = Math.sin(seed) * 1.65;
      positions[index * 3 + 1] = 0.08 + ((index * 17) % 100) / 100 * 0.34;
      positions[index * 3 + 2] = (tieIndex - (tieCount - 1) / 2) * 0.82 + Math.cos(seed) * 0.13;
      seeds[index] = seed;
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3));
    result.userData.seeds = seeds;
    result.userData.base = positions.slice();
    return result;
  }, [count, tieCount]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (!active) return;
    const position = geometry.attributes.position;
    const values = position.array;
    const base = geometry.userData.base;
    const seeds = geometry.userData.seeds;
    const time = clock.elapsedTime;
    for (let index = 0; index < count; index += 1) {
      values[index * 3] = base[index * 3] + Math.sin(time * 1.7 + seeds[index]) * 0.025;
      values[index * 3 + 1] = base[index * 3 + 1] + Math.sin(time * 2.4 + seeds[index]) * 0.045;
      values[index * 3 + 2] = base[index * 3 + 2] + Math.cos(time * 1.2 + seeds[index]) * 0.025;
    }
    position.needsUpdate = true;
  });

  const particleColor = appearance.colorMode === 'custom' ? appearance.color : '#70e6c3';
  return <points geometry={geometry} visible={active}>
    <pointsMaterial color={particleColor} size={0.035 * appearance.sizeScale} sizeAttenuation transparent opacity={appearance.opacity} blending={AdditiveBlending} depthWrite={false} />
  </points>;
}

function MovingWheelset({ enabled, speed, running, configuration, tieCount, onTelemetry }) {
  const groupRef = useRef(null);
  const previousImpactIndexRef = useRef(-1);
  const reportTimeRef = useRef(0);
  const impactCountRef = useRef(0);
  const harvestedJoulesRef = useRef(0);
  const readingsRef = useRef([]);
  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const wheelZ = enabled && running ? ((clock.elapsedTime * speed + 4) % 8) - 4 : 0;
    group.position.z = wheelZ;
    group.rotation.x = enabled && running ? -clock.elapsedTime * speed / 0.35 : 0;
    const tiePositions = Array.from({ length: tieCount }, (_, index) => (index - (tieCount - 1) / 2) * 0.82);
    const readings = readingsRef.current;
    if (readings.length !== tieCount) {
      readingsRef.current = tiePositions.map((_, index) => ({ id: `0x00A${index}`, impacts: 0 }));
      previousImpactIndexRef.current = -1;
    }

    let closestIndex = 0;
    let closestDistance = Infinity;
    tiePositions.forEach((position, index) => {
      const distance = Math.abs(position - wheelZ);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    const impactActive = enabled && running && closestDistance < 0.2;
    if (impactActive && previousImpactIndexRef.current !== closestIndex) {
      previousImpactIndexRef.current = closestIndex;
      readingsRef.current[closestIndex].impacts += 1;
      impactCountRef.current += 1;
      const piezo = configuration.harvestingMode === 'piezo' || configuration.harvestingMode === 'hybrid' ? configuration.piezoJoulesPerAxleTie : 0;
      const teng = configuration.harvestingMode === 'teng' || configuration.harvestingMode === 'hybrid' ? configuration.tengJoulesPerAxleTie : 0;
      harvestedJoulesRef.current += piezo + teng;
    } else if (!impactActive) {
      previousImpactIndexRef.current = -1;
    }

    reportTimeRef.current += delta;
    if (reportTimeRef.current < 0.15) return;
    reportTimeRef.current = 0;
    const rows = tiePositions.map((position, index) => {
      const distance = Math.abs(position - wheelZ);
      const loadFactor = enabled && running ? Math.exp(-0.5 * (distance / 0.45) ** 2) : 0;
      const response = estimateRailTieResponse({
        material: configuration.material,
        carbonSkinWtPercent: configuration.carbonSkinWtPercent,
        loadKN: configuration.railSeatLoadKN * loadFactor,
        grapheneLoadingWtPercent: configuration.grapheneLoadingWtPercent,
        percolationThresholdWtPercent: configuration.percolationThresholdWtPercent,
        measuredRailToRailResistanceOhm: configuration.measuredRailToRailResistanceOhm,
        dielectricBarrierIntact: configuration.dielectricBarrierIntact,
        bucklingLoadRatio: configuration.bucklingLoad
      });
      return {
        id: readingsRef.current[index]?.id ?? `0x00A${index}`,
        impacts: readingsRef.current[index]?.impacts ?? 0,
        loadKN: configuration.railSeatLoadKN * loadFactor,
        stressMPa: response.bendingStressMPa,
        deflectionMm: response.deflectionMm,
        seatPressureMPa: response.railSeatPressureMPa,
        temperatureC: configuration.ambientTemperatureC,
        condition: response.isolationScreenPasses ? 'SCREEN ONLY' : 'CHECK ISOLATION'
      };
    });
    onTelemetry({ rows, impactCount: impactCountRef.current, harvestedJoules: harvestedJoulesRef.current, activeTieIndex: impactActive ? closestIndex : -1 });
  });
  return <group ref={groupRef} position={[0, 0.4875, 0]}>
    <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.045, 0.045, 3.2, 16]} /><meshStandardMaterial color="#7d8583" metalness={0.88} roughness={0.28} /></mesh>
    {[-1.5, 1.5].map((x) => <group key={x} position={[x, 0, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.35, 0.35, 0.14, 32]} /><meshStandardMaterial color="#30383b" metalness={0.84} roughness={0.3} /></mesh>
      <mesh position={[x < 0 ? 0.09 : -0.09, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 0.035, 32]} /><meshStandardMaterial color="#242a2c" metalness={0.86} roughness={0.3} /></mesh>
    </group>)}
  </group>;
}

function RailTieScene({ configuration, running, viewMode, orbitPlaying, cameraViews, onUserInteraction, onTelemetry }) {
  const material = getRailTieFormulation(configuration.material);
  const materialColor = MATERIAL_COLORS[material.value] ?? '#476f63';
  const ties = Array.from({ length: configuration.tieCount }, (_, index) => (index - (configuration.tieCount - 1) / 2) * 0.82);
  return <>
    <color attach="background" args={['#091518']} />
    <fog attach="fog" args={['#091518', 13, 26]} />
    <ambientLight intensity={0.78} color="#d3e9da" />
    <directionalLight intensity={1.5} position={[5, 9, 5]} color="#fff0d0" />
    <pointLight intensity={18} distance={8} color="#e9a45b" position={[0, 1.2, 0]} />
    <mesh position={[0, -0.46, 0]}><boxGeometry args={[5.4, 0.5, 9.2]} /><meshStandardMaterial color="#303a3c" roughness={1} /></mesh>
    {[-1.5, 1.5].map((x) => <group key={x}>
      <mesh position={[x, 0.1, 0]}><boxGeometry args={[0.22, 0.075, 9.3]} /><meshStandardMaterial color="#9ba4a0" metalness={0.82} roughness={0.27} /></mesh>
      <mesh position={[x, 0.03, 0]}><boxGeometry args={[0.34, 0.035, 9.3]} /><meshStandardMaterial color="#707977" metalness={0.76} roughness={0.35} /></mesh>
    </group>)}
    {ties.map((z, index) => <group key={z} position={[0, -0.12, z]}>
      <mesh><boxGeometry args={[3.8, 0.25, 0.34]} /><meshStandardMaterial color={materialColor} roughness={0.66} transparent={configuration.xrayMode} opacity={configuration.xrayMode ? 0.72 : 1} emissive={configuration.selfHealing ? '#b74b36' : '#000000'} emissiveIntensity={configuration.selfHealing ? 0.42 : 0} /></mesh>
      {configuration.xrayMode && <mesh><boxGeometry args={[1.15, 0.14, 0.22]} /><meshStandardMaterial color="#42bba4" emissive="#178f79" emissiveIntensity={configuration.ligCurrent / 12 * 0.65} roughness={0.25} /></mesh>}
      {[-1.5, 1.5].map((x) => <group key={x} position={[x, 0.15, 0]}>
        <mesh><boxGeometry args={[0.34, 0.035, 0.38]} /><meshStandardMaterial color="#5e615d" metalness={0.8} roughness={0.4} /></mesh>
        {[-0.1, 0.1].map((zOffset) => <mesh key={zOffset} position={[0, -0.055, zOffset]}><cylinderGeometry args={[0.013, 0.013, 0.12, 8]} /><meshStandardMaterial color="#282c2d" metalness={0.8} /></mesh>)}
      </group>)}
      {index === 0 && configuration.xrayMode && <mesh position={[0, 0.01, 0]}><boxGeometry args={[0.55, 0.025, 0.28]} /><meshStandardMaterial color="#e7b550" emissive="#a86715" emissiveIntensity={0.45} /></mesh>}
    </group>)}
    <MovingWheelset enabled={configuration.axlePassing} speed={configuration.axlePassSpeed} running={running} configuration={configuration} tieCount={configuration.tieCount} onTelemetry={onTelemetry} />
    <SleeperParticles count={configuration.particleCount} tieCount={configuration.tieCount} appearance={configuration.particleAppearance} active={running} />
    <ContactShadows position={[0, -0.2, 0]} opacity={0.36} scale={12} blur={2.2} far={3} />
    <PerspectiveOrbitControls viewMode={viewMode} orbitPlaying={orbitPlaying} orbitSettings={configuration} views={cameraViews} cameraParams={{ minDistance: 6, maxDistance: 24, target: [0, -0.35, 0] }} onUserInteraction={onUserInteraction} />
  </>;
}

function money(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function paybackText(value) {
  return value == null || !Number.isFinite(value) ? 'No payback in scenario' : `${value.toFixed(1)} years`;
}

function RailTiePerformancePanel({ configuration, response, telemetry }) {
  const samples = telemetry.rows?.length ? telemetry.rows : Array.from({ length: configuration.tieCount }, (_, index) => ({
    id: `0x00A${index}`, impacts: 0, loadKN: 0, stressMPa: 0, deflectionMm: 0, seatPressureMPa: 0, temperatureC: configuration.ambientTemperatureC, condition: response.isolationScreenPasses ? 'SCREEN ONLY' : 'CHECK ISOLATION'
  }));
  return <section className="rail-tie-report">
    <header><span>MODEL RESPONSE / MATERIAL SCREEN</span><h1>Compare the tie mechanics.</h1><p>Beam and rail-seat numbers are screening approximations; track interaction, fatigue, and ballast support still need calibrated models.</p></header>
    <div className="rail-tie-report-readouts">
      <div className="thermal-readout"><span>Estimated modulus</span><strong>{response.effectiveModulusGPa.toFixed(1)} GPa</strong></div>
      <div className="thermal-readout"><span>Instantaneous deflection</span><strong>{response.deflectionMm.toFixed(2)} mm</strong></div>
      <div className="thermal-readout"><span>Flexural stress proxy</span><strong>{response.bendingStressMPa.toFixed(1)} MPa</strong></div>
      <div className="thermal-readout"><span>Loss factor / damping</span><strong>tan δ {response.dampingLossFactor.toFixed(3)}</strong></div>
    </div>
    <div className="rail-tie-comparison-wrap"><table className="rail-tie-comparison">
      <thead><tr><th>Formulation</th><th>E (GPa)</th><th>tan δ</th><th>Rail-seat wear</th><th>Life (yr)</th><th>Indicative cost</th><th>MCI</th></tr></thead>
      <tbody>{RAIL_TIE_FORMULATIONS.map((material) => <tr key={material.value} className={material.value === configuration.material ? 'is-selected' : ''}>
        <th>{material.label}</th><td>{material.modulusGPa.toFixed(1)}</td><td>{material.tanDelta.toFixed(3)}</td><td>{material.abrasion}</td><td>{material.serviceLifeYears ?? 'Unpriced'}</td><td>{material.referenceCostPerTie == null ? 'Not estimated' : money(material.referenceCostPerTie)}</td><td>{material.circularity == null ? 'Unassessed' : material.circularity.toFixed(2)}</td>
      </tr>)}</tbody>
    </table></div>
    <section className="rail-tie-live-telemetry"><div className="rail-tie-section-title"><span>LIVE SENSOR MESH</span><strong>{telemetry.impactCount ?? 0} axle / tie contacts</strong></div>
      <div className="rail-tie-comparison-wrap"><table className="rail-tie-comparison"><thead><tr><th>Tie ID</th><th>Contacts</th><th>Rail-seat load</th><th>Stress proxy</th><th>Deflection</th><th>Seat pressure</th><th>Temperature</th><th>Screen</th></tr></thead>
        <tbody>{samples.map((sample) => <tr key={sample.id} className={sample.condition === 'CHECK ISOLATION' ? 'is-warning' : ''}><th>{sample.id}</th><td>{sample.impacts}</td><td>{sample.loadKN.toFixed(1)} kN</td><td>{sample.stressMPa.toFixed(2)} MPa</td><td>{sample.deflectionMm.toFixed(3)} mm</td><td>{sample.seatPressureMPa.toFixed(2)} MPa</td><td>{sample.temperatureC.toFixed(1)} °C</td><td>{sample.condition}</td></tr>)}</tbody></table></div>
    </section>
    <p className="thermal-citation">Source estimates are scenario inputs, not measured qualification data. Fatigue, rail-seat crushing, abrasion, track modulus, and damping require coupon, sleeper, and track-panel tests.</p>
  </section>;
}

function RailTieCashflowChart({ finance }) {
  const series = [
    { key: 'reference', label: 'Unsubsidized', color: '#e5a653' },
    { key: 'configured', label: 'Selected grant / credit', color: '#70e6c3' },
    { key: 'gridDownside', label: '30% VPP downside', color: '#df789b' },
    { key: 'maximumGrant', label: '80% grant scenario', color: '#72b9e8' }
  ];
  const allValues = finance.cashflow.flatMap((point) => series.map(({ key }) => point[key]));
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(1, ...allValues);
  const yAt = (value) => 266 - (value - minValue) / Math.max(1, maxValue - minValue) * 224;
  const xAt = (index) => 48 + index / Math.max(1, finance.cashflow.length - 1) * 900;
  return <div className="rail-tie-chart-frame"><svg viewBox="0 0 980 310" role="img" aria-label="Illustrative cumulative cash-flow scenarios over twenty years">
    <line x1="48" x2="948" y1={yAt(0)} y2={yAt(0)} className="rail-tie-chart-zero" />
    {series.map(({ key, color }) => <polyline key={key} points={finance.cashflow.map((point, index) => `${xAt(index)},${yAt(point[key])}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" />)}
    {[0, 5, 10, 15, 20].map((year) => <text key={year} x={xAt(year)} y="294" textAnchor="middle" className="rail-tie-chart-label">Y{year}</text>)}
    <text x="48" y="18" className="rail-tie-chart-label">NET CASH FLOW / TRACK MILE</text>
  </svg><div className="rail-tie-chart-legend">{series.map((entry) => <span key={entry.key}><i style={{ background: entry.color }} />{entry.label}</span>)}</div></div>;
}

function RailTieLifecyclePanel({ configuration, harvest, finance }) {
  return <section className="rail-tie-report">
    <header><span>20-YEAR CASH-FLOW SCENARIOS / PER TRACK MILE</span><h1>Price the assumptions.</h1><p>VPP, grant, tax-credit, and maintenance values are editable scenarios, not awarded funding or contracted market revenue.</p></header>
    <div className="rail-tie-report-readouts">
      <div className="thermal-readout"><span>Integrated tie estimate</span><strong>{money(finance.unitCost)} / tie</strong></div>
      <div className="thermal-readout"><span>Project cost / mile</span><strong>{money(finance.projectCost)}</strong></div>
      <div className="thermal-readout"><span>Selected net premium</span><strong>{money(finance.configuredPremium)}</strong></div>
      <div className="thermal-readout"><span>Selected payback</span><strong>{paybackText(finance.configuredPaybackYears)}</strong></div>
      <div className="thermal-readout"><span>Storage capacity input</span><strong>{harvest.storageMWhPerMile.toFixed(2)} MWh / mile</strong></div>
      <div className="thermal-readout"><span>Gross vibration harvest</span><strong>{harvest.grossKWhPerDayMile.toFixed(2)} kWh / day / mile</strong></div>
    </div>
    <RailTieCashflowChart finance={finance} />
    <div className="rail-tie-scenario-table"><div><span>Reference payback</span><strong>{paybackText(finance.referencePaybackYears)}</strong></div><div><span>Selected grant / credit</span><strong>{paybackText(finance.configuredPaybackYears)}</strong></div><div><span>30% lower VPP value</span><strong>{paybackText(finance.gridDownsidePaybackYears)}</strong></div><div><span>80% grant scenario</span><strong>{paybackText(finance.maximumGrantPaybackYears)}</strong></div></div>
    <p className="thermal-citation">{finance.status}. The calculation is undiscounted and does not model battery degradation, replacement timing, tax eligibility, grid interconnection, or verified NPV.</p>
  </section>;
}

export default function RailTieMaterialSim({ onBack }) {
  const [presetLibrary, setPresetLibrary] = useState(readNormalizedRailTiePresets);
  const [currentPreset, setCurrentPreset] = useState('Default');
  const [presetName, setPresetName] = useState('');
  const [configuration, setConfiguration] = useState(() => normalizeRailTieConfiguration(savedRailTiePresets().Default ?? INITIAL_CONFIGURATION));
  const [panelVisible, setPanelVisible] = useState(true);
  const [running, setRunning] = useState(true);
  const [activeView, setActiveView] = useState('scene');
  const [telemetry, setTelemetry] = useState({ rows: [], impactCount: 0, harvestedJoules: 0, activeTieIndex: -1 });
  const [cameraView, setCameraView] = useState(configuration.cameraViewMode ?? 'ortho1');
  const [orbitPlaying, setOrbitPlaying] = useState(true);
  const [compactLandscape, setCompactLandscape] = useState(() => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches);
  const cameraViews = useMemo(() => createCameraViews({ target: [0, -0.35, 0], distance: 12, frontDistance: 15, ortho1Offset: [9, 8, 12], ortho2Offset: [-9, 7, -12] }), []);
  const response = estimateRailTieResponse({
    material: configuration.material,
    carbonSkinWtPercent: configuration.carbonSkinWtPercent,
    loadKN: configuration.railSeatLoadKN,
    grapheneLoadingWtPercent: configuration.grapheneLoadingWtPercent,
    percolationThresholdWtPercent: configuration.percolationThresholdWtPercent,
    measuredRailToRailResistanceOhm: configuration.measuredRailToRailResistanceOhm,
    dielectricBarrierIntact: configuration.dielectricBarrierIntact,
    bucklingLoadRatio: configuration.bucklingLoad
  });
  const harvest = calculateRailHarvestYield({
    harvestingMode: configuration.harvestingMode,
    piezoJoulesPerAxleTie: configuration.piezoJoulesPerAxleTie,
    tengJoulesPerAxleTie: configuration.tengJoulesPerAxleTie,
    axlesPerTrain: configuration.axlesPerTrain,
    trainsPerDay: configuration.trainsPerDay,
    transferEfficiency: configuration.transferEfficiencyPercent / 100,
    batteryVolumeL: configuration.batteryVolumeL,
    batteryEnergyDensityWhPerL: configuration.batteryEnergyDensityWhPerL
  });
  const acousticEfficiency = Math.max(13.4, 68 - Math.abs(configuration.hempVolume - 60) * 0.91);
  const batteryServiceYearsAtTargetCycles = configuration.storageCyclesPerYear > 0 ? configuration.batteryCycleLife / configuration.storageCyclesPerYear : null;
  const finance = calculateRailTieEconomics({
    tiesPerMile: 3250,
    structuralCostPerTie: configuration.structuralCostPerTie,
    batteryCostPerTie: configuration.batteryCostPerTie,
    batteryCapacityKWhPerTie: harvest.batteryCapacityKWhPerTie,
    harvesterCostPerTie: configuration.harvesterCostPerTie,
    wirelessTransferCostPerTie: configuration.wirelessTransferCostPerTie,
    telemetryCostPerTie: configuration.telemetryCostPerTie,
    integrationCostPerTie: configuration.integrationCostPerTie,
    grantShare: configuration.grantSharePercent / 100,
    productionCreditPerKWh: configuration.productionCreditPerKWh,
    creditTransferRate: configuration.creditTransferRatePercent / 100,
    gridValuePerMWhYear: configuration.gridValuePerMWhYear,
    storageMWhPerMile: harvest.storageMWhPerMile,
    annualMaintenanceSavings: configuration.annualMaintenanceSavings,
    annualHarvestValue: harvest.annualHarvestValuePerMile
  });
  const update = (patch) => setConfiguration((current) => ({ ...current, ...patch }));
  const applyPreset = (name) => {
    const preset = normalizeRailTieConfiguration(presetLibrary[name] ?? INITIAL_CONFIGURATION);
    setConfiguration(preset);
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
  const updateConfiguration = (next) => setConfiguration((current) => ({ ...current, ...next, particleAppearance: { ...current.particleAppearance, ...next.particleAppearance } }));
  const parameterValue = configuration;
  const currentPresetValue = presetLibrary[currentPreset] ?? INITIAL_CONFIGURATION;
  const materialOptions = RAIL_TIE_FORMULATIONS.map(({ value, label }) => ({ value, label }));
  const modeOptions = [
    { value: 'scene', label: '3D scene' },
    { value: 'performance', label: 'Performance' },
    { value: 'lifecycle', label: 'Lifecycle' }
  ];
  const changeMaterial = (material) => {
    const referenceCost = getRailTieFormulation(material).referenceCostPerTie;
    update({ material, ...(referenceCost == null ? {} : { structuralCostPerTie: referenceCost }) });
  };
  const telemetryDockPosition = configuration.telemetryDock === 'auto' ? (compactLandscape ? 'bottom' : 'top') : configuration.telemetryDock;

  useEffect(() => {
    if (cameraView !== configuration.cameraViewMode) update({ cameraViewMode: cameraView });
  }, [cameraView]);

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape) and (max-height: 560px)');
    const updateLandscape = (event) => setCompactLandscape(event.matches);
    media.addEventListener('change', updateLandscape);
    return () => media.removeEventListener('change', updateLandscape);
  }, []);

  return <SimulatorBase className="thermal-app rail-tie-app" headerClassName="thermal-topbar rail-tie-topbar" mark="LV / RAIL" markClassName="thermal-mark" title="SUSTAINABLE RAIL TIE EXPLORER" subtitle="Material design / energy-active tie / system-level assumptions" parameterValue={parameterValue} presetValue={currentPresetValue} onParameterChange={updateConfiguration} actions={<div className="rail-tie-actions"><button type="button" onClick={() => setRunning((value) => !value)} aria-pressed={running}>{running ? 'Pause axle' : 'Run axle'}</button><button type="button" className="rail-tie-telemetry-toggle" aria-pressed={configuration.showTelemetryTable} onClick={() => update({ showTelemetryTable: !configuration.showTelemetryTable })}>{configuration.showTelemetryTable ? 'Hide telemetry' : 'Show telemetry'}</button><button type="button" onClick={() => setPanelVisible((value) => !value)}>{panelVisible ? 'Hide params' : 'Show params'}</button></div>} onHome={onBack}>
    {activeView === 'scene' && <div className="thermal-scene rail-tie-scene"><Canvas camera={{ position: [9, 8, 12], fov: 42, near: 0.1, far: 60 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}><RailTieScene configuration={configuration} running={running} viewMode={cameraView} orbitPlaying={orbitPlaying} cameraViews={cameraViews} onUserInteraction={() => setCameraView(null)} onTelemetry={setTelemetry} /></Canvas></div>}
    <nav className="rail-tie-mode-tabs" role="tablist" aria-label="Rail tie views">{modeOptions.map((mode) => <button key={mode.value} type="button" role="tab" aria-selected={activeView === mode.value} className={activeView === mode.value ? 'active' : ''} onClick={() => setActiveView(mode.value)}>{mode.label}</button>)}</nav>
    {activeView === 'scene' && <>
      <CameraPerspectiveToolbar className="simulator-perspective-toolbar rail-tie-perspectives" modesClassName="simulator-perspective-modes" views={cameraViews} viewMode={cameraView} orbitPlaying={orbitPlaying} onViewChange={(view) => { setCameraView(view); if (view === 'orbital') setOrbitPlaying(true); }} onToggleOrbit={() => setOrbitPlaying((value) => !value)} />
      <section className="thermal-title rail-tie-title"><span>MATERIAL STUDY / ACTIVE TIE CONCEPT</span><h1>Build the next sleeper.</h1><p>Compare candidate materials while axle response, sensor telemetry, and isolation assumptions remain visible.</p></section>
      <TelemetryHud className="rail-tie-hud" label="Live rail tie metrics" items={[
        { label: 'ACTIVE LOAD', value: `${telemetry.rows?.[telemetry.activeTieIndex]?.loadKN.toFixed(1) ?? '0.0'} kN` },
        { label: 'HARVESTED', value: `${((telemetry.harvestedJoules ?? 0) / 3600).toFixed(4)} Wh` },
        { label: 'RAIL-TO-RAIL SCREEN', value: response.isolationScreenPasses ? 'CLEAR INPUT' : 'CHECK INPUT', tone: response.isolationScreenPasses ? 'safe' : 'warning' }
      ]} />
      {configuration.showTelemetryTable && <div className={`rail-tie-scene-table${telemetryDockPosition === 'bottom' ? ' is-bottom' : ''}`} style={{ '--rail-tie-telemetry-opacity': configuration.telemetryOpacity, '--rail-tie-telemetry-height': `${configuration.telemetryHeight}px` }}><div className="rail-tie-section-title"><span>LIVE SENSOR MESH / ESTIMATED VALUES</span><strong>{telemetry.impactCount ?? 0} contacts</strong></div><div className="rail-tie-comparison-wrap"><table className="rail-tie-comparison"><thead><tr><th>Tie ID</th><th>Hits</th><th>Load</th><th>Stress</th><th>Deflection</th><th>Temp</th></tr></thead><tbody>{telemetry.rows?.map((row) => <tr key={row.id}><th>{row.id}</th><td>{row.impacts}</td><td>{row.loadKN.toFixed(1)} kN</td><td>{row.stressMPa.toFixed(2)} MPa</td><td>{row.deflectionMm.toFixed(3)} mm</td><td>{row.temperatureC.toFixed(1)} °C</td></tr>)}</tbody></table></div></div>}
    </>}
    {activeView === 'performance' && <RailTiePerformancePanel configuration={configuration} response={response} telemetry={telemetry} />}
    {activeView === 'lifecycle' && <RailTieLifecyclePanel configuration={configuration} harvest={harvest} finance={finance} />}
    <aside className={`thermal-panel rail-tie-panel${panelVisible ? '' : ' is-hidden'}`}>
      <div className="thermal-panel-heading"><div><span>STRUCTURAL COMPOSITE / PROTOTYPE</span><h2>Lignolux core</h2></div></div>
      <details className="rail-tie-presets" open><summary>Saved configurations</summary><SimulatorPresetControls name={presetName} onNameChange={setPresetName} presets={presetLibrary} currentPreset={currentPreset} onApply={applyPreset} onSave={savePreset} onReset={() => applyPreset('Default')} /></details>
      <ParamSelect className="thermal-select" label="Tie formulation" value={configuration.material} options={materialOptions} onChange={changeMaterial} />
      <details open><summary>Mechanics and acoustics</summary>
        <NumericParamControl className="thermal-range" label="Buckling beam load (P/Pcr)" value={configuration.bucklingLoad} min={1.05} max={2} step={0.05} onChange={(bucklingLoad) => update({ bucklingLoad })} />
        <NumericParamControl className="thermal-range" label="Rail-seat design load" value={configuration.railSeatLoadKN} min={5} max={120} step={1} suffix="kN" onChange={(railSeatLoadKN) => update({ railSeatLoadKN })} />
        <NumericParamControl className="thermal-range" label="Hemp acoustic-match volume" value={configuration.hempVolume} min={0} max={100} step={5} suffix="%" onChange={(hempVolume) => update({ hempVolume })} />
        {configuration.material === 'hybrid-lvh-lvcf' && <NumericParamControl className="thermal-range" label="LVCF tensile skin share" value={configuration.carbonSkinWtPercent} min={0} max={30} step={1} suffix="wt%" onChange={(carbonSkinWtPercent) => update({ carbonSkinWtPercent })} />}
        <NumericParamControl className="thermal-range" label="Graphene loading" value={configuration.grapheneLoadingWtPercent} min={0} max={0.5} step={0.01} suffix="wt%" onChange={(grapheneLoadingWtPercent) => update({ grapheneLoadingWtPercent })} />
        <NumericParamControl className="thermal-range" label="Lignin-vitrimer current" value={configuration.ligCurrent} min={0} max={12} step={0.1} suffix="A" onChange={(ligCurrent) => update({ ligCurrent })} />
        <div className="thermal-readout"><span>Simple beam deflection</span><strong>{response.deflectionMm.toFixed(2)} mm</strong></div>
        <div className="thermal-readout"><span>Flexural stress proxy</span><strong>{response.bendingStressMPa.toFixed(1)} MPa</strong></div>
        <div className="thermal-readout"><span>Rail-seat pressure proxy</span><strong>{response.railSeatPressureMPa.toFixed(2)} MPa</strong></div>
        <div className="thermal-readout"><span>Loss factor / damping</span><strong>tan δ {response.dampingLossFactor.toFixed(3)}</strong></div>
        <div className="thermal-readout"><span>Acoustic transmissivity heuristic</span><strong>{acousticEfficiency.toFixed(1)}%</strong></div>
        <div className="thermal-readout"><span>Bistable snap threshold</span><strong>{response.snapThresholdKN.toFixed(1)} kN</strong></div>
        {response.graphenePercolationRisk && <p className="thermal-citation rail-tie-warning">Loading is at or above the assumed percolation threshold. Verify conductivity on coupons before considering rail use.</p>}
      </details>
      <details><summary>Energy, storage, and harvest</summary>
        <ParamSelect className="thermal-select" label="Harvester architecture" value={configuration.harvestingMode} options={RAIL_HARVEST_MODES} onChange={(harvestingMode) => update({ harvestingMode })} />
        <NumericParamControl className="thermal-range" label="Piezo input / axle / tie" value={configuration.piezoJoulesPerAxleTie} min={0} max={40} step={0.5} suffix="J" onChange={(piezoJoulesPerAxleTie) => update({ piezoJoulesPerAxleTie })} />
        <NumericParamControl className="thermal-range" label="TENG input / axle / tie" value={configuration.tengJoulesPerAxleTie} min={0} max={20} step={0.5} suffix="J" onChange={(tengJoulesPerAxleTie) => update({ tengJoulesPerAxleTie })} />
        <NumericParamControl className="thermal-range" label="Axles / train" value={configuration.axlesPerTrain} min={1} max={1000} step={1} onChange={(axlesPerTrain) => update({ axlesPerTrain })} />
        <NumericParamControl className="thermal-range" label="Trains / day" value={configuration.trainsPerDay} min={0} max={200} step={1} onChange={(trainsPerDay) => update({ trainsPerDay })} />
        <NumericParamControl className="thermal-range" label="Battery volume / tie" value={configuration.batteryVolumeL} min={0} max={20} step={0.25} suffix="L" onChange={(batteryVolumeL) => update({ batteryVolumeL })} />
        <NumericParamControl className="thermal-range" label="Battery target density" value={configuration.batteryEnergyDensityWhPerL} min={0} max={600} step={10} suffix="Wh/L" onChange={(batteryEnergyDensityWhPerL) => update({ batteryEnergyDensityWhPerL })} />
        <NumericParamControl className="thermal-range" label="Battery cycle-life target" value={configuration.batteryCycleLife} min={0} max={100000} step={1000} onChange={(batteryCycleLife) => update({ batteryCycleLife })} />
        <NumericParamControl className="thermal-range" label="Storage cycles / year" value={configuration.storageCyclesPerYear} min={0} max={1000} step={10} onChange={(storageCyclesPerYear) => update({ storageCyclesPerYear })} />
        <NumericParamControl className="thermal-range" label="WPT transfer efficiency" value={configuration.transferEfficiencyPercent} min={0} max={90} step={1} suffix="%" onChange={(transferEfficiencyPercent) => update({ transferEfficiencyPercent })} />
        <div className="thermal-readout"><span>Calculated storage capacity</span><strong>{harvest.storageMWhPerMile.toFixed(2)} MWh / mile</strong></div>
        <div className="thermal-readout"><span>Harvest estimate</span><strong>{harvest.grossKWhPerDayMile.toFixed(2)} kWh / day / mile</strong></div>
        <div className="thermal-readout"><span>Train passes to fill one tie</span><strong>{harvest.trainPassesToFillBattery?.toFixed(0) ?? 'N/A'}</strong></div>
        <div className="thermal-readout"><span>Cycle-life at assumed cycling</span><strong>{batteryServiceYearsAtTargetCycles == null ? 'N/A' : `${batteryServiceYearsAtTargetCycles.toFixed(1)} years`}</strong></div>
        <p className="thermal-citation">Battery density, cycle life, 1 MHz up-conversion, and WPT efficiency are scenario inputs from the transcript, not verified specifications.</p>
      </details>
      <details><summary>Electrical isolation screen</summary>
        <label className="amplitude-toggle"><input type="checkbox" checked={configuration.dielectricBarrierIntact} onChange={(event) => update({ dielectricBarrierIntact: event.target.checked })} /><span>Rail-seat dielectric barriers intact</span></label>
        <label className="rail-tie-number-control"><span>Measured rail-to-rail resistance</span><span><input type="number" min="0" step="any" value={configuration.measuredRailToRailResistanceOhm} onChange={(event) => update({ measuredRailToRailResistanceOhm: Math.max(0, Number(event.target.value) || 0) })} /> Ω</span></label>
        <div className={`rail-tie-isolation-state ${response.isolationScreenPasses ? '' : 'is-warning'}`}><span>Screening result</span><strong>{response.isolationScreenPasses ? 'Input clears 2 Ω screen' : 'Isolation review required'}</strong></div>
        <p className="thermal-citation">The 2 Ω value is from the source notes and is not a universal signaling acceptance criterion. This UI is not a track-circuit qualification or safety certification.</p>
      </details>
      <details><summary>Lifecycle scenario inputs</summary>
        {[
          ['Structural material / tie', 'structuralCostPerTie', 75, 1600, 0.01],
          ['Battery / tie', 'batteryCostPerTie', 0, 2000, 1],
          ['Harvester / tie', 'harvesterCostPerTie', 0, 500, 1],
          ['Wireless transfer / tie', 'wirelessTransferCostPerTie', 0, 500, 1],
          ['Telemetry / tie', 'telemetryCostPerTie', 0, 500, 1],
          ['Integration / tie', 'integrationCostPerTie', 0, 500, 1]
        ].map(([label, key, min, max, step]) => <NumericParamControl key={key} className="thermal-range" label={label} value={configuration[key]} min={min} max={max} step={step} prefix="$" onChange={(value) => update({ [key]: value })} />)}
        <NumericParamControl className="thermal-range" label="VPP value" value={configuration.gridValuePerMWhYear} min={0} max={40000} step={500} prefix="$" suffix="/MWh-year" onChange={(gridValuePerMWhYear) => update({ gridValuePerMWhYear })} />
        <NumericParamControl className="thermal-range" label="Maintenance savings scenario" value={configuration.annualMaintenanceSavings} min={0} max={100000} step={1000} prefix="$" suffix="/mile-year" onChange={(annualMaintenanceSavings) => update({ annualMaintenanceSavings })} />
        <NumericParamControl className="thermal-range" label="Infrastructure grant share" value={configuration.grantSharePercent} min={0} max={80} step={1} suffix="%" onChange={(grantSharePercent) => update({ grantSharePercent })} />
        <NumericParamControl className="thermal-range" label="Assumed eligible 45X credit" value={configuration.productionCreditPerKWh} min={0} max={45} step={1} suffix="$/kWh" onChange={(productionCreditPerKWh) => update({ productionCreditPerKWh })} />
        <NumericParamControl className="thermal-range" label="Credit transfer rate" value={configuration.creditTransferRatePercent} min={0} max={100} step={1} suffix="%" onChange={(creditTransferRatePercent) => update({ creditTransferRatePercent })} />
        <div className="thermal-readout"><span>Integrated tie cost scenario</span><strong>{money(finance.unitCost)} / tie</strong></div>
        <div className="thermal-readout"><span>Grant-adjusted premium / mile</span><strong>{money(finance.configuredPremium)}</strong></div>
        <div className="thermal-readout"><span>Payback scenario</span><strong>{paybackText(finance.configuredPaybackYears)}</strong></div>
        <p className="thermal-citation">Grant and tax-credit controls are sensitivity inputs; award eligibility and tax treatment are not determined here.</p>
      </details>
      <details open><summary>Rail scene and particles</summary>
        <NumericParamControl className="thermal-range" label="Sleeper count" value={configuration.tieCount} min={3} max={11} step={2} onChange={(tieCount) => update({ tieCount })} />
        <NumericParamControl className="thermal-range" label="Particle count" value={configuration.particleCount} min={128} max={4096} step={128} onChange={(particleCount) => update({ particleCount })} />
        <NumericParamControl className="thermal-range" label="Axle speed" value={configuration.axlePassSpeed} min={0.1} max={2.5} step={0.05} suffix="m/s" onChange={(axlePassSpeed) => update({ axlePassSpeed })} />
        <label className="amplitude-toggle"><input type="checkbox" checked={configuration.axlePassing} onChange={(event) => update({ axlePassing: event.target.checked })} /><span>Enable wheel passage</span></label>
        <label className="amplitude-toggle"><input type="checkbox" checked={configuration.xrayMode} onChange={(event) => update({ xrayMode: event.target.checked })} /><span>Show internal energy core</span></label>
        <label className="amplitude-toggle"><input type="checkbox" checked={configuration.selfHealing} onChange={(event) => update({ selfHealing: event.target.checked })} /><span>Visualize self-healing response</span></label>
        <ParamSelect className="thermal-select" label="Telemetry dock" value={configuration.telemetryDock} options={[{ value: 'auto', label: 'Auto (landscape bottom)' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} onChange={(telemetryDock) => update({ telemetryDock })} />
        <NumericParamControl className="thermal-range" label="Telemetry opacity" value={configuration.telemetryOpacity} min={0.2} max={1} step={0.01} onChange={(telemetryOpacity) => update({ telemetryOpacity })} />
        <NumericParamControl className="thermal-range" label="Telemetry height" value={configuration.telemetryHeight} min={120} max={420} step={20} suffix="px" onChange={(telemetryHeight) => update({ telemetryHeight })} />
        <SimulatorViewParameters configuration={configuration} onChange={updateConfiguration} cameraClassName="rail-tie-camera-settings" particleClassName="rail-tie-view-particles" appearanceCapabilities={{ shape: false, derivativeOrder: false, colorMode: false, color: false }} />
      </details>
      <p className="thermal-citation">Concept-stage estimates only. Acetolysis recovery, battery safety, energy yield, fatigue life, and self-healing all require formulation-specific testing.</p>
    </aside>
  </SimulatorBase>;
}