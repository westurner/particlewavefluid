import { calculateDdfMobility, calculateTensorGaussianWeight, evaluateMechanicsResponse, evaluateGpeResponse, evaluateRadialGeneralRelativity, evaluateSpinPhaseResponse, evaluateSqgGpeResponse, GRAVITY_MODEL_LIBRARY } from './lib/simulationMechanics.js';

export { evaluateGpeResponse } from './lib/simulationMechanics.js';

export const FIELD_MODEL_OPTIONS = [
  { value: 'default', label: 'Default particle mechanics' },
  { value: 'newtonian', label: 'Newtonian response' },
  { value: 'ns-compressible', label: 'NS compressible fluid' },
  { value: 'ns-incompressible', label: 'NS incompressible fluid' },
  { value: 'sqg', label: GRAVITY_MODEL_LIBRARY.sqg.label },
  { value: 'sqg-tensor-gaussian', label: GRAVITY_MODEL_LIBRARY['sqg-tensor-gaussian'].label },
  { value: 'ddf', label: 'DDF hypothesis' },
  { value: 'ddf-tensor-gaussian', label: GRAVITY_MODEL_LIBRARY['ddf-tensor-gaussian'].label },
  { value: 'grassmannian-amplituhedron', label: GRAVITY_MODEL_LIBRARY['grassmannian-amplituhedron'].label }
];

const SHARED_FIELD_SOLVER_DESCRIPTION = 'All choices use the same per-particle GPU compute passes: explicit Euler position and velocity updates, a speed cap, and configured damping. Particles do not exchange pressure or density with neighbors, so these are response-field experiments, not full fluid solvers.';

export const FIELD_MODEL_DETAILS = Object.freeze({
  default: {
    status: 'Default particle mechanics',
    description: 'Simple inverse-square attraction with the configured spin force and per-particle mass weighting.',
    equation: 'inverse-square attraction + configured spin force',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  newtonian: {
    status: 'Newtonian response reference',
    description: 'A central inverse-square response without fluid pressure, compressibility, or viscosity. Selecting it replaces the legacy simple-attractor spin response.',
    equation: 'a = -GM r / |r|^3',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  'ns-compressible': {
    status: 'Reduced Navier-Stokes experiment',
    description: 'Adds a compressible radial sink and a nonzero divergence/volume-change diagnostic; it does not evolve a density field or capture shocks.',
    equation: 'd rho/dt + div(rho u) = 0',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  'ns-incompressible': {
    status: 'Reduced Navier-Stokes experiment',
    description: 'Uses a zero-divergence response field. It does not perform a global pressure projection to enforce incompressibility.',
    equation: 'div(u) = 0',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  sqg: {
    status: 'Speculative SQG / GR + GPE hypothesis',
    description: 'Combines a pairwise 1PN-inspired radial GR response and GPE term with a bounded spin-axis projection of the order-parameter phase gradient and vorticity. GPU velocity and rigid-spin 2Ω are proxies; scalar-only CPU inputs use +Y for phase-gradient direction. This does not solve a complex GPE.',
    equation: '1PN GR + GPE + k_phi [s·g/(1+|g|) + s·w/(1+|w|)]',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  'sqg-tensor-gaussian': {
    status: 'Speculative SQG / normed tensor-Gaussian hypothesis',
    description: 'Applies a normalized tensor-Gaussian window to both the GPE and its bounded phase/vorticity spin response while retaining the GR baseline.',
    equation: '1PN GR radial response + normed Gaussian × (GPE + spin-phase term)',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  ddf: {
    status: 'Speculative DDF hypothesis',
    description: 'Applies speed-dependent dilatant mobility to the entire SQG response, including its phase/vorticity spin term; this is exploratory rather than experimentally validated.',
    equation: 'DDF mobility × (GR + GPE + spin-phase response)',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  'ddf-tensor-gaussian': {
    status: 'Speculative DDF / normed tensor-Gaussian hypothesis',
    description: 'Localizes the DDF mobility modulation of the full SQG response, including phase/vorticity spin response, with a normalized tensor-Gaussian window.',
    equation: '(GR + GPE + spin-phase response) × localized DDF mobility',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  },
  'grassmannian-amplituhedron': {
    status: 'Exploratory geometric hypothesis',
    description: 'Adds the bounded quadrupole (3(s·rhat)^2 - 1)/2 to the Gr(2,4)-motivated correction near a tensor-Gaussian splat; this axis term is exploratory and is not derived from amplituhedron theory.',
    equation: 'Newtonian × [1 + Gaussian × (Gr(2,4) weight + k_s(3(s·rhat)^2 - 1)/2)]',
    solver: SHARED_FIELD_SOLVER_DESCRIPTION
  }
});

export const FIELD_MECHANICS_PARAMETER_FIELDS = Object.freeze({
  coreRadius: { label: 'Core radius', min: 0.05, max: 5, step: 0.05, description: 'Characteristic inner length scale; it regularizes radial response and sets how quickly the SQG GPE correction decays away from the core.' },
  quantumPressure: { label: 'Quantum pressure', min: 0, max: 5, step: 0.01, description: 'Weights the Laplacian/dispersion term in the reduced GPE response. This is not a pressure-Poisson solve.' },
  compressibility: { label: 'Compressibility', min: 0, max: 4, step: 0.01, description: 'Controls the nonlinear GPE coupling in SQG and the radial sink/divergence in the reduced compressible response.' },
  baseViscosity: { label: 'Base viscosity', min: 0, max: 0.5, step: 0.005, description: 'Baseline viscosity used by reduced NS responses and DDF mobility; higher values lower DDF mobility.' },
  dilatancy: { label: 'Dilatancy', min: 0, max: 10, step: 0.05, description: 'Scales the speed- and strain-dependent viscosity increase in the DDF mobility model.' },
  speedLimit: { label: 'Speed limit', min: 0.1, max: 10, step: 0.1, description: 'Reference speed for DDF mobility; as particle speed approaches this value, the dilatant penalty rises sharply.' },
  grSpeedOfLight: { label: 'Normalized speed of light', min: 5, max: 1000, step: 1, description: 'Speed scale used in the 1PN-inspired radial correction; increasing it weakens that relativistic correction.' },
  tensorGaussianWaist: { label: 'Tensor-Gaussian waist', min: 0.1, max: 20, step: 0.1, description: 'Radial width of the Gaussian localization, exp(-r²/(2 waist²)), applied by tensor-Gaussian variants.' },
  grassmannianPoleWeight: { label: 'Positive-cell pole weight', min: 0, max: 1, step: 0.01 },
  geometryCoupling: { label: 'Amplituhedron acceleration coupling', min: 0, max: 0.25, step: 0.005 },
  spinPhaseCoupling: { label: 'SQG phase/vorticity spin coupling', min: 0, max: 1, step: 0.01, description: 'Scales the bounded spin-axis projection of phase-gradient and vorticity alignment in the SQG response.' },
  geometrySpinCoupling: { label: 'Gr(2,4) spin-axis coupling', min: 0, max: 0.25, step: 0.005 }
});

export const FIELD_MODEL_PARAMETER_DEPENDENCIES = Object.freeze({
  default: [],
  newtonian: [],
  'ns-compressible': ['coreRadius', 'compressibility'],
  'ns-incompressible': [],
  sqg: ['coreRadius', 'compressibility', 'quantumPressure', 'grSpeedOfLight', 'spinPhaseCoupling'],
  'sqg-tensor-gaussian': ['coreRadius', 'compressibility', 'quantumPressure', 'grSpeedOfLight', 'tensorGaussianWaist', 'spinPhaseCoupling'],
  ddf: ['coreRadius', 'compressibility', 'quantumPressure', 'grSpeedOfLight', 'baseViscosity', 'dilatancy', 'speedLimit', 'spinPhaseCoupling'],
  'ddf-tensor-gaussian': ['coreRadius', 'compressibility', 'quantumPressure', 'grSpeedOfLight', 'baseViscosity', 'dilatancy', 'speedLimit', 'tensorGaussianWaist', 'spinPhaseCoupling'],
  'grassmannian-amplituhedron': ['tensorGaussianWaist', 'grassmannianPoleWeight', 'geometryCoupling', 'geometrySpinCoupling']
});

export const FLUID_MODEL_OPTIONS = [
  { value: 'baseline', label: 'Baseline Newtonian' },
  { value: 'hbn-farnesane', label: 'h-BN farnesane hypothesis' },
  { value: 'ddf', label: 'DDF dilatant hypothesis' }
];

export const QUANTUM_TRANSPORT_OPTIONS = [
  { value: 'classical', label: 'Classical transport' },
  { value: 'gpe', label: 'GPE / Euler-Korteweg response' },
  { value: 'ddf', label: 'DDF dilatant response' }
];

export const WAVE_EVOLUTION_OPTIONS = [
  { value: 'linear', label: 'Linear superposition' },
  { value: 'gpe', label: 'GPE response hypothesis' }
];

export const DEFAULT_FIELD_MECHANICS = Object.freeze({
  enabled: true,
  model: 'default',
  comparisonEnabled: false,
  comparisonModel: 'sqg',
  differenceScale: 1,
  coreRadius: 0.8,
  quantumPressure: 0.35,
  compressibility: 0.45,
  dilatancy: 1,
  speedLimit: 8,
  grSpeedOfLight: 20,
  baseViscosity: 0.02,
  tensorGaussianWaist: 2.5,
  grassmannianPoleWeight: 0.72,
  geometryCoupling: 0.15,
  spinPhaseCoupling: 0.15,
  geometrySpinCoupling: 0.1
});

const MODEL_IDS = new Set(FIELD_MODEL_OPTIONS.map(({ value }) => value));

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizeFieldMechanics(value = {}, defaults = DEFAULT_FIELD_MECHANICS) {
  return {
    enabled: Boolean(value.enabled ?? defaults.enabled),
    model: MODEL_IDS.has(value.model) ? value.model : defaults.model,
    comparisonEnabled: Boolean(value.comparisonEnabled ?? defaults.comparisonEnabled),
    comparisonModel: MODEL_IDS.has(value.comparisonModel) ? value.comparisonModel : defaults.comparisonModel,
    differenceScale: clamp(finiteOr(value.differenceScale, defaults.differenceScale), 0, 10),
    coreRadius: clamp(finiteOr(value.coreRadius, defaults.coreRadius), 0.05, 20),
    quantumPressure: clamp(finiteOr(value.quantumPressure, defaults.quantumPressure), 0, 20),
    compressibility: clamp(finiteOr(value.compressibility, defaults.compressibility), 0, 4),
    dilatancy: clamp(finiteOr(value.dilatancy, defaults.dilatancy), 0, 20),
    speedLimit: clamp(finiteOr(value.speedLimit, defaults.speedLimit), 0.1, 1e6),
    grSpeedOfLight: clamp(finiteOr(value.grSpeedOfLight, defaults.grSpeedOfLight), 5, 1e6),
    baseViscosity: clamp(finiteOr(value.baseViscosity, defaults.baseViscosity), 0, 1),
    tensorGaussianWaist: clamp(finiteOr(value.tensorGaussianWaist, defaults.tensorGaussianWaist), 0.1, 100),
    grassmannianPoleWeight: clamp(finiteOr(value.grassmannianPoleWeight, defaults.grassmannianPoleWeight), 0, 1),
    geometryCoupling: clamp(finiteOr(value.geometryCoupling, defaults.geometryCoupling), 0, 0.25),
    spinPhaseCoupling: clamp(finiteOr(value.spinPhaseCoupling, defaults.spinPhaseCoupling), 0, 1),
    geometrySpinCoupling: clamp(finiteOr(value.geometrySpinCoupling, defaults.geometrySpinCoupling), 0, 0.25)
  };
}

export function fieldModelIndex(model) {
  return Math.max(0, FIELD_MODEL_OPTIONS.findIndex(({ value }) => value === model));
}

export function evaluateFieldModel(model, state = {}, mechanics = DEFAULT_FIELD_MECHANICS) {
  const settings = sanitizeFieldMechanics(mechanics);
  const radius = Math.max(0.05, finiteOr(state.radius, 1));
  const speed = Math.max(0, finiteOr(state.speed, 0));
  const magnitude = Math.max(0, finiteOr(state.magnitude, 1));
  const rotation = finiteOr(state.rotation, 1);
  const spinAxis = state.spinAxis ?? [0, 1, 0];
  const spinAxisMagnitude = Math.hypot(...spinAxis);
  const normalizedSpinAxis = spinAxisMagnitude > 1e-15 ? spinAxis.map((component) => component / spinAxisMagnitude) : [0, 1, 0];
  const phaseGradient = state.phaseGradient ?? state.velocityVector ?? [0, speed, 0];
  const phaseVorticity = state.phaseVorticity ?? normalizedSpinAxis.map((component) => 2 * rotation * component);
  const spinPhase = evaluateSpinPhaseResponse({
    phaseGradient,
    phaseVorticity,
    spinAxis,
    coupling: settings.spinPhaseCoupling
  });
  const inverseSquare = magnitude / (radius * radius);
  const coreRatio = radius / settings.coreRadius;
  const tangentialAcceleration = rotation * magnitude / radius;

  if (model === 'default' || model === 'newtonian') {
    return {
      radialAcceleration: -inverseSquare,
      tangentialAcceleration: model === 'default' ? tangentialAcceleration : 0,
      quantumPressure: 0,
      effectiveViscosity: 0,
      mobility: 1,
      divergence: null,
      volumeChangeRate: null
    };
  }

  if (model === 'ns-incompressible') {
    return {
      radialAcceleration: -inverseSquare,
      tangentialAcceleration,
      quantumPressure: 0,
      effectiveViscosity: settings.baseViscosity,
      mobility: 1,
      divergence: 0,
      volumeChangeRate: 0
    };
  }

  const divergence = -settings.compressibility * magnitude
    / (settings.coreRadius ** 3 * (1 + coreRatio) ** 2);
  const compressibleSink = inverseSquare * (1 + settings.compressibility / (1 + coreRatio));
  const gaussianWeight = calculateTensorGaussianWeight(radius, settings.tensorGaussianWaist);

  if (model === 'ns-compressible') {
    return {
      radialAcceleration: -compressibleSink,
      tangentialAcceleration,
      quantumPressure: 0,
      effectiveViscosity: settings.baseViscosity,
      mobility: 1,
      divergence,
      volumeChangeRate: divergence
    };
  }

  if (model === 'sqg' || model === 'sqg-tensor-gaussian' || model === 'ddf' || model === 'ddf-tensor-gaussian') {
    const grAcceleration = evaluateRadialGeneralRelativity({ radius, speed, magnitude, grSpeedOfLight: settings.grSpeedOfLight });
    const boundedMagnitude = magnitude / (1 + magnitude);
    const gpeAmplitude = Math.sqrt(boundedMagnitude) * Math.exp(-0.5 * coreRatio * coreRatio);
    const gpeLaplacian = gpeAmplitude * (coreRatio * coreRatio - 3) / (settings.coreRadius ** 2);
    const sqgResponse = evaluateSqgGpeResponse({
      generalRelativityAcceleration: grAcceleration,
      amplitude: gpeAmplitude,
      laplacian: gpeLaplacian,
      nonlinearCoupling: settings.compressibility,
      dispersion: settings.quantumPressure,
      tensorGaussianWeight: model === 'sqg-tensor-gaussian' ? gaussianWeight : 1,
      rotationalResponse: spinPhase.response,
      responseScale: inverseSquare,
      maximumResponse: 0.5
    });
    if (model === 'sqg' || model === 'sqg-tensor-gaussian') {
      return {
        radialAcceleration: sqgResponse.acceleration,
        tangentialAcceleration,
        generalRelativityAcceleration: grAcceleration,
        gpeResponse: sqgResponse.gpeResponse,
        sqgCorrection: sqgResponse.correction,
        rotationalResponse: sqgResponse.rotationalResponse * sqgResponse.tensorGaussianWeight,
        phaseAlignment: spinPhase.phaseAlignment,
        vorticityAlignment: spinPhase.vorticityAlignment,
        quantumPressure: sqgResponse.gpeResponse,
        effectiveViscosity: 0,
        mobility: 1,
        tensorGaussian: model === 'sqg-tensor-gaussian' ? sqgResponse.tensorGaussianWeight : 0,
        divergence: null,
        volumeChangeRate: null
      };
    }
    const mobility = calculateDdfMobility({ radiusM: radius, speedMS: speed, coreRadiusM: settings.coreRadius, speedLimitMS: settings.speedLimit, dilatancy: settings.dilatancy, baseViscosity: settings.baseViscosity });
    const effectiveViscosity = 1 / mobility - 1;
    const response = evaluateMechanicsResponse({
      regime: 'ddf-tensor-gaussian',
      gaussianWeight: model === 'ddf-tensor-gaussian' ? gaussianWeight : 1,
      ddfMobility: mobility
    });
    return {
      radialAcceleration: sqgResponse.acceleration * response.accelerationScale,
      tangentialAcceleration: tangentialAcceleration * response.accelerationScale,
      generalRelativityAcceleration: grAcceleration,
      gpeResponse: sqgResponse.gpeResponse,
      sqgCorrection: sqgResponse.correction,
      rotationalResponse: sqgResponse.rotationalResponse * response.accelerationScale,
      phaseAlignment: spinPhase.phaseAlignment,
      vorticityAlignment: spinPhase.vorticityAlignment,
      quantumPressure: sqgResponse.gpeResponse,
      effectiveViscosity,
      mobility: response.accelerationScale,
      ddfMobility: mobility,
      divergence: null,
      volumeChangeRate: null,
      tensorGaussian: model === 'ddf-tensor-gaussian' ? response.splatWeight : 0
    };
  }

  const geometry = evaluateMechanicsResponse({
    regime: 'grassmannian-amplituhedron',
    gaussianWeight,
    grassmannianWeight: settings.grassmannianPoleWeight,
    geometryCoupling: settings.geometryCoupling,
    spinAxis,
    radialDirection: state.radialDirection ?? [1, 0, 0],
    spinAxisCoupling: settings.geometrySpinCoupling
  });
  return {
    radialAcceleration: -inverseSquare * geometry.accelerationScale,
    tangentialAcceleration: tangentialAcceleration * geometry.accelerationScale,
    quantumPressure: 0,
    effectiveViscosity: 0,
    mobility: geometry.accelerationScale,
    divergence: null,
    volumeChangeRate: null,
    tensorGaussian: geometry.splatWeight,
    geometricCorrection: geometry.geometricCorrection,
    spinAxisTensor: geometry.axisTensor,
    spinAxisCorrection: geometry.spinAxisCorrection
  };
}

export function compareFieldModels(primaryModel, comparisonModel, state, mechanics) {
  const primary = evaluateFieldModel(primaryModel, state, mechanics);
  const comparison = evaluateFieldModel(comparisonModel, state, mechanics);
  const accelerationDifference = Math.hypot(
    primary.radialAcceleration - comparison.radialAcceleration,
    primary.tangentialAcceleration - comparison.tangentialAcceleration
  );
  const referenceAcceleration = Math.max(1e-9, Math.hypot(
    comparison.radialAcceleration,
    comparison.tangentialAcceleration
  ));
  return {
    primary,
    comparison,
    absoluteDifference: accelerationDifference,
    relativeDifference: accelerationDifference / referenceAcceleration
  };
}

export function fluidModelIndex(model) {
  return Math.max(0, FLUID_MODEL_OPTIONS.findIndex(({ value }) => value === model));
}

export function quantumTransportIndex(model) {
  return Math.max(0, QUANTUM_TRANSPORT_OPTIONS.findIndex(({ value }) => value === model));
}

export function evaluateEffectiveViscosity(model, state = {}) {
  const baseViscosity = Math.max(0, finiteOr(state.baseViscosity, 0.012));
  const speed = Math.max(0, finiteOr(state.speed, 0));
  const lengthScale = Math.max(0.05, finiteOr(state.lengthScale, 0.85));
  const temperature = finiteOr(state.temperature, 72);
  const strength = clamp(finiteOr(state.strength, 1), 0, 20);
  if (model === 'hbn-farnesane') {
    const temperatureFactor = Math.exp(-0.02 * (temperature - 72));
    const shearFactor = Math.pow(Math.max(1, speed / lengthScale), -0.35 * strength);
    return baseViscosity * temperatureFactor * shearFactor;
  }
  if (model === 'ddf') {
    const speedLimit = Math.max(0.1, finiteOr(state.speedLimit, 8));
    const mobility = calculateDdfMobility({
      radiusM: lengthScale,
      speedMS: speed,
      coreRadiusM: lengthScale,
      speedLimitMS: speedLimit,
      dilatancy: strength,
      baseViscosity
    });
    return 1 / mobility - 1;
  }
  return baseViscosity;
}
