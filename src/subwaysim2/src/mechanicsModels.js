import { calculateDdfMobility, evaluateMechanicsResponse } from './lib/simulationMechanics.js';

export const FIELD_MODEL_OPTIONS = [
  { value: 'newtonian', label: 'Newtonian' },
  { value: 'ns-compressible', label: 'NS compressible fluid' },
  { value: 'ns-incompressible', label: 'NS incompressible fluid' },
  { value: 'sqg', label: 'SQG hypothesis' },
  { value: 'ddf', label: 'DDF hypothesis' },
  { value: 'grassmannian-amplituhedron', label: 'Gr(2,4) / amplituhedron splat' }
];

export const FIELD_MODEL_DETAILS = Object.freeze({
  newtonian: { status: 'Established reference', equation: 'a = -GM r / |r|^3' },
  'ns-compressible': { status: 'Reduced NS experiment', equation: 'd rho/dt + div(rho u) = 0' },
  'ns-incompressible': { status: 'Reduced NS experiment', equation: 'div(u) = 0' },
  sqg: { status: 'Speculative SQG hypothesis', equation: 'compressible sink + bounded quantum pressure' },
  ddf: { status: 'Speculative DDF hypothesis', equation: 'SQG response / (1 + strain-dependent viscosity)' },
  'grassmannian-amplituhedron': { status: 'Exploratory geometric hypothesis', equation: 'Newtonian baseline × [1 + bounded Gr(2,4) tensor-Gaussian splat]' }
});

export const FIELD_MECHANICS_PARAMETER_FIELDS = Object.freeze({
  coreRadius: { label: 'Core radius', min: 0.05, max: 5, step: 0.05 },
  quantumPressure: { label: 'Quantum pressure', min: 0, max: 5, step: 0.01 },
  compressibility: { label: 'Compressibility', min: 0, max: 4, step: 0.01 },
  baseViscosity: { label: 'Base viscosity', min: 0, max: 0.5, step: 0.005 },
  dilatancy: { label: 'Dilatancy', min: 0, max: 10, step: 0.05 },
  speedLimit: { label: 'Speed limit', min: 0.1, max: 10, step: 0.1 },
  tensorGaussianWaist: { label: 'Tensor-Gaussian waist', min: 0.1, max: 20, step: 0.1 },
  grassmannianPoleWeight: { label: 'Positive-cell pole weight', min: 0, max: 1, step: 0.01 },
  geometryCoupling: { label: 'Amplituhedron acceleration coupling', min: 0, max: 0.25, step: 0.005 }
});

export const FIELD_MODEL_PARAMETER_DEPENDENCIES = Object.freeze({
  newtonian: [],
  'ns-compressible': ['coreRadius', 'compressibility'],
  'ns-incompressible': [],
  sqg: ['coreRadius', 'compressibility', 'quantumPressure'],
  ddf: ['coreRadius', 'compressibility', 'quantumPressure', 'baseViscosity', 'dilatancy', 'speedLimit', 'tensorGaussianWaist'],
  'grassmannian-amplituhedron': ['tensorGaussianWaist', 'grassmannianPoleWeight', 'geometryCoupling']
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
  enabled: false,
  model: 'newtonian',
  comparisonEnabled: false,
  comparisonModel: 'sqg',
  differenceScale: 1,
  coreRadius: 0.8,
  quantumPressure: 0.35,
  compressibility: 0.45,
  dilatancy: 1,
  speedLimit: 8,
  baseViscosity: 0.02,
  tensorGaussianWaist: 2.5,
  grassmannianPoleWeight: 0.72,
  geometryCoupling: 0.15
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
    baseViscosity: clamp(finiteOr(value.baseViscosity, defaults.baseViscosity), 0, 1),
    tensorGaussianWaist: clamp(finiteOr(value.tensorGaussianWaist, defaults.tensorGaussianWaist), 0.1, 100),
    grassmannianPoleWeight: clamp(finiteOr(value.grassmannianPoleWeight, defaults.grassmannianPoleWeight), 0, 1),
    geometryCoupling: clamp(finiteOr(value.geometryCoupling, defaults.geometryCoupling), 0, 0.25)
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
  const inverseSquare = magnitude / (radius * radius);
  const coreRatio = radius / settings.coreRadius;
  const tangentialAcceleration = rotation * magnitude / radius;

  if (model === 'newtonian') {
    return {
      radialAcceleration: -inverseSquare,
      tangentialAcceleration: 0,
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
  const quantumPressure = settings.quantumPressure
    * Math.exp(-(coreRatio * coreRatio)) / settings.coreRadius;
  const compressibleSink = inverseSquare * (1 + settings.compressibility / (1 + coreRatio));
  const gaussianWeight = Math.exp(-(radius * radius) / (2 * settings.tensorGaussianWaist ** 2));

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

  if (model === 'sqg') {
    return {
      radialAcceleration: -compressibleSink + quantumPressure,
      tangentialAcceleration,
      quantumPressure,
      effectiveViscosity: settings.baseViscosity,
      mobility: 1,
      divergence,
      volumeChangeRate: divergence
    };
  }

  if (model === 'ddf') {
    const mobility = calculateDdfMobility({ radiusM: radius, speedMS: speed, coreRadiusM: settings.coreRadius, speedLimitMS: settings.speedLimit, dilatancy: settings.dilatancy, baseViscosity: settings.baseViscosity });
    const effectiveViscosity = 1 / mobility - 1;
    const response = evaluateMechanicsResponse({ regime: 'ddf-tensor-gaussian', gaussianWeight, ddfMobility: mobility });
    return {
      radialAcceleration: (-compressibleSink + quantumPressure) * response.accelerationScale,
      tangentialAcceleration: tangentialAcceleration * response.accelerationScale,
      quantumPressure,
      effectiveViscosity,
      mobility: response.accelerationScale,
      ddfMobility: mobility,
      divergence: divergence * response.accelerationScale,
      volumeChangeRate: divergence * response.accelerationScale,
      tensorGaussian: response.splatWeight
    };
  }

  const geometry = evaluateMechanicsResponse({
    regime: 'grassmannian-amplituhedron',
    gaussianWeight,
    grassmannianWeight: settings.grassmannianPoleWeight,
    geometryCoupling: settings.geometryCoupling
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
    geometricCorrection: geometry.geometricCorrection
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
    const beta = clamp(speed / speedLimit, 0, 0.9999);
    const lorentzFactor = 1 / Math.sqrt(1 - beta * beta);
    return baseViscosity * (1 + strength * ((lorentzFactor - 1) + speed / lengthScale));
  }
  return baseViscosity;
}

export function evaluateGpeResponse(amplitude, laplacian, options = {}) {
  const nonlinearCoupling = clamp(finiteOr(options.nonlinearCoupling, 0), 0, 10);
  const dispersion = clamp(finiteOr(options.dispersion, 0), 0, 10);
  const boundedAmplitude = clamp(finiteOr(amplitude, 0), -1e3, 1e3);
  const boundedLaplacian = clamp(finiteOr(laplacian, 0), -1e3, 1e3);
  return boundedAmplitude
    - nonlinearCoupling * boundedAmplitude * boundedAmplitude * boundedAmplitude
    - dispersion * boundedLaplacian;
}