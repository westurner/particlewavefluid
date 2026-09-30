export const FIELD_MODEL_OPTIONS = [
  { value: 'newtonian', label: 'Newtonian' },
  { value: 'sqg', label: 'SQG hypothesis' },
  { value: 'ddf', label: 'DDF hypothesis' }
];

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
  baseViscosity: 0.02
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
    baseViscosity: clamp(finiteOr(value.baseViscosity, defaults.baseViscosity), 0, 1)
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

  if (model === 'newtonian') {
    return {
      radialAcceleration: -inverseSquare,
      tangentialAcceleration: 0,
      quantumPressure: 0,
      effectiveViscosity: 0,
      mobility: 1
    };
  }

  const coreRatio = radius / settings.coreRadius;
  const quantumPressure = settings.quantumPressure
    * Math.exp(-(coreRatio * coreRatio)) / settings.coreRadius;
  const compressibleSink = inverseSquare * (1 + settings.compressibility / (1 + coreRatio));
  const tangentialAcceleration = rotation * magnitude / radius;

  if (model === 'sqg') {
    return {
      radialAcceleration: -compressibleSink + quantumPressure,
      tangentialAcceleration,
      quantumPressure,
      effectiveViscosity: settings.baseViscosity,
      mobility: 1
    };
  }

  const beta = clamp(speed / settings.speedLimit, 0, 0.9999);
  const lorentzFactor = 1 / Math.sqrt(1 - beta * beta);
  const strainRate = speed / radius;
  const effectiveViscosity = settings.baseViscosity
    * (1 + settings.dilatancy * ((lorentzFactor - 1) + strainRate));
  const mobility = 1 / (1 + effectiveViscosity);
  return {
    radialAcceleration: (-compressibleSink + quantumPressure) * mobility,
    tangentialAcceleration: tangentialAcceleration * mobility,
    quantumPressure,
    effectiveViscosity,
    mobility
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