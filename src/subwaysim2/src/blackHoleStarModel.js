export const BLACK_HOLE_STAR_SPLAT_COUNT = 96;

const GRAVITY_CONSTANT = 6.67e-11;
const MAX_FRAME_DELTA = 1 / 30;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function seededUnit(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function simulationMass(configuration, attractor) {
  return (10 ** configuration.attractorMassExponent)
    * (10 ** configuration.particleGlobalMassExponent)
    * Math.max(0, attractor.magnitude);
}

function clampSpeed(velocity, maximumSpeed) {
  const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
  if (speed <= maximumSpeed || speed === 0) return;
  const scale = maximumSpeed / speed;
  velocity[0] *= scale;
  velocity[1] *= scale;
  velocity[2] *= scale;
}

function rotatedSpinAxis(rotation) {
  const [rotationX, rotationY, rotationZ] = rotation;
  const sinX = Math.sin(rotationX);
  const cosX = Math.cos(rotationX);
  const sinY = Math.sin(rotationY);
  const cosY = Math.cos(rotationY);
  const sinZ = Math.sin(rotationZ);
  const cosZ = Math.cos(rotationZ);
  const axis = [
    cosZ * sinY * sinX - sinZ * cosX,
    sinZ * sinY * sinX + cosZ * cosX,
    cosY * sinX
  ];
  const length = Math.max(Math.hypot(...axis), 1e-6);
  return axis.map((component) => component / length);
}

function advanceParticle(position, velocity, massFraction, attractorPosition, attractor, configuration, deltaSeconds) {
  const offsetX = position[0] - attractorPosition[0];
  const offsetY = position[1] - attractorPosition[1];
  const offsetZ = position[2] - attractorPosition[2];
  const distance = Math.max(Math.hypot(offsetX, offsetY, offsetZ), 0.12);
  const directionToAttractor = [-offsetX / distance, -offsetY / distance, -offsetZ / distance];
  const force = GRAVITY_CONSTANT * simulationMass(configuration, attractor) * massFraction / (distance * distance);
  const acceleration = directionToAttractor.map((component) => component * force);
  const rotationAxis = rotatedSpinAxis(attractor.rotation);
  const spinningForce = rotationAxis.map((component) => component
    * force * configuration.spinningStrength * attractor.blackHole.rotationSpeed);
  acceleration[0] += spinningForce[1] * -offsetZ - spinningForce[2] * -offsetY;
  acceleration[1] += spinningForce[2] * -offsetX - spinningForce[0] * -offsetZ;
  acceleration[2] += spinningForce[0] * -offsetY - spinningForce[1] * -offsetX;

  for (let axis = 0; axis < 3; axis += 1) velocity[axis] += acceleration[axis] * deltaSeconds;
  clampSpeed(velocity, Math.max(0, configuration.maxSpeed));
  const damping = Math.pow(1 - clamp(configuration.velocityDamping, 0, 1), deltaSeconds * 60);
  for (let axis = 0; axis < 3; axis += 1) {
    velocity[axis] *= damping;
    position[axis] += velocity[axis] * deltaSeconds;
  }
}

export function createBlackHoleStarField(attractor, configuration, count = BLACK_HOLE_STAR_SPLAT_COUNT) {
  const orbitRadius = Math.max(0.12, attractor.blackHole.orbitRadius);
  const eccentricity = clamp(attractor.blackHole.testStarEccentricity, 0, 0.99);
  const periapsis = Math.max(0.12, orbitRadius * (1 - eccentricity));
  const orbitalMass = GRAVITY_CONSTANT * simulationMass(configuration, attractor);
  const orbitalSpeed = Math.sqrt(Math.max(0, orbitalMass * (1 + eccentricity) / periapsis));
  const center = new Float32Array([
    attractor.position[0] + periapsis,
    attractor.position[1],
    attractor.position[2]
  ]);
  const centerVelocity = new Float32Array([0, 0, Math.min(orbitalSpeed, Math.max(0, configuration.maxSpeed))]);
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const masses = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const mass = 0.45 + seededUnit(index, 1) * 0.55;
    const y = seededUnit(index, 2) * 2 - 1;
    const angle = seededUnit(index, 3) * Math.PI * 2;
    const radial = Math.sqrt(1 - y * y);
    const radius = 0.06 + seededUnit(index, 4) * 0.22;
    const offset = index * 3;
    positions[offset] = center[0] + Math.cos(angle) * radial * radius;
    positions[offset + 1] = center[1] + y * radius;
    positions[offset + 2] = center[2] + Math.sin(angle) * radial * radius;
    velocities[offset] = centerVelocity[0];
    velocities[offset + 1] = centerVelocity[1];
    velocities[offset + 2] = centerVelocity[2];
    masses[index] = mass;
  }

  return {
    count,
    center,
    centerVelocity,
    hostPosition: new Float32Array(attractor.position),
    positions,
    velocities,
    masses,
    centerMassFraction: masses.reduce((sum, mass) => sum + mass, 0) / count,
    massFraction: masses.reduce((sum, mass) => sum + mass, 0)
  };
}

export function advanceBlackHoleStarField(field, attractor, configuration, frameDelta) {
  const deltaSeconds = Math.min(Math.max(0, frameDelta), MAX_FRAME_DELTA) * Math.max(0, configuration.timeScale);
  if (field.count === 0) return field;

  for (let axis = 0; axis < 3; axis += 1) {
    const hostDelta = attractor.position[axis] - field.hostPosition[axis];
    field.center[axis] += hostDelta;
    for (let index = axis; index < field.positions.length; index += 3) field.positions[index] += hostDelta;
    field.hostPosition[axis] = attractor.position[axis];
  }
  if (deltaSeconds === 0) return field;

  advanceParticle(field.center, field.centerVelocity, field.centerMassFraction, attractor.position, attractor, configuration, deltaSeconds);

  const threshold = Math.max(0.1, attractor.blackHole.fractureThreshold);
  let totalMass = 0;
  for (let index = 0; index < field.count; index += 1) {
    const offset = index * 3;
    const position = field.positions.subarray(offset, offset + 3);
    const velocity = field.velocities.subarray(offset, offset + 3);
    const mass = field.masses[index];
    advanceParticle(position, velocity, mass, attractor.position, attractor, configuration, deltaSeconds);

    const radius = Math.max(0.12, Math.hypot(
      position[0] - attractor.position[0],
      position[1] - attractor.position[1],
      position[2] - attractor.position[2]
    ));
    const thermalVariation = seededUnit(index, Math.floor(frameDelta * 100000) + 5) * attractor.blackHole.thermalNoise;
    const normalizedStress = (attractor.blackHole.eventHorizonShear / radius + thermalVariation * 0.5) / threshold;
    const shedding = Math.max(0, normalizedStress - 0.18) * attractor.blackHole.fractureIntensity * 0.08;
    field.masses[index] = Math.max(0, mass * Math.exp(-shedding * deltaSeconds));
    totalMass += field.masses[index];
  }
  field.centerMassFraction = totalMass / field.count;
  field.massFraction = totalMass;
  return field;
}