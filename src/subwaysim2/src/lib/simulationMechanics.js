export const SIMULATION_MECHANICS_REGIMES = [
  { value: 'classical', label: 'Classical / Maxwell baseline' },
  { value: 'ddf-tensor-gaussian', label: 'DDF / normed tensor-Gaussian' },
  { value: 'grassmannian-amplituhedron', label: 'Gr(2,4) / amplituhedron acceleration' }
];

export const GRAVITY_MODEL_LIBRARY = Object.freeze({
  gravituhedron: Object.freeze({ label: 'Gravituhedron hypothesis', base: 'spin2-tree', correction: 'positive-cell geometry' }),
  'grassmannian-amplituhedron': Object.freeze({ label: 'GR(2,4) / amplituhedron splat', base: 'newtonian', correction: 'bounded tensor-Gaussian geometry' }),
  'general-relativity': Object.freeze({ label: 'General Relativity', base: 'newtonian', correction: 'pairwise first post-Newtonian' }),
  'gr-normed-tensor-gaussian': Object.freeze({ label: 'GR / normed tensor-Gaussian', base: 'general-relativity', correction: 'trace-normalized tensor and Gaussian window' }),
  sqg: Object.freeze({ label: 'SQG / GR + GPE', base: 'general-relativity', correction: 'Gross-Pitaevskii response' }),
  'sqg-tensor-gaussian': Object.freeze({ label: 'SQG / normed tensor-Gaussian splat', base: 'sqg', correction: 'normalized Gaussian GPE response' }),
  ddf: Object.freeze({ label: 'DDF', base: 'sqg', correction: 'speed-limited dilatant mobility' }),
  'ddf-tensor-gaussian': Object.freeze({ label: 'DDF / normed tensor-Gaussian splat', base: 'ddf', correction: 'mobility localized by normalized Gaussian' })
});

export const SIMPLE_ATTRACTOR_GRAVITY_FIELD_GLSL = `
  vec4 fieldResponse(float model, float radius, float speed, float magnitude, float rotation) {
    float safeRadius = max(radius, 0.05);
    float inverseSquare = magnitude / (safeRadius * safeRadius);
    float tangent = rotation * magnitude / safeRadius;
    if (model < 0.5) return vec4(-inverseSquare, tangent, 0.0, 0.0);
    if (model < 1.5) return vec4(-inverseSquare, 0.0, 0.0, 0.0);
    float coreRatio = safeRadius / max(uCoreRadius, 0.05);
    float sink = inverseSquare * (1.0 + uCompressibility / (1.0 + coreRatio));
    if (model < 2.5) return vec4(-sink, tangent, uBaseViscosity, 0.0);
    if (model < 3.5) return vec4(-inverseSquare, tangent, uBaseViscosity, 0.0);
    float grCorrection = magnitude / (max(uGravitySpeedOfLight, 1.0) * max(uGravitySpeedOfLight, 1.0) * safeRadius * safeRadius)
      * (4.0 * magnitude / safeRadius - speed * speed);
    float grAcceleration = -inverseSquare + grCorrection;
    float gpeAmplitude = sqrt(max(magnitude, 0.0)) * exp(-0.5 * coreRatio * coreRatio);
    float gpeLaplacian = gpeAmplitude * (coreRatio * coreRatio - 3.0) / (max(uCoreRadius, 0.05) * max(uCoreRadius, 0.05));
    float gpeResponse = gpeAmplitude
      - uCompressibility * gpeAmplitude * gpeAmplitude * gpeAmplitude
      - uQuantumPressure * gpeLaplacian;
    if (model < 4.5) return vec4(grAcceleration + gpeResponse, tangent, gpeResponse, 0.0);
    float gaussianWeight = exp(-(safeRadius * safeRadius) / (2.0 * max(uTensorGaussianWaist, 0.1) * max(uTensorGaussianWaist, 0.1)));
    if (model < 5.5) return vec4(grAcceleration + gpeResponse * gaussianWeight, tangent, gpeResponse, gaussianWeight);
    float beta = clamp(speed / max(uSpeedLimit, 0.1), 0.0, 0.9999);
    float lorentzFactor = inversesqrt(1.0 - beta * beta);
    float strainRate = speed / safeRadius;
    float viscosity = uBaseViscosity * (1.0 + uDilatancy * ((lorentzFactor - 1.0) + strainRate));
    float mobility = 1.0 / (1.0 + viscosity);
    if (model < 6.5) return vec4((grAcceleration + gpeResponse) * mobility, tangent * mobility, viscosity, 0.0);
    if (model < 7.5) {
      float ddfSplatScale = 1.0 - (1.0 - mobility) * gaussianWeight;
      float ddfSplatWeight = gaussianWeight * (0.25 + 0.75 * mobility);
      return vec4((grAcceleration + gpeResponse) * ddfSplatScale, tangent * ddfSplatScale, viscosity, ddfSplatWeight);
    }
    float geometryWeight = clamp(uGrassmannianPoleWeight, 0.0, 1.0);
    float geometryCorrection = clamp(uGeometryCoupling, 0.0, 0.25) * geometryWeight * gaussianWeight;
    return vec4(-inverseSquare * (1.0 + geometryCorrection), tangent * (1.0 + geometryCorrection), 0.0, gaussianWeight * geometryWeight);
  }
`;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
const vectorEnergy = (vector = {}) => (Number(vector.x) || 0) ** 2 + (Number(vector.y) || 0) ** 2 + (Number(vector.z) || 0) ** 2;
const dot = (left = {}, right = {}) => (Number(left.x) || 0) * (Number(right.x) || 0) + (Number(left.y) || 0) * (Number(right.y) || 0) + (Number(left.z) || 0) * (Number(right.z) || 0);

export function calculateZoomCoupledFieldExtent(boundHalfExtent, cameraZoom, enabled = false) {
  const extent = Math.max(0, Number.isFinite(Number(boundHalfExtent)) ? Number(boundHalfExtent) : 0);
  const zoom = clamp(Number(cameraZoom), 0.1, 10);
  return extent * (enabled ? zoom : 1);
}

export function calculateDdfMobility({ radiusM = 1, speedMS = 0, coreRadiusM = 0.8, speedLimitMS = 8, dilatancy = 1, baseViscosity = 0.02 } = {}) {
  const radius = Math.max(0.05, Number.isFinite(Number(radiusM)) ? Number(radiusM) : 1);
  const speed = Math.max(0, Number.isFinite(Number(speedMS)) ? Number(speedMS) : 0);
  const coreRadius = clamp(coreRadiusM, 0.05, 20);
  const speedLimit = Math.max(0.1, Number(speedLimitMS) || 0.1);
  const beta = clamp(speed / speedLimit, 0, 0.9999);
  const lorentzFactor = 1 / Math.sqrt(1 - beta * beta);
  const strainRate = speed / radius;
  const viscosity = Math.max(0, baseViscosity) * (1 + Math.max(0, dilatancy) * ((lorentzFactor - 1) + strainRate));
  return 1 / (1 + viscosity);
}

export function calculateMaxwellStressTensor(electric = {}, magnetic = {}) {
  const electricEnergy = vectorEnergy(electric);
  const magneticEnergy = vectorEnergy(magnetic);
  const energyDensity = 0.5 * (electricEnergy + magneticEnergy);
  const tensor = [
    electric.x * electric.x + magnetic.x * magnetic.x - energyDensity,
    electric.x * electric.y + magnetic.x * magnetic.y,
    electric.x * electric.z + magnetic.x * magnetic.z,
    electric.y * electric.x + magnetic.y * magnetic.x,
    electric.y * electric.y + magnetic.y * magnetic.y - energyDensity,
    electric.y * electric.z + magnetic.y * magnetic.z,
    electric.z * electric.x + magnetic.z * magnetic.x,
    electric.z * electric.y + magnetic.z * magnetic.y,
    electric.z * electric.z + magnetic.z * magnetic.z - energyDensity
  ];
  return { electricEnergy, magneticEnergy, energyDensity, tensor, trace: tensor[0] + tensor[4] + tensor[8] };
}

export function normalizeTensorGaussian(electricEnergy, gaussianWeight) {
  return clamp(Math.min(1, Math.max(0, Number(electricEnergy) || 0)) * clamp(gaussianWeight, 0, 1), 0, 1);
}

export function calculateTensorGaussianWeight(radius, waist) {
  const boundedRadius = Math.max(0, Number.isFinite(radius) ? radius : 0);
  const boundedWaist = Math.max(1e-6, Number.isFinite(waist) ? waist : 1);
  return Math.exp(-0.5 * (boundedRadius / boundedWaist) ** 2);
}

export function evaluateMechanicsResponse({
  regime = 'classical',
  gaussianWeight = 0,
  ddfMobility = 1,
  grassmannianWeight = 1,
  geometryCoupling = 0,
  geometryCouplingMax = 0.25
} = {}) {
  const normalizedGaussian = clamp(gaussianWeight, 0, 1);
  if (regime === 'sqg-tensor-gaussian') {
    return {
      regime,
      gaussianWeight: normalizedGaussian,
      splatWeight: normalizedGaussian,
      accelerationScale: 1,
      status: 'SQG retains the GR baseline and localizes its GPE response with a normalized tensor-Gaussian window.'
    };
  }
  if (regime === 'ddf-tensor-gaussian') {
    const mobility = clamp(ddfMobility, 0, 1);
    return {
      regime,
      gaussianWeight: normalizedGaussian,
      splatWeight: clamp(normalizedGaussian * (0.25 + 0.75 * mobility), 0, 1),
      accelerationScale: 1 - (1 - mobility) * normalizedGaussian,
      status: 'DDF mobility scales the normalized electromagnetic tensor-Gaussian splat; constitutive hypothesis only.'
    };
  }
  if (regime === 'grassmannian-amplituhedron') {
    const geometryWeight = clamp(grassmannianWeight, 0, 1);
    const correction = clamp(geometryCoupling, 0, Math.max(0, geometryCouplingMax)) * geometryWeight * normalizedGaussian;
    return {
      regime,
      gaussianWeight: normalizedGaussian,
      splatWeight: clamp(normalizedGaussian * geometryWeight, 0, 1),
      accelerationScale: 1 + correction,
      geometricCorrection: correction,
      status: 'Positive-Grassmannian / amplituhedron correction is a bounded research hypothesis.'
    };
  }
  return {
    regime: 'classical',
    gaussianWeight: normalizedGaussian,
    splatWeight: normalizedGaussian,
    accelerationScale: 1,
    status: 'Classical mechanics / Maxwell-energy reference.'
  };
}

export function evaluateGpeResponse(amplitude, laplacian, options = {}) {
  const nonlinearCoupling = clamp(Number.isFinite(options.nonlinearCoupling) ? options.nonlinearCoupling : 0, 0, 10);
  const dispersion = clamp(Number.isFinite(options.dispersion) ? options.dispersion : 0, 0, 10);
  const boundedAmplitude = clamp(Number.isFinite(amplitude) ? amplitude : 0, -1e3, 1e3);
  const boundedLaplacian = clamp(Number.isFinite(laplacian) ? laplacian : 0, -1e3, 1e3);
  return boundedAmplitude
    - nonlinearCoupling * boundedAmplitude ** 3
    - dispersion * boundedLaplacian;
}

export function evaluateSqgGpeResponse({
  generalRelativityAcceleration = 0,
  amplitude = 0,
  laplacian = 0,
  nonlinearCoupling = 0,
  dispersion = 0,
  tensorGaussianWeight = 1
} = {}) {
  const gpeResponse = evaluateGpeResponse(amplitude, laplacian, { nonlinearCoupling, dispersion });
  const gaussianWeight = clamp(tensorGaussianWeight, 0, 1);
  return {
    generalRelativityAcceleration,
    gpeResponse,
    tensorGaussianWeight: gaussianWeight,
    acceleration: generalRelativityAcceleration + gaussianWeight * gpeResponse
  };
}

const vectorDot = (first, second) => first.reduce((sum, value, axis) => sum + value * second[axis], 0);
const vectorMagnitude = (vector) => Math.hypot(...vector);

export function evaluateGeneralRelativityPair(input, configuration = {}) {
  const {
    positionFirst,
    positionSecond,
    velocityFirst = [0, 0, 0],
    velocitySecond = [0, 0, 0],
    massFirst = 1,
    massSecond = 1
  } = input;
  const gravity = Number.isFinite(configuration.gravitationalConstant) ? configuration.gravitationalConstant : 1;
  const softening = Math.max(0, Number.isFinite(configuration.softening) ? configuration.softening : 0.18);
  const speedOfLight = Math.max(1, Number.isFinite(configuration.grSpeedOfLight) ? configuration.grSpeedOfLight : 63241.077);
  const mode = configuration.mode ?? 'general-relativity';
  const gaussianWaist = Math.max(1e-6, Number.isFinite(configuration.grTensorGaussianWaist) ? configuration.grTensorGaussianWaist : 0.75);
  const separation = positionFirst.map((value, axis) => value - positionSecond[axis]);
  const distance = vectorMagnitude(separation);
  if (distance === 0) return { newtonian: [0, 0, 0], generalRelativity: [0, 0, 0], pnCorrection: [0, 0, 0], tensorGaussian: 0, normalizedTensor: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const radius = Math.sqrt(distance * distance + softening * softening);
  const radial = separation.map((value) => value / distance);
  const relativeVelocity = velocityFirst.map((value, axis) => value - velocitySecond[axis]);
  const speedSquared = vectorDot(relativeVelocity, relativeVelocity);
  const radialSpeed = vectorDot(radial, relativeVelocity);
  const firstMassValue = Math.max(Number.MIN_VALUE, Number.isFinite(massFirst) ? massFirst : 1);
  const secondMassValue = Math.max(Number.MIN_VALUE, Number.isFinite(massSecond) ? massSecond : 1);
  const totalMass = firstMassValue + secondMassValue;
  const symmetricMassRatio = firstMassValue * secondMassValue / totalMass ** 2;
  const gravitationalParameter = gravity * totalMass;
  const newtonianScale = -gravitationalParameter / radius ** 2;
  const newtonian = radial.map((component) => component * newtonianScale);
  const cSquared = speedOfLight ** 2;
  const radialPN = (4 + 2 * symmetricMassRatio) * gravitationalParameter / radius
    - (1 + 3 * symmetricMassRatio) * speedSquared
    + 1.5 * symmetricMassRatio * radialSpeed ** 2;
  const pnScale = gravitationalParameter / (cSquared * radius ** 2);
  const pnCorrection = radial.map((component, axis) => pnScale * (
    component * radialPN + (4 - 2 * symmetricMassRatio) * radialSpeed * relativeVelocity[axis]
  ));
  const speed = Math.sqrt(speedSquared);
  const velocityDirection = speed > 0 ? relativeVelocity.map((component) => component / speed) : [0, 0, 0];
  const anisotropy = Math.min(0.5, Math.max(0, speedSquared / cSquared));
  const tensorNormalizer = 1 + anisotropy / 3;
  const normalizedTensor = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => (
    ((row === column ? 1 : 0) + anisotropy * velocityDirection[row] * velocityDirection[column]) / tensorNormalizer
  )));
  const tensorCorrection = normalizedTensor.map((row) => vectorDot(row, pnCorrection));
  const tensorGaussian = mode === 'gr-normed-tensor-gaussian'
    ? calculateTensorGaussianWeight(radius, gaussianWaist)
    : 1;
  const selectedCorrection = (mode === 'gr-normed-tensor-gaussian' ? tensorCorrection : pnCorrection)
    .map((component) => component * tensorGaussian);
  return {
    newtonian,
    generalRelativity: newtonian.map((component, axis) => component + selectedCorrection[axis]),
    pnCorrection: selectedCorrection,
    tensorGaussian,
    normalizedTensor
  };
}

export function evaluateRadialGeneralRelativity({ radius, speed = 0, magnitude = 1, grSpeedOfLight = 20 } = {}) {
  const boundedRadius = Math.max(1e-6, Number.isFinite(radius) ? radius : 1);
  const boundedMagnitude = Math.max(0, Number.isFinite(magnitude) ? magnitude : 1);
  const pair = evaluateGeneralRelativityPair({
    positionFirst: [boundedRadius, 0, 0],
    positionSecond: [0, 0, 0],
    velocityFirst: [0, Number.isFinite(speed) ? speed : 0, 0],
    velocitySecond: [0, 0, 0],
    massFirst: boundedMagnitude,
    massSecond: 0
  }, { mode: 'general-relativity', gravitationalConstant: 1, grSpeedOfLight, softening: 0 });
  return pair.generalRelativity[0];
}

export function calculateMaxwellTensorGaussian(electric, magnetic, gaussianWeight) {
  const maxwell = calculateMaxwellStressTensor(electric, magnetic);
  return { ...maxwell, tensorGaussian: normalizeTensorGaussian(maxwell.electricEnergy, gaussianWeight) };
}