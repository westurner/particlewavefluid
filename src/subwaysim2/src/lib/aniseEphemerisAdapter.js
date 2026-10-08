import * as Astronomy from 'astronomy-engine';

export const ANISE_COMPATIBILITY_API = Object.freeze({
  name: 'ANISE Almanac compatibility surface',
  version: '0.1',
  orientationFrame: 'J2000_EQJ',
  distanceUnit: 'AU',
  velocityUnit: 'AU/day',
  operations: Object.freeze(['stateOf(targetFrame, observerFrame, epoch)', 'rotate(fromFrame, toFrame, epoch)', 'angularVelocityRadPerSecond(fromFrame, toFrame, epoch)']),
  aniseDocs: 'https://docs.rs/anise/latest/anise/almanac/struct.Almanac.html'
});

const FRAME_TO_BODY = new Map([
  ['0', 'SSB'], ['SSB', 'SSB'], ['SolarSystemBarycenter', 'SSB'],
  ['10', 'Sun'], ['Sun', 'Sun'], ['IAU_SUN', 'Sun'], ['IAU_SUN_FRAME', 'Sun'],
  ['1', 'Mercury'], ['MercuryBarycenter', 'Mercury'], ['199', 'Mercury'], ['Mercury', 'Mercury'],
  ['IAU_MERCURY', 'Mercury'], ['IAU_MERCURY_FRAME', 'Mercury'],
  ['2', 'Venus'], ['VenusBarycenter', 'Venus'], ['299', 'Venus'], ['Venus', 'Venus'],
  ['IAU_VENUS', 'Venus'], ['IAU_VENUS_FRAME', 'Venus'],
  ['3', 'EMB'], ['EarthMoonBarycenter', 'EMB'], ['EMB', 'EMB'],
  ['399', 'Earth'], ['Earth', 'Earth'], ['IAU_EARTH', 'Earth'], ['IAU_EARTH_FRAME', 'Earth'],
  ['301', 'Moon'], ['Moon', 'Moon'], ['IAU_MOON', 'Moon'], ['IAU_MOON_FRAME', 'Moon'],
  ['4', 'Mars'], ['MarsBarycenter', 'Mars'], ['499', 'Mars'], ['Mars', 'Mars'],
  ['IAU_MARS', 'Mars'], ['IAU_MARS_FRAME', 'Mars'],
  ['5', 'Jupiter'], ['JupiterBarycenter', 'Jupiter'], ['599', 'Jupiter'], ['Jupiter', 'Jupiter'],
  ['IAU_JUPITER', 'Jupiter'], ['IAU_JUPITER_FRAME', 'Jupiter'],
  ['6', 'Saturn'], ['SaturnBarycenter', 'Saturn'], ['699', 'Saturn'], ['Saturn', 'Saturn'],
  ['IAU_SATURN', 'Saturn'], ['IAU_SATURN_FRAME', 'Saturn'],
  ['7', 'Uranus'], ['UranusBarycenter', 'Uranus'], ['799', 'Uranus'], ['Uranus', 'Uranus'],
  ['IAU_URANUS', 'Uranus'], ['IAU_URANUS_FRAME', 'Uranus'],
  ['8', 'Neptune'], ['NeptuneBarycenter', 'Neptune'], ['899', 'Neptune'], ['Neptune', 'Neptune'],
  ['IAU_NEPTUNE', 'Neptune'], ['IAU_NEPTUNE_FRAME', 'Neptune'],
  ['9', 'Pluto'], ['PlutoBarycenter', 'Pluto'], ['999', 'Pluto'], ['Pluto', 'Pluto'],
  ['J2000_EQJ', 'J2000_EQJ'], ['ICRF', 'J2000_EQJ']
]);

const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const DOT = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const CROSS = (left, right) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0]
];
const NORM = (vector) => Math.hypot(...vector);
const NORMALIZE = (vector) => {
  const length = NORM(vector);
  if (length <= 1e-15) throw new RangeError('ANISE-compatible frame axis cannot be zero.');
  return vector.map((value) => value / length);
};
const TRANSPOSE = (matrix) => matrix[0].map((_, column) => matrix.map((row) => row[column]));
const MULTIPLY = (left, right) => left.map((row) => right[0].map((_, column) => row.reduce((sum, value, index) => sum + value * right[index][column], 0)));

function epochDate(epoch) {
  const date = epoch instanceof Date ? new Date(epoch.getTime()) : new Date(epoch);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`Invalid ephemeris epoch: ${epoch}`);
  return date;
}

export function resolveAniseFrame(frame) {
  const key = typeof frame === 'object' && frame !== null
    ? String(frame.naifId ?? frame.id ?? frame.name)
    : String(frame);
  const body = FRAME_TO_BODY.get(key);
  if (!body) throw new RangeError(`Unsupported local ANISE-compatible frame: ${key}`);
  return { id: key, body, orientation: 'J2000_EQJ' };
}

function barycentricState(body, date) {
  return Astronomy.BaryState(Astronomy.Body[body], date);
}

function rotationAt(body, date) {
  const axis = Astronomy.RotationAxis(Astronomy.Body[body], date);
  const rightAscension = axis.ra * Math.PI / 12;
  const declination = axis.dec * Math.PI / 180;
  const pole = NORMALIZE([
    Math.cos(declination) * Math.cos(rightAscension),
    Math.cos(declination) * Math.sin(rightAscension),
    Math.sin(declination)
  ]);
  const reference = Math.abs(pole[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1];
  const projectedReference = reference.map((value, index) => value - DOT(reference, pole) * pole[index]);
  const meridian = NORMALIZE(projectedReference);
  const east = NORMALIZE(CROSS(pole, meridian));
  const spin = axis.spin * Math.PI / 180;
  const primeMeridian = meridian.map((value, index) => value * Math.cos(spin) + east[index] * Math.sin(spin));
  const primeEast = NORMALIZE(CROSS(pole, primeMeridian));
  return {
    poleJ2000: pole,
    primeMeridianDeg: axis.spin,
    matrixBodyToJ2000: [
      [primeMeridian[0], primeEast[0], pole[0]],
      [primeMeridian[1], primeEast[1], pole[1]],
      [primeMeridian[2], primeEast[2], pole[2]]
    ]
  };
}

export class LocalAniseCompatibleAdapter {
  backend = 'astronomy-engine-local';

  stateOf(targetFrame, observerFrame, epoch) {
    const target = resolveAniseFrame(targetFrame);
    const observer = resolveAniseFrame(observerFrame);
    const date = epochDate(epoch);
    const targetState = barycentricState(target.body, date);
    const observerState = barycentricState(observer.body, date);
    return {
      targetFrame: target.id,
      observerFrame: observer.id,
      orientationFrame: 'J2000_EQJ',
      epoch: date.toISOString(),
      positionAU: [targetState.x - observerState.x, targetState.y - observerState.y, targetState.z - observerState.z],
      velocityAUPerDay: [targetState.vx - observerState.vx, targetState.vy - observerState.vy, targetState.vz - observerState.vz],
      units: { position: 'AU', velocity: 'AU/day' },
      aberration: 'NONE'
    };
  }

  rotate(fromFrame, toFrame, epoch) {
    const from = resolveAniseFrame(fromFrame);
    const to = resolveAniseFrame(toFrame);
    const date = epochDate(epoch);
    const fromToJ2000 = from.body === 'J2000_EQJ' ? IDENTITY : rotationAt(from.body, date).matrixBodyToJ2000;
    const toToJ2000 = to.body === 'J2000_EQJ' ? IDENTITY : rotationAt(to.body, date).matrixBodyToJ2000;
    return {
      fromFrame: from.id,
      toFrame: to.id,
      orientationFrame: 'J2000_EQJ',
      epoch: date.toISOString(),
      matrix: MULTIPLY(TRANSPOSE(toToJ2000), fromToJ2000)
    };
  }

  orientationOf(frame, epoch) {
    const resolved = resolveAniseFrame(frame);
    if (resolved.body === 'J2000_EQJ') return { frame: resolved.id, epoch: epochDate(epoch).toISOString(), poleJ2000: [0, 0, 1], primeMeridianDeg: 0, matrixBodyToJ2000: IDENTITY };
    return { frame: resolved.id, epoch: epochDate(epoch).toISOString(), ...rotationAt(resolved.body, epochDate(epoch)) };
  }

  angularVelocityRadPerSecond(fromFrame, toFrame = 'J2000_EQJ', epoch) {
    const from = resolveAniseFrame(fromFrame);
    const to = resolveAniseFrame(toFrame);
    const date = epochDate(epoch);
    if (from.body === 'J2000_EQJ' || from.body === to.body) return [0, 0, 0];
    const halfStepSeconds = 30;
    const before = new Date(date.getTime() - halfStepSeconds * 1000);
    const after = new Date(date.getTime() + halfStepSeconds * 1000);
    const beforeRotation = rotationAt(from.body, before);
    const afterRotation = rotationAt(from.body, after);
    const deltaDegrees = ((afterRotation.primeMeridianDeg - beforeRotation.primeMeridianDeg + 540) % 360) - 180;
    const rate = deltaDegrees * Math.PI / 180 / (2 * halfStepSeconds);
    const omegaJ2000 = beforeRotation.poleJ2000.map((value) => value * rate);
    const toToJ2000 = to.body === 'J2000_EQJ' ? IDENTITY : rotationAt(to.body, date).matrixBodyToJ2000;
    return TRANSPOSE(toToJ2000).map((row) => DOT(row, omegaJ2000));
  }
}

export class AniseWasmAdapter {
  constructor(bridge) {
    for (const method of ['stateOf', 'rotate', 'orientationOf', 'angularVelocityRadPerSecond']) {
      if (typeof bridge?.[method] !== 'function') throw new TypeError(`ANISE WASM bridge must implement ${method}()`);
    }
    this.bridge = bridge;
    this.backend = 'anise-wasm';
  }

  stateOf(...args) { return this.bridge.stateOf(...args); }
  rotate(...args) { return this.bridge.rotate(...args); }
  orientationOf(...args) { return this.bridge.orientationOf(...args); }
  angularVelocityRadPerSecond(...args) { return this.bridge.angularVelocityRadPerSecond(...args); }
}

export function createAniseEphemerisAdapter({ backend = 'local', wasmBridge } = {}) {
  if (backend === 'anise-wasm') return new AniseWasmAdapter(wasmBridge);
  if (backend !== 'local') throw new RangeError(`Unsupported ephemeris adapter backend: ${backend}`);
  return new LocalAniseCompatibleAdapter();
}

export const DEFAULT_ANISE_EPHEMERIS_ADAPTER = createAniseEphemerisAdapter();
