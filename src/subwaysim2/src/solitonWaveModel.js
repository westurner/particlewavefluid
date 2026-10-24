export const SOLITON_GRID_SIZE = 160;
export const SOLITON_CFD_NX = 64;
export const SOLITON_CFD_NZ = 16;
export const SOLITON_DOMAIN_SPAN = 18;

export const SOLITON_DOMAIN_OPTIONS = Object.freeze([
  { value: 'wave-pool', label: 'Pneumatic surfing wave pool (hydrodynamic)' },
  { value: 'plasma-wave', label: 'Plasma wave chamber (ion-acoustic / MHD)' }
]);

export const SOLITON_EQUATION_OPTIONS = Object.freeze([
  { value: 'kdv', label: 'Korteweg-de Vries (KdV + viscosity)' },
  { value: 'boussinesq', label: 'Bidirectional Boussinesq (two-sided pool / plasma)' },
  { value: 'vector-coupled', label: 'Vector soliton (2-component coupled KdV / Manakov)' },
  { value: 'gardner-mkdv', label: 'Gardner / mKdV (quadratic + cubic nonlinearity)' },
  { value: 'sine-gordon', label: 'Sine-Gordon (topological kink / breather)' },
  { value: 'cfd-2d', label: '2D Real-time Navier-Stokes / Fluid CFD' }
]);

export const SOLITON_EQUATION_DETAILS = Object.freeze({
  kdv: {
    id: 'kdv',
    label: 'Korteweg-de Vries (KdV + viscosity)',
    formula: '∂t u + c0 ∂x u + α u ∂x u + β ∂xxx u = νeff ∂xx u',
    summary: 'Unidirectional weakly nonlinear, weakly dispersive long-wave solver with calibrated KdV-Burgers viscous attenuation.',
    poolUse: 'Models single-direction shallow-water solitary waves and overtaking two-soliton elastic phase-shift interactions.',
    plasmaUse: 'Washimi-Taniuti ion-acoustic solitary waves where electron Debye dispersion balances ion inertial steepening.'
  },
  boussinesq: {
    id: 'boussinesq',
    label: 'Bidirectional Boussinesq (two-sided pool / plasma)',
    formula: '∂t u + ∂x v + ∂x(α u v / c0) = νeff ∂xx u; (1 - 3β/c0 ∂xx) ∂t v + c0² ∂x u + ½ α c0 ∂x(u²) = νeff ∂xx v',
    summary: 'Two-way coupled elevation/potential and momentum system supporting simultaneous left and right soliton emission and wall reflections.',
    poolUse: 'Captures head-on bilateral pneumatic wave-pool collisions, crest run-up amplification, and counter-propagating phase lag.',
    plasmaUse: 'Models counter-propagating ion-acoustic wave packets launched from opposing plasma excitation grids.'
  },
  'vector-coupled': {
    id: 'vector-coupled',
    label: 'Vector soliton (2-component coupled KdV / Manakov)',
    formula: '∂t u1,2 + (c0 ± Δc) ∂x u1,2 + α (u1,2 + σ12 u2,1) ∂x u1,2 + β ∂xxx u1,2 = νeff ∂xx u1,2',
    summary: 'Evolves a two-component vector wave field U = (u1, u2) with group-velocity mismatch Δc and cross-phase nonlinear coupling σ12.',
    poolUse: 'Represents coupled longitudinal/transverse channel modes that exchange energy or lock into polarized vector solitons.',
    plasmaUse: 'Models coupled two-polarization magnetosonic, Alfvén, or Langmuir/ion-acoustic envelope modes.'
  },
  'gardner-mkdv': {
    id: 'gardner-mkdv',
    label: 'Gardner / mKdV (quadratic + cubic nonlinearity)',
    formula: '∂t u + c0 ∂x u + (α u + α2 u²) ∂x u + β ∂xxx u = νeff ∂xx u',
    summary: 'Combines quadratic KdV and cubic modified-KdV (mKdV) nonlinearity to support both compressive (+1) and rarefactive (-1) solitons and flat-top table solitons.',
    poolUse: 'Captures internal/stratified pycnocline waves and steep finite-amplitude shallow-water crests near limiting height.',
    plasmaUse: 'Essential for multi-species, negative-ion, or two-electron-temperature plasmas where quadratic nonlinearity vanishes or changes sign.'
  },
  'sine-gordon': {
    id: 'sine-gordon',
    label: 'Sine-Gordon (topological kink / breather)',
    formula: '∂tt u - c0² ∂xx u + ω0² sin(π u) = νeff ∂xx(∂t u) - γ ∂t u',
    summary: 'Lorentz-covariant nonlinear Klein-Gordon wave solver supporting topological 2π kinks, antikinks, and oscillatory breathers.',
    poolUse: 'Provides a topological phase-front and sloshing pendulum-chain analogue across the channel.',
    plasmaUse: 'Models magnetic fluxon propagation, Josephson-like phase slips, and periodic nonlinear cyclotron/phase waves.'
  },
  'cfd-2d': {
    id: 'cfd-2d',
    label: '2D Real-time Navier-Stokes / Fluid CFD',
    formula: '∂t u + (u·∇)u = -(1/ρ)∇p + νCFD ∇²u + f; ∇·u → 0 (Jacobi pressure-Poisson projection)',
    summary: 'Couples surface/density wave transport to a 64×16 longitudinal-vertical (x,z) staggered-grid Navier-Stokes momentum and pressure-projection solver.',
    poolUse: 'Resolves vertical orbital velocity structure, bottom shear, vorticity rollers, and pneumatic caisson impulse across pool depth.',
    plasmaUse: 'Resolves 2D axial-transverse ion fluid momentum, shear vorticity, and electrostatic/magnetic pressure gradients.'
  }
});

export function getSolitonEquationDetails(equationId) {
  return SOLITON_EQUATION_DETAILS[equationId] ?? SOLITON_EQUATION_DETAILS.boussinesq;
}

export const SOLITON_EMISSION_SIDE_OPTIONS = Object.freeze([
  { value: 'left', label: 'Left launcher only' },
  { value: 'right', label: 'Right launcher only' },
  { value: 'both', label: 'Both sides (head-on collision)' }
]);

export const SOLITON_BOUNDARY_OPTIONS = Object.freeze([
  { value: 'reflective', label: 'Reflective pool / chamber walls' },
  { value: 'absorbing', label: 'Absorbing beach / plasma damper' },
  { value: 'periodic', label: 'Periodic wrap' }
]);

export const WATER_HDL_LDL_PATHWAY_OPTIONS = Object.freeze([
  {
    value: 'near-boundary-3-saddle',
    label: 'Near HDL/LDL boundary (full-loop, 3 saddle points)',
    saddlePoints: 3,
    loopTopology: 'full-loop',
    equilibriumLdlFraction: 0.46,
    relaxationTimeS: 0.45,
    compressibilityAnomaly: 0.32,
    viscosityCoupling: 0.28,
    citation: 'Li et al., Nature Physics 22, 1144-1151 (2026) — full-loop 3-saddle pathway near HDL/LDL coexistence (e.g. 1800 bar, 188 K).'
  },
  {
    value: 'ambient-1-saddle',
    label: 'Away from boundary (semi-loop, 1 saddle point)',
    saddlePoints: 1,
    loopTopology: 'semi-loop',
    equilibriumLdlFraction: 0.22,
    relaxationTimeS: 0.16,
    compressibilityAnomaly: 0.11,
    viscosityCoupling: 0.09,
    citation: 'Li et al., Nature Physics 22, 1144-1151 (2026) — semi-loop 1-saddle pathway away from phase boundary (e.g. 1 bar, 260 K).'
  },
  {
    value: 'confined-hdl-2004',
    label: 'Confined interfacial HDL layer (Reichert 2004, +17% density)',
    saddlePoints: 1,
    loopTopology: 'interfacial-confined',
    equilibriumLdlFraction: 0.14,
    relaxationTimeS: 0.28,
    compressibilityAnomaly: 0.24,
    viscosityCoupling: 0.22,
    citation: 'Reichert et al. / Krieger, Science (2004) — 5-molecule confined water layer between ice and silica at -17 C with ~17% higher HDL-like density.'
  }
]);

export const SOLITON_FLUIDS = Object.freeze({
  water: {
    id: 'water',
    label: 'Water',
    stateSummary: 'Ambient liquid water (293 K, 1 atm)',
    plasmaSummary: 'Water-group ion plasma proxy (H2O+, mi = 18 u)',
    densityKgM3: 998.2,
    kinematicViscosityM2S: 1.004e-6,
    dynamicViscosityPaS: 1.002e-3,
    surfaceTensionNM: 0.0728,
    effectiveViscousDamping: 0.012,
    ionMassU: 18.015,
    chargeNumberZ: 1,
    defaultElectronTempEv: 2.2,
    defaultIonTempEv: 0.2,
    colorHex: '#35b8d6',
    secondaryColorHex: '#7be7ff',
    caveat: 'Standard IAPWS liquid water baseline for shallow-water KdV, Boussinesq, and 2D free-surface CFD.'
  },
  glycerin: {
    id: 'glycerin',
    label: 'Glycerin',
    stateSummary: 'High-viscosity Newtonian liquid (293 K, 1 atm)',
    plasmaSummary: 'Collisional heavy macromolecular plasma proxy (mi = 92 u)',
    densityKgM3: 1261.0,
    kinematicViscosityM2S: 1.12e-3,
    dynamicViscosityPaS: 1.412,
    surfaceTensionNM: 0.0634,
    effectiveViscousDamping: 0.16,
    ionMassU: 92.09,
    chargeNumberZ: 1,
    defaultElectronTempEv: 1.5,
    defaultIonTempEv: 0.3,
    colorHex: '#e3a84b',
    secondaryColorHex: '#ffd984',
    caveat: 'Kinematic viscosity is ~1100x water at 20 C, causing strong KdV-Burgers crest attenuation and diffusive tailing.'
  },
  hydrogen: {
    id: 'hydrogen',
    label: 'Hydrogen',
    stateSummary: 'Cryogenic liquid LH2 (20.3 K, 1 atm)',
    plasmaSummary: 'Proton-electron plasma (H+ / e-, mi = 1.008 u)',
    densityKgM3: 70.85,
    kinematicViscosityM2S: 1.9e-7,
    dynamicViscosityPaS: 1.35e-5,
    surfaceTensionNM: 0.0019,
    effectiveViscousDamping: 0.004,
    ionMassU: 1.008,
    chargeNumberZ: 1,
    defaultElectronTempEv: 4.5,
    defaultIonTempEv: 0.4,
    colorHex: '#64d8cb',
    secondaryColorHex: '#b9fff6',
    caveat: 'In wave-pool mode assumes cryogenic LH2 at 20.3 K; in plasma mode models fast proton-electron ion-acoustic solitons.'
  },
  'helium-3': {
    id: 'helium-3',
    label: 'Helium 3',
    stateSummary: 'Cryogenic Fermi liquid 3He (1.5 K, saturated)',
    plasmaSummary: 'Helium-3 fusion/space plasma (3He+ / e-, mi = 3.016 u)',
    densityKgM3: 59.0,
    kinematicViscosityM2S: 3.4e-7,
    dynamicViscosityPaS: 2.0e-5,
    surfaceTensionNM: 0.00015,
    effectiveViscousDamping: 0.006,
    ionMassU: 3.016,
    chargeNumberZ: 1,
    defaultElectronTempEv: 3.8,
    defaultIonTempEv: 0.35,
    colorHex: '#7da6ff',
    secondaryColorHex: '#c6d8ff',
    caveat: 'Normal Fermi liquid above 2.5 mK; superfluid 3He pairing requires mK temperatures and a spin-triplet order parameter.'
  },
  'helium-4': {
    id: 'helium-4',
    label: 'Helium 4',
    stateSummary: 'Cryogenic liquid 4He (4.2 K He-I / <2.17 K He-II proxy)',
    plasmaSummary: 'Helium-4 plasma (4He+ / e-, mi = 4.003 u)',
    densityKgM3: 125.0,
    kinematicViscosityM2S: 2.5e-8,
    dynamicViscosityPaS: 3.1e-6,
    surfaceTensionNM: 0.00035,
    effectiveViscousDamping: 0.002,
    ionMassU: 4.0026,
    chargeNumberZ: 1,
    defaultElectronTempEv: 3.5,
    defaultIonTempEv: 0.3,
    colorHex: '#a58bff',
    secondaryColorHex: '#dfd4ff',
    caveat: 'Ultra-low viscosity cryogenic liquid; below the 2.17 K lambda point requires a Tisza-Landau two-fluid superfluid model.'
  },
  argon: {
    id: 'argon',
    label: 'Argon',
    stateSummary: 'Cryogenic liquid LAr (87.3 K, 1 atm)',
    plasmaSummary: 'Argon discharge plasma (Ar+ / e-, mi = 39.948 u)',
    densityKgM3: 1395.0,
    kinematicViscosityM2S: 1.94e-7,
    dynamicViscosityPaS: 2.7e-4,
    surfaceTensionNM: 0.0125,
    effectiveViscousDamping: 0.008,
    ionMassU: 39.948,
    chargeNumberZ: 1,
    defaultElectronTempEv: 2.5,
    defaultIonTempEv: 0.15,
    colorHex: '#ff7a59',
    secondaryColorHex: '#ffc1ae',
    caveat: 'Canonical laboratory plasma for Washimi-Taniuti and Ikezi ion-acoustic soliton collision experiments; cryogenic LAr in pool mode.'
  },
  'water-hdl-ldl': {
    id: 'water-hdl-ldl',
    label: 'Water (HDL+LDL)',
    stateSummary: 'Two-state local structure water hypothesis (HDL + LDL)',
    plasmaSummary: 'Two-temperature bi-Maxwellian / dual-structure effective medium',
    densityKgM3: 1018.0,
    kinematicViscosityM2S: 1.45e-6,
    dynamicViscosityPaS: 1.48e-3,
    surfaceTensionNM: 0.0742,
    effectiveViscousDamping: 0.022,
    ionMassU: 18.015,
    chargeNumberZ: 1,
    defaultElectronTempEv: 2.4,
    defaultIonTempEv: 0.25,
    colorHex: '#2ee6a8',
    secondaryColorHex: '#3b82f6',
    caveat: 'Exploratory continuum coupling of HDL and LDL local tetrahedral order (Li et al., Nature Physics 2026; Krieger, Science 2004). Not two bulk phases at room temperature.'
  }
});

export const SOLITON_FLUID_OPTIONS = Object.freeze(
  Object.values(SOLITON_FLUIDS).map(({ id, label }) => ({ value: id, label }))
);

export const DEFAULT_SOLITON_PULSES = Object.freeze([
  {
    enabled: true,
    amplitude: 0.72,
    width: 1.35,
    positionOffset: -4.2,
    polarity: 1,
    vectorAngleDeg: 22,
    sideOverride: 'auto'
  },
  {
    enabled: true,
    amplitude: 0.44,
    width: 1.75,
    positionOffset: 4.2,
    polarity: 1,
    vectorAngleDeg: 68,
    sideOverride: 'auto'
  }
]);

export const DEFAULT_SOLITON_CONFIG = Object.freeze({
  enabled: false,
  domain: 'wave-pool',
  equation: 'boussinesq',
  fluidId: 'water',
  emissionSide: 'both',
  solitonCount: 2,
  boundaryCondition: 'reflective',
  poolDepthM: 1.8,
  viscosityScale: 1,
  nonlinearScale: 1,
  dispersionScale: 1,
  pneumaticPressureKPa: 38,
  vectorCoupling: 0.65,
  vectorGroupMismatch: 0.18,
  cubicNonlinearity: -0.35,
  electronTempEv: 2.5,
  ionTempEv: 0.2,
  plasmaDensity1e16M3: 4.0,
  magneticFieldT: 0.45,
  magneticAngleDeg: 18,
  landauDamping: 0.015,
  hdlLdlPathway: 'near-boundary-3-saddle',
  hdlLdlCoupling: 0.45,
  hdlLdlTemperatureK: 228,
  hdlLdlPressureBar: 1200,
  showCfdVelocityOverlay: true,
  showHdlLdlOverlay: true,
  solitons: DEFAULT_SOLITON_PULSES.map((pulse) => ({ ...pulse }))
});

const ELEMENTARY_CHARGE = 1.602176634e-19;
const VACUUM_PERMITTIVITY = 8.8541878128e-12;
const PROTON_MASS_KG = 1.6605390666e-27;
const MU_0 = 4 * Math.PI * 1e-7;
const GRAVITY_MS2 = 9.80665;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sech(x) {
  const absX = Math.min(40, Math.abs(x));
  return 2 / (Math.exp(absX) + Math.exp(-absX));
}

export function normalizeSolitonPulse(pulse = {}, defaults = DEFAULT_SOLITON_PULSES[0]) {
  const polarity = Number(pulse.polarity ?? defaults.polarity) < 0 ? -1 : 1;
  const sideOverride = ['auto', 'left', 'right'].includes(pulse.sideOverride)
    ? pulse.sideOverride
    : defaults.sideOverride;
  return {
    enabled: Boolean(pulse.enabled ?? defaults.enabled),
    amplitude: clamp(finiteOr(pulse.amplitude, defaults.amplitude), 0.05, 1.5),
    width: clamp(finiteOr(pulse.width, defaults.width), 0.45, 4.5),
    positionOffset: clamp(finiteOr(pulse.positionOffset, defaults.positionOffset), -7.5, 7.5),
    polarity,
    vectorAngleDeg: clamp(finiteOr(pulse.vectorAngleDeg, defaults.vectorAngleDeg), -90, 90),
    sideOverride
  };
}

export function normalizeSolitonConfig(input = {}, defaults = DEFAULT_SOLITON_CONFIG) {
  const domain = SOLITON_DOMAIN_OPTIONS.some((option) => option.value === input.domain)
    ? input.domain
    : defaults.domain;
  const equation = SOLITON_EQUATION_OPTIONS.some((option) => option.value === input.equation)
    ? input.equation
    : defaults.equation;
  const fluidId = SOLITON_FLUIDS[input.fluidId] ? input.fluidId : defaults.fluidId;
  const emissionSide = SOLITON_EMISSION_SIDE_OPTIONS.some((option) => option.value === input.emissionSide)
    ? input.emissionSide
    : defaults.emissionSide;
  const boundaryCondition = SOLITON_BOUNDARY_OPTIONS.some((option) => option.value === input.boundaryCondition)
    ? input.boundaryCondition
    : defaults.boundaryCondition;
  const hdlLdlPathway = WATER_HDL_LDL_PATHWAY_OPTIONS.some((option) => option.value === input.hdlLdlPathway)
    ? input.hdlLdlPathway
    : defaults.hdlLdlPathway;
  const rawSolitons = Array.isArray(input.solitons) ? input.solitons : defaults.solitons;
  const solitons = [
    normalizeSolitonPulse(rawSolitons[0], DEFAULT_SOLITON_PULSES[0]),
    normalizeSolitonPulse(rawSolitons[1], DEFAULT_SOLITON_PULSES[1])
  ];
  return {
    enabled: Boolean(input.enabled ?? defaults.enabled),
    domain,
    equation,
    fluidId,
    emissionSide,
    solitonCount: clamp(Math.round(finiteOr(input.solitonCount, defaults.solitonCount)), 1, 2),
    boundaryCondition,
    poolDepthM: clamp(finiteOr(input.poolDepthM, defaults.poolDepthM), 0.4, 5.0),
    viscosityScale: clamp(finiteOr(input.viscosityScale, defaults.viscosityScale), 0, 5),
    nonlinearScale: clamp(finiteOr(input.nonlinearScale, defaults.nonlinearScale), 0.1, 3),
    dispersionScale: clamp(finiteOr(input.dispersionScale, defaults.dispersionScale), 0.1, 3),
    pneumaticPressureKPa: clamp(finiteOr(input.pneumaticPressureKPa, defaults.pneumaticPressureKPa), 5, 120),
    vectorCoupling: clamp(finiteOr(input.vectorCoupling, defaults.vectorCoupling), -1.5, 1.5),
    vectorGroupMismatch: clamp(finiteOr(input.vectorGroupMismatch, defaults.vectorGroupMismatch), -0.8, 0.8),
    cubicNonlinearity: clamp(finiteOr(input.cubicNonlinearity, defaults.cubicNonlinearity), -2, 2),
    electronTempEv: clamp(finiteOr(input.electronTempEv, defaults.electronTempEv), 0.2, 25),
    ionTempEv: clamp(finiteOr(input.ionTempEv, defaults.ionTempEv), 0.02, 10),
    plasmaDensity1e16M3: clamp(finiteOr(input.plasmaDensity1e16M3, defaults.plasmaDensity1e16M3), 0.2, 50),
    magneticFieldT: clamp(finiteOr(input.magneticFieldT, defaults.magneticFieldT), 0, 5),
    magneticAngleDeg: clamp(finiteOr(input.magneticAngleDeg, defaults.magneticAngleDeg), 0, 89),
    landauDamping: clamp(finiteOr(input.landauDamping, defaults.landauDamping), 0, 0.25),
    hdlLdlPathway,
    hdlLdlCoupling: clamp(finiteOr(input.hdlLdlCoupling, defaults.hdlLdlCoupling), 0, 1.5),
    hdlLdlTemperatureK: clamp(finiteOr(input.hdlLdlTemperatureK, defaults.hdlLdlTemperatureK), 175, 310),
    hdlLdlPressureBar: clamp(finiteOr(input.hdlLdlPressureBar, defaults.hdlLdlPressureBar), 1, 2500),
    showCfdVelocityOverlay: Boolean(input.showCfdVelocityOverlay ?? defaults.showCfdVelocityOverlay),
    showHdlLdlOverlay: Boolean(input.showHdlLdlOverlay ?? defaults.showHdlLdlOverlay),
    solitons
  };
}

export function getWaterHdlLdlPathwayDetails(pathwayId) {
  return WATER_HDL_LDL_PATHWAY_OPTIONS.find((item) => item.value === pathwayId)
    ?? WATER_HDL_LDL_PATHWAY_OPTIONS[0];
}

export function deriveSolitonPhysicsParameters(rawConfig = {}) {
  const config = normalizeSolitonConfig(rawConfig);
  const fluid = SOLITON_FLUIDS[config.fluidId] ?? SOLITON_FLUIDS.water;
  const pathway = getWaterHdlLdlPathwayDetails(config.hdlLdlPathway);
  const isHdlLdl = config.fluidId === 'water-hdl-ldl';

  const temperatureProximity = Math.exp(-(((config.hdlLdlTemperatureK - 195) / 42) ** 2));
  const pressureProximity = Math.exp(-(((config.hdlLdlPressureBar - 1650) / 750) ** 2));
  const coexistenceProximity = clamp(0.35 + 0.65 * temperatureProximity * pressureProximity, 0.1, 1);
  const equilibriumLdlFraction = isHdlLdl
    ? clamp(pathway.equilibriumLdlFraction * (0.75 + 0.45 * coexistenceProximity), 0.05, 0.92)
    : 0;
  const equilibriumHdlFraction = isHdlLdl ? 1 - equilibriumLdlFraction : 1;
  const effectiveDensityKgM3 = isHdlLdl
    ? (1085 * equilibriumHdlFraction + 920 * equilibriumLdlFraction)
    : fluid.densityKgM3;

  const ionMassKg = fluid.ionMassU * PROTON_MASS_KG;
  const electronTempJ = config.electronTempEv * ELEMENTARY_CHARGE;
  const ionTempJ = config.ionTempEv * ELEMENTARY_CHARGE;
  const plasmaDensityM3 = config.plasmaDensity1e16M3 * 1e16;
  const debyeLengthM = Math.sqrt((VACUUM_PERMITTIVITY * electronTempJ) / (plasmaDensityM3 * ELEMENTARY_CHARGE ** 2));
  const ionSoundSpeedMS = Math.sqrt((fluid.chargeNumberZ * electronTempJ + 3 * ionTempJ) / ionMassKg);
  const ionPlasmaFrequencyRadS = Math.sqrt((plasmaDensityM3 * (fluid.chargeNumberZ * ELEMENTARY_CHARGE) ** 2) / (VACUUM_PERMITTIVITY * ionMassKg));
  const massDensityPlasmaKgM3 = plasmaDensityM3 * ionMassKg;
  const alfvenSpeedMS = config.magneticFieldT > 0
    ? config.magneticFieldT / Math.sqrt(MU_0 * Math.max(1e-18, massDensityPlasmaKgM3))
    : 0;
  const ionCyclotronRadS = (fluid.chargeNumberZ * ELEMENTARY_CHARGE * config.magneticFieldT) / ionMassKg;
  const ionSoundGyroradiusM = ionCyclotronRadS > 1e-6 ? ionSoundSpeedMS / ionCyclotronRadS : 0;
  const thetaRad = (config.magneticAngleDeg * Math.PI) / 180;
  const magnetizedDispersionLengthM = Math.sqrt(debyeLengthM ** 2 + (ionSoundGyroradiusM * Math.sin(thetaRad)) ** 2);

  const shallowWaterSpeedMS = Math.sqrt(GRAVITY_MS2 * config.poolDepthM);
  const bondNumber = (effectiveDensityKgM3 * GRAVITY_MS2 * config.poolDepthM ** 2) / Math.max(1e-5, fluid.surfaceTensionNM);
  const capillaryFactor = clamp(1 - 3 / Math.max(10, bondNumber), 0.4, 1.05);

  const normalizedWaveSpeed = config.domain === 'plasma-wave'
    ? clamp(1.85 * Math.pow(40 / fluid.ionMassU, 0.22) * Math.pow(config.electronTempEv / 2.5, 0.25), 0.9, 4.4)
    : clamp(shallowWaterSpeedMS * 0.52, 0.9, 3.8);

  const hdlLdlCompressibilityBoost = isHdlLdl
    ? 1 + config.hdlLdlCoupling * pathway.compressibilityAnomaly * coexistenceProximity
    : 1;
  const hdlLdlViscosityBoost = isHdlLdl
    ? 1 + config.hdlLdlCoupling * pathway.viscosityCoupling * (pathway.saddlePoints / 2)
    : 1;

  const alphaNonlinear = config.nonlinearScale * hdlLdlCompressibilityBoost * (
    config.domain === 'plasma-wave'
      ? 1.45 * Math.cos(thetaRad * 0.5)
      : (1.5 * normalizedWaveSpeed) / Math.max(0.5, config.poolDepthM)
  );

  const betaDispersion = config.dispersionScale * (
    config.domain === 'plasma-wave'
      ? 0.24 * (1 + 0.65 * Math.sin(thetaRad) ** 2)
      : 0.22 * capillaryFactor * Math.min(2.2, config.poolDepthM / 1.5)
  );

  const effectiveViscosity = clamp(
    config.viscosityScale * fluid.effectiveViscousDamping * hdlLdlViscosityBoost
      + (config.domain === 'plasma-wave' ? config.landauDamping * 0.6 : 0),
    0,
    0.65
  );

  return {
    config,
    fluid,
    pathway,
    isHdlLdl,
    coexistenceProximity,
    equilibriumLdlFraction,
    equilibriumHdlFraction,
    effectiveDensityKgM3,
    shallowWaterSpeedMS,
    bondNumber,
    ionSoundSpeedMS,
    debyeLengthM,
    magnetizedDispersionLengthM,
    ionPlasmaFrequencyHz: ionPlasmaFrequencyRadS / (2 * Math.PI),
    alfvenSpeedMS,
    ionSoundGyroradiusM,
    normalizedWaveSpeed,
    alphaNonlinear,
    betaDispersion,
    effectiveViscosity,
    dampingRate: config.domain === 'plasma-wave' ? config.landauDamping : 0
  };
}

function resolvePulseLaunchDirection(config, pulseIndex, pulse) {
  if (pulse.sideOverride === 'left') return { direction: 1, defaultCenter: -5.4 + pulseIndex * 2.4 };
  if (pulse.sideOverride === 'right') return { direction: -1, defaultCenter: 5.4 - pulseIndex * 2.4 };
  if (config.emissionSide === 'left') {
    return { direction: 1, defaultCenter: pulseIndex === 0 ? -5.8 : -2.6 };
  }
  if (config.emissionSide === 'right') {
    return { direction: -1, defaultCenter: pulseIndex === 0 ? 5.8 : 2.6 };
  }
  return pulseIndex === 0
    ? { direction: 1, defaultCenter: -4.8 }
    : { direction: -1, defaultCenter: 4.8 };
}

export function evaluateAnalyticSolitonProfile(x, pulse, direction, physics) {
  const width = Math.max(0.45, pulse.width);
  const center = pulse.positionOffset;
  const xi = (x - center) / width;
  if (physics.config.equation === 'sine-gordon') {
    const kink = (4 / Math.PI) * Math.atan(Math.exp(pulse.polarity * direction * xi)) - 1;
    const envelope = sech(xi);
    return {
      u1: pulse.amplitude * kink * 0.85,
      u2: pulse.amplitude * envelope * 0.45,
      velocity: direction * physics.normalizedWaveSpeed * pulse.amplitude * envelope
    };
  }
  if (physics.config.equation === 'gardner-mkdv') {
    const flatness = clamp(Math.abs(physics.config.cubicNonlinearity), 0, 1.5);
    const sechVal = sech(xi);
    const tableTop = sechVal / Math.sqrt(1 + flatness * sechVal ** 2);
    const height = pulse.polarity * pulse.amplitude * (sechVal ** 2 * (1 - 0.35 * flatness) + 0.35 * flatness * tableTop);
    return {
      u1: height,
      u2: 0,
      velocity: direction * physics.normalizedWaveSpeed * height
    };
  }
  const sechSq = sech(xi) ** 2;
  const signedAmplitude = pulse.polarity * pulse.amplitude;
  const angleRad = (pulse.vectorAngleDeg * Math.PI) / 180;
  const u1 = physics.config.equation === 'vector-coupled'
    ? signedAmplitude * Math.cos(angleRad) * sechSq
    : signedAmplitude * sechSq;
  const u2 = physics.config.equation === 'vector-coupled'
    ? signedAmplitude * Math.sin(angleRad) * sechSq
    : 0;
  const speedBoost = 1 + 0.32 * Math.abs(signedAmplitude) * physics.config.nonlinearScale;
  return {
    u1,
    u2,
    velocity: direction * physics.normalizedWaveSpeed * speedBoost * u1
  };
}

export function createSolitonSolverState(rawConfig = {}) {
  const physics = deriveSolitonPhysicsParameters(rawConfig);
  const { config } = physics;
  const size = SOLITON_GRID_SIZE;
  const dx = SOLITON_DOMAIN_SPAN / (size - 1);
  const x = new Float64Array(size);
  const u1 = new Float64Array(size);
  const u2 = new Float64Array(size);
  const v1 = new Float64Array(size);
  const v2 = new Float64Array(size);
  const ldlFraction = new Float64Array(size);
  const baselineU1 = new Float64Array(size);

  for (let i = 0; i < size; i += 1) {
    x[i] = -SOLITON_DOMAIN_SPAN / 2 + i * dx;
    ldlFraction[i] = physics.equilibriumLdlFraction;
  }

  const activePulses = config.solitons.slice(0, config.solitonCount).filter((pulse) => pulse.enabled);
  activePulses.forEach((pulse, index) => {
    const { direction, defaultCenter } = resolvePulseLaunchDirection(config, index, pulse);
    const effectivePulse = {
      ...pulse,
      positionOffset: Number.isFinite(pulse.positionOffset) ? pulse.positionOffset : defaultCenter
    };
    const effectiveDirection = config.equation === 'kdv' && config.emissionSide === 'both'
      ? (index === 0 ? 1 : 1)
      : direction;
    for (let i = 0; i < size; i += 1) {
      const sample = evaluateAnalyticSolitonProfile(x[i], effectivePulse, effectiveDirection, physics);
      u1[i] += sample.u1;
      u2[i] += sample.u2;
      v1[i] += sample.velocity;
      v2[i] += effectiveDirection * physics.normalizedWaveSpeed * sample.u2;
      if (physics.isHdlLdl) {
        const compressionShift = -0.18 * config.hdlLdlCoupling * sample.u1;
        ldlFraction[i] = clamp(ldlFraction[i] + compressionShift, 0.03, 0.97);
      }
    }
  });

  baselineU1.set(u1);

  const cfdNx = SOLITON_CFD_NX;
  const cfdNz = SOLITON_CFD_NZ;
  const cfdCount = cfdNx * cfdNz;
  const cfdU = new Float64Array(cfdCount);
  const cfdW = new Float64Array(cfdCount);
  const cfdP = new Float64Array(cfdCount);
  const cfdVorticity = new Float64Array(cfdCount);

  for (let ix = 0; ix < cfdNx; ix += 1) {
    const gridIndex = Math.min(size - 1, Math.round((ix / (cfdNx - 1)) * (size - 1)));
    const surfaceEta = u1[gridIndex];
    const surfaceVel = v1[gridIndex];
    for (let iz = 0; iz < cfdNz; iz += 1) {
      const zFrac = (iz + 0.5) / cfdNz;
      const depthProfile = Math.cosh(1.6 * zFrac) / Math.cosh(1.6);
      const cell = iz * cfdNx + ix;
      cfdU[cell] = surfaceVel * depthProfile;
      cfdW[cell] = 0;
      cfdP[cell] = surfaceEta * depthProfile;
    }
  }

  const state = {
    size,
    dx,
    x,
    u1,
    u2,
    v1,
    v2,
    ldlFraction,
    baselineU1,
    initialPeak: Math.max(0.05, ...Array.from(u1, (val) => Math.abs(val))),
    initialMass: u1.reduce((sum, val) => sum + val, 0) * dx,
    initialEnergy: u1.reduce((sum, val, idx) => sum + (val ** 2 + u2[idx] ** 2), 0) * dx,
    time: 0,
    stepCount: 0,
    lastStepMs: 0.15,
    cfd: {
      nx: cfdNx,
      nz: cfdNz,
      u: cfdU,
      w: cfdW,
      p: cfdP,
      vorticity: cfdVorticity,
      maxDivergence: 0,
      pressureIterations: 10
    },
    actuatorPulseTimerLeft: 0,
    actuatorPulseTimerRight: 0,
    telemetry: null
  };
  state.telemetry = computeSolitonTelemetry(state, config);
  return state;
}

export function triggerSolitonLauncherImpulse(state, rawConfig = {}, side = null) {
  const physics = deriveSolitonPhysicsParameters(rawConfig);
  const { config } = physics;
  const targetSide = side ?? config.emissionSide;
  const impulseScale = clamp(config.pneumaticPressureKPa / 45, 0.25, 2.2);
  const pulse0 = config.solitons[0] ?? DEFAULT_SOLITON_PULSES[0];
  const pulse1 = config.solitons[1] ?? DEFAULT_SOLITON_PULSES[1];

  const injectAtSide = (whichSide, pulse) => {
    const center = whichSide === 'left' ? -6.6 : 6.6;
    const direction = whichSide === 'left' ? 1 : -1;
    const width = Math.max(0.65, pulse.width);
    const angleRad = (pulse.vectorAngleDeg * Math.PI) / 180;
    for (let i = 0; i < state.size; i += 1) {
      const xi = (state.x[i] - center) / width;
      const env = sech(xi) ** 2;
      const amp = pulse.polarity * pulse.amplitude * impulseScale * env;
      if (config.equation === 'vector-coupled') {
        state.u1[i] = clamp(state.u1[i] + amp * Math.cos(angleRad), -2.4, 2.4);
        state.u2[i] = clamp(state.u2[i] + amp * Math.sin(angleRad), -2.4, 2.4);
      } else {
        state.u1[i] = clamp(state.u1[i] + amp, -2.4, 2.4);
      }
      state.v1[i] = clamp(state.v1[i] + direction * physics.normalizedWaveSpeed * amp, -8, 8);
      if (physics.isHdlLdl) {
        state.ldlFraction[i] = clamp(state.ldlFraction[i] - 0.16 * config.hdlLdlCoupling * amp, 0.03, 0.97);
      }
    }
    if (whichSide === 'left') state.actuatorPulseTimerLeft = 0.65;
    if (whichSide === 'right') state.actuatorPulseTimerRight = 0.65;
  };

  if (targetSide === 'left' || targetSide === 'both') injectAtSide('left', pulse0);
  if (targetSide === 'right' || targetSide === 'both') {
    injectAtSide('right', config.solitonCount > 1 ? pulse1 : pulse0);
  }
  state.telemetry = computeSolitonTelemetry(state, config);
  return state;
}

function indexWithBoundary(index, size, boundaryCondition) {
  if (boundaryCondition === 'periodic') {
    return ((index % size) + size) % size;
  }
  if (index < 0) return -index;
  if (index >= size) return 2 * (size - 1) - index;
  return index;
}

function boundaryDampingMask(i, size, boundaryCondition) {
  if (boundaryCondition !== 'absorbing') return 1;
  const edgeSpan = 14;
  if (i < edgeSpan) {
    const s = (edgeSpan - i) / edgeSpan;
    return Math.exp(-0.08 * s * s);
  }
  if (i >= size - edgeSpan) {
    const s = (i - (size - 1 - edgeSpan)) / edgeSpan;
    return Math.exp(-0.08 * s * s);
  }
  return 1;
}

function step2dCrossSectionCfd(state, physics, dt) {
  const { cfd } = state;
  const { nx, nz, u, w, p, vorticity } = cfd;
  const dx = SOLITON_DOMAIN_SPAN / (nx - 1);
  const dz = Math.max(0.4, physics.config.poolDepthM) / nz;
  const nu = clamp(0.015 + physics.effectiveViscosity * 0.45, 0.004, 0.35);
  const c0Sq = physics.normalizedWaveSpeed ** 2;
  const nextU = new Float64Array(u.length);
  const nextW = new Float64Array(w.length);

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const idx = iz * nx + ix;
      const ixL = ix > 0 ? ix - 1 : (physics.config.boundaryCondition === 'periodic' ? nx - 1 : 0);
      const ixR = ix < nx - 1 ? ix + 1 : (physics.config.boundaryCondition === 'periodic' ? 0 : nx - 1);
      const izB = Math.max(0, iz - 1);
      const izT = Math.min(nz - 1, iz + 1);

      const uC = u[idx];
      const wC = w[idx];
      const dudx = (u[iz * nx + ixR] - u[iz * nx + ixL]) / (2 * dx);
      const dudz = (u[izT * nx + ix] - u[izB * nx + ix]) / (2 * dz);
      const dwdx = (w[iz * nx + ixR] - w[iz * nx + ixL]) / (2 * dx);
      const dwdz = (w[izT * nx + ix] - w[izB * nx + ix]) / (2 * dz);

      const lapU = (u[iz * nx + ixR] - 2 * uC + u[iz * nx + ixL]) / (dx * dx)
        + (u[izT * nx + ix] - 2 * uC + u[izB * nx + ix]) / (dz * dz);
      const lapW = (w[iz * nx + ixR] - 2 * wC + w[iz * nx + ixL]) / (dx * dx)
        + (w[izT * nx + ix] - 2 * wC + w[izB * nx + ix]) / (dz * dz);

      const grid1dIdx = Math.min(state.size - 1, Math.round((ix / (nx - 1)) * (state.size - 1)));
      const grid1dL = Math.max(0, grid1dIdx - 1);
      const grid1dR = Math.min(state.size - 1, grid1dIdx + 1);
      const dEtaDx = (state.u1[grid1dR] - state.u1[grid1dL]) / (2 * state.dx);

      const advectU = uC * dudx + wC * dudz;
      const advectW = uC * dwdx + wC * dwdz;

      nextU[idx] = clamp(
        (uC + dt * (-advectU - c0Sq * dEtaDx + nu * lapU - physics.dampingRate * uC)) * 0.998,
        -6,
        6
      );
      nextW[idx] = clamp(
        (wC + dt * (-advectW + nu * lapW - 0.8 * wC)) * 0.995,
        -4,
        4
      );
    }
  }

  if (physics.config.boundaryCondition === 'reflective') {
    for (let iz = 0; iz < nz; iz += 1) {
      nextU[iz * nx] = 0;
      nextU[iz * nx + (nx - 1)] = 0;
    }
  }
  for (let ix = 0; ix < nx; ix += 1) {
    nextW[ix] = 0;
  }

  const div = new Float64Array(u.length);
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const ixL = Math.max(0, ix - 1);
      const ixR = Math.min(nx - 1, ix + 1);
      const izB = Math.max(0, iz - 1);
      const izT = Math.min(nz - 1, iz + 1);
      div[iz * nx + ix] = (nextU[iz * nx + ixR] - nextU[iz * nx + ixL]) / (2 * dx)
        + (nextW[izT * nx + ix] - nextW[izB * nx + ix]) / (2 * dz);
    }
  }

  const iterations = cfd.pressureIterations;
  const nextP = new Float64Array(p);
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const ixL = Math.max(0, ix - 1);
        const ixR = Math.min(nx - 1, ix + 1);
        const izB = Math.max(0, iz - 1);
        const izT = Math.min(nz - 1, iz + 1);
        const idx = iz * nx + ix;
        nextP[idx] = 0.25 * (
          nextP[iz * nx + ixL]
          + nextP[iz * nx + ixR]
          + nextP[izB * nx + ix]
          + nextP[izT * nx + ix]
          - dx * dz * div[idx]
        );
      }
    }
  }

  let maxDivergence = 0;
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const ixL = Math.max(0, ix - 1);
      const ixR = Math.min(nx - 1, ix + 1);
      const izB = Math.max(0, iz - 1);
      const izT = Math.min(nz - 1, iz + 1);
      const idx = iz * nx + ix;
      const dpdx = (nextP[iz * nx + ixR] - nextP[iz * nx + ixL]) / (2 * dx);
      const dpdz = (nextP[izT * nx + ix] - nextP[izB * nx + ix]) / (2 * dz);
      u[idx] = clamp(nextU[idx] - 0.35 * dt * dpdx, -6, 6);
      w[idx] = clamp(nextW[idx] - 0.35 * dt * dpdz, -4, 4);
      p[idx] = nextP[idx];
    }
  }

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const ixL = Math.max(0, ix - 1);
      const ixR = Math.min(nx - 1, ix + 1);
      const izB = Math.max(0, iz - 1);
      const izT = Math.min(nz - 1, iz + 1);
      const idx = iz * nx + ix;
      const residualDiv = Math.abs(
        (u[iz * nx + ixR] - u[iz * nx + ixL]) / (2 * dx)
        + (w[izT * nx + ix] - w[izB * nx + ix]) / (2 * dz)
      );
      if (residualDiv > maxDivergence) maxDivergence = residualDiv;
      const dudz = (u[izT * nx + ix] - u[izB * nx + ix]) / (2 * dz);
      const dwdx = (w[iz * nx + ixR] - w[iz * nx + ixL]) / (2 * dx);
      vorticity[idx] = dudz - dwdx;
    }
  }
  cfd.maxDivergence = maxDivergence;
}

export function stepSolitonSolver(state, rawConfig = {}, deltaSeconds = 1 / 60) {
  const startWall = typeof performance !== 'undefined' ? performance.now() : 0;
  const physics = deriveSolitonPhysicsParameters(rawConfig);
  const { config } = physics;
  const size = state.size;
  const dx = state.dx;
  const clampedDelta = clamp(finiteOr(deltaSeconds, 1 / 60), 0.001, 0.05);
  const substeps = 6;
  const dt = clampedDelta / substeps;

  const baseC0 = physics.normalizedWaveSpeed;
  const directionSign = config.equation === 'kdv' && config.emissionSide === 'right' ? -1 : 1;
  const c0 = baseC0 * directionSign;
  const alpha = physics.alphaNonlinear * directionSign;
  const beta = physics.betaDispersion * directionSign * 0.085;
  const nu = physics.effectiveViscosity;
  const damping = physics.dampingRate;
  const boundary = config.boundaryCondition;

  const nextU1 = new Float64Array(size);
  const nextU2 = new Float64Array(size);
  const nextV1 = new Float64Array(size);
  const nextLdl = new Float64Array(size);

  for (let step = 0; step < substeps; step += 1) {
    const { u1, u2, v1, ldlFraction } = state;

    for (let i = 0; i < size; i += 1) {
      const iM2 = indexWithBoundary(i - 2, size, boundary);
      const iM1 = indexWithBoundary(i - 1, size, boundary);
      const iP1 = indexWithBoundary(i + 1, size, boundary);
      const iP2 = indexWithBoundary(i + 2, size, boundary);

      const u = u1[i];
      const w = u2[i];
      const du1dx = (u1[iP1] - u1[iM1]) / (2 * dx);
      const d2u1dx2 = (u1[iP1] - 2 * u + u1[iM1]) / (dx * dx);
      const d3u1dx3 = (u1[iP2] - 2 * u1[iP1] + 2 * u1[iM1] - u1[iM2]) / (2 * dx ** 3);
      const hyperFilter1 = (u1[iP2] - 4 * u1[iP1] + 6 * u - 4 * u1[iM1] + u1[iM2]) * 0.018;

      const du2dx = (u2[iP1] - u2[iM1]) / (2 * dx);
      const d2u2dx2 = (u2[iP1] - 2 * w + u2[iM1]) / (dx * dx);
      const d3u2dx3 = (u2[iP2] - 2 * u2[iP1] + 2 * u2[iM1] - u2[iM2]) / (2 * dx ** 3);
      const hyperFilter2 = (u2[iP2] - 4 * u2[iP1] + 6 * w - 4 * u2[iM1] + u2[iM2]) * 0.018;

      const localHdlFactor = physics.isHdlLdl
        ? 1 + config.hdlLdlCoupling * (0.5 - ldlFraction[i]) * 0.35
        : 1;
      const localNu = clamp(nu * (physics.isHdlLdl ? 0.85 + 0.5 * ldlFraction[i] : 1), 0, 0.75);

      if (config.equation === 'boussinesq' || config.equation === 'cfd-2d') {
        const dvdx = (v1[iP1] - v1[iM1]) / (2 * dx);
        const d2vdx2 = (v1[iP1] - 2 * v1[i] + v1[iM1]) / (dx * dx);
        const nonlinearFlux = 0.42 * config.nonlinearScale * localHdlFactor * (u * dvdx + v1[i] * du1dx);
        const duDt = -dvdx - nonlinearFlux + localNu * d2u1dx2 - damping * u;
        const dvDt = -(baseC0 ** 2) * du1dx
          - 0.45 * baseC0 * config.nonlinearScale * u * du1dx
          - baseC0 * Math.abs(beta) * d3u1dx3
          + localNu * d2vdx2
          - damping * v1[i];
        nextU1[i] = u + dt * duDt - hyperFilter1;
        nextV1[i] = v1[i] + dt * dvDt;
        nextU2[i] = w * 0.98;
      } else if (config.equation === 'vector-coupled') {
        const deltaC = config.vectorGroupMismatch * baseC0;
        const sigma = config.vectorCoupling;
        const du1Dt = -(c0 + deltaC) * du1dx
          - alpha * localHdlFactor * (u + sigma * w) * du1dx
          - beta * d3u1dx3
          + localNu * d2u1dx2
          - damping * u;
        const du2Dt = -(c0 - deltaC) * du2dx
          - alpha * localHdlFactor * (w + sigma * u) * du2dx
          - beta * d3u2dx3
          + localNu * d2u2dx2
          - damping * w;
        nextU1[i] = u + dt * du1Dt - hyperFilter1;
        nextU2[i] = w + dt * du2Dt - hyperFilter2;
        nextV1[i] = c0 * nextU1[i];
      } else if (config.equation === 'gardner-mkdv') {
        const alpha2 = config.cubicNonlinearity * Math.abs(alpha);
        const duDt = -c0 * du1dx
          - (alpha * localHdlFactor * u + alpha2 * u * u) * du1dx
          - beta * d3u1dx3
          + localNu * d2u1dx2
          - damping * u;
        nextU1[i] = u + dt * duDt - hyperFilter1;
        nextU2[i] = 0;
        nextV1[i] = c0 * nextU1[i];
      } else if (config.equation === 'sine-gordon') {
        const omega0Sq = 1.6 * config.dispersionScale;
        const dvDt = (baseC0 ** 2) * d2u1dx2 - omega0Sq * Math.sin(u * Math.PI) + localNu * d2u1dx2 - (damping + localNu * 0.5) * v1[i];
        nextV1[i] = v1[i] + dt * dvDt;
        nextU1[i] = u + dt * nextV1[i] - hyperFilter1 * 0.5;
        nextU2[i] = sech(u * 2) * 0.35;
      } else {
        const duDt = -c0 * du1dx
          - alpha * localHdlFactor * u * du1dx
          - beta * d3u1dx3
          + localNu * d2u1dx2
          - damping * u;
        nextU1[i] = u + dt * duDt - hyperFilter1;
        nextU2[i] = 0;
        nextV1[i] = c0 * nextU1[i];
      }

      const mask = boundaryDampingMask(i, size, boundary);
      nextU1[i] = clamp(nextU1[i] * mask, -2.5, 2.5);
      nextU2[i] = clamp(nextU2[i] * mask, -2.5, 2.5);
      nextV1[i] = clamp(nextV1[i] * mask, -8, 8);

      if (physics.isHdlLdl) {
        const d2LdlDx2 = (ldlFraction[iP1] - 2 * ldlFraction[i] + ldlFraction[iM1]) / (dx * dx);
        const compressionDrive = -0.22 * config.hdlLdlCoupling * nextU1[i]
          + 0.06 * config.hdlLdlCoupling * Math.abs(du1dx);
        const targetLdl = clamp(physics.equilibriumLdlFraction + compressionDrive, 0.03, 0.97);
        const tau = Math.max(0.08, physics.pathway.relaxationTimeS);
        const dLdlDt = -(ldlFraction[i] - targetLdl) / tau + 0.03 * d2LdlDx2;
        nextLdl[i] = clamp(ldlFraction[i] + dt * dLdlDt, 0.02, 0.98);
      } else {
        nextLdl[i] = 0;
      }
    }

    if (boundary === 'reflective') {
      nextV1[0] = 0;
      nextV1[size - 1] = 0;
    }

    state.u1.set(nextU1);
    state.u2.set(nextU2);
    state.v1.set(nextV1);
    state.ldlFraction.set(nextLdl);
  }

  if (config.equation === 'cfd-2d' || config.showCfdVelocityOverlay) {
    step2dCrossSectionCfd(state, physics, clampedDelta);
  }

  state.time += clampedDelta;
  state.stepCount += 1;
  state.actuatorPulseTimerLeft = Math.max(0, state.actuatorPulseTimerLeft - clampedDelta);
  state.actuatorPulseTimerRight = Math.max(0, state.actuatorPulseTimerRight - clampedDelta);
  if (typeof performance !== 'undefined') {
    state.lastStepMs = Math.max(0.01, performance.now() - startWall);
  }
  state.telemetry = computeSolitonTelemetry(state, config);
  return state;
}

export function computeSolitonTelemetry(state, rawConfig = {}) {
  const physics = deriveSolitonPhysicsParameters(rawConfig);
  const { config, fluid, pathway } = physics;
  const { size, dx, x, u1, u2, ldlFraction, cfd } = state;

  let peakAmplitude = 0;
  let minAmplitude = 0;
  let peakX = 0;
  let vectorNormEnergy = 0;
  let primaryEnergy = 0;
  let secondaryEnergy = 0;
  let mass = 0;
  let meanLdl = 0;

  for (let i = 0; i < size; i += 1) {
    const val1 = u1[i];
    const val2 = u2[i];
    const mag = Math.hypot(val1, val2);
    if (mag > peakAmplitude) {
      peakAmplitude = mag;
      peakX = x[i];
    }
    if (val1 < minAmplitude) minAmplitude = val1;
    primaryEnergy += val1 * val1 * dx;
    secondaryEnergy += val2 * val2 * dx;
    vectorNormEnergy += (val1 * val1 + val2 * val2) * dx;
    mass += val1 * dx;
    meanLdl += ldlFraction[i];
  }
  meanLdl /= size;
  const meanHdl = physics.isHdlLdl ? 1 - meanLdl : 1;

  const energyRetention = state.initialEnergy > 1e-8
    ? clamp(vectorNormEnergy / state.initialEnergy, 0, 2)
    : 1;
  const viscousEnergyLossFraction = clamp(1 - energyRetention, 0, 1);

  const machOrFroudeNumber = config.domain === 'plasma-wave'
    ? 1 + 0.33 * peakAmplitude * config.nonlinearScale
    : (physics.shallowWaterSpeedMS + 0.5 * peakAmplitude * Math.sqrt(GRAVITY_MS2 / config.poolDepthM))
      / Math.max(0.1, physics.shallowWaterSpeedMS);

  return {
    domain: config.domain,
    equation: config.equation,
    fluidId: config.fluidId,
    fluidLabel: fluid.label,
    stateSummary: config.domain === 'plasma-wave' ? fluid.plasmaSummary : fluid.stateSummary,
    caveat: fluid.caveat,
    time: state.time,
    stepCount: state.stepCount,
    lastStepMs: state.lastStepMs,
    peakAmplitude,
    minAmplitude,
    peakX,
    mass,
    primaryEnergy,
    secondaryEnergy,
    vectorNormEnergy,
    energyRetention,
    viscousEnergyLossFraction,
    characteristicWaveSpeedMS: config.domain === 'plasma-wave'
      ? physics.ionSoundSpeedMS
      : physics.shallowWaterSpeedMS,
    debyeLengthM: physics.debyeLengthM,
    magnetizedDispersionLengthM: physics.magnetizedDispersionLengthM,
    ionPlasmaFrequencyHz: physics.ionPlasmaFrequencyHz,
    alfvenSpeedMS: physics.alfvenSpeedMS,
    machOrFroudeNumber,
    effectiveViscosity: physics.effectiveViscosity,
    effectiveDensityKgM3: physics.effectiveDensityKgM3,
    isHdlLdl: physics.isHdlLdl,
    hdlLdlPathwayLabel: pathway.label,
    hdlLdlSaddlePoints: pathway.saddlePoints,
    hdlLdlLoopTopology: pathway.loopTopology,
    meanLdlFraction: meanLdl,
    meanHdlFraction: meanHdl,
    cfdMaxDivergence: cfd.maxDivergence,
    cfdGridLabel: `${cfd.nx}x${cfd.nz}`
  };
}

export function sampleSolitonFieldAt(state, rawConfig, worldX, worldZ) {
  const config = normalizeSolitonConfig(rawConfig);
  const size = state.size;
  const uNorm = clamp((worldX + SOLITON_DOMAIN_SPAN / 2) / SOLITON_DOMAIN_SPAN, 0, 1);
  const scaledIndex = uNorm * (size - 1);
  const i0 = Math.floor(scaledIndex);
  const i1 = Math.min(size - 1, i0 + 1);
  const frac = scaledIndex - i0;

  const u1 = state.u1[i0] * (1 - frac) + state.u1[i1] * frac;
  const u2 = state.u2[i0] * (1 - frac) + state.u2[i1] * frac;
  const v1 = state.v1[i0] * (1 - frac) + state.v1[i1] * frac;
  const ldl = state.ldlFraction[i0] * (1 - frac) + state.ldlFraction[i1] * frac;

  const iL = Math.max(0, i0 - 1);
  const iR = Math.min(size - 1, i0 + 1);
  const slope = (state.u1[iR] - state.u1[iL]) / (2 * state.dx);

  const channelEnvelope = Math.exp(-((worldZ / 7.2) ** 4));
  const transverseMode = config.equation === 'vector-coupled'
    ? Math.sin((worldZ / SOLITON_DOMAIN_SPAN) * Math.PI * 1.5) * 0.35
    : 0;
  const height = (u1 + u2 * transverseMode) * channelEnvelope;

  return {
    height,
    u1,
    u2,
    velocityX: v1 * channelEnvelope,
    slope: slope * channelEnvelope,
    ldlFraction: ldl,
    hdlFraction: 1 - ldl,
    vectorAngle: Math.atan2(u2, u1 || 1e-6)
  };
}
