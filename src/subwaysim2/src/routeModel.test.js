import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLUID_BOUNDS,
  AIRFLOW_PARAMS,
  PASSENGER_POSITIONS,
  airflowControlResponse,
  FLOOD_GALLERY,
  FLOOD_WATERFALL,
  GROUND_LAYOUT,
  PARTICLE_SEED_BOUNDS,
  SHAFT_POSITIONS,
  SHAFT_LABELS,
  SHAFT_ROUTE,
  STATION_FLOOR_Y,
  STAIR_ROUTE,
  STREET_LAYOUT,
  STREET_VOLUME,
  SURFACE_MIXING,
  SURFACE_PARTICLE_STRIDE,
  TRACK_ROUTE,
  TRAIN_ROUTE,
  TURNSTILE_ROUTE,
  constrainFloodPositionY,
  constrainPermanentGroundPosition,
  constrainStairUnderfillPositionY,
  constrainSurfacePositionY,
  constrainTurnstilePositionX,
  glslFloat,
  isInsideStairTunnel,
  isInsideStreetVolume,
  isSurfaceOpening,
  minimumImageSurfaceDelta,
  measureShaftEndpoints,
  shaftControlAtX,
  stairStreetPortalX,
  clerestoryOpeningStrength,
  stairSurfaceY,
  temperatureChartRange,
  roofGapEndpoints,
  roofCeilingAt,
  roofPanelSegments,
  thermalResilienceReport,
  trainStateAtTime,
  trainThermalSource,
  passengerHeatResponse,
  surfacePressureAccelerations,
  surfaceParticleSeedFraction,
  surfaceParticleSeedY,
  verticalLayout,
  wrapSurfacePositionZ
} from './routeModel.js';

test('fluid bounds contain the entire stair route and street volume', () => {
  assert.ok(FLUID_BOUNDS.minX <= STAIR_ROUTE.startX);
  assert.ok(FLUID_BOUNDS.maxX >= STAIR_ROUTE.endX);
  assert.ok(FLUID_BOUNDS.minY <= STAIR_ROUTE.baseY);
  assert.ok(FLUID_BOUNDS.maxY >= STREET_VOLUME.maxY);
  assert.ok(FLUID_BOUNDS.minZ <= STREET_VOLUME.minZ);
  assert.ok(FLUID_BOUNDS.maxZ >= STREET_VOLUME.maxZ);
});

test('particle seeding reaches the flood gallery cold-sink band', () => {
  assert.ok(PARTICLE_SEED_BOUNDS.minY <= FLOOD_GALLERY.maxY);
  assert.ok(PARTICLE_SEED_BOUNDS.maxY >= FLOOD_GALLERY.minY);
});

test('stair profile has lower and upper flights separated by a level landing', () => {
  assert.equal(STAIR_ROUTE.startX, 11);
  assert.ok(STAIR_ROUTE.landingStartX < STAIR_ROUTE.startX);
  assert.equal(stairSurfaceY(STAIR_ROUTE.startX), STAIR_ROUTE.baseY);
  assert.equal(stairSurfaceY(STAIR_ROUTE.lowerFlightEndX), STAIR_ROUTE.landingY);
  assert.equal(stairSurfaceY(STAIR_ROUTE.upperFlightStartX), STAIR_ROUTE.landingY);
  assert.equal(stairSurfaceY(STAIR_ROUTE.endX), STAIR_ROUTE.baseY + STAIR_ROUTE.riseY);
  assert.equal(stairSurfaceY(STAIR_ROUTE.endX), SHAFT_ROUTE.streetY);
  assert.equal(stairSurfaceY(10), STAIR_ROUTE.baseY);
  assert.equal(STAIR_ROUTE.baseY, STATION_FLOOR_Y);
  assert.ok(Math.abs(STAIR_ROUTE.topLandingEndX - STAIR_ROUTE.endX - STAIR_ROUTE.landingDepth) < 1e-9);
  assert.ok(Math.abs(STAIR_ROUTE.startX - STAIR_ROUTE.landingStartX - STAIR_ROUTE.landingDepth) < 1e-9);
  assert.ok(stairSurfaceY(15) > stairSurfaceY(STAIR_ROUTE.startX));
  assert.ok(isInsideStairTunnel(10, stairSurfaceY(10) + 0.5, STAIR_ROUTE.z));
  assert.ok(!isInsideStairTunnel(10, stairSurfaceY(10) - 0.2, STAIR_ROUTE.z));
});

test('stair flights meet ADA tread, riser, nosing, and landing dimensions', () => {
  const lowerTreadDepth = (STAIR_ROUTE.lowerFlightEndX - STAIR_ROUTE.startX) / STAIR_ROUTE.lowerStepCount;
  const upperTreadDepth = (STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX) / STAIR_ROUTE.upperStepCount;
  const lowerRiserHeight = (STAIR_ROUTE.landingY - STAIR_ROUTE.baseY) / STAIR_ROUTE.lowerStepCount;
  const upperRiserHeight = (STAIR_ROUTE.baseY + STAIR_ROUTE.riseY - STAIR_ROUTE.landingY) / STAIR_ROUTE.upperStepCount;
  assert.ok(lowerTreadDepth >= STAIR_ROUTE.minTreadDepth);
  assert.ok(upperTreadDepth >= STAIR_ROUTE.minTreadDepth);
  assert.ok(lowerRiserHeight <= STAIR_ROUTE.maxRiserHeight);
  assert.ok(upperRiserHeight <= STAIR_ROUTE.maxRiserHeight);
  assert.ok(STAIR_ROUTE.nosingDepth <= 0.0381);
  assert.ok(STAIR_ROUTE.landingDepth >= 1.524);
});

test('stair height moves the street and shaft outlet together', () => {
  const low = verticalLayout(10);
  const high = verticalLayout(12);
  assert.ok(Math.abs(high.streetY - low.streetY - 2) < 1e-9);
  assert.ok(Math.abs(high.shaftOutletY - low.shaftOutletY - 2) < 1e-9);
  assert.ok(Math.abs(high.surfaceParticleFloorY - low.surfaceParticleFloorY - 2) < 1e-9);
  assert.ok(Math.abs(high.streetMaxY - low.streetMaxY - 2) < 1e-9);
  assert.equal(stairSurfaceY(STAIR_ROUTE.endX, STAIR_ROUTE.baseY, STAIR_ROUTE.landingY, high.streetY), high.streetY);
  assert.equal(SHAFT_ROUTE.throatY, 3.6);
});

test('permanent stair underfill always occludes particles at the dynamic stair surface', () => {
  const stairX = 20;
  const lowSurfaceY = stairSurfaceY(stairX, STATION_FLOOR_Y, 2, 8.2);
  const highSurfaceY = stairSurfaceY(stairX, STATION_FLOOR_Y, 4, 10);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z + STAIR_ROUTE.width, STATION_FLOOR_Y, 2, 8.2), -4);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z, STATION_FLOOR_Y, 2, 8.2), lowSurfaceY + 0.12);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z, STATION_FLOOR_Y, 4, 10), highSurfaceY + 0.12);
  assert.ok(highSurfaceY > lowSurfaceY);
});

test('turnstile pedestals occlude while fare lanes remain open', () => {
  const floorY = STATION_FLOOR_Y + 0.3;
  assert.equal(
    constrainTurnstilePositionX(TURNSTILE_ROUTE.x, floorY, TURNSTILE_ROUTE.pedestalZ[1], 1),
    TURNSTILE_ROUTE.x - TURNSTILE_ROUTE.halfDepth
  );
  assert.equal(
    constrainTurnstilePositionX(TURNSTILE_ROUTE.x, floorY, -2.5, 1),
    TURNSTILE_ROUTE.x
  );
  assert.equal(
    constrainTurnstilePositionX(TURNSTILE_ROUTE.x, floorY, TURNSTILE_ROUTE.pedestalZ[1], -1),
    TURNSTILE_ROUTE.x + TURNSTILE_ROUTE.halfDepth
  );
});

test('underground opening clearance changes the tunnel portal without moving stairs or turnstiles', () => {
  const stairFloorY = stairSurfaceY(STAIR_ROUTE.startX);
  const lowPortalX = stairStreetPortalX(STAIR_ROUTE.landingY, SHAFT_ROUTE.streetY, 2.2);
  const highPortalX = stairStreetPortalX(STAIR_ROUTE.landingY, SHAFT_ROUTE.streetY, 5);
  assert.equal(stairFloorY, STAIR_ROUTE.baseY);
  assert.notEqual(lowPortalX, highPortalX);
  assert.equal(
    constrainTurnstilePositionX(TURNSTILE_ROUTE.x, STAIR_ROUTE.baseY + 0.2, TURNSTILE_ROUTE.pedestalZ[0], 1),
    TURNSTILE_ROUTE.x - TURNSTILE_ROUTE.halfDepth
  );
});

test('permanent track, stair, and outer-wall ground occlude without sealing passages', () => {
  const trackGround = constrainPermanentGroundPosition(0, -5, TRACK_ROUTE.centerZ);
  assert.equal(trackGround[1], GROUND_LAYOUT.trackFloorY);
  assert.equal(constrainPermanentGroundPosition(0, -3, TRACK_ROUTE.centerZ)[1], -3);

  const stairGround = constrainPermanentGroundPosition(16, -5, STAIR_ROUTE.z);
  assert.equal(stairGround[1], GROUND_LAYOUT.stairFloorY);
  assert.equal(constrainPermanentGroundPosition(16, 0, STAIR_ROUTE.z)[1], 0);

  const outerGround = constrainPermanentGroundPosition(16, 0, GROUND_LAYOUT.stairOuterZ - 0.4);
  assert.equal(outerGround[2], GROUND_LAYOUT.stairOuterZ + 0.02);
  assert.equal(constrainPermanentGroundPosition(16, 0, STAIR_ROUTE.z)[2], STAIR_ROUTE.z);
});

test('shaft outlets sit above the station roof and inside the street volume', () => {
  assert.deepEqual(SHAFT_POSITIONS, [-7, 0, 7]);
  assert.ok(SHAFT_POSITIONS.every((shaftX) => shaftX < STAIR_ROUTE.landingStartX - STAIR_ROUTE.width / 2));
  assert.ok(SHAFT_ROUTE.throatY < SHAFT_ROUTE.outletY);
  assert.ok(SHAFT_ROUTE.streetY >= STREET_VOLUME.minY);
  assert.ok(isInsideStreetVolume(0, SHAFT_ROUTE.streetY, SHAFT_ROUTE.z));
});

test('individual shaft controls select the nearest ventilation shaft', () => {
  const controls = [0.2, 0.5, 0.9];
  assert.equal(shaftControlAtX(SHAFT_POSITIONS[0], controls), controls[0]);
  assert.equal(shaftControlAtX(SHAFT_POSITIONS[1], controls), controls[1]);
  assert.equal(shaftControlAtX(SHAFT_POSITIONS[2], controls), controls[2]);
  const isolatedSettings = { ...settings, shaftControls: [0, 1, 1] };
  assert.equal(airflowControlResponse('shaftStack', [SHAFT_POSITIONS[0], 5, SHAFT_ROUTE.z], isolatedSettings).y, 0);
  assert.ok(airflowControlResponse('shaftStack', [SHAFT_POSITIONS[1], 5, SHAFT_ROUTE.z], isolatedSettings).y > 0);
  assert.ok(airflowControlResponse('shaftStack', [SHAFT_POSITIONS[2], 5, SHAFT_ROUTE.z], isolatedSettings).y > 0);
});

test('negative shaft speed reverses vertical flow while retaining inward capture', () => {
  const reverseSettings = { ...settings, shaftControls: [-1, 1, 1] };
  const halfReverseSettings = { ...settings, shaftControls: [-0.5, 1, 1] };
  const shaftX = SHAFT_POSITIONS[0];
  const shaftResponse = airflowControlResponse('shaftStack', [shaftX + 0.5, 5, SHAFT_ROUTE.z + 0.25], reverseSettings);
  const halfShaftResponse = airflowControlResponse(
    'shaftStack',
    [shaftX + 0.5, 5, SHAFT_ROUTE.z + 0.25],
    halfReverseSettings
  );
  const outletResponse = airflowControlResponse(
    'surfaceCrosswind',
    [shaftX, STREET_VOLUME.minY + 0.5, SHAFT_ROUTE.z],
    reverseSettings
  );
  assert.ok(shaftResponse.y < 0);
  assert.ok(shaftResponse.x < 0);
  assert.ok(shaftResponse.z < 0);
  assert.ok(outletResponse.y < 0);
  assert.ok(Math.sign(outletResponse.z) === Math.sign(settings.surfaceCrosswind));
  assert.ok(Math.abs(halfShaftResponse.y - shaftResponse.y * 0.5) < 1e-9);
  assert.ok(Math.abs(halfShaftResponse.x - shaftResponse.x * 0.5) < 1e-9);
});

test('shaft endpoint telemetry measures flow and temperature at both ends', () => {
  const positions = new Float32Array([
    SHAFT_POSITIONS[0], SHAFT_ROUTE.throatY, SHAFT_ROUTE.z, 1,
    SHAFT_POSITIONS[0], SHAFT_ROUTE.streetY + 0.6, SHAFT_ROUTE.z, 2,
    SHAFT_POSITIONS[1], SHAFT_ROUTE.throatY, SHAFT_ROUTE.z, 1,
    SHAFT_POSITIONS[1], SHAFT_ROUTE.streetY + 0.6, SHAFT_ROUTE.z, 2,
    30, 20, 4, 2
  ]);
  const velocities = new Float32Array([
    0, 2, 0, 0.4,
    0, 3, 0, 0.6,
    0, 1, 0, 0.2,
    0, 4, 0, 0.8,
    0, 20, 0, 1
  ]);
  const telemetry = measureShaftEndpoints(positions, velocities, 5);
  assert.equal(telemetry.length, SHAFT_POSITIONS.length);
  assert.equal(telemetry[0].label, SHAFT_LABELS[0]);
  assert.ok(Math.abs(telemetry[0].intake.flow - 2) < 0.01);
  assert.ok(Math.abs(telemetry[0].intake.temperature - 80) < 0.1);
  assert.ok(Math.abs(telemetry[0].outlet.flow - 3) < 0.01);
  assert.ok(Math.abs(telemetry[0].outlet.temperature - 90) < 0.1);
  assert.equal(telemetry[0].intake.count, 2);
  assert.equal(telemetry[0].outlet.count, 2);
  assert.deepEqual(telemetry[2].intake, { flow: null, temperature: null, count: 0 });
  assert.deepEqual(telemetry[2].outlet, { flow: null, temperature: null, count: 0 });
});

test('temperature chart range follows observed endpoint temperatures with padding', () => {
  assert.deepEqual(temperatureChartRange([]), [60, 110]);
  assert.deepEqual(temperatureChartRange([60, 60.4, 61.2]), [58, 64]);
  assert.deepEqual(temperatureChartRange([72, Number.NaN, 92]), [70, 94]);
});

test('street volume remains inside the expanded fluid bounds', () => {
  assert.ok(STREET_VOLUME.minX >= FLUID_BOUNDS.minX);
  assert.ok(STREET_VOLUME.maxX <= FLUID_BOUNDS.maxX);
  assert.ok(STREET_VOLUME.minY >= FLUID_BOUNDS.minY);
  assert.ok(STREET_VOLUME.maxY <= FLUID_BOUNDS.maxY);
});

test('fluid volume leaves an upper-air region above the street', () => {
  assert.ok(FLUID_BOUNDS.maxY - STREET_VOLUME.maxY >= 10);
});

test('roof gap widens symmetrically around the ridge', () => {
  const endpoints = roofGapEndpoints(0.4, 1.2);
  assert.ok(Math.abs(endpoints.leftEndZ - -0.2) < 0.000001);
  assert.equal(endpoints.rightStartZ, 1);
  assert.ok(roofGapEndpoints(0, 2).rightStartZ - roofGapEndpoints(0, 2).leftEndZ > 0);
});

test('vertical roof gap raises only the elevated roof panel', () => {
  const leftRoof = roofCeilingAt(-2, 14, 0, 1.4);
  const rightRoof = roofCeilingAt(2, 14, 0, 1.4);
  assert.equal(leftRoof, roofCeilingAt(-2, 14, 0, 0));
  assert.ok(Math.abs(rightRoof - roofCeilingAt(2, 14, 0, 0) - 1.4) < 0.000001);
});

test('roof panel segments leave apertures around every shaft', () => {
  const segments = roofPanelSegments(-11, 11, -4.6, -0.4);
  SHAFT_POSITIONS.forEach((shaftX) => {
    assert.ok(!segments.some((segment) => (
      shaftX > segment.startX && shaftX < segment.endX
      && SHAFT_ROUTE.z > segment.startZ && SHAFT_ROUTE.z < segment.endZ
    )));
  });
});

test('clerestory horizontal and vertical gaps independently increase ridge exchange', () => {
  const base = { roofOffset: 0, roofGapHorizontal: 0.8, roofGapVertical: 0.4, clerestoryOpen: 1 };
  const tallerGap = { ...base, roofGapVertical: 0.9 };
  const widerGap = { ...base, roofGapHorizontal: 1.8 };
  assert.equal(clerestoryOpeningStrength(2, base), 0);
  assert.ok(clerestoryOpeningStrength(0, tallerGap) > clerestoryOpeningStrength(0, base));
  assert.ok(clerestoryOpeningStrength(0.7, widerGap) > clerestoryOpeningStrength(0.7, base));
  assert.equal(clerestoryOpeningStrength(0, { ...base, clerestoryWindows: false }), 0);
});

test('shader route constants are emitted as GLSL float literals', () => {
  assert.equal(glslFloat(-16), '-16.000');
  assert.equal(glslFloat(7), '7.000');
  assert.equal(glslFloat(8.4), '8.400');
});

const settings = {
  shaftExchange: 0.65,
  downFans: 1,
  floorAirMovers: 1,
  surfaceTemperature: 81.5,
  roadSurfaceTemperature: 92,
  ambientAirTemperature: 72,
  passengerHeat: 0.75,
  surfaceCrosswind: 3,
  density: 1.18,
  stiffness: 5,
  ceilingFans: 1,
  grooves: 1,
  roofOffset: 0,
  stackEffect: 1,
  shaftFans: true,
  shaftFanVelocity: 3,
  floodTunnels: true,
  floodFlow: 1,
  floodPumpDirection: 1
};

test('downward fans produce downward force only in their capture zone', () => {
  assert.ok(airflowControlResponse('downFans', [0, 2.2, AIRFLOW_PARAMS.fanZ], settings).y < 0);
  assert.equal(airflowControlResponse('downFans', [0, -2, AIRFLOW_PARAMS.fanZ], settings).y, 0);
  assert.equal(airflowControlResponse('downFans', [14, 2.2, AIRFLOW_PARAMS.fanZ], settings).y, 0);
});

test('floor air-mover slider varies positive floor movement', () => {
  const position = [0, -2.4, AIRFLOW_PARAMS.floorMoverZ];
  const stopped = airflowControlResponse('floorAirMovers', position, { ...settings, floorAirMovers: 0 });
  const halfSpeed = airflowControlResponse('floorAirMovers', position, { ...settings, floorAirMovers: 0.5 });
  const fullSpeed = airflowControlResponse('floorAirMovers', position, settings);
  assert.equal(stopped.x, 0);
  assert.ok(halfSpeed.x > stopped.x);
  assert.ok(fullSpeed.x > halfSpeed.x);
  assert.equal(airflowControlResponse('floorAirMovers', [0, 0, AIRFLOW_PARAMS.floorMoverZ], settings).x, 0);
});

test('surface temperature changes floor buoyancy and thermal response', () => {
  const position = [0, -2.4, 0];
  const cool = airflowControlResponse('surfaceTemperature', position, { ...settings, surfaceTemperature: 60 });
  const warm = airflowControlResponse('surfaceTemperature', position, { ...settings, surfaceTemperature: 110 });
  assert.ok(warm.y > cool.y);
  assert.ok(warm.cooling < cool.cooling);
});

test('passenger heat follows the visible commuter positions', () => {
  assert.equal(PASSENGER_POSITIONS.length, 18);
  const nearPassenger = passengerHeatResponse([
    PASSENGER_POSITIONS[0].x,
    PASSENGER_POSITIONS[0].y,
    PASSENGER_POSITIONS[0].z
  ], 1);
  const farFromPassengers = passengerHeatResponse([-20, -1.75, 0], 1);
  assert.ok(nearPassenger.y > 0);
  assert.ok(nearPassenger.thermal > farFromPassengers.thermal);
  assert.equal(passengerHeatResponse([0, 0, 0], 0).y, 0);
});

test('road temperature drives signed convection above the road', () => {
  const roadPosition = [0, STREET_VOLUME.minY + 1, 0];
  const hotRoad = airflowControlResponse('roadTemperature', roadPosition, {
    ...settings,
    roadSurfaceTemperature: 110
  });
  const coldRoad = airflowControlResponse('roadTemperature', roadPosition, {
    ...settings,
    roadSurfaceTemperature: 50
  });
  const sidewalk = airflowControlResponse('roadTemperature', [0, STREET_VOLUME.minY + 1, -2], {
    ...settings,
    roadSurfaceTemperature: 110
  });
  assert.ok(hotRoad.y > 0);
  assert.ok(coldRoad.y < 0);
  assert.equal(sidewalk.y, 0);
});

test('ambient air temperature affects the retained upper-air band', () => {
  const position = [0, FLUID_BOUNDS.maxY - 4, 0];
  const coolAmbient = airflowControlResponse('ambientAirTemperature', position, {
    ...settings,
    ambientAirTemperature: 50
  });
  const warmAmbient = airflowControlResponse('ambientAirTemperature', position, {
    ...settings,
    ambientAirTemperature: 95
  });
  assert.ok(warmAmbient.cooling < coolAmbient.cooling);
  assert.ok(warmAmbient.y > coolAmbient.y);
  assert.ok(Math.abs(airflowControlResponse('ambientAirTemperature', [0, STREET_VOLUME.minY, 0], settings).y) < 1e-12);
});

test('surface crosswind changes direction and stays above the station roof', () => {
  const positive = airflowControlResponse('surfaceCrosswind', [0, STREET_VOLUME.minY + 1, 0], settings);
  const negative = airflowControlResponse('surfaceCrosswind', [0, STREET_VOLUME.minY + 1, 0], {
    ...settings, surfaceCrosswind: -3
  });
  const underground = airflowControlResponse('surfaceCrosswind', [0, 4, 0], settings);
  assert.ok(positive.z > 0);
  assert.ok(negative.z < 0);
  assert.deepEqual(underground, { x: 0, y: 0, z: 0, cooling: 0 });
});

test('surface crosswind remains visible ten meters above the road', () => {
  const particleCount = 4096;
  [STREET_VOLUME.minY, STREET_VOLUME.minY + 2].forEach((streetY) => {
    const targetY = streetY + 10;
    const response = airflowControlResponse('surfaceCrosswind', [3, targetY, 2], settings);
    const particlesNearTarget = Array.from(
      { length: Math.ceil(particleCount / SURFACE_PARTICLE_STRIDE) },
      (_, surfaceIndex) => surfaceParticleSeedY(
        surfaceIndex * SURFACE_PARTICLE_STRIDE,
        particleCount,
        streetY
      )
    ).filter((particleY) => Math.abs(particleY - targetY) <= 0.1);

    assert.ok(response.z > 0);
    assert.ok(particlesNearTarget.length > 0);
    assert.ok(targetY < FLUID_BOUNDS.maxY);
  });
});

test('surface wind keeps particles distributed in the air above the street', () => {
  const particleXs = [-40, -20, 0, 20, 40];
  const mixFractions = particleXs.map((_, index) => (index + 0.5) / particleXs.length);
  const floorResponses = particleXs.map((x, index) => airflowControlResponse(
    'surfaceCrosswind',
    [x, STREET_LAYOUT.surfaceParticleFloorY + 0.25, 2, mixFractions[index]],
    settings
  ));
  const results = particleXs.map((x, index) => integrateResponse(
    'surfaceCrosswind',
    [x, STREET_LAYOUT.surfaceParticleFloorY + 0.25, 2, mixFractions[index]],
    settings,
    500
  ));
  const airborneHeights = results.map(({ position }) => position[1] - STREET_LAYOUT.surfaceParticleFloorY);

  assert.ok(floorResponses.every(({ y }) => y > 2));
  assert.ok(results.every(({ position }) => position[2] > 2));
  assert.ok(airborneHeights.every((height) => height >= SURFACE_MIXING.minimumHeight - 0.5));
  assert.ok(Math.max(...airborneHeights) - Math.min(...airborneHeights) > 6);
  assert.ok(airborneHeights.filter((height) => height > 4).length >= 3);
});

test('surface particle identities provide stable independent mixing heights', () => {
  const particleCount = 4096;
  const fractions = Array.from(
    { length: Math.ceil(particleCount / SURFACE_PARTICLE_STRIDE) },
    (_, surfaceIndex) => surfaceParticleSeedFraction(surfaceIndex * SURFACE_PARTICLE_STRIDE, particleCount)
  );
  assert.ok(fractions.every((fraction) => fraction > 0 && fraction < 1));
  assert.ok(fractions.every((fraction, index) => index === 0 || fraction > fractions[index - 1]));
});

test('surface crosswind returns particles from both vertical boundaries', () => {
  const nearFloor = airflowControlResponse('surfaceCrosswind', [3, STREET_LAYOUT.surfaceParticleFloorY, 2], settings);
  const nearCeiling = airflowControlResponse('surfaceCrosswind', [3, FLUID_BOUNDS.maxY, 2], settings);
  assert.ok(nearFloor.y > 0);
  assert.ok(nearCeiling.y < 0);
});

test('surface crosswind creates an upward pressure draw at each shaft outlet', () => {
  SHAFT_POSITIONS.forEach((shaftX) => {
    const outlet = airflowControlResponse('surfaceCrosswind', [shaftX, STREET_VOLUME.minY + 0.5, SHAFT_ROUTE.z], settings);
    const openStreet = airflowControlResponse('surfaceCrosswind', [shaftX + 2.5, STREET_VOLUME.minY + 0.5, 2], settings);
    assert.ok(outlet.y > 0);
    assert.ok(Math.abs(outlet.z) < Math.abs(openStreet.z));
  });
  const ceilingReturn = airflowControlResponse('surfaceCrosswind', [0, FLUID_BOUNDS.maxY, 2], settings);
  assert.ok(ceilingReturn.y < 0);
});

test('surface crosswind carries heat at least one meter above the road through each shaft', () => {
  const exhaustY = STREET_VOLUME.minY + 1;
  SHAFT_POSITIONS.forEach((shaftX) => {
    const exhaust = airflowControlResponse('surfaceCrosswind', [shaftX, exhaustY, SHAFT_ROUTE.z], settings);
    assert.ok(exhaust.y > 0);
    assert.equal(exhaust.cooling, 0);
  });
});

test('periodic surface pressure repels particles across the road seam', () => {
  const accelerations = surfacePressureAccelerations([-4.8, 4.8], 0.85, 1.18, 5);
  assert.ok(accelerations[0] > 0);
  assert.ok(accelerations[1] < 0);
  assert.ok(Math.abs(minimumImageSurfaceDelta(-9.6) - 0.4) < 1e-9);
});

test('surface crosswind pressure remains distributed instead of bunching at one side', () => {
  const binCount = 10;
  const span = FLUID_BOUNDS.maxZ - FLUID_BOUNDS.minZ;
  let positions = Array.from({ length: 40 }, (_, index) => (
    FLUID_BOUNDS.minZ + (index + 0.5) * span / 40 + Math.sin(index * 1.7) * 0.035
  ));
  let velocities = positions.map(() => 0);
  for (let step = 0; step < 240; step += 1) {
    const pressure = surfacePressureAccelerations(positions, 0.85, settings.density, settings.stiffness);
    velocities = velocities.map((velocity, index) => (
      (velocity + (pressure[index] + (settings.surfaceCrosswind - velocity) * 1.2) * 0.01) * 0.985
    ));
    positions = positions.map((z, index) => wrapSurfacePositionZ(z + velocities[index] * 0.01));
  }
  const occupancy = Array(binCount).fill(0);
  positions.forEach((z) => {
    const bin = Math.min(binCount - 1, Math.floor((z - FLUID_BOUNDS.minZ) / span * binCount));
    occupancy[bin] += 1;
  });
  assert.ok(occupancy.every((count) => count >= 2));
  assert.ok(Math.max(...occupancy) <= 6);
  assert.ok(positions.every((z) => z >= FLUID_BOUNDS.minZ && z < FLUID_BOUNDS.maxZ));
  assert.equal(wrapSurfacePositionZ(FLUID_BOUNDS.maxZ + span * 3.25), FLUID_BOUNDS.minZ + span * 0.25);
});

test('sidewalk stops where the stair tunnel enters the street plane', () => {
  const portalX = stairStreetPortalX();
  const upperRise = STREET_VOLUME.minY - STAIR_ROUTE.landingY;
  const centerlinePortalX = STAIR_ROUTE.upperFlightStartX
    + ((STREET_VOLUME.minY - STAIR_ROUTE.tunnelHeight - STAIR_ROUTE.landingY) / upperRise)
      * (STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX);
  assert.ok(portalX > STAIR_ROUTE.startX);
  assert.ok(portalX < centerlinePortalX);
  assert.ok(STREET_LAYOUT.sidewalkRoadEdgeZ > SHAFT_ROUTE.z + STREET_LAYOUT.shaftApertureSize / 2);
});

test('street ground occludes surface particles except at route openings', () => {
  assert.equal(constrainSurfacePositionY(4, 7, 2, true), STREET_LAYOUT.surfaceParticleFloorY);
  assert.equal(constrainSurfacePositionY(4, 7, 2, false), 7);
  SHAFT_POSITIONS.forEach((shaftX) => {
    assert.ok(isSurfaceOpening(shaftX, SHAFT_ROUTE.z));
    assert.equal(constrainSurfacePositionY(shaftX, 7, SHAFT_ROUTE.z, true), 7);
  });
  assert.ok(isSurfaceOpening(STAIR_ROUTE.endX, STAIR_ROUTE.z));
  assert.equal(constrainSurfacePositionY(STAIR_ROUTE.endX, 9, STAIR_ROUTE.z, true), 9);
});

test('insulated ground blocks direct train heat from the surface crosswind', () => {
  const acPosition = [0, 2, 2.5];
  const brakePosition = [0, -3, 2.5];
  assert.equal(trainThermalSource(acPosition, true, 0, true, false), 0);
  assert.equal(trainThermalSource(brakePosition, true, 0, false, true), 0);
  assert.ok(trainThermalSource(acPosition, false, 0, true, false) > 0);
  assert.ok(trainThermalSource(brakePosition, false, 0, false, true) > 0);
});

test('surface crosswind draws air up ventilation shafts and stairs', () => {
  const noWindSettings = {
    ...settings,
    surfaceCrosswind: 0,
    shaftFans: false,
    stackEffect: 0
  };
  const windSettings = { ...noWindSettings, surfaceCrosswind: -6 };
  const shaftPosition = [0, 5, SHAFT_ROUTE.z];
  const stairX = STAIR_ROUTE.endX - 1;
  const stairPosition = [stairX, stairSurfaceY(stairX) + 1, STAIR_ROUTE.z];
  const shaftWithoutWind = airflowControlResponse('shaftStack', shaftPosition, noWindSettings);
  const shaftWithWind = airflowControlResponse('shaftStack', shaftPosition, windSettings);
  const stairWithoutWind = airflowControlResponse('stairRoute', stairPosition, noWindSettings);
  const stairWithWind = airflowControlResponse('stairRoute', stairPosition, windSettings);
  assert.ok(shaftWithWind.y > shaftWithoutWind.y);
  assert.ok(stairWithWind.y > stairWithoutWind.y);
});

test('thermal resilience report balances passive credits and active load', () => {
  const report = thermalResilienceReport(settings);
  assert.equal(report.baseline, 45);
  assert.equal(report.passiveTotal, 60.8);
  assert.equal(report.activeTotal, 30.5);
  assert.equal(report.score, 75);
  assert.equal(report.passive.find((item) => item.key === 'floodFlow').points, 22);
  assert.equal(report.active.find((item) => item.key === 'shaftFans').points, 4.5);
  assert.equal(report.active.find((item) => item.key === 'floorAirMovers').points, 8);
});

test('ceiling flow and passive grooves have distinct directional responses', () => {
  assert.ok(airflowControlResponse('ceilingFlow', [0, 3, 0], settings).x > 0);
  assert.equal(airflowControlResponse('ceilingFlow', [0, 0, 0], settings).x, 0);
  const grooveResponse = airflowControlResponse('passiveGrooves', [0, 3.8, -2], settings);
  assert.ok(grooveResponse.x > 0);
  assert.ok(grooveResponse.z > 0);
});

function integrateResponse(control, initialPosition, simulationSettings, steps = 160, delta = 0.05) {
  const position = [...initialPosition];
  const velocity = [0, 0, 0];
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    const response = airflowControlResponse(control, position, simulationSettings);
    velocity[0] = (velocity[0] + response.x * delta) * 0.94;
    velocity[1] = (velocity[1] + response.y * delta) * 0.94;
    velocity[2] = (velocity[2] + response.z * delta) * 0.94;
    position[0] += velocity[0] * delta;
    position[1] += velocity[1] * delta;
    position[2] += velocity[2] * delta;
  }
  return { position, velocity };
}

test('particles follow the roof underside toward the ridge', () => {
  const roofSettings = { ...settings, roofPitch: 14, roofOffset: 0, grooves: 1 };
  const startZ = -3.2;
  const startY = roofCeilingAt(startZ, roofSettings.roofPitch, roofSettings.roofOffset) - 0.35;
  const result = integrateResponse('roofUnderside', [2, startY, startZ], roofSettings, 120);
  const finalRoofY = roofCeilingAt(result.position[2], roofSettings.roofPitch, roofSettings.roofOffset);
  assert.ok(result.position[2] > startZ);
  assert.ok(Math.abs(finalRoofY - result.position[1] - 0.25) < 0.55);
});

test('vertical roof gap updates roof underside airflow', () => {
  const position = [2, 6, 2];
  const lowRoof = airflowControlResponse('roofUnderside', position, {
    ...settings, roofPitch: 14, roofGapVertical: 0.2
  });
  const raisedRoof = airflowControlResponse('roofUnderside', position, {
    ...settings, roofPitch: 14, roofGapVertical: 2
  });
  assert.ok(raisedRoof.y > lowRoof.y);
  assert.ok(raisedRoof.z < lowRoof.z);
});

test('shaft stack effect lifts and cools air without shaft exchange', () => {
  const response = airflowControlResponse('shaftStack', [0, 3, SHAFT_ROUTE.z], settings);
  assert.ok(response.y > 0);
  assert.ok(response.cooling > 0);
  assert.equal(airflowControlResponse('shaftStack', [3, 3, SHAFT_ROUTE.z], settings).y, 0);
});

test('shaft lift starts at the intake and continues through the outlet', () => {
  assert.ok(airflowControlResponse('shaftStack', [0, 1.5, SHAFT_ROUTE.z], settings).y > 0);
  assert.ok(airflowControlResponse('shaftStack', [0, SHAFT_ROUTE.outletY, SHAFT_ROUTE.z], settings).y > 0);
  assert.deepEqual(
    airflowControlResponse('shaftStack', [0, STREET_VOLUME.minY + 0.6, SHAFT_ROUTE.z], settings),
    { x: 0, y: 0, z: 0, cooling: 0 }
  );
});

test('shaft flow recenters particles inside the shaft column', () => {
  const response = airflowControlResponse('shaftStack', [0.7, 5, SHAFT_ROUTE.z + 0.35], settings);
  assert.ok(response.x < 0);
  assert.ok(response.z < 0);
  assert.ok(response.y > 0);
});

test('particles travel from the shaft intake through its outlet', () => {
  const start = [0.65, 1.2, SHAFT_ROUTE.z + 0.35];
  const result = integrateResponse('shaftStack', start, settings, 180);
  assert.ok(result.position[1] > SHAFT_ROUTE.outletY);
  assert.ok(Math.abs(result.position[0]) < Math.abs(start[0]));
  assert.ok(Math.abs(result.position[2] - SHAFT_ROUTE.z) < Math.abs(start[2] - SHAFT_ROUTE.z));
  assert.ok(result.velocity[1] > 0);
});

test('scene occlusion deflects flow around solid station objects when enabled', () => {
  const position = [0.35, 0, -0.3];
  assert.deepEqual(
    airflowControlResponse('sceneOcclusion', position, { ...settings, windOcclusion: false }),
    { x: 0, y: 0, z: 0, cooling: 0 }
  );
  const deflected = airflowControlResponse('sceneOcclusion', position, { ...settings, windOcclusion: true });
  assert.ok(deflected.x > 0);
  assert.ok(deflected.z > 0);
});

test('powered shaft fans add controllable upward velocity', () => {
  const position = [0, 3, SHAFT_ROUTE.z];
  const passive = airflowControlResponse('shaftStack', position, { ...settings, shaftFans: false });
  const slow = airflowControlResponse('shaftStack', position, { ...settings, shaftFanVelocity: 1 });
  const fast = airflowControlResponse('shaftStack', position, { ...settings, shaftFanVelocity: 5 });
  assert.ok(slow.y > passive.y);
  assert.ok(fast.y > slow.y);
});

test('enclosed stair route carries heat uphill toward its street exit', () => {
  const routeX = 10;
  const response = airflowControlResponse('stairRoute', [routeX, stairSurfaceY(routeX) + 1, STAIR_ROUTE.z], settings);
  assert.ok(isInsideStairTunnel(routeX, stairSurfaceY(routeX) + 1, STAIR_ROUTE.z));
  assert.ok(response.x > 0);
  assert.ok(response.y > 0);
  assert.equal(airflowControlResponse('stairRoute', [routeX, stairSurfaceY(routeX) + 1, 2], settings).y, 0);
});

test('flood gallery flow captures warm air, pumps through the gallery, and cools it', () => {
  const response = airflowControlResponse('floodGallery', [0, -3.1, -3], settings);
  assert.ok(response.y < 0);
  assert.ok(response.z < 0);
  assert.ok(response.cooling > 0);
  const galleryResponse = airflowControlResponse('floodGallery', [0, FLOOD_GALLERY.y, FLOOD_GALLERY.z], settings);
  assert.ok(galleryResponse.x > 0);
  assert.equal(airflowControlResponse('floodGallery', [0, 1, 0], settings).cooling, 0);
});

test('disabled flood tunnels occlude the below-ground gallery volume', () => {
  assert.equal(constrainFloodPositionY(FLOOD_GALLERY.y, false), FLOOD_GALLERY.maxY);
  assert.equal(constrainFloodPositionY(FLOOD_GALLERY.y, true), FLOOD_GALLERY.y);
  assert.equal(constrainFloodPositionY(-3, false), -3);
  assert.deepEqual(
    airflowControlResponse('floodGallery', [0, -3.1, FLOOD_GALLERY.z], { ...settings, floodTunnels: false }),
    { x: 0, y: 0, z: 0, cooling: 0 }
  );
});

test('enabled flood tunnels require positive control to create cold-sink flow', () => {
  const position = [0, FLOOD_GALLERY.y, FLOOD_GALLERY.z];
  const stopped = airflowControlResponse('floodGallery', position, { ...settings, floodFlow: 0 });
  const flowing = airflowControlResponse('floodGallery', position, { ...settings, floodFlow: 0.5 });
  assert.deepEqual(stopped, { x: 0, y: 0, z: 0, cooling: 0 });
  assert.ok(flowing.x > 0);
  assert.ok(flowing.cooling > 0);
});

test('flood waterfall pulls air downward and cools it', () => {
  const position = [FLOOD_WATERFALL.x, (FLOOD_WATERFALL.topY + FLOOD_WATERFALL.bottomY) / 2, FLOOD_WATERFALL.z];
  const flowing = airflowControlResponse('floodWaterfall', position, settings);
  assert.ok(flowing.y < 0);
  assert.ok(flowing.cooling > 0);
  assert.deepEqual(
    airflowControlResponse('floodWaterfall', position, { ...settings, floodTunnels: false }),
    { x: 0, y: 0, z: 0, cooling: 0 }
  );
});

test('allowed trains cross the station once per configured interval', () => {
  const interval = 20;
  const entering = trainStateAtTime(0, interval, true);
  const midpoint = trainStateAtTime(TRAIN_ROUTE.traversalSeconds / 2, interval, true);
  const betweenRuns = trainStateAtTime(12, interval, true);
  const nextRun = trainStateAtTime(interval, interval, true);
  assert.equal(entering.positionX, TRAIN_ROUTE.startX);
  assert.equal(midpoint.positionX, 0);
  assert.ok(midpoint.velocityX < 0);
  assert.equal(betweenRuns.active, false);
  assert.deepEqual(nextRun, entering);
  assert.equal(trainStateAtTime(2, interval, false).active, false);
});

test('track and tunnel contain the full train at both route endpoints', () => {
  const halfCarLength = 8;
  assert.ok(TRACK_ROUTE.minX <= Math.min(TRAIN_ROUTE.startX, TRAIN_ROUTE.endX) - halfCarLength);
  assert.ok(TRACK_ROUTE.maxX >= Math.max(TRAIN_ROUTE.startX, TRAIN_ROUTE.endX) + halfCarLength);
  assert.ok(TRACK_ROUTE.tunnelHeight > 3.4);
  assert.ok(TRACK_ROUTE.tunnelWidth > 2.8);
});

test('flood gallery extends across the full track route', () => {
  assert.equal(FLOOD_GALLERY.minX, TRACK_ROUTE.minX);
  assert.equal(FLOOD_GALLERY.maxX, TRACK_ROUTE.maxX);
});

test('train stop frequency and duration control station dwell', () => {
  const stopStart = TRAIN_ROUTE.traversalSeconds / 2;
  assert.equal(trainStateAtTime(stopStart + 2, 20, true, 0, 5).stopped, false);
  const stopped = trainStateAtTime(stopStart + 2, 20, true, 1, 5);
  assert.equal(stopped.positionX, 0);
  assert.equal(stopped.velocityX, 0);
  assert.equal(stopped.stopped, true);
  assert.ok(trainStateAtTime(stopStart + 5.5, 20, true, 1, 5).positionX < 0);
  const partialStops = Array.from({ length: 20 }, (_, cycleIndex) => (
    trainStateAtTime(cycleIndex * 20 + stopStart + 1, 20, true, 0.5, 5).stopped
  ));
  assert.ok(partialStops.some(Boolean));
  assert.ok(partialStops.some((didStop) => !didStop));
});
