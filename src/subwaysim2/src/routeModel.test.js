import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLUID_BOUNDS,
  AIRFLOW_PARAMS,
  airflowControlResponse,
  FLOOD_GALLERY,
  FLOOD_WATERFALL,
  PARTICLE_SEED_BOUNDS,
  SHAFT_POSITIONS,
  SHAFT_ROUTE,
  STAIR_ROUTE,
  STREET_LAYOUT,
  STREET_VOLUME,
  TRACK_ROUTE,
  TRAIN_ROUTE,
  TURNSTILE_ROUTE,
  constrainFloodPositionY,
  constrainStairUnderfillPositionY,
  constrainSurfacePositionY,
  constrainTurnstilePositionX,
  glslFloat,
  isInsideStairTunnel,
  isInsideStreetVolume,
  isSurfaceOpening,
  minimumImageSurfaceDelta,
  stairStreetPortalX,
  clerestoryOpeningStrength,
  stairSurfaceY,
  roofGapEndpoints,
  roofCeilingAt,
  roofPanelSegments,
  thermalResilienceReport,
  trainStateAtTime,
  trainThermalSource,
  surfacePressureAccelerations,
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
  assert.ok(stairSurfaceY(15) > stairSurfaceY(STAIR_ROUTE.startX));
  assert.ok(isInsideStairTunnel(10, stairSurfaceY(10) + 0.5, STAIR_ROUTE.z));
  assert.ok(!isInsideStairTunnel(10, stairSurfaceY(10) - 0.2, STAIR_ROUTE.z));
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

test('enabled stair underfill always occludes particles at the dynamic stair surface', () => {
  const stairX = 20;
  const lowSurfaceY = stairSurfaceY(stairX, -3.05, 2, 8.2);
  const highSurfaceY = stairSurfaceY(stairX, -3.05, 4, 10);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z, false, -3.05, 2, 8.2), -4);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z + STAIR_ROUTE.width, true, -3.05, 2, 8.2), -4);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z, true, -3.05, 2, 8.2), lowSurfaceY + 0.12);
  assert.equal(constrainStairUnderfillPositionY(stairX, -4, STAIR_ROUTE.z, true, -3.05, 4, 10), highSurfaceY + 0.12);
  assert.ok(highSurfaceY > lowSurfaceY);
});

test('turnstile pedestals occlude while fare lanes remain open', () => {
  const floorY = -2.8;
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

test('shaft outlets sit above the station roof and inside the street volume', () => {
  assert.deepEqual(SHAFT_POSITIONS, [-7, 0, 7]);
  assert.ok(SHAFT_POSITIONS.every((shaftX) => shaftX < STAIR_ROUTE.landingStartX - STAIR_ROUTE.width / 2));
  assert.ok(SHAFT_ROUTE.throatY < SHAFT_ROUTE.outletY);
  assert.ok(SHAFT_ROUTE.streetY >= STREET_VOLUME.minY);
  assert.ok(isInsideStreetVolume(0, SHAFT_ROUTE.streetY, SHAFT_ROUTE.z));
});

test('street volume remains inside the expanded fluid bounds', () => {
  assert.ok(STREET_VOLUME.minX >= FLUID_BOUNDS.minX);
  assert.ok(STREET_VOLUME.maxX <= FLUID_BOUNDS.maxX);
  assert.ok(STREET_VOLUME.minY >= FLUID_BOUNDS.minY);
  assert.ok(STREET_VOLUME.maxY <= FLUID_BOUNDS.maxY);
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
