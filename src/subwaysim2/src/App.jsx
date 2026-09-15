import { lazy, Suspense, useState } from 'react';

const WaveInterferenceSim = lazy(() => import('./WaveInterferenceSim.jsx'));
const SimpleAttractorSim = lazy(() => import('./SimpleAttractorSim.jsx').then(({ SimpleAttractorSim: component }) => ({ default: component })));
const SqgBlackHoleSim = lazy(() => import('./SqgBlackHoleSim.jsx'));
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
    description: 'The attractor rig, copied forward as a blank gravitational playground for the next SQG experiment.',
    detail: 'PROTOTYPE / INHERITED RIG',
    accent: 'orange'
  },
  {
    id: 'frcfusionsim',
    index: '04',
    name: 'frcfusionsim',
    label: 'FRC fusion device',
    description: 'A transparent field-reversed configuration foundation with selectable vessel geometries and physical device configurations.',
    detail: 'DEVICE / HIGH-BETA / PHASE 01',
    accent: 'orange'
  },
  {
    id: 'subwaysim2',
    index: '05',
    name: 'subwaysim2',
    label: 'Transit thermodynamics',
    description: 'A GPU airflow chamber where trains, shafts, stairs, and thermal sources shape a living station field.',
    detail: 'FLUID / SPH / INFRASTRUCTURE',
    accent: 'teal'
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
  if (selectedSimulation === 'frcfusionsim') simulation = <FrcFusionSim onBack={onBack} />;
  if (selectedSimulation === 'subwaysim2') simulation = <SubwaySim onBack={onBack} />;
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
