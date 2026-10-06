import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHistoricMissionTrajectory,
  createKeplerOrbit,
  createSolarSystemBodies,
  createSolarSystemOrbitPaths,
  createSpacecraftLaunchBody,
  JPL_SATELLITE_GM_KM3_S2,
  SOLAR_SYSTEM_DATASET_CITATIONS,
  PLANET_DIAMETER_MODES,
  HISTORIC_MISSIONS,
  MAX_OPTIONAL_MOONS_PER_PLANET,
  OPTIONAL_MOON_COUNTS,
  SOLAR_SYSTEM_SOURCE_URLS,
  SOLAR_SYSTEM_ATTRACTOR_MODELS,
  propagateKeplerOrbit,
  SOLAR_SYSTEM_SCENE_SCALE
} from './solarSystemModel.js';

test('Solar System dataset citations identify sources and approximation limits', () => {
  assert.ok(SOLAR_SYSTEM_DATASET_CITATIONS.length >= 6);
  assert.ok(SOLAR_SYSTEM_DATASET_CITATIONS.every(({ label, source, description, limitations }) => label && source.startsWith('https://') && description && limitations));
  assert.match(SOLAR_SYSTEM_DATASET_CITATIONS.find(({ id }) => id === 'satellite-elements').limitations, /not intended for ephemeris computation/);
});

test('default Solar System contains the Sun, eight planets, and Earth’s Moon with finite state vectors', () => {
  const bodies = createSolarSystemBodies(new Date('2026-10-06T00:00:00Z'));
  assert.equal(bodies.length, 10);
  assert.deepEqual(bodies.map(({ id }) => id), ['Sun', 'Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']);
  for (const body of bodies) {
    assert.ok(body.mass > 0);
    assert.equal(body.position.length, 3);
    assert.equal(body.velocity.length, 3);
    assert.ok([...body.position, ...body.velocity].every(Number.isFinite));
  }
  assert.ok(bodies.find(({ id }) => id === 'Earth').rotation);
  assert.ok(Number.isFinite(bodies.find(({ id }) => id === 'Moon').rotation.librationLongitudeDeg));
  assert.match(bodies.find(({ id }) => id === 'Sun').massSource, /NASA planetary fact sheet/);
  assert.equal(bodies.find(({ id }) => id === 'Sun').massSourceUrl, SOLAR_SYSTEM_SOURCE_URLS.facts);
});

test('optional moon catalog stays at ten or fewer per planet and uses finite approximate states', () => {
  assert.ok(MAX_OPTIONAL_MOONS_PER_PLANET <= 10);
  assert.ok(Object.values(OPTIONAL_MOON_COUNTS).every((count) => count <= 10));
  const bodies = createSolarSystemBodies(new Date('2026-10-06T00:00:00Z'), { includeMajorMoons: true });
  assert.equal(bodies.length, 10 + Object.values(OPTIONAL_MOON_COUNTS).reduce((sum, count) => sum + count, 0));
  assert.ok(bodies.some(({ id }) => id === 'Triton'));
  assert.ok(bodies.every(({ position, velocity }) => [...position, ...velocity].every(Number.isFinite)));
  for (const name of ['Moon', 'Phobos', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Titan', 'Triton']) {
    const moon = bodies.find(({ id }) => id === name);
    assert.ok(moon.massKg > 0);
    assert.ok(Number.isFinite(moon.gmKm3PerS2));
    assert.match(moon.massSource, /JPL ephemeris GM/);
    assert.ok(Math.abs(moon.massKg * 6.67430e-20 - JPL_SATELLITE_GM_KM3_S2[name]) < 1e-10);
    assert.equal(moon.massSourceUrl, 'https://ssd.jpl.nasa.gov/sats/phys_par/');
    assert.ok(moon.moonOrbit);
  }
  const elara = bodies.find(({ id }) => id === 'Elara');
  assert.equal(elara.gmKm3PerS2, null);
  assert.equal(elara.massSourceUrl, 'https://ssd.jpl.nasa.gov/sats/phys_par/');
});

test('Kepler moon propagation stays parent-centered and closes after one orbital period', () => {
  const date = new Date('2026-10-06T00:00:00Z');
  const earth = createSolarSystemBodies(date).find(({ id }) => id === 'Earth');
  const moon = createSolarSystemBodies(date).find(({ id }) => id === 'Moon');
  const orbit = moon.moonOrbit;
  const periodDays = 2 * Math.PI * Math.sqrt(orbit.semiMajorAxis ** 3 / orbit.mu);
  const afterOneOrbit = propagateKeplerOrbit(orbit, orbit.epochMs + periodDays * 86400000);
  const relativeSpeedKmPerSecond = Math.hypot(afterOneOrbit.vx, afterOneOrbit.vy, afterOneOrbit.vz) * 149597870.7 / 86400;
  const initialPosition = moon.positionAU.map((value, axis) => value - earth.positionAU[axis]);
  assert.ok(Math.hypot(...initialPosition.map((value, axis) => value - afterOneOrbit[['x', 'y', 'z'][axis]])) < 1e-8);
  assert.ok(relativeSpeedKmPerSecond > 0.8 && relativeSpeedKmPerSecond < 1.2, `expected lunar orbital speed near 1 km/s, received ${relativeSpeedKmPerSecond}`);
  const scenePosition = propagateKeplerOrbit(orbit, orbit.epochMs);
  assert.ok(Math.hypot(...initialPosition.map((value, axis) => value - scenePosition[['x', 'y', 'z'][axis]])) < 1e-10);
  assert.ok(Math.abs(moon.radius - 1737.4 / 149597870.7 * SOLAR_SYSTEM_SCENE_SCALE) > 0.001);
});

test('actual body diameters retain their physical ratios while illustrative scale remains adjustable', () => {
  const date = new Date('2026-10-06T00:00:00Z');
  const actual = createSolarSystemBodies(date, { diameterMode: 'actual' });
  const sun = actual.find(({ id }) => id === 'Sun');
  const earth = actual.find(({ id }) => id === 'Earth');
  assert.ok(Math.abs(sun.radius / earth.radius - 696340 / 6371) < 1e-10);
  const illustrative = createSolarSystemBodies(date, { diameterMode: 'illustrative', diameterExaggeration: 2 });
  assert.equal(illustrative.find(({ id }) => id === 'Earth').radius, 0.115 * 2);
  const actualMoon = actual.find(({ id }) => id === 'Moon');
  const illustrativeMoon = illustrative.find(({ id }) => id === 'Moon');
  assert.equal(actualMoon.moonOrbit.displayScale, 1);
  assert.ok(illustrativeMoon.moonOrbit.displayScale > 1);
  assert.notDeepEqual(illustrativeMoon.displayPosition, actualMoon.displayPosition);
  assert.deepEqual(PLANET_DIAMETER_MODES.map(({ value }) => value), ['illustrative', 'actual']);
});

test('historic mission waypoint paths use dated ephemeris locations and disclose schematic interpolation', () => {
  assert.ok(HISTORIC_MISSIONS.length >= 30);
  for (const mission of HISTORIC_MISSIONS) {
    const trajectory = createHistoricMissionTrajectory(mission.id);
    assert.equal(trajectory.waypoints.length, mission.events.length + 1);
    assert.match(trajectory.note, /schematic/);
    assert.match(trajectory.note, /not spacecraft positions/);
    assert.match(trajectory.source, /^https:\/\/(www\.|science\.)?nasa\.gov\//);
    assert.equal(trajectory.waypoints[0].body, 'Earth');
    assert.equal(trajectory.waypoints[0].date, mission.launchDate);
    assert.ok(trajectory.waypoints.every(({ position }) => position.every(Number.isFinite)));
  }
  const missionById = new Map(HISTORIC_MISSIONS.map((mission) => [mission.id, mission]));
  for (const id of ['apollo-8', 'apollo-10', 'apollo-11', 'apollo-12', 'apollo-13', 'apollo-14', 'apollo-15', 'apollo-16', 'apollo-17', 'artemis-2']) {
    assert.ok(missionById.get(id).events.some(({ body }) => body === 'Moon'), `${id} should include a Moon waypoint`);
  }
  for (const id of ['viking-1', 'viking-2', 'curiosity', 'perseverance-ingenuity', 'maven', 'insight']) {
    assert.ok(missionById.get(id).events.some(({ body }) => body === 'Mars'), `${id} should include a Mars waypoint`);
  }
  assert.ok(missionById.get('perseverance-ingenuity').events.some(({ date }) => date === '2021-04-19'));
  for (const id of ['mariner-2', 'mariner-10', 'magellan', 'messenger', 'galileo', 'juno', 'cassini']) {
    assert.ok(missionById.has(id), `${id} should be available in the historic mission catalog`);
  }
  assert.equal(createHistoricMissionTrajectory('unknown'), null);
});

test('planet orbit tracks are closed sampled curves around the selected ephemeris epoch', () => {
  const paths = createSolarSystemOrbitPaths(new Date('2026-10-06T00:00:00Z'), 24);
  assert.equal(paths.length, 8);
  for (const path of paths) {
    assert.equal(path.positions.length, 25);
    assert.ok(path.positions.every((position) => position.every(Number.isFinite)));
    const closureError = Math.hypot(...path.positions[0].map((value, axis) => value - path.positions.at(-1)[axis]));
    assert.ok(closureError < 1e-10);
  }
  const mercury = paths.find(({ id }) => id === 'Mercury');
  const closestMercuryOrbitRadius = Math.min(...mercury.positions.map((position) => Math.hypot(position[0], position[2])));
  const sun = createSolarSystemBodies(new Date('2026-10-06T00:00:00Z')).find(({ id }) => id === 'Sun');
  assert.ok(sun.radius < closestMercuryOrbitRadius, 'the Sun display sphere must not cover Mercury’s orbit');
});

test('spacecraft launch adds the requested local impulse to a named departure body', () => {
  const earth = createSolarSystemBodies(new Date('2026-10-06T00:00:00Z')).find(({ id }) => id === 'Earth');
  const spacecraft = createSpacecraftLaunchBody([earth], { speedKmPerSecond: 30, headingDeg: 0, inclinationDeg: 0 });
  assert.equal(spacecraft.parentId, 'Earth');
  assert.deepEqual(spacecraft.position, earth.position);
  const impulseKmPerSecond = Math.hypot(...spacecraft.velocity.map((value, axis) => value - earth.velocity[axis]))
    / 0.42 * (149597870.7 / (365.25 * 86400));
  assert.ok(Math.abs(impulseKmPerSecond - 30) < 1e-10);
  assert.equal(createSpacecraftLaunchBody([], { originId: 'Earth' }), null);
});

test('model selector exposes physical Solar System modes and the existing illustrative lab', () => {
  assert.deepEqual(SOLAR_SYSTEM_ATTRACTOR_MODELS.map(({ value }) => value), ['solar-system', 'solar-system-moons', 'illustrative']);
});