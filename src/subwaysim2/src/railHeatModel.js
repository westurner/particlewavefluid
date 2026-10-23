export const RAIL_HEAT_MODELS = [
  { value: 'fourier', label: "Fourier's law", description: 'Baseline conduction model: heat flux follows the local temperature gradient immediately, q = -k grad(T), producing classical diffusion.' },
  { value: 'cattaneo', label: 'Cattaneo-Vernotte', description: 'Finite-speed conduction model: heat flux relaxes toward the Fourier flux over the configured relaxation time, rather than responding instantly.' },
  { value: 'ddf', label: 'DDF / Fedi hypothesis', description: 'Exploratory flux-limiting model: steep gradients reduce Fourier flux by a gradient-dependent factor. This phenomenological hypothesis is not a validated rail-steel material law.' }
];

const DEFAULT_MATERIAL = {
  conductivity: 45,
  density: 7850,
  specificHeat: 486,
  crossSection: 0.007
};

export function createRailHeatState({ nodes = 81, length = 6, ambientTemperature = 20, initialTemperature = ambientTemperature } = {}) {
  if (!Number.isInteger(nodes) || nodes < 3) throw new RangeError('Rail heat state requires at least three nodes.');
  if (!(length > 0)) throw new RangeError('Rail length must be positive.');
  return {
    nodes,
    length,
    time: 0,
    temperatures: new Float64Array(nodes).fill(initialTemperature),
    heatFluxes: new Float64Array(nodes - 1)
  };
}

export function normalizedTensorGaussian({ x, y, centerX = 0, centerY = 0, sigmaX = 0.18, sigmaY = 0.045, correlation = 0 } = {}) {
  const safeSigmaX = Math.max(1e-6, Math.abs(sigmaX));
  const safeSigmaY = Math.max(1e-6, Math.abs(sigmaY));
  const rho = Math.max(-0.95, Math.min(0.95, correlation));
  const dx = (x - centerX) / safeSigmaX;
  const dy = (y - centerY) / safeSigmaY;
  const quadratic = (dx * dx - 2 * rho * dx * dy + dy * dy) / (1 - rho * rho);
  return Math.exp(-0.5 * quadratic);
}

export function stepRailHeatState(state, elapsedSeconds, configuration = {}) {
  if (!(elapsedSeconds > 0)) return state;

  const {
    model = 'fourier',
    ambientTemperature = 20,
    heatPower = 4200,
    sourcePosition = 0,
    sourceWidth = 0.12,
    diffusivityScale = 1,
    convection = 0.0003,
    relaxationTime = 2,
    ddfStrength = 0.8
  } = configuration;
  const material = { ...DEFAULT_MATERIAL, ...configuration.material };
  const heatCapacityPerLength = material.density * material.specificHeat * material.crossSection;
  const diffusivity = material.conductivity / (material.density * material.specificHeat) * Math.max(0.01, diffusivityScale);
  const dx = state.length / (state.nodes - 1);
  const sourceSigma = Math.max(dx * 0.5, sourceWidth);
  const maxDiffusionStep = 0.42 * dx * dx / diffusivity;
  const waveSpeed = Math.sqrt(diffusivity / Math.max(1e-4, relaxationTime));
  const maxWaveStep = 0.42 * dx / waveSpeed;
  const stableStep = model === 'cattaneo' ? Math.min(maxDiffusionStep, maxWaveStep) : maxDiffusionStep;
  const substeps = Math.max(1, Math.min(240, Math.ceil(elapsedSeconds / stableStep)));
  const dt = elapsedSeconds / substeps;
  const temperatures = state.temperatures;
  const nextTemperatures = new Float64Array(state.nodes);
  const sourceWeights = new Float64Array(state.nodes);
  let sourceWeightTotal = 0;

  for (let index = 0; index < state.nodes; index += 1) {
    const x = index * dx - state.length / 2;
    const offset = (x - sourcePosition) / sourceSigma;
    const weight = Math.exp(-0.5 * offset * offset);
    sourceWeights[index] = weight;
    sourceWeightTotal += weight;
  }

  for (let step = 0; step < substeps; step += 1) {
    for (let edge = 0; edge < state.nodes - 1; edge += 1) {
      const gradient = (temperatures[edge + 1] - temperatures[edge]) / dx;
      const fourierFlux = -material.conductivity * Math.max(0.01, diffusivityScale) * gradient;
      if (model === 'cattaneo') {
        const relaxationFraction = 1 - Math.exp(-dt / Math.max(1e-4, relaxationTime));
        state.heatFluxes[edge] += relaxationFraction * (fourierFlux - state.heatFluxes[edge]);
      } else if (model === 'ddf') {
        state.heatFluxes[edge] = fourierFlux / (1 + Math.max(0, ddfStrength) * Math.abs(gradient));
      } else {
        state.heatFluxes[edge] = fourierFlux;
      }
    }

    for (let index = 0; index < state.nodes; index += 1) {
      const leftFlux = index > 0 ? state.heatFluxes[index - 1] : 0;
      const rightFlux = index < state.nodes - 1 ? state.heatFluxes[index] : 0;
      const conductionRate = (leftFlux - rightFlux) / (material.density * material.specificHeat * dx);
      const sourceRate = heatPower * sourceWeights[index] / Math.max(1e-12, sourceWeightTotal) / (heatCapacityPerLength * dx);
      const convectionRate = -convection * (temperatures[index] - ambientTemperature);
      nextTemperatures[index] = temperatures[index] + dt * (conductionRate + sourceRate + convectionRate);
    }

    temperatures.set(nextTemperatures);
    state.time += dt;
  }

  return state;
}

export function stepRailHeatComparison(states, elapsedSeconds, configuration = {}) {
  for (const model of ['fourier', 'cattaneo', 'ddf']) {
    stepRailHeatState(states[model], elapsedSeconds, { ...configuration, model });
  }
  return states;
}

export function summarizeRailHeatState(state, ambientTemperature = 20) {
  let maximumTemperature = -Infinity;
  let totalExcess = 0;
  for (const temperature of state.temperatures) {
    maximumTemperature = Math.max(maximumTemperature, temperature);
    totalExcess += Math.max(0, temperature - ambientTemperature);
  }
  return { maximumTemperature, meanExcess: totalExcess / state.nodes, time: state.time };
}

export function compareRailHeatStates(referenceState, candidateState) {
  if (referenceState.nodes !== candidateState.nodes) throw new RangeError('Rail heat states must have the same number of nodes to compare.');

  const temperatureDifferences = new Float64Array(referenceState.nodes);
  let maximumAbsoluteDifference = 0;
  let totalAbsoluteDifference = 0;
  let totalSquaredDifference = 0;
  for (let index = 0; index < referenceState.nodes; index += 1) {
    const difference = candidateState.temperatures[index] - referenceState.temperatures[index];
    const absoluteDifference = Math.abs(difference);
    temperatureDifferences[index] = difference;
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, absoluteDifference);
    totalAbsoluteDifference += absoluteDifference;
    totalSquaredDifference += difference * difference;
  }

  return {
    temperatureDifferences,
    maximumAbsoluteDifference,
    meanAbsoluteDifference: totalAbsoluteDifference / referenceState.nodes,
    rootMeanSquareDifference: Math.sqrt(totalSquaredDifference / referenceState.nodes)
  };
}