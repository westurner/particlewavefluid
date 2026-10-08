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
  sqg: Object.freeze({ label: 'SQG / GR + GPE', base: 'general-relativity', correction: 'GPE plus bounded phase/vorticity spin response' }),
  'sqg-tensor-gaussian': Object.freeze({ label: 'SQG / normed tensor-Gaussian splat', base: 'sqg', correction: 'normalized Gaussian GPE and spin-phase response' }),
  ddf: Object.freeze({ label: 'DDF', base: 'sqg', correction: 'mobility scales the complete SQG response' }),
  'ddf-tensor-gaussian': Object.freeze({ label: 'DDF / normed tensor-Gaussian splat', base: 'ddf', correction: 'Gaussian-localized mobility on the complete SQG response' })
});

export const ROTATIONAL_GRAVITY_REFERENCES = Object.freeze({
  postNewtonianSpin: 'https://doi.org/10.1103/PhysRevD.52.821',
  planetaryHarmonics: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/'
});

export const SIMPLE_ATTRACTOR_GRAVITY_FIELD_GLSL = `
  vec4 fieldResponse(float model, float radius, vec3 particleVelocity, float magnitude, float rotation, vec3 radialDirection, vec3 spinAxis) {
    float safeRadius = max(radius, 0.05);
    float speed = length(particleVelocity);
    float axisMagnitude = length(spinAxis);
    vec3 axis = axisMagnitude > 0.00000001 ? spinAxis / axisMagnitude : vec3(0.0, 1.0, 0.0);
    float phaseAlignment = dot(axis, particleVelocity) / (1.0 + speed);
    vec3 phaseVorticity = 2.0 * rotation * axis;
    float vorticityAlignment = dot(axis, phaseVorticity) / (1.0 + length(phaseVorticity));
    float spinPhaseResponse = clamp(uSpinPhaseCoupling, 0.0, 2.0) * (phaseAlignment + vorticityAlignment);
    float inverseSquare = magnitude / (safeRadius * safeRadius);
    float tangent = rotation * magnitude / safeRadius;
    if (model < 0.5) return vec4(-inverseSquare, tangent, 0.0, 0.0);
    if (model < 1.5) return vec4(-inverseSquare, 0.0, 0.0, 0.0);
    float coreRatio = safeRadius / max(uCoreRadius, 0.05);
    float sink = inverseSquare * (1.0 + uCompressibility / (1.0 + coreRatio));
    if (model < 2.5) return vec4(-sink, tangent, uBaseViscosity, 0.0);
    if (model < 3.5) return vec4(-inverseSquare, tangent, uBaseViscosity, 0.0);
    float grCorrection = inverseSquare
      * (4.0 * GRAVITY_CONSTANT * magnitude / safeRadius - speed * speed)
      / (max(uGravitySpeedOfLight, 1.0) * max(uGravitySpeedOfLight, 1.0));
    float grAcceleration = -inverseSquare + grCorrection;
    float boundedMagnitude = max(magnitude, 0.0) / (1.0 + max(magnitude, 0.0));
    float gpeAmplitude = sqrt(boundedMagnitude) * exp(-0.5 * coreRatio * coreRatio);
    float gpeLaplacian = gpeAmplitude * (coreRatio * coreRatio - 3.0) / (max(uCoreRadius, 0.05) * max(uCoreRadius, 0.05));
    float gpeResponse = gpeAmplitude
      - uCompressibility * gpeAmplitude * gpeAmplitude * gpeAmplitude
      - uQuantumPressure * gpeLaplacian;
    float sqgCorrection = inverseSquare * clamp(gpeResponse + spinPhaseResponse, -0.5, 0.5);
    if (model < 4.5) return vec4(grAcceleration + sqgCorrection, tangent, gpeResponse, 0.0);
    float gaussianWeight = exp(-(safeRadius * safeRadius) / (2.0 * max(uTensorGaussianWaist, 0.1) * max(uTensorGaussianWaist, 0.1)));
    if (model < 5.5) return vec4(grAcceleration + sqgCorrection * gaussianWeight, tangent, gpeResponse, gaussianWeight);
    float beta = clamp(speed / max(uSpeedLimit, 0.1), 0.0, 0.9999);
    float lorentzFactor = inversesqrt(1.0 - beta * beta);
    float strainRate = speed / safeRadius;
    float viscosity = uBaseViscosity * (1.0 + uDilatancy * ((lorentzFactor - 1.0) + strainRate));
    float mobility = 1.0 / (1.0 + viscosity);
    if (model < 6.5) return vec4((grAcceleration + sqgCorrection) * mobility, tangent * mobility, viscosity, 0.0);
    if (model < 7.5) {
      float ddfSplatScale = 1.0 - (1.0 - mobility) * gaussianWeight;
      float ddfSplatWeight = gaussianWeight * (0.25 + 0.75 * mobility);
      return vec4((grAcceleration + sqgCorrection) * ddfSplatScale, tangent * ddfSplatScale, viscosity, ddfSplatWeight);
    }
    float geometryWeight = clamp(uGrassmannianPoleWeight, 0.0, 1.0);
    float radialMagnitude = length(radialDirection);
    vec3 radialAxis = radialMagnitude > 0.00000001 ? radialDirection / radialMagnitude : vec3(1.0, 0.0, 0.0);
    float axialProjection = dot(axis, radialAxis);
    float spinAxisTensor = clamp(1.5 * (axialProjection * axialProjection - 0.3333333333), -0.5, 1.0);
    float geometryCorrection = clamp(geometryWeight * gaussianWeight * (
      clamp(uGeometryCoupling, 0.0, 0.25)
      + clamp(uSpinAxisCoupling, 0.0, 0.25) * spinAxisTensor
    ), -0.25, 0.25);
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
  geometryCouplingMax = 0.25,
  spinAxis = [0, 1, 0],
  radialDirection = [1, 0, 0],
  spinAxisCoupling = 0
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
      status: 'DDF mobility scales the complete SQG response through a normalized Gaussian window; constitutive hypothesis only.'
    };
  }
  if (regime === 'grassmannian-amplituhedron') {
    const geometryWeight = clamp(grassmannianWeight, 0, 1);
    const axisTensor = evaluateSpinAxisTensorResponse({ spinAxis, radialDirection });
    const baseCorrection = clamp(geometryCoupling, 0, Math.max(0, geometryCouplingMax)) * geometryWeight * normalizedGaussian;
    const correction = clamp(
      baseCorrection + clamp(spinAxisCoupling, 0, 0.25) * geometryWeight * normalizedGaussian * axisTensor,
      -0.25,
      Math.max(0, geometryCouplingMax)
    );
    const axisCorrection = correction - baseCorrection;
    return {
      regime,
      gaussianWeight: normalizedGaussian,
      splatWeight: clamp(normalizedGaussian * geometryWeight, 0, 1),
      accelerationScale: 1 + correction,
      geometricCorrection: correction,
      axisTensor,
      spinAxisCorrection: axisCorrection,
      status: 'Exploratory Gr(2,4) correction with a bounded spin-axis quadrupole contraction; it is not derived from amplituhedron theory.'
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

export function evaluateSpinPhaseResponse({ phaseGradient = [0, 0, 0], phaseVorticity = [0, 0, 0], spinAxis = [0, 1, 0], coupling = 0 } = {}) {
  const axisMagnitude = vectorMagnitude(spinAxis);
  const axis = axisMagnitude > 1e-15 ? spinAxis.map((value) => value / axisMagnitude) : [0, 1, 0];
  const phaseGradientMagnitude = vectorMagnitude(phaseGradient);
  const phaseVorticityMagnitude = vectorMagnitude(phaseVorticity);
  const phaseAlignment = vectorDot(axis, phaseGradient) / (1 + phaseGradientMagnitude);
  const vorticityAlignment = vectorDot(axis, phaseVorticity) / (1 + phaseVorticityMagnitude);
  return {
    phaseAlignment,
    vorticityAlignment,
    response: clamp(coupling, 0, 2) * (phaseAlignment + vorticityAlignment)
  };
}

export function evaluateSpinAxisTensorResponse({ spinAxis = [0, 1, 0], radialDirection = [1, 0, 0] } = {}) {
  const axisMagnitude = vectorMagnitude(spinAxis);
  const radialMagnitude = vectorMagnitude(radialDirection);
  const axis = axisMagnitude > 1e-15 ? spinAxis.map((value) => value / axisMagnitude) : [0, 1, 0];
  const radial = radialMagnitude > 1e-15 ? radialDirection.map((value) => value / radialMagnitude) : [1, 0, 0];
  const axialProjection = vectorDot(axis, radial);
  return clamp(1.5 * (axialProjection ** 2 - 1 / 3), -0.5, 1);
}

export function evaluateSqgGpeResponse({
  generalRelativityAcceleration = 0,
  amplitude = 0,
  laplacian = 0,
  nonlinearCoupling = 0,
  dispersion = 0,
  tensorGaussianWeight = 1,
  rotationalResponse = 0,
  responseScale = 1,
  maximumResponse = 4
} = {}) {
  const gpeResponse = evaluateGpeResponse(amplitude, laplacian, { nonlinearCoupling, dispersion });
  const gaussianWeight = clamp(tensorGaussianWeight, 0, 1);
  const boundedRotationalResponse = clamp(rotationalResponse, -4, 4);
  const combinedResponse = clamp(gpeResponse + boundedRotationalResponse, -Math.max(0, maximumResponse), Math.max(0, maximumResponse));
  const correction = gaussianWeight * Math.max(0, Number.isFinite(responseScale) ? responseScale : 1) * combinedResponse;
  return {
    generalRelativityAcceleration,
    gpeResponse,
    rotationalResponse: boundedRotationalResponse,
    combinedResponse,
    correction,
    tensorGaussianWeight: gaussianWeight,
    acceleration: generalRelativityAcceleration + correction
  };
}

const vectorDot = (first, second) => first.reduce((sum, value, axis) => sum + value * second[axis], 0);
const vectorMagnitude = (vector) => Math.hypot(...vector);
const vectorCross = (first, second) => [
  first[1] * second[2] - first[2] * second[1],
  first[2] * second[0] - first[0] * second[2],
  first[0] * second[1] - first[1] * second[0]
];
const vectorScale = (vector, scale) => vector.map((component) => component * scale);
const vectorAdd = (first, second) => first.map((component, axis) => component + second[axis]);
const vectorSubtract = (first, second) => first.map((component, axis) => component - second[axis]);

function j2SourceAcceleration(separation, sourceMass, source, gravitationalConstant, softening) {
  const j2 = Number.isFinite(source?.j2) ? source.j2 : 0;
  const equatorialRadius = Number.isFinite(source?.equatorialRadius) ? source.equatorialRadius : 0;
  if (j2 === 0 || equatorialRadius <= 0 || sourceMass <= 0) return [0, 0, 0];
  const distance = vectorMagnitude(separation);
  if (distance <= 0) return [0, 0, 0];
  const softenedDistance = Math.sqrt(distance * distance + softening * softening);
  const radial = vectorScale(separation, 1 / distance);
  const spinAxis = source.spinAxis?.length === 3 ? vectorScale(source.spinAxis, 1 / Math.max(vectorMagnitude(source.spinAxis), 1e-15)) : [0, 0, 1];
  const axialProjection = vectorDot(radial, spinAxis);
  const shape = vectorSubtract(
    vectorScale(radial, 5 * axialProjection * axialProjection - 1),
    vectorScale(spinAxis, 2 * axialProjection)
  );
  const scale = 1.5 * gravitationalConstant * sourceMass * j2 * equatorialRadius ** 2 / softenedDistance ** 4;
  return vectorScale(shape, scale);
}

export function evaluateRotationalGravityPair({
  positionFirst,
  positionSecond,
  velocityFirst = [0, 0, 0],
  velocitySecond = [0, 0, 0],
  massFirst = 1,
  massSecond = 1,
  spinFirst = [0, 0, 0],
  spinSecond = [0, 0, 0],
  bodyFirst = {},
  bodySecond = {}
}, { gravitationalConstant = 1, speedOfLight = 63241.077, softening = 0, includeSpinOrbit = true, includeSpinSpin = true, includeJ2 = true } = {}) {
  const separation = positionFirst.map((value, axis) => value - positionSecond[axis]);
  const distance = vectorMagnitude(separation);
  const zero = [0, 0, 0];
  if (distance <= 0) return { spinOrbit: zero, spinSpin: zero, j2: zero, total: zero };
  const radius = Math.sqrt(distance * distance + Math.max(0, softening) ** 2);
  const direction = vectorScale(separation, 1 / distance);
  const relativeVelocity = velocityFirst.map((value, axis) => value - velocitySecond[axis]);
  const firstMass = Math.max(0, Number.isFinite(massFirst) ? massFirst : 0);
  const secondMass = Math.max(0, Number.isFinite(massSecond) ? massSecond : 0);
  const totalMass = firstMass + secondMass;
  const firstSpin = spinFirst?.length === 3 ? spinFirst : zero;
  const secondSpin = spinSecond?.length === 3 ? spinSecond : zero;
  const totalSpin = vectorAdd(firstSpin, secondSpin);
  const speedOfLightSquared = Math.max(1, speedOfLight) ** 2;
  let spinOrbit = zero;
  let spinSpin = zero;

  if (includeSpinOrbit && totalMass > 0 && (vectorMagnitude(firstSpin) + vectorMagnitude(secondSpin)) > 0) {
    const massDifferenceRatio = (firstMass - secondMass) / totalMass;
    const firstMassSafe = Math.max(firstMass, 1e-30);
    const secondMassSafe = Math.max(secondMass, 1e-30);
    const deltaSpin = vectorScale(vectorSubtract(vectorScale(secondSpin, 1 / secondMassSafe), vectorScale(firstSpin, 1 / firstMassSafe)), totalMass);
    const spinA = vectorAdd(vectorScale(totalSpin, 2), vectorScale(deltaSpin, massDifferenceRatio));
    const spinB = vectorAdd(vectorScale(totalSpin, 7), vectorScale(deltaSpin, 3 * massDifferenceRatio));
    const spinC = vectorAdd(vectorScale(totalSpin, 3), vectorScale(deltaSpin, massDifferenceRatio));
    const radialSpeed = vectorDot(direction, relativeVelocity);
    const orbitalPlaneNormal = vectorCross(direction, relativeVelocity);
    const alongSpin = vectorDot(orbitalPlaneNormal, spinA);
    const numerator = vectorAdd(
      vectorSubtract(vectorScale(direction, 6 * alongSpin), vectorCross(relativeVelocity, spinB)),
      vectorScale(vectorCross(direction, spinC), 3 * radialSpeed)
    );
    spinOrbit = vectorScale(numerator, gravitationalConstant / (speedOfLightSquared * radius ** 3));
  }

  const reducedMass = totalMass > 0 ? firstMass * secondMass / totalMass : 0;
  if (includeSpinSpin && reducedMass > 0 && vectorMagnitude(firstSpin) > 0 && vectorMagnitude(secondSpin) > 0) {
    const firstProjection = vectorDot(direction, firstSpin);
    const secondProjection = vectorDot(direction, secondSpin);
    const spinDot = vectorDot(firstSpin, secondSpin);
    const shape = vectorAdd(
      vectorScale(direction, spinDot - 5 * firstProjection * secondProjection),
      vectorAdd(vectorScale(firstSpin, secondProjection), vectorScale(secondSpin, firstProjection))
    );
    spinSpin = vectorScale(shape, -3 * gravitationalConstant / (speedOfLightSquared * reducedMass * radius ** 4));
  }

  let j2 = zero;
  if (includeJ2) {
    const accelerationOfFirst = j2SourceAcceleration(separation, secondMass, bodySecond, gravitationalConstant, softening);
    const accelerationOfSecond = j2SourceAcceleration(vectorScale(separation, -1), firstMass, bodyFirst, gravitationalConstant, softening);
    const reducedMass = totalMass > 0 ? firstMass * secondMass / totalMass : 0;
    if (reducedMass > 0) {
      const interactionForceOnFirst = vectorSubtract(
        vectorScale(accelerationOfFirst, firstMass),
        vectorScale(accelerationOfSecond, secondMass)
      );
      j2 = vectorScale(interactionForceOnFirst, 1 / reducedMass);
    }
  }

  return { spinOrbit, spinSpin, j2, total: vectorAdd(vectorAdd(spinOrbit, spinSpin), j2) };
}

export function evaluateSpinOrbitAndSpinSpinPair(input, configuration = {}) {
  const result = evaluateRotationalGravityPair(input, { ...configuration, includeJ2: false });
  return { spinOrbit: result.spinOrbit, spinSpin: result.spinSpin, total: vectorAdd(result.spinOrbit, result.spinSpin) };
}

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