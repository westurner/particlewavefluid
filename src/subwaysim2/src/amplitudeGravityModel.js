export const AMPLITUDE_GRAVITY_MODES = [
  { value: 'newtonian', label: 'Newtonian reference' },
  { value: 'spin2-tree', label: 'Spin-2 EFT tree proxy' },
  { value: 'gravituhedron', label: 'Gravituhedron hypothesis' }
];

export const DEFAULT_AMPLITUDE_GRAVITY = Object.freeze({
  mode: 'spin2-tree',
  cellGaps: [0.8, 1.1, 0.9],
  fourthColumnWeight: 1,
  coupling: 0.35,
  correctionRange: 4,
  softening: 0.18,
  gravitationalConstant: 1,
  showDifference: false
});

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

export function sanitizeAmplitudeGravity(value = {}) {
  const gaps = Array.isArray(value.cellGaps) ? value.cellGaps : DEFAULT_AMPLITUDE_GRAVITY.cellGaps;
  return {
    mode: MODE_IDS.has(value.mode) ? value.mode : DEFAULT_AMPLITUDE_GRAVITY.mode,
    cellGaps: [0, 1, 2].map((index) => positive(gaps[index], DEFAULT_AMPLITUDE_GRAVITY.cellGaps[index])),
    fourthColumnWeight: positive(value.fourthColumnWeight, DEFAULT_AMPLITUDE_GRAVITY.fourthColumnWeight),
    coupling: clamp(finiteOr(value.coupling, DEFAULT_AMPLITUDE_GRAVITY.coupling), 0, 4),
    correctionRange: positive(value.correctionRange, DEFAULT_AMPLITUDE_GRAVITY.correctionRange),
    softening: clamp(finiteOr(value.softening, DEFAULT_AMPLITUDE_GRAVITY.softening), 0.001, 10),
    gravitationalConstant: clamp(finiteOr(value.gravitationalConstant, DEFAULT_AMPLITUDE_GRAVITY.gravitationalConstant), 0, 100),
    showDifference: Boolean(value.showDifference)
  };
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

export function evaluateAmplitudeChannels({ distance, massProduct = 1, chargeProduct = 0 }, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const cell = createPositiveGrassmannianCell(settings);
  const radius = Math.sqrt(distance * distance + settings.softening * settings.softening);
  const momentumTransferSquared = 1 / (radius * radius);
  const photonExchange = chargeProduct * momentumTransferSquared;
  const spin2Tree = settings.gravitationalConstant * massProduct * momentumTransferSquared;
  const geometricCorrection = settings.coupling * cell.canonicalPoleWeight
    * Math.exp(-radius / settings.correctionRange);
  const selectedKernel = settings.mode === 'newtonian'
    ? spin2Tree
    : settings.mode === 'spin2-tree'
      ? spin2Tree * (1 + settings.coupling / radius)
      : spin2Tree * (1 + geometricCorrection);
  return {
    cell,
    radius,
    momentumTransferSquared,
    photonExchange,
    spin2Tree,
    selectedKernel,
    geometricCorrection,
    relativeDifference: spin2Tree === 0 ? 0 : Math.abs(selectedKernel - spin2Tree) / Math.abs(spin2Tree)
  };
}

export function evaluateNBodyAmplitudeGravity(bodies, configuration = DEFAULT_AMPLITUDE_GRAVITY) {
  const settings = sanitizeAmplitudeGravity(configuration);
  const accelerations = bodies.map(() => [0, 0, 0]);
  let potential = 0;
  let photonDiagnostic = 0;
  let maximumDifference = 0;

  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      const offset = [0, 1, 2].map((axis) => bodies[second].position[axis] - bodies[first].position[axis]);
      const distance = Math.hypot(...offset);
      if (distance === 0) continue;
      const firstMass = positive(bodies[first].mass, 1);
      const secondMass = positive(bodies[second].mass, 1);
      const channels = evaluateAmplitudeChannels({
        distance,
        massProduct: firstMass * secondMass,
        chargeProduct: finiteOr(bodies[first].charge, 0) * finiteOr(bodies[second].charge, 0)
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
    (sum, body, index) => sum + positive(body.mass, 1) * accelerations[index][axis],
    0
  ));
  return { accelerations, potential, photonDiagnostic, maximumDifference, forceResidual };
}