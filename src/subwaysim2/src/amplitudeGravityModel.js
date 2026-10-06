import { calculateDdfMobility, evaluateMechanicsResponse } from './lib/simulationMechanics.js';

export const AMPLITUDE_GRAVITY_MODES = [
  { value: 'newtonian', label: 'Newtonian reference' },
  { value: 'general-relativity', label: 'GR (General Relativity)' },
  { value: 'gr-normed-tensor-gaussian', label: 'GR (Normed Tensor Gaussian Splatter)' },
  { value: 'spin2-tree', label: 'Spin-2 EFT tree proxy' },
  { value: 'gravituhedron', label: 'Gravituhedron hypothesis' },
  { value: 'ddf-tensor-gaussian', label: 'DDF / normed tensor-Gaussian' }
];

export const DEFAULT_AMPLITUDE_GRAVITY = Object.freeze({
  mode: 'spin2-tree',
  cellGaps: [0.8, 1.1, 0.9],
  fourthColumnWeight: 1,
  coupling: 0.35,
  correctionRange: 4,
  tensorGaussianWaist: 3,
  ddfStrength: 0.5,
  ddfSpeedLimitMS: 8,
  ddfBaseViscosity: 0.02,
  softening: 0.18,
  gravitationalConstant: 1,
  speedOfLight: 20,
  grSpeedOfLight: 63241.077,
  grTensorGaussianWaist: 0.75,
  showDifference: false,
  showStreamlines: false,
  streamlineLength: 9,
  streamlineColor: '#59dbe0',
  streamlineOpacity: 0.55,
  showAttractorPaths: false,
  attractorPathLength: 6
});

export const AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY = 8;
export const AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS = 40;
export const AMPLITUDE_GRAVITY_PATH_SAMPLE_RATE = 24;
export const AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY = AMPLITUDE_GRAVITY_PATH_SAMPLE_RATE * 12 + 1;
export const AMPLITUDE_GRAVITY_MAX_INTEGRATION_STEP_YEARS = 0.001;

const MODE_IDS = new Set(AMPLITUDE_GRAVITY_MODES.map(({ value }) => value));

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function positive(value, fallback) {
  return Math.max(1e-6, finiteOr(value, fallback));
}

function positiveMass(value, fallback = 1) {
  return Math.max(Number.MIN_VALUE, finiteOr(value, fallback));
}

export function sanitizeAmplitudeGravity(value = {}) {
  const gaps = Array.isArray(value.cellGaps) ? value.cellGaps : DEFAULT_AMPLITUDE_GRAVITY.cellGaps;
  return {
    mode: MODE_IDS.has(value.mode) ? value.mode : DEFAULT_AMPLITUDE_GRAVITY.mode,
    cellGaps: [0, 1, 2].map((index) => positive(gaps[index], DEFAULT_AMPLITUDE_GRAVITY.cellGaps[index])),
    fourthColumnWeight: positive(value.fourthColumnWeight, DEFAULT_AMPLITUDE_GRAVITY.fourthColumnWeight),
    coupling: clamp(finiteOr(value.coupling, DEFAULT_AMPLITUDE_GRAVITY.coupling), 0, 4),
    correctionRange: positive(value.correctionRange, DEFAULT_AMPLITUDE_GRAVITY.correctionRange),
    tensorGaussianWaist: positive(value.tensorGaussianWaist, DEFAULT_AMPLITUDE_GRAVITY.tensorGaussianWaist),
    ddfStrength: clamp(finiteOr(value.ddfStrength, DEFAULT_AMPLITUDE_GRAVITY.ddfStrength), 0, 20),
    ddfSpeedLimitMS: clamp(finiteOr(value.ddfSpeedLimitMS, DEFAULT_AMPLITUDE_GRAVITY.ddfSpeedLimitMS), 0.1, 1e6),
    ddfBaseViscosity: clamp(finiteOr(value.ddfBaseViscosity, DEFAULT_AMPLITUDE_GRAVITY.ddfBaseViscosity), 0, 1),
    softening: clamp(finiteOr(value.softening, DEFAULT_AMPLITUDE_GRAVITY.softening), 1e-9, 10),
    gravitationalConstant: clamp(finiteOr(value.gravitationalConstant, DEFAULT_AMPLITUDE_GRAVITY.gravitationalConstant), 0, 100),
    speedOfLight: clamp(finiteOr(value.speedOfLight, DEFAULT_AMPLITUDE_GRAVITY.speedOfLight), 1, 1e6),
    grSpeedOfLight: clamp(finiteOr(value.grSpeedOfLight, DEFAULT_AMPLITUDE_GRAVITY.grSpeedOfLight), 1, 1e9),
    grTensorGaussianWaist: positive(value.grTensorGaussianWaist, DEFAULT_AMPLITUDE_GRAVITY.grTensorGaussianWaist),
    showDifference: Boolean(value.showDifference),
    showStreamlines: Boolean(value.showStreamlines),
    streamlineLength: clamp(finiteOr(value.streamlineLength, DEFAULT_AMPLITUDE_GRAVITY.streamlineLength), 1, 24),
    streamlineColor: typeof value.streamlineColor === 'string' && /^#[\da-f]{6}$/i.test(value.streamlineColor)
      ? value.streamlineColor.toLowerCase()
      : DEFAULT_AMPLITUDE_GRAVITY.streamlineColor,
    streamlineOpacity: clamp(finiteOr(value.streamlineOpacity, DEFAULT_AMPLITUDE_GRAVITY.streamlineOpacity), 0, 1),
    showAttractorPaths: Boolean(value.showAttractorPaths),
    attractorPathLength: clamp(finiteOr(value.attractorPathLength, DEFAULT_AMPLITUDE_GRAVITY.attractorPathLength), 1, 12)
  };
}

export function updateAmplitudeGravityStreamlines(target, bodies, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const sourceMasses = bodies.map((body) => positiveMass(body.mass, 1));
  const field = new Float64Array(3);
  const segmentLength = settings.streamlineLength / AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS;
  const softeningSquared = settings.softening * settings.softening;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
    const body = bodies[bodyIndex];
    const seedRadius = Math.max(finiteOr(body.radius, 0.2) * 1.6, 0.42);
    for (let seedIndex = 0; seedIndex < AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY; seedIndex += 1) {
      const vertical = 1 - 2 * (seedIndex + 0.5) / AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY;
      const radial = Math.sqrt(1 - vertical * vertical);
      const angle = seedIndex * goldenAngle + bodyIndex * 0.37;
      let x = body.position[0] + Math.cos(angle) * radial * seedRadius;
      let y = body.position[1] + vertical * seedRadius;
      let z = body.position[2] + Math.sin(angle) * radial * seedRadius;
      const streamlineIndex = bodyIndex * AMPLITUDE_GRAVITY_STREAMLINES_PER_BODY + seedIndex;

      for (let segmentIndex = 0; segmentIndex < AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS; segmentIndex += 1) {
        const outputOffset = (streamlineIndex * AMPLITUDE_GRAVITY_STREAMLINE_SEGMENTS + segmentIndex) * 6;
        target[outputOffset] = x;
        target[outputOffset + 1] = y;
        target[outputOffset + 2] = z;
        field[0] = 0;
        field[1] = 0;
        field[2] = 0;

        for (let sourceIndex = 0; sourceIndex < bodies.length; sourceIndex += 1) {
          const sourcePosition = bodies[sourceIndex].position;
          const dx = sourcePosition[0] - x;
          const dy = sourcePosition[1] - y;
          const dz = sourcePosition[2] - z;
          const distanceSquared = dx * dx + dy * dy + dz * dz;
          if (distanceSquared < 1e-12) continue;
          const distance = Math.sqrt(distanceSquared);
          const kernel = evaluateAmplitudeChannels({ distance, massProduct: sourceMasses[sourceIndex] }, settings).selectedKernel;
          const fieldScale = kernel / distance;
          field[0] += dx * fieldScale;
          field[1] += dy * fieldScale;
          field[2] += dz * fieldScale;
        }

        const fieldMagnitude = Math.hypot(field[0], field[1], field[2]);
        if (fieldMagnitude > 1e-12) {
          x -= field[0] / fieldMagnitude * segmentLength;
          y -= field[1] / fieldMagnitude * segmentLength;
          z -= field[2] / fieldMagnitude * segmentLength;
        }
        target[outputOffset + 3] = x;
        target[outputOffset + 4] = y;
        target[outputOffset + 5] = z;
      }
    }
  }
  return target;
}

export function appendAmplitudeGravityPathSample(history, bodies, nextIndex) {
  const sampleIndex = nextIndex % AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY;
  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
    const outputOffset = (bodyIndex * AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY + sampleIndex) * 3;
    history[outputOffset] = bodies[bodyIndex].position[0];
    history[outputOffset + 1] = bodies[bodyIndex].position[1];
    history[outputOffset + 2] = bodies[bodyIndex].position[2];
  }
  return (sampleIndex + 1) % AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY;
}

export function writeAmplitudeGravityPathSegments(target, history, nextIndex, sampleCount, bodyCount, visiblePointCount) {
  const pointCount = Math.min(sampleCount, visiblePointCount, AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY);
  if (pointCount < 2) return 0;
  const firstSample = (nextIndex - pointCount + AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY) % AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY;
  let outputOffset = 0;

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const historyOffset = bodyIndex * AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY * 3;
    for (let pointIndex = 1; pointIndex < pointCount; pointIndex += 1) {
      const previousSample = (firstSample + pointIndex - 1) % AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY;
      const currentSample = (firstSample + pointIndex) % AMPLITUDE_GRAVITY_PATH_HISTORY_CAPACITY;
      const previousOffset = historyOffset + previousSample * 3;
      const currentOffset = historyOffset + currentSample * 3;
      target[outputOffset] = history[previousOffset];
      target[outputOffset + 1] = history[previousOffset + 1];
      target[outputOffset + 2] = history[previousOffset + 2];
      target[outputOffset + 3] = history[currentOffset];
      target[outputOffset + 4] = history[currentOffset + 1];
      target[outputOffset + 5] = history[currentOffset + 2];
      outputOffset += 6;
    }
  }
  return outputOffset / 3;
}

export function createPositiveGrassmannianCell(configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const [gapA, gapB, gapC] = settings.cellGaps;
  const parameters = [0, gapA, gapA + gapB, gapA + gapB + gapC];
  const weights = [1, 1, 1, settings.fourthColumnWeight];
  const matrix = [
    weights,
    parameters.map((parameter, index) => parameter * weights[index])
  ];
  const minors = {};
  for (let first = 0; first < 4; first += 1) {
    for (let second = first + 1; second < 4; second += 1) {
      minors[`${first + 1}${second + 1}`] = matrix[0][first] * matrix[1][second]
        - matrix[0][second] * matrix[1][first];
    }
  }
  const values = Object.values(minors);
  const minimumMinor = Math.min(...values);
  const maximumMinor = Math.max(...values);
  const pluckerResidual = minors['12'] * minors['34']
    - minors['13'] * minors['24']
    + minors['14'] * minors['23'];
  const adjacentPole = ['12', '23', '34', '14']
    .reduce((sum, key) => sum + 1 / Math.max(minors[key], 1e-9), 0);
  return {
    matrix,
    minors,
    positive: minimumMinor > 0,
    pluckerResidual,
    boundaryProximity: minimumMinor / Math.max(maximumMinor, 1e-9),
    canonicalPoleWeight: adjacentPole / (1 + adjacentPole)
  };
}

export function evaluateAmplitudeChannels({ distance, massProduct = 1, chargeProduct = 0, speedMS = 0 }, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const cell = createPositiveGrassmannianCell(settings);
  const radius = Math.sqrt(distance * distance + settings.softening * settings.softening);
  const momentumTransferSquared = 1 / (radius * radius);
  const photonExchange = chargeProduct * momentumTransferSquared;
  const spin2Tree = settings.gravitationalConstant * massProduct * momentumTransferSquared;
  const gaussianWeight = settings.mode === 'ddf-tensor-gaussian'
    ? Math.exp(-(radius * radius) / (2 * settings.tensorGaussianWaist ** 2))
    : Math.exp(-radius / settings.correctionRange);
  const ddfMobility = settings.mode === 'ddf-tensor-gaussian'
    ? calculateDdfMobility({ radiusM: radius, speedMS, coreRadiusM: settings.softening, speedLimitMS: settings.ddfSpeedLimitMS, dilatancy: settings.ddfStrength, baseViscosity: settings.ddfBaseViscosity })
    : 1;
  const ddfResponse = settings.mode === 'ddf-tensor-gaussian'
    ? evaluateMechanicsResponse({ regime: 'ddf-tensor-gaussian', gaussianWeight, ddfMobility })
    : null;
  const geometricResponse = settings.mode === 'gravituhedron'
    ? evaluateMechanicsResponse({ regime: 'grassmannian-amplituhedron', gaussianWeight, grassmannianWeight: cell.canonicalPoleWeight, geometryCoupling: settings.coupling, geometryCouplingMax: 4 })
    : null;
  const geometricCorrection = geometricResponse ? geometricResponse.accelerationScale - 1 : 0;
  const selectedKernel = settings.mode === 'newtonian'
    ? spin2Tree
    : settings.mode === 'spin2-tree'
      ? spin2Tree * (1 + settings.coupling / radius)
      : settings.mode === 'ddf-tensor-gaussian'
        ? spin2Tree * ddfResponse.accelerationScale
        : spin2Tree * (1 + geometricCorrection);
  return {
    cell,
    radius,
    momentumTransferSquared,
    photonExchange,
    spin2Tree,
    selectedKernel,
    geometricCorrection,
    ddfMobility,
    tensorGaussian: ddfResponse?.splatWeight ?? geometricResponse?.splatWeight ?? 0,
    relativeDifference: spin2Tree === 0 ? 0 : Math.abs(selectedKernel - spin2Tree) / Math.abs(spin2Tree)
  };
}

export function evaluateNBodyAmplitudeGravity(bodies, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  if (settings.mode === 'general-relativity' || settings.mode === 'gr-normed-tensor-gaussian') {
    return evaluateGeneralRelativityNBody(bodies, settings);
  }
  const accelerations = bodies.map(() => [0, 0, 0]);
  let potential = 0;
  let photonDiagnostic = 0;
  let maximumDifference = 0;

  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      const offset = [0, 1, 2].map((axis) => bodies[second].position[axis] - bodies[first].position[axis]);
      const distance = Math.hypot(...offset);
      if (distance === 0) continue;
      const firstMass = positiveMass(bodies[first].mass, 1);
      const secondMass = positiveMass(bodies[second].mass, 1);
      const firstVelocity = bodies[first].velocity ?? [0, 0, 0];
      const secondVelocity = bodies[second].velocity ?? [0, 0, 0];
      const channels = evaluateAmplitudeChannels({
        distance,
        massProduct: firstMass * secondMass,
        chargeProduct: finiteOr(bodies[first].charge, 0) * finiteOr(bodies[second].charge, 0),
        speedMS: Math.hypot(...secondVelocity.map((value, axis) => value - (firstVelocity[axis] ?? 0)))
      }, settings);
      const direction = offset.map((component) => component / distance);
      const forceMagnitude = channels.selectedKernel;
      for (let axis = 0; axis < 3; axis += 1) {
        const force = direction[axis] * forceMagnitude;
        accelerations[first][axis] += force / firstMass;
        accelerations[second][axis] -= force / secondMass;
      }
      potential -= forceMagnitude * channels.radius;
      photonDiagnostic += channels.photonExchange;
      maximumDifference = Math.max(maximumDifference, channels.relativeDifference);
    }
  }

  const forceResidual = [0, 1, 2].map((axis) => bodies.reduce(
    (sum, body, index) => sum + positiveMass(body.mass, 1) * accelerations[index][axis],
    0
  ));
  return { accelerations, potential, photonDiagnostic, maximumDifference, forceResidual };
}

export function integrateNBodyVelocityVerlet(bodies, elapsedYears, configuration = DEFAULT_AMPLITUDE_GRAVITY, {
  fixedBodyIndices = new Set(),
  initialAccelerations = null,
  afterDrift = () => {},
  maximumStepYears = AMPLITUDE_GRAVITY_MAX_INTEGRATION_STEP_YEARS
} = {}) {
  if (!Number.isFinite(elapsedYears) || elapsedYears === 0 || bodies.length === 0) return { substeps: 0 };
  const stepCount = Math.max(1, Math.ceil(Math.abs(elapsedYears) / positive(maximumStepYears, AMPLITUDE_GRAVITY_MAX_INTEGRATION_STEP_YEARS)));
  const step = elapsedYears / stepCount;
  let accelerations = initialAccelerations?.length === bodies.length
    ? initialAccelerations
    : evaluateNBodyAmplitudeGravity(bodies, configuration).accelerations;

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    bodies.forEach((body, bodyIndex) => {
      if (fixedBodyIndices.has(bodyIndex)) return;
      for (let axis = 0; axis < 3; axis += 1) {
        body.velocity[axis] += 0.5 * accelerations[bodyIndex][axis] * step;
        body.position[axis] += body.velocity[axis] * step;
      }
    });
    afterDrift(step * (stepIndex + 1), stepIndex);
    const nextAccelerations = evaluateNBodyAmplitudeGravity(bodies, configuration).accelerations;
    bodies.forEach((body, bodyIndex) => {
      if (fixedBodyIndices.has(bodyIndex)) return;
      for (let axis = 0; axis < 3; axis += 1) body.velocity[axis] += 0.5 * nextAccelerations[bodyIndex][axis] * step;
    });
    accelerations = nextAccelerations;
  }
  return { substeps: stepCount, accelerations };
}

function vectorDot(first, second) {
  return first.reduce((sum, value, axis) => sum + value * second[axis], 0);
}

function vectorMagnitude(vector) {
  return Math.hypot(...vector);
}

export function evaluateGeneralRelativityPair({
  positionFirst,
  positionSecond,
  velocityFirst = [0, 0, 0],
  velocitySecond = [0, 0, 0],
  massFirst = 1,
  massSecond = 1
}, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const separation = positionFirst.map((value, axis) => value - positionSecond[axis]);
  const distance = vectorMagnitude(separation);
  if (distance === 0) return { newtonian: [0, 0, 0], generalRelativity: [0, 0, 0], pnCorrection: [0, 0, 0], tensorGaussian: 0, normalizedTensor: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const radius = Math.sqrt(distance * distance + settings.softening * settings.softening);
  const radial = separation.map((value) => value / distance);
  const relativeVelocity = velocityFirst.map((value, axis) => value - velocitySecond[axis]);
  const speedSquared = vectorDot(relativeVelocity, relativeVelocity);
  const radialSpeed = vectorDot(radial, relativeVelocity);
  const firstMassValue = positiveMass(massFirst, 1);
  const secondMassValue = positiveMass(massSecond, 1);
  const totalMass = firstMassValue + secondMassValue;
  const symmetricMassRatio = firstMassValue * secondMassValue / totalMass ** 2;
  const gravitationalParameter = settings.gravitationalConstant * totalMass;
  const newtonianScale = -gravitationalParameter / radius ** 2;
  const newtonian = radial.map((component) => component * newtonianScale);
  const cSquared = settings.grSpeedOfLight ** 2;
  const radialPN = (4 + 2 * symmetricMassRatio) * gravitationalParameter / radius
    - (1 + 3 * symmetricMassRatio) * speedSquared
    + 1.5 * symmetricMassRatio * radialSpeed ** 2;
  const pnScale = gravitationalParameter / (cSquared * radius ** 2);
  const pnCorrection = radial.map((component, axis) => pnScale * (
    component * radialPN + (4 - 2 * symmetricMassRatio) * radialSpeed * relativeVelocity[axis]
  ));

  const speed = Math.sqrt(speedSquared);
  const velocityDirection = speed > 0 ? relativeVelocity.map((component) => component / speed) : [0, 0, 0];
  const anisotropy = clamp(speedSquared / cSquared, 0, 0.5);
  const tensorNormalizer = 1 + anisotropy / 3;
  const normalizedTensor = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => (
    ((row === column ? 1 : 0) + anisotropy * velocityDirection[row] * velocityDirection[column]) / tensorNormalizer
  )));
  const tensorCorrection = normalizedTensor.map((row) => vectorDot(row, pnCorrection));
  const tensorGaussian = settings.mode === 'gr-normed-tensor-gaussian'
    ? Math.exp(-0.5 * (radius / settings.grTensorGaussianWaist) ** 2)
    : 1;
  const selectedCorrection = (settings.mode === 'gr-normed-tensor-gaussian' ? tensorCorrection : pnCorrection)
    .map((component) => component * tensorGaussian);

  return {
    newtonian,
    generalRelativity: newtonian.map((component, axis) => component + selectedCorrection[axis]),
    pnCorrection: selectedCorrection,
    tensorGaussian,
    normalizedTensor
  };
}

function evaluateGeneralRelativityNBody(bodies, settings) {
  const accelerations = bodies.map(() => [0, 0, 0]);
  let potential = 0;
  let maximumDifference = 0;
  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      const firstMass = positiveMass(bodies[first].mass, 1);
      const secondMass = positiveMass(bodies[second].mass, 1);
      const pair = evaluateGeneralRelativityPair({
        positionFirst: bodies[first].position,
        positionSecond: bodies[second].position,
        velocityFirst: bodies[first].velocity,
        velocitySecond: bodies[second].velocity,
        massFirst: firstMass,
        massSecond: secondMass
      }, settings);
      const totalMass = firstMass + secondMass;
      for (let axis = 0; axis < 3; axis += 1) {
        accelerations[first][axis] += pair.generalRelativity[axis] * secondMass / totalMass;
        accelerations[second][axis] -= pair.generalRelativity[axis] * firstMass / totalMass;
      }
      const newtonianMagnitude = Math.max(vectorMagnitude(pair.newtonian), 1e-30);
      maximumDifference = Math.max(maximumDifference, vectorMagnitude(pair.pnCorrection) / newtonianMagnitude);
      const distance = vectorMagnitude(bodies[first].position.map((value, axis) => value - bodies[second].position[axis]));
      potential -= settings.gravitationalConstant * firstMass * secondMass / Math.sqrt(distance ** 2 + settings.softening ** 2);
    }
  }
  const forceResidual = [0, 1, 2].map((axis) => bodies.reduce(
    (sum, body, index) => sum + positiveMass(body.mass, 1) * accelerations[index][axis],
    0
  ));
  return { accelerations, potential, photonDiagnostic: 0, maximumDifference, forceResidual };
}

export function calculateSystemInvariants(bodies, potential = 0) {
  const momentum = [0, 0, 0];
  const angularMomentum = [0, 0, 0];
  let kinetic = 0;
  bodies.forEach((body) => {
    const mass = positiveMass(body.mass, 1);
    const velocity = body.velocity ?? [0, 0, 0];
    const position = body.position ?? [0, 0, 0];
    kinetic += 0.5 * mass * velocity.reduce((sum, component) => sum + component * component, 0);
    for (let axis = 0; axis < 3; axis += 1) momentum[axis] += mass * velocity[axis];
    angularMomentum[0] += mass * (position[1] * velocity[2] - position[2] * velocity[1]);
    angularMomentum[1] += mass * (position[2] * velocity[0] - position[0] * velocity[2]);
    angularMomentum[2] += mass * (position[0] * velocity[1] - position[1] * velocity[0]);
  });
  return { momentum, angularMomentum, kinetic, potential, totalEnergy: kinetic + potential };
}

export function compareSystemInvariants(current, baseline) {
  const relative = (value, reference) => (value - reference) / Math.max(Math.abs(reference), 1e-12);
  const vectorDifference = (first, second) => Math.hypot(...first.map((value, index) => value - second[index]));
  return {
    energyDrift: relative(current.totalEnergy, baseline.totalEnergy),
    momentumResidual: vectorDifference(current.momentum, baseline.momentum),
    angularMomentumResidual: vectorDifference(current.angularMomentum, baseline.angularMomentum)
  };
}

export function calculateWeakFieldObservables(input = {}, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const centralMass = positive(input.centralMass, 1);
  const semiMajorAxis = positive(input.semiMajorAxis, 1);
  const eccentricity = clamp(finiteOr(input.eccentricity, 0), 0, 0.999);
  const impactParameter = positive(input.impactParameter, semiMajorAxis);
  const asymptoticSpeed = clamp(finiteOr(input.asymptoticSpeed, 1), 1e-6, settings.speedOfLight * 0.999);
  const cSquared = settings.speedOfLight ** 2;
  const periapsisAdvanceRadians = 6 * Math.PI * settings.gravitationalConstant * centralMass
    / (semiMajorAxis * (1 - eccentricity ** 2) * cSquared);
  const scatteringAngleRadians = 2 * settings.gravitationalConstant * centralMass
    / (impactParameter * asymptoticSpeed ** 2)
    * (1 + asymptoticSpeed ** 2 / cSquared);
  return {
    periapsisAdvanceRadians,
    scatteringAngleRadians,
    sources: {
      periapsis: 'Standard 1PN Schwarzschild test-particle periapsis advance: 6πGM/[a(1-e²)c²].',
      scattering: 'Leading weak-field 1PM massive test-particle scattering estimate; displayed as an analytic observable, not an N-body force term.'
    }
  };
}