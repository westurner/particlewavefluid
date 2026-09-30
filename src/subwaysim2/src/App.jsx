import { lazy, Suspense, useState } from 'react';

const WaveInterferenceSim = lazy(() => import('./WaveInterferenceSim.jsx'));
const SimpleAttractorSim = lazy(() => import('./SimpleAttractorSim.jsx').then(({ SimpleAttractorSim: component }) => ({ default: component })));
const SqgBlackHoleSim = lazy(() => import('./SqgBlackHoleSim.jsx'));
const DdfBlackHoleSim = lazy(() => import('./DdfBlackHoleSim.jsx'));
const AmplitudeGravitySim = lazy(() => import('./AmplitudeGravitySim.jsx'));
const FtleLabSim = lazy(() => import('./FtleLabSim.jsx'));
const QuantumFluidSim = lazy(() => import('./QuantumFluidSim.jsx'));
const ThermalLoopSim = lazy(() => import('./ThermalLoopSim.jsx'));
const PhaseSignalSim = lazy(() => import('./PhaseSignalSim.jsx'));
const FrcFusionSim = lazy(() => import('./FrcFusionSim.jsx'));
const SubwaySim = lazy(() => import('./SubwaySim.jsx').then(({ SubwaySim: component }) => ({ default: component })));

const SIMULATION_MODES = [
  {
    id: 'waveinterferencesim',
    index: '01',
    name: 'waveinterferencesim',
    label: 'Wave interference',
    description: 'Compose one or more animated waves with independent wavelength, amplitude, phase modes, and phase parameters.',
    detail: 'WAVES / PHASE / SUPERPOSITION',
    accent: 'violet'
  },
  {
    id: 'simpleattractorsim',
    index: '02',
    name: 'simpleattractorsim',
    label: 'Attractor particles',
    description: 'A direct React port of the Three.js attractor lab with spinning masses, transform rigs, presets, and playback.',
    detail: 'N-BODY / PRESETS / JOURNAL',
    accent: 'blue'
  },
  {
    id: 'sqgblackholesim',
    index: '03',
    name: 'sqgblackholesim',
    label: 'Black-hole sandbox',
    description: 'Compare compressible and incompressible NS response fields with explicitly hypothetical SQG and DDF sink models.',
    detail: 'NS / SQG / MODEL DELTA',
    accent: 'orange'
  },
  {
    id: 'frcfusionsim',
    index: '04',
    name: 'frcfusionsim',
    label: 'FRC + Argon MHD device',
    description: 'A transparent field-reversed device with independent Argon MHD, piezo-modulated RMF, and longitudinal ion-acoustic experiments.',
    detail: 'DEVICE / HIGH-BETA / MHD',
    accent: 'orange'
  },
  {
    id: 'ddfblackholesim',
    index: '05',
    name: 'ddfblackholesim',
    label: 'Dilatant dark fluid',
    description: 'A bounded hypothesis model adding speed-limited shear thickening to the SQG sink-flow experiment.',
    detail: 'DDF / DILATANCY / MODEL DELTA',
    accent: 'teal'
  },
  {
    id: 'subwaysim2',
    index: '06',
    name: 'subwaysim2',
    label: 'Transit thermodynamics',
    description: 'A GPU airflow chamber where trains, shafts, stairs, and thermal sources shape a living station field.',
    detail: 'FLUID / SPH / INFRASTRUCTURE',
    accent: 'teal'
  },
  {
    id: 'amplitudegravitysim',
    index: '07',
    name: 'amplitudegravitysim',
    label: 'Amplitude geometry gravity',
    description: 'Compare Newtonian motion with spin-2 EFT and positive-Grassmannian geometric correction proxies.',
    detail: 'GR(2,4) / SPIN-2 / N-BODY',
    accent: 'blue'
  },
  {
    id: 'ftlelabsim',
    index: '08',
    name: 'ftlelabsim',
    label: 'FTLE / coherent structures',
    description: 'Integrate trajectories and inspect deformation, volume change, and attracting or repelling transport structures.',
    detail: 'FLOW MAP / C-G TENSOR / LCS',
    accent: 'teal'
  },
  {
    id: 'quantumfluidsim',
    index: '09',
    name: 'quantumfluidsim',
    label: 'Quantum fluid',
    description: 'Evolve a complex Gross-Pitaevskii field beside an Euler-Korteweg hydrodynamic reference.',
    detail: 'GPE / PHASE / QUANTUM PRESSURE',
    accent: 'violet'
  },
  {
    id: 'thermalloopsim',
    index: '10',
    name: 'thermalloopsim',
    label: 'Datacenter thermal loop',
    description: 'Balance heat capacity, pressure drop, pump work, chiller load, economizer hours, and PUE uncertainty.',
    detail: 'ENERGY / HYDRAULICS / PUE',
    accent: 'orange'
  },
  {
    id: 'phasesignalsim',
    index: '11',
    name: 'phasesignalsim',
    label: 'Fracture / phase-slip signals',
    description: 'Demodulate synthetic I/Q data, unwrap phase, detect discontinuities, and compare event timing.',
    detail: 'I/Q / EVENTS / PHASE UNWRAP',
    accent: 'blue'
  }
];

function LoadingScreen() {
  return <main className="sqg-loader"><section className="sqg-loader-intro"><span className="sqg-loader-kicker">LOADING FIELD</span><h1>Preparing the simulation</h1></section></main>;
}

function SimulationLoader() {
  const [selectedSimulation, setSelectedSimulation] = useState(null);
  const onBack = () => setSelectedSimulation(null);
  let simulation = null;
  if (selectedSimulation === 'waveinterferencesim') simulation = <WaveInterferenceSim onBack={onBack} />;
  if (selectedSimulation === 'simpleattractorsim') simulation = <SimpleAttractorSim onBack={onBack} />;
  if (selectedSimulation === 'sqgblackholesim') simulation = <SqgBlackHoleSim onBack={onBack} />;
  if (selectedSimulation === 'ddfblackholesim') simulation = <DdfBlackHoleSim onBack={onBack} />;
  if (selectedSimulation === 'frcfusionsim') simulation = <FrcFusionSim onBack={onBack} />;
  if (selectedSimulation === 'subwaysim2') simulation = <SubwaySim onBack={onBack} />;
  if (selectedSimulation === 'amplitudegravitysim') simulation = <AmplitudeGravitySim onBack={onBack} />;
  if (selectedSimulation === 'ftlelabsim') simulation = <FtleLabSim onBack={onBack} />;
  if (selectedSimulation === 'quantumfluidsim') simulation = <QuantumFluidSim onBack={onBack} />;
  if (selectedSimulation === 'thermalloopsim') simulation = <ThermalLoopSim onBack={onBack} />;
  if (selectedSimulation === 'phasesignalsim') simulation = <PhaseSignalSim onBack={onBack} />;
  if (simulation) return <Suspense fallback={<LoadingScreen />}>{simulation}</Suspense>;

  return (
    <main className="sqg-loader">
      <header className="sqg-loader-header">
        <div className="sqg-loader-brand"><span className="sqg-loader-mark">PAS</span><span><b>PARTICLESWAVESFLUIDS</b><em>Particle system field experiments</em></span></div>
        <span className="sqg-loader-meta">00 / SIM LOADER</span>
      </header>
      <section className="sqg-loader-intro">
        <span className="sqg-loader-kicker">SELECT A SIMULATION</span>
        <h1>Particle, Wave, Gravity, Fluid, Plasma<br />simulation</h1>
        <h2>Simulators for all of the things.</h2>
        <p>An R3F (React Three Fiber (ThreeJS)) and GPU shader based particle framework. Choose a field to simulate:</p>
      </section>
      <section className="sqg-mode-grid" aria-label="Available simulations">
        {SIMULATION_MODES.map((mode) => (
          <button key={mode.id} type="button" className={`sqg-mode-card ${mode.accent}`} onClick={() => setSelectedSimulation(mode.id)}>
            <span className="sqg-mode-index">{mode.index} / LOAD FIELD</span>
            <span className="sqg-mode-name">{mode.name}</span>
            <span className="sqg-mode-label">{mode.label}</span>
            <span className="sqg-mode-description">{mode.description}</span>
            <span className="sqg-mode-footer"><span>{mode.detail}</span><strong>Enter <span aria-hidden="true">↗</span></strong></span>
          </button>
        ))}
      </section>
      <footer className="sqg-loader-footer"><span>THREE.JS / REACT / WEBGL</span><span>Choose a field to begin</span></footer>
    </main>
  );
}

export default SimulationLoader;
