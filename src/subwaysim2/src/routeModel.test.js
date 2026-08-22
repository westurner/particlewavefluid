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
  STREET_VOLUME,
  TRAIN_ROUTE,
  constrainFloodPositionY,
  glslFloat,
  isInsideStairTunnel,
  isInsideStreetVolume,
  clerestoryOpeningStrength,
  stairSurfaceY,
  roofGapEndpoints,
  thermalResilienceReport,
  trainStateAtTime
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

test('stair profile rises continuously from platform to street route', () => {
  assert.equal(stairSurfaceY(STAIR_ROUTE.startX), STAIR_ROUTE.baseY);
  assert.equal(stairSurfaceY(STAIR_ROUTE.endX), STAIR_ROUTE.baseY + STAIR_ROUTE.riseY);
  assert.ok(stairSurfaceY(10) > stairSurfaceY(STAIR_ROUTE.startX));
  assert.ok(isInsideStairTunnel(10, stairSurfaceY(10) + 0.5, STAIR_ROUTE.z));
  assert.ok(!isInsideStairTunnel(10, stairSurfaceY(10) - 0.2, STAIR_ROUTE.z));
});

test('shaft outlets sit above the station roof and inside the street volume', () => {
  assert.deepEqual(SHAFT_POSITIONS, [-7, 0, 7]);
  assert.ok(SHAFT_ROUTE.throatY < SHAFT_ROUTE.outletY);
  assert.ok(SHAFT_ROUTE.outletY >= STREET_VOLUME.minY);
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

test('clerestory horizontal and vertical gaps independently increase ridge exchange', () => {
  const base = { roofOffset: 0, roofGapHorizontal: 0.8, roofGapVertical: 0.4, clerestoryOpen: 1 };
  const tallerGap = { ...base, roofGapVertical: 0.9 };
  const widerGap = { ...base, roofGapHorizontal: 1.8 };
  assert.equal(clerestoryOpeningStrength(2, base), 0);
  assert.ok(clerestoryOpeningStrength(0, tallerGap) > clerestoryOpeningStrength(0, base));
  assert.ok(clerestoryOpeningStrength(0.7, widerGap) > clerestoryOpeningStrength(0.7, base));
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

test('shaft stack effect lifts and cools air without shaft exchange', () => {
  const response = airflowControlResponse('shaftStack', [0, 3, SHAFT_ROUTE.z], settings);
  assert.ok(response.y > 0);
  assert.ok(response.cooling > 0);
  assert.equal(airflowControlResponse('shaftStack', [3, 3, SHAFT_ROUTE.z], settings).y, 0);
});

test('shaft lift starts at the intake and continues through the outlet', () => {
  assert.ok(airflowControlResponse('shaftStack', [0, 1.5, SHAFT_ROUTE.z], settings).y > 0);
  assert.ok(airflowControlResponse('shaftStack', [0, SHAFT_ROUTE.outletY, SHAFT_ROUTE.z], settings).y > 0);
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
