import { evaluateMechanicsResponse } from './lib/simulationMechanics.js';

export const DDF_PAPER_REFERENCE = Object.freeze({
  title: 'Dilatant Dark Fluid: Toward a Unified Quantum-Hydrodynamic Origin of Lorentz Invariance, Gravity, and Cosmological Phenomenology',
  author: 'Marco Fedi',
  url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7406660'
});

export const RAIL_HEAT_MODELS = [
  { value: 'fourier', label: "Fourier's law", description: 'Baseline conduction model: heat flux follows the local temperature gradient immediately, q = -k grad(T), producing classical parabolic diffusion.' },
  { value: 'cattaneo', label: 'Cattaneo-Vernotte', description: 'Finite-speed conduction model: heat flux relaxes toward the Fourier flux over the configured relaxation time τ, producing damped hyperbolic thermal waves.' },
  { value: 'ddf', label: 'DDF / Fedi hypothesis', description: 'Exploratory thermal adaptation of Marco Fedi’s Dilatant Dark Fluid (SSRN 7406660) in a normed tensor-Gaussian splatter space: high temperature gradients and phonon drift trigger Lorentz-like shear-thickening mobility reduction while deforming the rail metric under det(C) = 1 and tr(T̂) = 3.' }
];

export const RAIL_HEAT_CONSTRAINTS = Object.freeze([
  {
    id: 'clausius-duhem',
    label: 'Second-Law / Clausius-Duhem positivity',
    equation: '0 < M_DDF ≤ 1,  g^{zz} > 0,  -q · ∂_x T ≥ 0',
    description: 'Effective conductivity remains strictly positive so heat flux is always downgrade; dilatant resistance slows transport without creating energy.'
  },
  {
    id: 'dilatant-jamming',
    label: 'Lorentz-like dilatant shear-jamming (SSRN 7406660)',
    equation: 'Γ_* = (1 - β_q²)^(-1/2),  M_DDF = 1 - (1 - μ_DDF) w_G',
    description: 'Adapts Fedi’s dilatant viscosity to phonon drift β_q = |q|/q_max and dimensionless gradient strain |∂_x T|/G_ref, blended by the Gaussian window w_G so M_DDF → 1 in the far field.'
  },
  {
    id: 'normed-splatter-metric',
    label: 'Trace- & determinant-normed 3×3 splatter deformation',
    equation: 'det(F) = det(C) = 1,  tr(T̂) = 3,  g^{zz} = λ_∥^(-2)',
    description: 'Models the rail as an isochoric 3D deformation in tensor-Gaussian splatter space whose longitudinal stretch λ_∥ pulls back the conduction metric and whose eigensystem orients the anisotropic splats.'
  },
  {
    id: 'conservative-flux',
    label: 'Conservative edge-flux divergence',
    equation: 'ρ c_p ∂_t T = -(q_{i+1/2} - q_{i-1/2}) / Δx + s - h(T - T_amb)',
    description: 'Evaluates constitutive flux on staggered rail edges with insulated endpoints so internal conduction strictly conserves thermal energy across all three models.'
  }
]);

const DEFAULT_MATERIAL = {
  conductivity: 45,
  density: 7850,
  specificHeat: 486,
  crossSection: 0.007
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function cross3(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0]
  ];
}

function normalize3(vector, fallback = [1, 0, 0]) {
  const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
  return magnitude > 1e-12 ? [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude] : fallback;
}

function extractSymmetricEigenvector(matrix, eigenvalue, fallback) {
  const shiftedColumns = [
    [matrix[0][0] - eigenvalue, matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1] - eigenvalue, matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2] - eigenvalue]
  ];
  const candidates = [
    cross3(shiftedColumns[0], shiftedColumns[1]),
    cross3(shiftedColumns[0], shiftedColumns[2]),
    cross3(shiftedColumns[1], shiftedColumns[2])
  ];
  let best = candidates[0];
  let bestNormSquared = best[0] * best[0] + best[1] * best[1] + best[2] * best[2];
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const normSquared = candidate[0] * candidate[0] + candidate[1] * candidate[1] + candidate[2] * candidate[2];
    if (normSquared > bestNormSquared) {
      best = candidate;
      bestNormSquared = normSquared;
    }
  }
  return normalize3(best, fallback);
}

export function eigenDecomposeSymmetric3x3(matrix) {
  const m00 = Number(matrix?.[0]?.[0]) || 0;
  const m01 = Number(matrix?.[0]?.[1]) || 0;
  const m02 = Number(matrix?.[0]?.[2]) || 0;
  const m11 = Number(matrix?.[1]?.[1]) || 0;
  const m12 = Number(matrix?.[1]?.[2]) || 0;
  const m22 = Number(matrix?.[2]?.[2]) || 0;
  const offDiagonalNormSquared = m01 * m01 + m02 * m02 + m12 * m12;

  if (offDiagonalNormSquared < 1e-16) {
    const pairs = [
      { value: m00, vector: [1, 0, 0] },
      { value: m11, vector: [0, 1, 0] },
      { value: m22, vector: [0, 0, 1] }
    ].sort((first, second) => second.value - first.value);
    const firstVector = pairs[0].vector;
    const secondVector = pairs[1].vector;
    const thirdVector = cross3(firstVector, secondVector);
    return {
      eigenvalues: pairs.map(({ value }) => value),
      eigenvectors: [firstVector, secondVector, thirdVector]
    };
  }

  const meanTrace = (m00 + m11 + m22) / 3;
  const p2 = (m00 - meanTrace) ** 2 + (m11 - meanTrace) ** 2 + (m22 - meanTrace) ** 2 + 2 * offDiagonalNormSquared;
  const p = Math.sqrt(Math.max(p2 / 6, 1e-30));
  const b00 = (m00 - meanTrace) / p;
  const b01 = m01 / p;
  const b02 = m02 / p;
  const b11 = (m11 - meanTrace) / p;
  const b12 = m12 / p;
  const b22 = (m22 - meanTrace) / p;
  const detB = b00 * (b11 * b22 - b12 * b12)
    - b01 * (b01 * b22 - b12 * b02)
    + b02 * (b01 * b12 - b11 * b02);
  const phi = Math.acos(clamp(detB / 2, -1, 1)) / 3;
  const twoPiThirds = (2 * Math.PI) / 3;

  const eig1 = meanTrace + 2 * p * Math.cos(phi);
  const eig3 = meanTrace + 2 * p * Math.cos(phi + twoPiThirds);
  const eig2 = 3 * meanTrace - eig1 - eig3;
  const eigenvalues = [eig1, eig2, eig3].sort((first, second) => second - first);

  const symmetric = [
    [m00, m01, m02],
    [m01, m11, m12],
    [m02, m12, m22]
  ];
  const e1 = extractSymmetricEigenvector(symmetric, eigenvalues[0], [0, 0, 1]);
  const rawE2 = extractSymmetricEigenvector(symmetric, eigenvalues[1], [0, 1, 0]);
  const dot12 = e1[0] * rawE2[0] + e1[1] * rawE2[1] + e1[2] * rawE2[2];
  const orthogonalE2 = normalize3([
    rawE2[0] - dot12 * e1[0],
    rawE2[1] - dot12 * e1[1],
    rawE2[2] - dot12 * e1[2]
  ], Math.abs(e1[1]) < 0.9 ? normalize3(cross3(e1, [0, 1, 0])) : normalize3(cross3(e1, [1, 0, 0])));
  const e3 = normalize3(cross3(e1, orthogonalE2), [1, 0, 0]);

  return {
    eigenvalues,
    eigenvectors: [e1, orthogonalE2, e3]
  };
}

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

export function calculateRailDdfMobility({
  gradient = 0,
  fourierFlux = 0,
  ddfStrength = 0.8,
  tensorGaussianWeight = 1,
  gradientScale = 40,
  fluxLimit = 4500
} = {}) {
  const strength = Math.max(0, Number.isFinite(ddfStrength) ? ddfStrength : 0);
  const weight = clamp(tensorGaussianWeight, 0, 1);
  const referenceGradient = Math.max(1, Number.isFinite(gradientScale) ? gradientScale : 40);
  const maxFlux = Math.max(10, Number.isFinite(fluxLimit) ? fluxLimit : 4500);
  const beta = clamp(Math.abs(fourierFlux) / maxFlux, 0, 0.9999);
  const lorentzJamming = 1 / Math.sqrt(1 - beta * beta);
  const unlocalizedMobility = 1 / (
    1 + strength * (Math.abs(gradient) + referenceGradient * (lorentzJamming - 1))
  );
  const response = evaluateMechanicsResponse({
    regime: 'ddf-tensor-gaussian',
    gaussianWeight: weight,
    ddfMobility: unlocalizedMobility
  });
  return response.accelerationScale;
}

export function evaluateRailSplatterDeformation(state, configuration = {}) {
  const {
    model = state.model ?? 'ddf',
    ambientTemperature = 20,
    sourcePosition = 0,
    sourceWidth = 0.16,
    ddfStrength = 0.8,
    gaussianSplatters = true,
    tensorGaussianWaist = Math.max(0.24, sourceWidth * 2.2),
    splatterDeformationScale = 1,
    gradientScale = 40,
    fluxLimit = 4500
  } = configuration;
  const nodeCount = state.nodes;
  const length = state.length;
  const dx = length / Math.max(1, nodeCount - 1);
  const waist = Math.max(0.08, Number.isFinite(tensorGaussianWaist) ? tensorGaussianWaist : 0.35);
  const deformationScale = clamp(splatterDeformationScale, 0, 3);
  const referenceGradient = Math.max(1, Number.isFinite(gradientScale) ? gradientScale : 40);
  const maxFlux = Math.max(10, Number.isFinite(fluxLimit) ? fluxLimit : 4500);
  const activeDdfStrength = model === 'ddf' ? ddfStrength : 0;

  let maxAnisotropy = 1;
  let totalTrace = 0;
  let totalDeterminant = 0;
  let maxDisplacementMm = 0;
  let maxShearAngleDeg = 0;
  let minDdfMobility = 1;
  let clausiusDuhemSatisfied = true;

  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const z = (index / Math.max(1, nodeCount - 1) - 0.5) * length;
    const temperature = state.temperatures[index];
    const excessTemperature = temperature - ambientTemperature;
    const normalizedExcess = clamp(excessTemperature / 90, -1, 2);
    const leftIndex = Math.max(0, index - 1);
    const rightIndex = Math.min(nodeCount - 1, index + 1);
    const span = Math.max(dx, (rightIndex - leftIndex) * dx);
    const gradient = (state.temperatures[rightIndex] - state.temperatures[leftIndex]) / span;
    const leftFlux = index > 0 ? state.heatFluxes[index - 1] : state.heatFluxes[0] ?? 0;
    const rightFlux = index < nodeCount - 1 ? state.heatFluxes[index] : state.heatFluxes[nodeCount - 2] ?? 0;
    const localFlux = 0.5 * (leftFlux + rightFlux);
    if (index < nodeCount - 1) {
      const edgeGradient = (state.temperatures[index + 1] - state.temperatures[index]) / dx;
      if (-state.heatFluxes[index] * edgeGradient < -1e-9) clausiusDuhemSatisfied = false;
    }

    const tensorGaussianWeight = gaussianSplatters !== false
      ? normalizedTensorGaussian({
        x: z,
        y: 0,
        centerX: sourcePosition,
        centerY: 0,
        sigmaX: waist,
        sigmaY: 0.12,
        correlation: 0.12
      })
      : 1;
    const ddfMobility = calculateRailDdfMobility({
      gradient,
      fourierFlux: localFlux,
      ddfStrength: activeDdfStrength,
      tensorGaussianWeight,
      gradientScale: referenceGradient,
      fluxLimit: maxFlux
    });
    const splatResponse = evaluateMechanicsResponse({
      regime: 'ddf-tensor-gaussian',
      gaussianWeight: tensorGaussianWeight,
      ddfMobility
    });
    minDdfMobility = Math.min(minDdfMobility, ddfMobility);

    const jammingStrain = 1 - ddfMobility;
    const axialStretch = Math.max(
      0.65,
      1 + deformationScale * tensorGaussianWeight * (0.16 * Math.max(0, normalizedExcess) + 0.18 * jammingStrain)
    );
    const verticalStretch = Math.max(
      0.65,
      Math.pow(axialStretch, -1 / 3) * (1 + 0.07 * deformationScale * tensorGaussianWeight * (Math.max(0, normalizedExcess) + 0.5 * jammingStrain))
    );
    const lateralStretch = 1 / (axialStretch * verticalStretch);
    const shearYZ = 0.2 * deformationScale * tensorGaussianWeight * Math.tanh(gradient / referenceGradient) * (1 + 0.4 * jammingStrain);
    const shearXZ = 0.16 * deformationScale * tensorGaussianWeight * Math.tanh(localFlux / maxFlux) * (0.35 + 0.65 * jammingStrain);

    const deformationGradient = [
      [lateralStretch, 0, shearXZ],
      [0, verticalStretch, shearYZ],
      [0, 0, axialStretch]
    ];
    const cxx = lateralStretch * lateralStretch + shearXZ * shearXZ;
    const cxy = shearXZ * shearYZ;
    const cxz = shearXZ * axialStretch;
    const cyy = verticalStretch * verticalStretch + shearYZ * shearYZ;
    const cyz = shearYZ * axialStretch;
    const czz = axialStretch * axialStretch;
    const cauchyGreenTensor = [
      [cxx, cxy, cxz],
      [cxy, cyy, cyz],
      [cxz, cyz, czz]
    ];
    const rawTrace = Math.max(1e-12, cxx + cyy + czz);
    const traceScale = 3 / rawTrace;
    const normalizedTensor = cauchyGreenTensor.map((row) => row.map((value) => value * traceScale));
    const trace = normalizedTensor[0][0] + normalizedTensor[1][1] + normalizedTensor[2][2];
    const determinantF = lateralStretch * verticalStretch * axialStretch;
    const determinant = determinantF * determinantF;

    const eigensystem = eigenDecomposeSymmetric3x3(cauchyGreenTensor);
    const principalStretches = eigensystem.eigenvalues.map((value) => Math.sqrt(Math.max(1e-12, value)));
    const anisotropy = principalStretches[0] / Math.max(1e-6, principalStretches[2]);
    const primaryEigenvector = eigensystem.eigenvectors[0];
    const majorAxisAngle = Math.atan2(primaryEigenvector[0], primaryEigenvector[2]);
    const pitchAngle = -Math.atan2(primaryEigenvector[1], Math.hypot(primaryEigenvector[0], primaryEigenvector[2]));

    const displacementX = 0.042 * deformationScale * tensorGaussianWeight * (gradient / Math.hypot(referenceGradient, gradient)) * (1 + 0.65 * jammingStrain);
    const displacementY = 0.085 * deformationScale * tensorGaussianWeight * Math.max(0, normalizedExcess) * (1 + 0.45 * jammingStrain);
    const displacementZ = -0.038 * deformationScale * tensorGaussianWeight * (gradient / Math.hypot(referenceGradient, gradient)) * dx;
    const shearAngleRad = Math.atan(Math.hypot(shearXZ, shearYZ));

    maxAnisotropy = Math.max(maxAnisotropy, anisotropy);
    totalTrace += trace;
    totalDeterminant += determinant;
    maxDisplacementMm = Math.max(maxDisplacementMm, Math.hypot(displacementX, displacementY, displacementZ) * 1000);
    maxShearAngleDeg = Math.max(maxShearAngleDeg, shearAngleRad * 180 / Math.PI);

    return {
      z,
      displacement: [displacementX, displacementY, displacementZ],
      deformedPosition: [displacementX, 0.26 + displacementY, z + displacementZ],
      scale: [lateralStretch, verticalStretch, axialStretch],
      principalStretches,
      eigenvectors: eigensystem.eigenvectors,
      majorAxisAngle,
      rotation: [pitchAngle * 0.65, majorAxisAngle * 0.65, 0],
      tensorGaussianWeight,
      splatWeight: splatResponse.splatWeight,
      ddfMobility,
      metricConductivityScale: 1 / (axialStretch * axialStretch),
      deformationGradient,
      cauchyGreenTensor,
      normalizedTensor,
      trace,
      determinant,
      anisotropy
    };
  });

  const meanTrace = totalTrace / nodeCount;
  const meanDeterminant = totalDeterminant / nodeCount;
  const constraintsSatisfied = clausiusDuhemSatisfied
    && minDdfMobility > 0
    && minDdfMobility <= 1
    && Math.abs(meanTrace - 3) < 1e-9
    && Math.abs(meanDeterminant - 1) < 1e-9;

  return {
    nodes,
    maxAnisotropy,
    meanTrace,
    meanDeterminant,
    maxDisplacementMm,
    maxShearAngleDeg,
    minDdfMobility,
    clausiusDuhemSatisfied,
    constraintsSatisfied
  };
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
    ddfStrength = 0.8,
    gaussianSplatters = true,
    tensorGaussianWaist = Math.max(0.24, sourceWidth * 2.2),
    splatterDeformationScale = 1,
    gradientScale = 40,
    fluxLimit = 4500
  } = configuration;
  const material = { ...DEFAULT_MATERIAL, ...configuration.material };
  const heatCapacityPerLength = material.density * material.specificHeat * material.crossSection;
  const diffusivity = material.conductivity / (material.density * material.specificHeat) * Math.max(0.01, diffusivityScale);
  const dx = state.length / (state.nodes - 1);
  const sourceSigma = Math.max(dx * 0.5, sourceWidth);
  const waist = Math.max(0.08, Number.isFinite(tensorGaussianWaist) ? tensorGaussianWaist : Math.max(0.24, sourceWidth * 2.2));
  const deformationScale = clamp(splatterDeformationScale, 0, 3);
  const maxDiffusionStep = 0.42 * dx * dx / diffusivity;
  const waveSpeed = Math.sqrt(diffusivity / Math.max(1e-4, relaxationTime));
  const maxWaveStep = 0.42 * dx / waveSpeed;
  const stableStep = Math.min(2.5, model === 'cattaneo' ? Math.min(maxDiffusionStep, maxWaveStep) : maxDiffusionStep);
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
        const edgeX = (edge + 0.5) * dx - state.length / 2;
        const tensorGaussianWeight = gaussianSplatters !== false
          ? normalizedTensorGaussian({
            x: edgeX,
            y: 0,
            centerX: sourcePosition,
            centerY: 0,
            sigmaX: waist,
            sigmaY: 0.12,
            correlation: 0.12
          })
          : 1;
        const mobility = calculateRailDdfMobility({
          gradient,
          fourierFlux,
          ddfStrength,
          tensorGaussianWeight,
          gradientScale,
          fluxLimit
        });
        const edgeExcess = Math.max(0, (0.5 * (temperatures[edge] + temperatures[edge + 1]) - ambientTemperature) / 90);
        const edgeAxialStretch = Math.max(
          0.65,
          1 + deformationScale * tensorGaussianWeight * (0.16 * edgeExcess + 0.18 * (1 - mobility))
        );
        const metricConductivityScale = 1 / (edgeAxialStretch * edgeAxialStretch);
        state.heatFluxes[edge] = fourierFlux * mobility * metricConductivityScale;
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

  state.model = model;
  state.deformation = evaluateRailSplatterDeformation(state, { ...configuration, model });
  return state;
}

export function stepRailHeatComparison(states, elapsedSeconds, configuration = {}) {
  for (const model of ['fourier', 'cattaneo', 'ddf']) {
    stepRailHeatState(states[model], elapsedSeconds, { ...configuration, model });
  }
  return states;
}

export function summarizeRailHeatState(state, ambientTemperature = 20, configuration = {}) {
  let maximumTemperature = -Infinity;
  let totalExcess = 0;
  for (const temperature of state.temperatures) {
    maximumTemperature = Math.max(maximumTemperature, temperature);
    totalExcess += Math.max(0, temperature - ambientTemperature);
  }
  const deformation = evaluateRailSplatterDeformation(state, { ...configuration, ambientTemperature });
  return {
    maximumTemperature,
    meanExcess: totalExcess / state.nodes,
    time: state.time,
    maxAnisotropy: deformation.maxAnisotropy,
    meanTrace: deformation.meanTrace,
    meanDeterminant: deformation.meanDeterminant,
    maxDisplacementMm: deformation.maxDisplacementMm,
    minDdfMobility: deformation.minDdfMobility,
    constraintsSatisfied: deformation.constraintsSatisfied
  };
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