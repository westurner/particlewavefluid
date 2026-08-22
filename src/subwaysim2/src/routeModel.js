export const FLUID_BOUNDS = {
  minX: -16,
  maxX: 16,
  minY: -6.2,
  maxY: 14,
  minZ: -5,
  maxZ: 5
};

export const PARTICLE_SEED_BOUNDS = {
  minY: -5.5,
  maxY: 5
};

export const STAIR_ROUTE = {
  startX: 7,
  endX: 15.4,
  baseY: -3.05,
  riseY: 5.25,
  z: -2.5,
  width: 2.8,
  tunnelHeight: 3.2
};

export const SHAFT_POSITIONS = [-7, 0, 7];
export const SHAFT_ROUTE = {
  z: -1.4,
  throatY: 3.6,
  outletY: 8,
  streetY: 10
};

export const STREET_VOLUME = {
  minX: -15.5,
  maxX: 15.5,
  minY: 8,
  maxY: 13,
  minZ: -4.8,
  maxZ: 4.8
};

export const FLOOD_GALLERY = {
  y: -5,
  minY: -6.1,
  maxY: -3.8,
  z: -4.15,
  radius: 1.25
};

export const FLOOD_WATERFALL = {
  x: -8,
  topY: -2.6,
  bottomY: -5.4,
  z: -4.15,
  radius: 1.5
};

export const TRAIN_ROUTE = {
  startX: 35,
  endX: -35,
  traversalSeconds: 8
};

export const AIRFLOW_PARAMS = {
  fanPositions: [-6, 0, 6],
  fanZ: 1.4,
  fanRadius: 2.4,
  fanMinY: 0.8,
  fanMaxY: 3.8,
  floorMoverZ: -0.6,
  floorMoverMinY: -3,
  floorMoverMaxY: -1.8,
  ceilingMinY: 1.8,
  ceilingMaxY: 4,
  clerestoryMinGap: 0.08,
  clerestoryMaxGap: 2.4
};

export const RESILIENCE_BASELINE = 45;

export function glslFloat(value) {
  return Number(value).toFixed(3);
}

export function roofGapEndpoints(roofOffset, roofGap) {
  const gap = Math.max(0, roofGap);
  return {
    leftEndZ: roofOffset - gap / 2,
    rightStartZ: roofOffset + gap / 2
  };
}

export function thermalResilienceReport(settings) {
  const passive = [
    { key: 'shaftExchange', label: 'Shaft exchange', points: settings.shaftExchange * 32, description: 'Passive lift through the three street shafts.' },
    { key: 'grooves', label: 'Passive grooves', points: settings.grooves * 18, description: 'Low-energy guidance along the roof grooves.' },
    { key: 'floodFlow', label: 'Flood gallery', points: settings.floodTunnels ? settings.floodFlow * 22 : 0, description: 'Cold-sink exchange through the lower gallery.' }
  ];
  const active = [
    { key: 'shaftFans', label: 'Shaft fans', points: settings.shaftFans ? settings.shaftFanVelocity / 8 * 12 : 0, description: 'Powered upward flow through the street shafts.' },
    { key: 'downFans', label: 'Downward fans', points: settings.downFans * 8, description: 'Powered ceiling fan transport.' },
    { key: 'floorAirMovers', label: 'Floor air movers', points: settings.floorAirMovers * 8, description: 'Powered platform-level transport.' },
    { key: 'ceilingFans', label: 'Ceiling flow', points: settings.ceilingFans * 10, description: 'Powered ceiling-band sweep.' }
  ];
  const passiveTotal = passive.reduce((total, item) => total + item.points, 0);
  const activeTotal = active.reduce((total, item) => total + item.points, 0);
  const rawScore = RESILIENCE_BASELINE + passiveTotal - activeTotal;

  return {
    baseline: RESILIENCE_BASELINE,
    passive,
    active,
    passiveTotal,
    activeTotal,
    rawScore,
    score: Math.round(Math.max(0, Math.min(100, rawScore)))
  };
}

export function stairProgress(x) {
  return Math.max(0, Math.min(1, (x - STAIR_ROUTE.startX) / (STAIR_ROUTE.endX - STAIR_ROUTE.startX)));
}

export function stairSurfaceY(x) {
  return STAIR_ROUTE.baseY + stairProgress(x) * STAIR_ROUTE.riseY;
}

export function isInsideStairTunnel(x, y, z, margin = 0) {
  const inX = x >= STAIR_ROUTE.startX - margin && x <= STAIR_ROUTE.endX + margin;
  const inZ = Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2 + margin;
  const floorY = stairSurfaceY(x);
  return inX && inZ && y >= floorY - margin && y <= floorY + STAIR_ROUTE.tunnelHeight + margin;
}

export function isInsideStreetVolume(x, y, z) {
  return x >= STREET_VOLUME.minX && x <= STREET_VOLUME.maxX
    && y >= STREET_VOLUME.minY && y <= STREET_VOLUME.maxY
    && z >= STREET_VOLUME.minZ && z <= STREET_VOLUME.maxZ;
}

export function constrainFloodPositionY(y, floodTunnels) {
  return floodTunnels ? y : Math.max(y, FLOOD_GALLERY.maxY);
}

function trainStopsOnCycle(cycleIndex, stopFrequency) {
  if (stopFrequency <= 0) return false;
  if (stopFrequency >= 1) return true;
  const sequence = ((cycleIndex * 0.61803398875) % 1 + 1) % 1;
  return sequence < stopFrequency;
}

export function trainStateAtTime(elapsedSeconds, intervalSeconds, allowTrains, stopFrequency = 0, stopDuration = 0) {
  if (!allowTrains) return { active: false, positionX: TRAIN_ROUTE.startX, velocityX: 0 };
  const interval = Math.max(TRAIN_ROUTE.traversalSeconds + stopDuration, intervalSeconds);
  const cycleTime = ((elapsedSeconds % interval) + interval) % interval;
  const cycleIndex = Math.floor(Math.max(0, elapsedSeconds) / interval);
  const stops = trainStopsOnCycle(cycleIndex, stopFrequency);
  const halfTraversal = TRAIN_ROUTE.traversalSeconds / 2;
  const dwell = stops ? stopDuration : 0;
  if (cycleTime > TRAIN_ROUTE.traversalSeconds + dwell) {
    return { active: false, positionX: TRAIN_ROUTE.startX, velocityX: 0 };
  }
  const routeDistance = TRAIN_ROUTE.endX - TRAIN_ROUTE.startX;
  const routeVelocity = routeDistance / TRAIN_ROUTE.traversalSeconds;
  if (stops && cycleTime >= halfTraversal && cycleTime <= halfTraversal + dwell) {
    return { active: true, positionX: 0, velocityX: 0, stopped: true };
  }
  const travelTime = stops && cycleTime > halfTraversal ? cycleTime - dwell : cycleTime;
  return {
    active: true,
    positionX: TRAIN_ROUTE.startX + routeDistance * (travelTime / TRAIN_ROUTE.traversalSeconds),
    velocityX: routeVelocity,
    stopped: false
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const normalized = clamp01((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
}

function band(minimum, maximum, value) {
  return smoothstep(minimum, minimum + 0.4, value) * (1 - smoothstep(maximum - 0.4, maximum, value));
}

export function clerestoryOpeningStrength(z, { roofOffset, roofGapHorizontal, roofGapVertical, clerestoryOpen }) {
  const halfGap = Math.max(AIRFLOW_PARAMS.clerestoryMinGap, roofGapHorizontal * 0.5);
  return clerestoryOpen * roofGapVertical
    * (1 - smoothstep(halfGap, halfGap + 0.35, Math.abs(z - roofOffset)));
}

function maxFanInfluence(x, z) {
  return Math.max(...AIRFLOW_PARAMS.fanPositions.map((fanX) => (
    (1 - smoothstep(AIRFLOW_PARAMS.fanRadius * 0.6, AIRFLOW_PARAMS.fanRadius, Math.abs(x - fanX)))
      * (1 - smoothstep(1.4, 2.3, Math.abs(z - AIRFLOW_PARAMS.fanZ)))
  )));
}

function maxFloorMoverInfluence(x, z) {
  return Math.max(...AIRFLOW_PARAMS.fanPositions.map((fanX) => (
    (1 - smoothstep(AIRFLOW_PARAMS.fanRadius * 0.6, AIRFLOW_PARAMS.fanRadius, Math.abs(x - fanX)))
      * (1 - smoothstep(1.0, 1.8, Math.abs(z - AIRFLOW_PARAMS.floorMoverZ)))
  )));
}

export function airflowControlResponse(control, position, settings) {
  const [x, y, z] = position;
  const response = { x: 0, y: 0, z: 0, cooling: 0 };
  const ceilingBand = band(AIRFLOW_PARAMS.ceilingMinY, AIRFLOW_PARAMS.ceilingMaxY, y);

  if (control === 'downFans') {
    response.y = (-settings.downFans * maxFanInfluence(x, z) * band(AIRFLOW_PARAMS.fanMinY, AIRFLOW_PARAMS.fanMaxY, y) * 1.8) || 0;
  }
  if (control === 'floorAirMovers') {
    response.x = settings.floorAirMovers * maxFloorMoverInfluence(x, z)
      * band(AIRFLOW_PARAMS.floorMoverMinY, AIRFLOW_PARAMS.floorMoverMaxY, y) * 2;
  }
  if (control === 'surfaceTemperature') {
    const surfaceHeat = clamp01((settings.surfaceTemperature - 60) / 50);
    const surfaceBand = 1 - smoothstep(0, 2.1, Math.abs(y + 2.4));
    const thermalDelta = surfaceHeat - 0.42;
    response.y = thermalDelta * surfaceBand * 0.55;
    response.cooling = -thermalDelta * surfaceBand * 0.25;
  }
  if (control === 'ceilingFlow') {
    response.x = settings.ceilingFans * ceilingBand * 1.4;
  }
  if (control === 'passiveGrooves') {
    response.x = settings.grooves * ceilingBand * 0.5;
    response.z = -Math.sign(z - settings.roofOffset) * settings.grooves * smoothstep(3.2, 4, y) * 0.22;
  }
  if (control === 'shaftStack') {
    const shaftColumn = Math.max(...SHAFT_POSITIONS.map((shaftX) => (
      (1 - smoothstep(0.9, 1.8, Math.abs(x - shaftX)))
        * (1 - smoothstep(0.0, 0.9, Math.abs(z - SHAFT_ROUTE.z)))
        * smoothstep(0.4, SHAFT_ROUTE.throatY, y)
    )));
    const poweredVelocity = settings.shaftFans ? settings.shaftFanVelocity : 0;
    response.y = shaftColumn * (settings.stackEffect * 3.4 + poweredVelocity);
    response.cooling = shaftColumn * settings.stackEffect * 0.35;
  }
  if (control === 'stairRoute') {
    const routeProgress = stairProgress(x);
    const floorY = stairSurfaceY(x);
    const inRoute = x >= STAIR_ROUTE.startX && x <= STAIR_ROUTE.endX
      && Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2
      && y >= floorY && y <= floorY + STAIR_ROUTE.tunnelHeight;
    if (inRoute) {
      response.x = 0.45 + routeProgress * settings.stackEffect;
      response.y = 0.28 + settings.stackEffect * (0.5 + routeProgress * 2.8);
      response.z = (STAIR_ROUTE.z - z) * 0.35;
    }
  }
  if (control === 'floodGallery') {
    if (!settings.floodTunnels || settings.floodFlow <= 0) return response;
    const floodBand = 1 - smoothstep(0, 2.4, Math.abs(z - FLOOD_GALLERY.z));
    const captureBand = 1 - smoothstep(0, 1.6, Math.abs(y + 3.1));
    const galleryBand = 1 - smoothstep(0, FLOOD_GALLERY.radius, Math.abs(z - FLOOD_GALLERY.z));
    response.y = -settings.floodFlow * floodBand * captureBand * 0.8;
    response.z = (FLOOD_GALLERY.z - z) * settings.floodFlow * captureBand * 0.45;
    response.x = settings.floodPumpDirection * settings.floodFlow * galleryBand * 2.4;
    response.cooling = settings.floodFlow * (floodBand * captureBand * 0.22 + galleryBand * 0.35);
  }
  if (control === 'floodWaterfall') {
    if (!settings.floodTunnels || settings.floodFlow <= 0) return response;
    const radialDistance = Math.hypot(x - FLOOD_WATERFALL.x, z - FLOOD_WATERFALL.z);
    const waterfallBand = 1 - smoothstep(FLOOD_WATERFALL.radius * 0.5, FLOOD_WATERFALL.radius, radialDistance);
    const verticalBand = band(FLOOD_WATERFALL.bottomY, FLOOD_WATERFALL.topY, y);
    response.y = -settings.floodFlow * waterfallBand * verticalBand * 2.4;
    response.cooling = settings.floodFlow * waterfallBand * verticalBand * 0.8;
  }

  return response;
}
