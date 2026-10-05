export const SIMULATION_MECHANICS_REGIMES = [
  { value: 'classical', label: 'Classical / Maxwell baseline' },
  { value: 'ddf-tensor-gaussian', label: 'DDF / normed tensor-Gaussian' },
  { value: 'grassmannian-amplituhedron', label: 'Gr(2,4) / amplituhedron acceleration' }
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
const vectorEnergy = (vector = {}) => (Number(vector.x) || 0) ** 2 + (Number(vector.y) || 0) ** 2 + (Number(vector.z) || 0) ** 2;
const dot = (left = {}, right = {}) => (Number(left.x) || 0) * (Number(right.x) || 0) + (Number(left.y) || 0) * (Number(right.y) || 0) + (Number(left.z) || 0) * (Number(right.z) || 0);

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

export function evaluateMechanicsResponse({
  regime = 'classical',
  gaussianWeight = 0,
  ddfMobility = 1,
  grassmannianWeight = 1,
  geometryCoupling = 0,
  geometryCouplingMax = 0.25
} = {}) {
  const normalizedGaussian = clamp(gaussianWeight, 0, 1);
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

export function calculateMaxwellTensorGaussian(electric, magnetic, gaussianWeight) {
  const maxwell = calculateMaxwellStressTensor(electric, magnetic);
  return { ...maxwell, tensorGaussian: normalizeTensorGaussian(maxwell.electricEnergy, gaussianWeight) };
}