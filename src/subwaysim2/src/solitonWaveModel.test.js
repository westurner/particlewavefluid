import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSolitonSolverState,
  DEFAULT_SOLITON_CONFIG,
  deriveSolitonPhysicsParameters,
  evaluateBathymetryAt,
  evaluateTubularCrestAt,
  getSolitonEquationDetails,
  normalizeSolitonConfig,
  sampleSolitonFieldAt,
  SOLITON_BATHYMETRY_OPTIONS,
  SOLITON_DOMAIN_OPTIONS,
  SOLITON_EQUATION_DETAILS,
  SOLITON_EQUATION_OPTIONS,
  SOLITON_FLUIDS,
  stepSolitonSolver,
  triggerSolitonLauncherImpulse,
  WATER_HDL_LDL_PATHWAY_OPTIONS
} from './solitonWaveModel.js';

test('soliton fluid catalog includes all required fluids and HDL+LDL pathways', () => {
  const expectedFluidIds = [
    'water',
    'glycerin',
    'hydrogen',
    'helium-3',
    'helium-4',
    'argon',
    'water-hdl-ldl'
  ];
  expectedFluidIds.forEach((fluidId) => {
    assert.ok(SOLITON_FLUIDS[fluidId], `missing fluid preset: ${fluidId}`);
  });
  assert.equal(SOLITON_DOMAIN_OPTIONS.length, 2);
  assert.ok(SOLITON_EQUATION_OPTIONS.some((option) => option.value === 'kdv'));
  assert.ok(SOLITON_EQUATION_OPTIONS.some((option) => option.value === 'boussinesq'));
  assert.ok(SOLITON_EQUATION_OPTIONS.some((option) => option.value === 'vector-coupled'));
  assert.ok(SOLITON_EQUATION_OPTIONS.some((option) => option.value === 'cfd-2d'));
  SOLITON_EQUATION_OPTIONS.forEach(({ value }) => {
    const details = getSolitonEquationDetails(value);
    assert.ok(SOLITON_EQUATION_DETAILS[value], `missing equation details for ${value}`);
    assert.ok(details.formula.length > 5 && details.summary.length > 10 && details.poolUse.length > 10 && details.plasmaUse.length > 10);
  });
  assert.ok(WATER_HDL_LDL_PATHWAY_OPTIONS.some((option) => option.value === 'near-boundary-3-saddle' && option.saddlePoints === 3));
  assert.ok(WATER_HDL_LDL_PATHWAY_OPTIONS.some((option) => option.value === 'ambient-1-saddle' && option.saddlePoints === 1));
});

test('KdV single soliton propagates forward and Glycerin dissipates more energy than Water', () => {
  const baseConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    domain: 'wave-pool',
    equation: 'kdv',
    emissionSide: 'left',
    solitonCount: 1,
    boundaryCondition: 'periodic',
    viscosityScale: 1.5,
    solitons: [
      { enabled: true, amplitude: 0.85, width: 1.4, positionOffset: -3.5, polarity: 1, vectorAngleDeg: 0, sideOverride: 'left' },
      { enabled: false, amplitude: 0.4, width: 1.5, positionOffset: 3.5, polarity: 1, vectorAngleDeg: 0, sideOverride: 'right' }
    ]
  });

  const waterState = createSolitonSolverState({ ...baseConfig, fluidId: 'water' });
  const glycerinState = createSolitonSolverState({ ...baseConfig, fluidId: 'glycerin' });
  const initialPeakX = waterState.telemetry.peakX;

  for (let step = 0; step < 35; step += 1) {
    stepSolitonSolver(waterState, { ...baseConfig, fluidId: 'water' }, 1 / 60);
    stepSolitonSolver(glycerinState, { ...baseConfig, fluidId: 'glycerin' }, 1 / 60);
  }

  assert.ok(waterState.telemetry.peakX > initialPeakX + 0.4, `expected KdV soliton to translate rightwards: ${initialPeakX} -> ${waterState.telemetry.peakX}`);
  assert.ok(
    glycerinState.telemetry.peakAmplitude < waterState.telemetry.peakAmplitude,
    `expected Glycerin peak (${glycerinState.telemetry.peakAmplitude}) < Water peak (${waterState.telemetry.peakAmplitude})`
  );
  assert.ok(
    glycerinState.telemetry.viscousEnergyLossFraction > waterState.telemetry.viscousEnergyLossFraction,
    'expected Glycerin to exhibit higher viscous energy loss than Water'
  );
});

test('bidirectional Boussinesq supports emitting two solitons from both sides and head-on collision', () => {
  const bothConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    domain: 'wave-pool',
    equation: 'boussinesq',
    fluidId: 'water',
    emissionSide: 'both',
    solitonCount: 2,
    solitons: [
      { enabled: true, amplitude: 0.7, width: 1.3, positionOffset: -4.2, polarity: 1, vectorAngleDeg: 0, sideOverride: 'left' },
      { enabled: true, amplitude: 0.65, width: 1.3, positionOffset: 4.2, polarity: 1, vectorAngleDeg: 0, sideOverride: 'right' }
    ]
  });
  const state = createSolitonSolverState(bothConfig);
  const leftSampleInitial = sampleSolitonFieldAt(state, bothConfig, -4.2, 0);
  const rightSampleInitial = sampleSolitonFieldAt(state, bothConfig, 4.2, 0);
  assert.ok(leftSampleInitial.u1 > 0.5);
  assert.ok(rightSampleInitial.u1 > 0.5);
  assert.ok(leftSampleInitial.velocityX > 0, 'left-emitted soliton should move rightward (+x)');
  assert.ok(rightSampleInitial.velocityX < 0, 'right-emitted soliton should move leftward (-x)');

  for (let step = 0; step < 40; step += 1) {
    stepSolitonSolver(state, bothConfig, 1 / 60);
  }
  assert.ok(Number.isFinite(state.telemetry.peakAmplitude) && state.telemetry.peakAmplitude > 0.2);
});

test('coupled vector soliton mode evolves two components and decouples when vectorCoupling is zero', () => {
  const coupledConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    equation: 'vector-coupled',
    solitonCount: 1,
    vectorCoupling: 0.85,
    solitons: [
      { enabled: true, amplitude: 0.8, width: 1.3, positionOffset: -3.0, polarity: 1, vectorAngleDeg: 35, sideOverride: 'left' },
      { enabled: false, amplitude: 0.4, width: 1.5, positionOffset: 3.0, polarity: 1, vectorAngleDeg: 0, sideOverride: 'right' }
    ]
  });
  const stateCoupled = createSolitonSolverState(coupledConfig);
  const stateUncoupled = createSolitonSolverState({ ...coupledConfig, vectorCoupling: 0 });

  for (let step = 0; step < 30; step += 1) {
    stepSolitonSolver(stateCoupled, coupledConfig, 1 / 60);
    stepSolitonSolver(stateUncoupled, { ...coupledConfig, vectorCoupling: 0 }, 1 / 60);
  }

  assert.ok(stateCoupled.telemetry.secondaryEnergy > 0.01, 'expected active secondary component energy in vector soliton');
  const diff = stateCoupled.u1.reduce((acc, val, idx) => acc + Math.abs(val - stateUncoupled.u1[idx]), 0);
  assert.ok(diff > 1e-3, 'expected cross-phase vector coupling to alter component evolution');
});

test('plasma wave mode computes ion-acoustic speed ordering across Hydrogen, Helium-3, Helium-4, and Argon', () => {
  const hPhysics = deriveSolitonPhysicsParameters({ domain: 'plasma-wave', fluidId: 'hydrogen', electronTempEv: 3 });
  const he3Physics = deriveSolitonPhysicsParameters({ domain: 'plasma-wave', fluidId: 'helium-3', electronTempEv: 3 });
  const he4Physics = deriveSolitonPhysicsParameters({ domain: 'plasma-wave', fluidId: 'helium-4', electronTempEv: 3 });
  const arPhysics = deriveSolitonPhysicsParameters({ domain: 'plasma-wave', fluidId: 'argon', electronTempEv: 3 });

  assert.ok(hPhysics.ionSoundSpeedMS > he3Physics.ionSoundSpeedMS);
  assert.ok(he3Physics.ionSoundSpeedMS > he4Physics.ionSoundSpeedMS);
  assert.ok(he4Physics.ionSoundSpeedMS > arPhysics.ionSoundSpeedMS);
  assert.ok(arPhysics.debyeLengthM > 0);
});

test('Water (HDL+LDL) tracks local structural fractions and pathway saddle points', () => {
  const nearBoundaryConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    fluidId: 'water-hdl-ldl',
    hdlLdlPathway: 'near-boundary-3-saddle',
    hdlLdlCoupling: 0.75
  });
  const ambientConfig = normalizeSolitonConfig({
    ...nearBoundaryConfig,
    hdlLdlPathway: 'ambient-1-saddle'
  });

  const stateNear = createSolitonSolverState(nearBoundaryConfig);
  const stateAmbient = createSolitonSolverState(ambientConfig);
  stepSolitonSolver(stateNear, nearBoundaryConfig, 1 / 30);
  stepSolitonSolver(stateAmbient, ambientConfig, 1 / 30);

  assert.equal(stateNear.telemetry.hdlLdlSaddlePoints, 3);
  assert.equal(stateAmbient.telemetry.hdlLdlSaddlePoints, 1);
  assert.ok(stateNear.telemetry.meanLdlFraction > stateAmbient.telemetry.meanLdlFraction);
  assert.ok(Math.abs(stateNear.telemetry.meanLdlFraction + stateNear.telemetry.meanHdlFraction - 1) < 1e-9);

  const confined2004Config = normalizeSolitonConfig({
    ...nearBoundaryConfig,
    hdlLdlPathway: 'confined-hdl-2004'
  });
  const stateConfined = createSolitonSolverState(confined2004Config);
  assert.equal(stateConfined.telemetry.hdlLdlLoopTopology, 'interfacial-confined');
  assert.ok(stateConfined.telemetry.meanHdlFraction > 0.8);
});

test('right-side soliton emission, Gardner/mKdV rarefactive pulses, and Sine-Gordon kinks evolve stably', () => {
  const rightGardnerConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    equation: 'gardner-mkdv',
    emissionSide: 'right',
    solitonCount: 1,
    cubicNonlinearity: -0.6,
    solitons: [
      { enabled: true, amplitude: 0.75, width: 1.3, positionOffset: 3.8, polarity: -1, vectorAngleDeg: 0, sideOverride: 'right' },
      { enabled: false, amplitude: 0.4, width: 1.5, positionOffset: -3.5, polarity: 1, vectorAngleDeg: 0, sideOverride: 'left' }
    ]
  });
  const gardnerState = createSolitonSolverState(rightGardnerConfig);
  assert.ok(gardnerState.telemetry.minAmplitude < -0.5, 'expected rarefactive depression soliton');
  for (let step = 0; step < 20; step += 1) {
    stepSolitonSolver(gardnerState, rightGardnerConfig, 1 / 60);
  }
  assert.ok(Number.isFinite(gardnerState.telemetry.peakAmplitude));

  const sineGordonConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    equation: 'sine-gordon',
    emissionSide: 'both',
    solitonCount: 2
  });
  const sgState = createSolitonSolverState(sineGordonConfig);
  for (let step = 0; step < 20; step += 1) {
    stepSolitonSolver(sgState, sineGordonConfig, 1 / 60);
  }
  assert.ok(Number.isFinite(sgState.telemetry.peakAmplitude) && sgState.telemetry.peakAmplitude > 0.1);
});

test('2D CFD cross-section solver advances velocity and pressure fields with bounded divergence', () => {
  const cfdConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    equation: 'cfd-2d',
    fluidId: 'water',
    emissionSide: 'both'
  });
  const state = createSolitonSolverState(cfdConfig);
  for (let step = 0; step < 15; step += 1) {
    stepSolitonSolver(state, cfdConfig, 1 / 60);
  }
  triggerSolitonLauncherImpulse(state, cfdConfig, 'both');
  stepSolitonSolver(state, cfdConfig, 1 / 60);

  assert.ok(Number.isFinite(state.telemetry.cfdMaxDivergence));
  assert.ok(state.telemetry.cfdMaxDivergence < 5, `expected bounded CFD divergence, got ${state.telemetry.cfdMaxDivergence}`);
  assert.ok(state.actuatorPulseTimerLeft > 0 && state.actuatorPulseTimerRight > 0);
});

test('floor bathymetry shoaling and tubular wave curl tool compute reef depth, breaker index, and barrel lip offsets', () => {
  assert.equal(SOLITON_BATHYMETRY_OPTIONS.length, 5);
  const flatBathy = evaluateBathymetryAt(1.0, 0, { poolDepthM: 2.0, bathymetryProfile: 'flat', bathymetryRelief: 0.6 });
  const reefBathy = evaluateBathymetryAt(1.0, 0, { poolDepthM: 2.0, bathymetryProfile: 'surf-reef', bathymetryRelief: 0.6, bathymetryCenterX: 1.0 });
  assert.equal(flatBathy.elevationM, 0);
  assert.equal(flatBathy.localDepthM, 2.0);
  assert.ok(reefBathy.elevationM > 0.5, 'expected submerged surfing reef to elevate seabed');
  assert.ok(reefBathy.localDepthM < flatBathy.localDepthM, 'expected reef to reduce local water depth');

  const tubularConfig = normalizeSolitonConfig({
    ...DEFAULT_SOLITON_CONFIG,
    enabled: true,
    domain: 'wave-pool',
    equation: 'boussinesq',
    bathymetryProfile: 'surf-reef',
    bathymetryRelief: 0.62,
    bathymetryCenterX: 1.0,
    tubularBreakerEnabled: true,
    tubularCurlStrength: 1.0,
    showStillWaterDepth: true,
    showFloorBathymetry: true,
    solitonCount: 1,
    solitons: [
      { enabled: true, amplitude: 0.9, width: 1.2, positionOffset: 0.8, polarity: 1, vectorAngleDeg: 0, sideOverride: 'left' },
      { enabled: false, amplitude: 0.4, width: 1.5, positionOffset: 3.5, polarity: 1, vectorAngleDeg: 0, sideOverride: 'right' }
    ]
  });
  const state = createSolitonSolverState(tubularConfig);
  stepSolitonSolver(state, tubularConfig, 1 / 60);
  const crest = evaluateTubularCrestAt(state, tubularConfig, 0.8, 0, 0.8);
  assert.ok(crest.plungeIntensity > 0.2, `expected active plunging intensity over surfing reef, got ${crest.plungeIntensity}`);
  assert.ok(Math.abs(crest.curlOffsetX) > 0.01, 'expected horizontal lip curl projection');
  assert.equal(state.telemetry.breakerRegime, 'Plunging / Tubular barrel');
  assert.ok(state.telemetry.minLocalDepthM < state.telemetry.poolDepthM);
});
