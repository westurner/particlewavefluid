import {
  AMPLITUDE_GRAVITY_MODES,
  DEFAULT_AMPLITUDE_GRAVITY,
  evaluateNBodyAmplitudeGravity,
  integrateNBodyVelocityVerlet,
  sanitizeAmplitudeGravity
} from './amplitudeGravityModel.js';
import { createSolarSystemBodies, SOLAR_SYSTEM_SCENE_SCALE } from './solarSystemModel.js';
import jplIntermediateStates from './jplDe441IntermediateStates.json' with { type: 'json' };

export const JPL_DE441_ORBIT_INTERVAL = Object.freeze({
  id: 'jpl-de441-30-day',
  label: 'JPL Horizons DE441 · 30 days',
  startDate: '2026-10-06',
  endDate: '2026-11-05',
  startJulianDateTDB: 2461319.5,
  endJulianDateTDB: 2461349.5,
  intervalDays: 30,
  sampleStepDays: 5,
  center: 'Solar System barycenter',
  frame: 'ICRF / J2000 equatorial',
  units: 'AU and AU/day',
  source: 'https://ssd.jpl.nasa.gov/api/horizons.api',
  ephemeris: 'DE441',
  objectIds: Object.freeze({
    Sun: 10,
    Mercury: 199,
    Venus: 299,
    EarthMoonBarycenter: 3,
    MarsBarycenter: 4,
    JupiterBarycenter: 5,
    SaturnBarycenter: 6,
    UranusBarycenter: 7,
    NeptuneBarycenter: 8
  })
});

const JPL_DE441_BARYCENTRIC_ENDPOINTS = Object.freeze({
  Sun: [[-0.001215141218845277,-0.004742005589960172,-0.00195344038846124,0.000006043438013503497,0.000002385853439450113,8.936682426680764e-7],[-0.001035398701935263,-0.004667026765527432,-0.001925164698955407,0.000005936619553101651,0.000002620380285700541,9.949901862622234e-7]],
  Mercury: [[0.08880127893225637,-0.3954229343260486,-0.2199862020211323,0.02193986290538335,0.007010703623427576,0.001471607854537263],[0.2257769952854022,0.1987836927090499,0.083253039556241,-0.02516550311911114,0.01798598553274655,0.01221650006231571]],
  Venus: [[0.7238384983769436,0.02845884202917603,-0.03288415671987083,-0.0005849836719515345,0.0183455053560381,0.008292209188772102],[0.4696382099825208,0.5059210466667721,0.1980499750718376,-0.01539977190242336,0.01158895622105137,0.006189229730732367]],
  EarthMoonBarycenter: [[0.9754084752704395,0.1921123209938484,0.08337270249698094,-0.0039646185869574,0.01536059817272114,0.006658406922945518],[0.7334736842725255,0.6066338996489689,0.2630566479498902,-0.01183246496441187,0.01163483020632171,0.005043380286171332]],
  MarsBarycenter: [[0.05885946312699107,1.41676971441066,0.648440751802652,-0.01344712922469685,0.001440244947627607,0.001023244808591236],[-0.3420812082545383,1.411422521386353,0.6568003418302465,-0.01313548256376149,-0.001760067926147263,-0.0004530840181132619]],
  JupiterBarycenter: [[-3.520456785006223,3.616501004792285,1.635875160695234,-0.00573778501005273,-0.004327202277072782,-0.001715114279420052],[-3.689352564065936,3.483506368563052,1.582981959826102,-0.005522465093444076,-0.004537604139752316,-0.001810490934017747]],
  SaturnBarycenter: [[9.251124347284033,1.800172405798182,0.3450943773726137,-0.001365307093484726,0.005030450515533163,0.002136617919340384],[9.208697417397005,1.95079145519068,0.4091344972730376,-0.001463126907788207,0.005010543876078051,0.002132608385031219]],
  UranusBarycenter: [[8.911878144569108,15.86671107479835,6.823135533196858,-0.003524229897579751,0.001465928956239089,0.0006918760780002895],[8.805990050287516,15.91040053061016,6.84376777717637,-0.003534956438595351,0.001446689976918187,0.0006836015543679092]],
  NeptuneBarycenter: [[29.83549255549325,1.560920669300504,-0.103905746556322,-0.0001668099946314406,0.002918364054638572,0.001198654702817795],[29.83033908897163,1.64846364086004,-0.06794564626285679,-0.0001767542488079929,0.002917829184073034,0.001198683320691894]]
});

export const JPL_DE441_SAMPLED_STATES = Object.freeze(Object.fromEntries(
  Object.entries(JPL_DE441_BARYCENTRIC_ENDPOINTS).map(([id, endpoints]) => [
    id,
    [endpoints[0], ...jplIntermediateStates.statesByBody[id], endpoints[1]]
  ])
));

export const MERCURY_PERIHELION_REFERENCE = Object.freeze({
  valueArcsecondsPerCentury: 42.980,
  sigmaArcsecondsPerCentury: 0.001,
  semiMajorAxisAU: 0.38709843,
  eccentricity: 0.20563661,
  orbitalPeriodYears: 0.2408467,
  source: 'https://doi.org/10.3847/1538-3881/aa5be2',
  sourceLabel: 'Park et al. (2017), MESSENGER ranging; relativistic excess over modeled Newtonian perturbations'
});

export const ORBIT_SCORE_TOLERANCES = Object.freeze({
  positionRmsKm: 1000,
  velocityRmsMetersPerSecond: 10,
  pairDistanceRmsKm: 1000,
  mercuryPerihelionArcsecondsPerCentury: 1
});

export const ORBIT_VALIDATION_DESCRIPTION = 'Score points are a weighted RMS of normalized position, velocity, pair-distance residuals over six 5-day DE441 samples, and Mercury perihelion residual; lower is closer to the references. This is a benchmark score, not a probability or mission-safety certification.';

export const ORBIT_VALIDATION_MODEL_EXTENSION_PLAN = Object.freeze([
  'Register a stable model ID and user-facing label in AMPLITUDE_GRAVITY_MODES.',
  'Implement its acceleration kernel in evaluateNBodyAmplitudeGravity without silently replacing existing models.',
  'Add an analytic limit/invariant test and a benchmark test demonstrating how this model should score.',
  'Declare whether it supports the Mercury perihelion metric; unsupported metrics are excluded and reported, never imputed.',
  'Attach model assumptions, valid regime, and citations before enabling it in the validation report.'
]);

export const ORBIT_VALIDATION_DATASET_CITATIONS = Object.freeze([
  {
    id: 'jpl-horizons-de441',
    label: 'JPL Horizons / DE441 planetary ephemeris',
    source: 'https://ssd.jpl.nasa.gov/horizons/manual.html',
    publication: 'Park, R. S.; Folkner, W. M.; Williams, J. G.; Boggs, D. H. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441, The Astronomical Journal 161:105.',
    publicationSource: 'https://doi.org/10.3847/1538-3881/abd414',
    usage: 'Fixed barycentric Cartesian state snapshot for the Sun, Mercury, Venus, Earth-Moon barycenter, and Mars/Jupiter/Saturn/Uranus/Neptune system barycenters; seven samples at 5-day spacing.',
    limitation: 'Horizons states are outputs of a fitted numerical ephemeris, not raw observations. This short interval is an educational regression benchmark, not an independent validation of DE441.'
  },
  {
    id: 'mercury-perihelion',
    label: 'Mercury relativistic perihelion residual',
    source: MERCURY_PERIHELION_REFERENCE.source,
    publication: 'Park et al. (2017), Precession of Mercury’s Perihelion from Ranging to the MESSENGER Spacecraft, The Astronomical Journal 153:121.',
    usage: 'Observed relativistic excess of 42.980 ± 0.001 arcseconds per century after modeled Newtonian planetary perturbations.',
    limitation: 'A separate isolated two-body 1PN diagnostic, not measured from the 30-day DE441 interval.'
  },
  {
    id: 'one-pn-model',
    label: 'First post-Newtonian gravity model',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5255900/',
    publication: 'Will, C. M. (2018), Theory and Experiment in Gravitational Physics / The Confrontation between General Relativity and Experiment, Living Reviews in Relativity 21:3.',
    usage: 'Pairwise weak-field, slow-motion 1PN acceleration; the Gaussian variant additionally applies the explicitly experimental normalized tensor window.',
    limitation: 'The implemented pairwise model omits full N-body Einstein-Infeld-Hoffmann cross-body terms; the tensor-Gaussian variant is a hypothesis, not GR.'
  }
]);

const AU_KM = 149597870.7;
const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365.25;
const ARCSECONDS_PER_RADIAN = 180 * 3600 / Math.PI;
const OBSERVED_ORBIT_MAXIMUM_STEP_YEARS = 0.0001;
const SOLAR_MU_AU3_PER_YEAR2 = 4 * Math.PI ** 2;
const SPEED_OF_LIGHT_AU_PER_YEAR = 63241.07708807546;
const PLANETARY_SYSTEM_IDS = ['Mercury', 'Venus', 'EarthMoonBarycenter', 'MarsBarycenter', 'JupiterBarycenter', 'SaturnBarycenter', 'UranusBarycenter', 'NeptuneBarycenter'];
const BODY_IDS = ['Sun', ...PLANETARY_SYSTEM_IDS];
const SAMPLE_COUNT = JPL_DE441_ORBIT_INTERVAL.intervalDays / JPL_DE441_ORBIT_INTERVAL.sampleStepDays + 1;
const DEFAULT_SCORE_WEIGHTS = Object.freeze({ position: 0.35, velocity: 0.2, pairDistance: 0.2, mercuryPerihelion: 0.25 });

function magnitude(vector) {
  return Math.hypot(...vector);
}

function bodyState(row) {
  return {
    position: row.slice(0, 3),
    velocity: row.slice(3).map((value) => value * DAYS_PER_YEAR)
  };
}

function observedBodies(states, massById) {
  return BODY_IDS.map((id) => ({ id, name: id, mass: massById.get(id), ...bodyState(states[id]) }));
}

function jplSystemMasses(date) {
  const bodies = createSolarSystemBodies(date, { includeMajorMoons: true });
  const byId = new Map(bodies.map((body) => [body.id, body]));
  const parentSystemMass = (parentId) => byId.get(parentId).mass
    + bodies.filter((body) => body.parentId === parentId).reduce((sum, body) => sum + body.mass, 0);
  return new Map([
    ['Sun', byId.get('Sun').mass],
    ['Mercury', byId.get('Mercury').mass],
    ['Venus', byId.get('Venus').mass],
    ['EarthMoonBarycenter', parentSystemMass('Earth')],
    ['MarsBarycenter', parentSystemMass('Mars')],
    ['JupiterBarycenter', parentSystemMass('Jupiter')],
    ['SaturnBarycenter', parentSystemMass('Saturn')],
    ['UranusBarycenter', parentSystemMass('Uranus')],
    ['NeptuneBarycenter', parentSystemMass('Neptune')]
  ]);
}

function orbitalScoreConfiguration(mode, input = {}) {
  const settings = sanitizeAmplitudeGravity({ ...DEFAULT_AMPLITUDE_GRAVITY, ...input, mode });
  return {
    ...settings,
    mode,
    gravitationalConstant: SOLAR_MU_AU3_PER_YEAR2,
    softening: 1e-9,
    grSpeedOfLight: SPEED_OF_LIGHT_AU_PER_YEAR,
    grTensorGaussianWaist: Math.max(1e-6, settings.grTensorGaussianWaist / SOLAR_SYSTEM_SCENE_SCALE)
  };
}

function periapsisRateForMode(mode, input = {}) {
  const { semiMajorAxisAU, eccentricity, orbitalPeriodYears } = MERCURY_PERIHELION_REFERENCE;
  const perihelion = semiMajorAxisAU * (1 - eccentricity);
  const sunMass = 1;
  const mercuryMass = 1.66012e-7;
  const perihelionSpeed = Math.sqrt(SOLAR_MU_AU3_PER_YEAR2 * sunMass * (1 + eccentricity) / (semiMajorAxisAU * (1 - eccentricity)));
  const bodies = [
    { id: 'Sun', mass: sunMass, position: [0, 0, 0], velocity: [0, 0, 0] },
    { id: 'Mercury', mass: mercuryMass, position: [perihelion, 0, 0], velocity: [0, perihelionSpeed, 0] }
  ];
  const configuration = orbitalScoreConfiguration(mode, input);
  const orbitCount = 8;
  const stepCountPerOrbit = 600;
  const step = orbitalPeriodYears / stepCountPerOrbit;
  const periapsisAngles = [];
  let previousRadialVelocity = 0;
  let previousPosition = [...bodies[1].position];
  let accelerations = evaluateNBodyAmplitudeGravity(bodies, configuration).accelerations;
  for (let stepIndex = 0; stepIndex < stepCountPerOrbit * orbitCount; stepIndex += 1) {
    const position = bodies[1].position;
    const velocity = bodies[1].velocity;
    const positionBefore = [...position];
    for (let axis = 0; axis < 3; axis += 1) {
      velocity[axis] += 0.5 * accelerations[1][axis] * step;
      position[axis] += velocity[axis] * step;
    }
    const nextAccelerations = evaluateNBodyAmplitudeGravity(bodies, configuration).accelerations;
    for (let axis = 0; axis < 3; axis += 1) velocity[axis] += 0.5 * nextAccelerations[1][axis] * step;
    const radius = magnitude(position);
    const radialVelocity = position.reduce((sum, value, axis) => sum + value * velocity[axis], 0) / radius;
    if (previousRadialVelocity < 0 && radialVelocity >= 0) {
      const fraction = previousRadialVelocity / (previousRadialVelocity - radialVelocity);
      const periapsisPosition = positionBefore.map((value, axis) => value + (position[axis] - value) * fraction);
      let angle = Math.atan2(periapsisPosition[1], periapsisPosition[0]);
      const previousAngle = periapsisAngles.at(-1) ?? 0;
      while (angle <= previousAngle + Math.PI) angle += 2 * Math.PI;
      periapsisAngles.push(angle);
    }
    previousRadialVelocity = radialVelocity;
    previousPosition = [...position];
    accelerations = nextAccelerations;
  }
  if (periapsisAngles.length < orbitCount - 1) return null;
  const radiansPerOrbit = periapsisAngles.at(-1) / periapsisAngles.length - 2 * Math.PI;
  return radiansPerOrbit / orbitalPeriodYears * 100 * ARCSECONDS_PER_RADIAN;
}

export function calculatePairDistances(bodies) {
  const distances = [];
  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      distances.push({
        firstId: bodies[first].id,
        secondId: bodies[second].id,
        distanceAU: magnitude(bodies[first].position.map((value, axis) => value - bodies[second].position[axis]))
      });
    }
  }
  return distances;
}

export function scoreObservedOrbits({ modes = AMPLITUDE_GRAVITY_MODES, configuration = {} } = {}) {
  const massById = jplSystemMasses(new Date(`${JPL_DE441_ORBIT_INTERVAL.startDate}T12:00:00Z`));
  const observedTimeline = Array.from({ length: SAMPLE_COUNT }, (_, sampleIndex) => observedBodies(
    Object.fromEntries(BODY_IDS.map((id) => [id, JPL_DE441_SAMPLED_STATES[id][sampleIndex]])),
    massById
  ));
  const observedStartDistances = calculatePairDistances(observedTimeline[0]);
  const intervalYears = JPL_DE441_ORBIT_INTERVAL.sampleStepDays / DAYS_PER_YEAR;
  const newtonianPerihelionNumericalRate = periapsisRateForMode('newtonian', configuration);

  return modes.map(({ value: mode, label }) => {
    const predicted = observedTimeline[0].map((body) => ({ ...body, position: [...body.position], velocity: [...body.velocity] }));
    const predictedTimeline = [predicted.map((body) => ({ ...body, position: [...body.position], velocity: [...body.velocity] }))];
    const settings = orbitalScoreConfiguration(mode, configuration);
    for (let sampleIndex = 1; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
      integrateNBodyVelocityVerlet(predicted, intervalYears, settings, { maximumStepYears: OBSERVED_ORBIT_MAXIMUM_STEP_YEARS });
      predictedTimeline.push(predicted.map((body) => ({ ...body, position: [...body.position], velocity: [...body.velocity] })));
    }
    const positionSquaredErrors = [];
    const velocitySquaredErrors = [];
    const distanceTimeline = [];
    for (let sampleIndex = 1; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
      const observed = observedTimeline[sampleIndex];
      const simulated = predictedTimeline[sampleIndex];
      PLANETARY_SYSTEM_IDS.forEach((id) => {
        const predictedBody = simulated.find((body) => body.id === id);
        const observedBody = observed.find((body) => body.id === id);
        positionSquaredErrors.push(magnitude(predictedBody.position.map((value, axis) => (value - observedBody.position[axis]) * AU_KM)) ** 2);
        velocitySquaredErrors.push(magnitude(predictedBody.velocity.map((value, axis) => (value - observedBody.velocity[axis]) * AU_KM / (DAYS_PER_YEAR * SECONDS_PER_DAY) * 1000)) ** 2);
      });
      distanceTimeline.push({ observed: calculatePairDistances(observed), predicted: calculatePairDistances(simulated) });
    }
    const pairDistanceSquaredErrors = distanceTimeline.flatMap(({ observed, predicted: simulated }) => observed.map(
      (distance, index) => ((simulated[index].distanceAU - distance.distanceAU) * AU_KM) ** 2
    ));
    const positionRmsKm = Math.sqrt(positionSquaredErrors.reduce((sum, value) => sum + value, 0) / positionSquaredErrors.length);
    const velocityRmsMetersPerSecond = Math.sqrt(velocitySquaredErrors.reduce((sum, value) => sum + value, 0) / velocitySquaredErrors.length);
    const pairDistanceRmsKm = Math.sqrt(pairDistanceSquaredErrors.reduce((sum, value) => sum + value, 0) / pairDistanceSquaredErrors.length);
    const rawMercuryPerihelionArcsecondsPerCentury = periapsisRateForMode(mode, configuration);
    const mercuryPerihelionArcsecondsPerCentury = rawMercuryPerihelionArcsecondsPerCentury == null
      ? null
      : rawMercuryPerihelionArcsecondsPerCentury - newtonianPerihelionNumericalRate;
    const mercuryPerihelionError = mercuryPerihelionArcsecondsPerCentury == null
      ? null
      : Math.abs(mercuryPerihelionArcsecondsPerCentury - MERCURY_PERIHELION_REFERENCE.valueArcsecondsPerCentury);
    const availableWeight = mercuryPerihelionError == null ? 1 - DEFAULT_SCORE_WEIGHTS.mercuryPerihelion : 1;
    const scorePoints = 100 * (
      DEFAULT_SCORE_WEIGHTS.position * positionRmsKm / ORBIT_SCORE_TOLERANCES.positionRmsKm
      + DEFAULT_SCORE_WEIGHTS.velocity * velocityRmsMetersPerSecond / ORBIT_SCORE_TOLERANCES.velocityRmsMetersPerSecond
      + DEFAULT_SCORE_WEIGHTS.pairDistance * pairDistanceRmsKm / ORBIT_SCORE_TOLERANCES.pairDistanceRmsKm
      + (mercuryPerihelionError == null ? 0 : DEFAULT_SCORE_WEIGHTS.mercuryPerihelion * mercuryPerihelionError / ORBIT_SCORE_TOLERANCES.mercuryPerihelionArcsecondsPerCentury)
    ) / availableWeight;
    const pairDistances = distanceTimeline.at(-1).observed.map((distance, pairIndex) => {
      const samples = distanceTimeline.map(({ observed, predicted: simulated }, sampleIndex) => ({
        day: (sampleIndex + 1) * JPL_DE441_ORBIT_INTERVAL.sampleStepDays,
        observedAU: observed[pairIndex].distanceAU,
        predictedAU: simulated[pairIndex].distanceAU,
        residualKm: (simulated[pairIndex].distanceAU - observed[pairIndex].distanceAU) * AU_KM
      }));
      return {
        firstId: distance.firstId,
        secondId: distance.secondId,
        observedStartAU: observedStartDistances[pairIndex].distanceAU,
        observedEndAU: distance.distanceAU,
        predictedEndAU: distanceTimeline.at(-1).predicted[pairIndex].distanceAU,
        residualKm: samples.at(-1).residualKm,
        residualRmsKm: Math.sqrt(samples.reduce((sum, sample) => sum + sample.residualKm ** 2, 0) / samples.length),
        samples
      };
    });
    const tracks = BODY_IDS.map((id) => ({
      bodyId: id,
      observed: observedTimeline.map((sample) => sample.find((body) => body.id === id).position),
      predicted: predictedTimeline.map((sample) => sample.find((body) => body.id === id).position)
    }));
    return {
      mode,
      label,
      scorePoints,
      positionRmsKm,
      velocityRmsMetersPerSecond,
      pairDistanceRmsKm,
      mercuryPerihelionArcsecondsPerCentury,
      mercuryPerihelionErrorArcsecondsPerCentury: mercuryPerihelionError,
      pairDistances,
      tracks,
      interval: JPL_DE441_ORBIT_INTERVAL
    };
  }).sort((first, second) => first.scorePoints - second.scorePoints);
}