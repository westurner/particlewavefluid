export const FLUID_BOUNDS = {
  minX: -48,
  maxX: 48,
  minY: -6.2,
  maxY: 32,
  minZ: -5,
  maxZ: 5
};

export const PARTICLE_SEED_BOUNDS = {
  minY: -5.5,
  maxY: 5
};
export const SURFACE_PARTICLE_STRIDE = 5;
export const SURFACE_MIXING = {
  minimumHeight: 1.25,
  ceilingMargin: 1.5,
  strength: 0.8
};

export function surfaceParticleSeedFraction(particleIndex, particleCount) {
  const surfaceParticleIndex = Math.floor(particleIndex / SURFACE_PARTICLE_STRIDE);
  const surfaceParticleCount = Math.ceil(particleCount / SURFACE_PARTICLE_STRIDE);
  return (Math.min(surfaceParticleIndex, surfaceParticleCount - 1) + 0.5) / surfaceParticleCount;
}

export function surfaceParticleSeedY(
  particleIndex,
  particleCount,
  streetY = STREET_VOLUME.minY,
  maxY = FLUID_BOUNDS.maxY
) {
  const heightFraction = surfaceParticleSeedFraction(particleIndex, particleCount);
  return streetY + (maxY - streetY) * heightFraction;
}

export const STAIR_ROUTE = {
  landingStartX: 9.5,
  startX: 11,
  lowerFlightEndX: 19.5,
  upperFlightStartX: 22.5,
  endX: 32,
  baseY: -3.05,
  landingY: 3,
  riseY: 13.05,
  z: -2.5,
  width: 2.8,
  tunnelHeight: 3.2,
  stepCount: 75,
  maxRiserHeight: 0.175,
  minTreadDepth: 0.28
};

export const TURNSTILE_ROUTE = {
  x: 8.65,
  halfDepth: 0.42,
  pedestalHalfWidth: 0.12,
  pedestalHeight: 1.15,
  pedestalZ: [-3.7, -2.9, -2.1, -1.3]
};

export const SHAFT_POSITIONS = [-7, 0, 7];
export const SHAFT_LABELS = ['West', 'Central', 'East'];
export const SHAFT_ROUTE = {
  z: -1.4,
  throatY: 3.6,
  outletY: 8,
  streetY: 10
};

export function shaftControlAtX(x, controls = [1, 1, 1]) {
  const shaftIndex = SHAFT_POSITIONS.reduce((nearestIndex, shaftX, index) => (
    Math.abs(x - shaftX) < Math.abs(x - SHAFT_POSITIONS[nearestIndex]) ? index : nearestIndex
  ), 0);
  return controls[shaftIndex] ?? 1;
}

export function measureShaftEndpoints(positionData, velocityData, particleCount, streetY = SHAFT_ROUTE.streetY) {
  const endpointDefinitions = [
    { key: 'intake', y: SHAFT_ROUTE.throatY },
    { key: 'outlet', y: streetY }
  ];
  return SHAFT_POSITIONS.map((shaftX, shaftIndex) => {
    const endpoints = Object.fromEntries(endpointDefinitions.map(({ key, y: endpointY }) => {
      const samples = [];
      for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
        const offset = particleIndex * 4;
        const deltaX = positionData[offset] - shaftX;
        const deltaY = positionData[offset + 1] - endpointY;
        const deltaZ = positionData[offset + 2] - SHAFT_ROUTE.z;
        if (Math.abs(deltaX) > 3.4 || Math.abs(deltaZ) > 3.5) continue;
        samples.push({ offset, distanceSquared: deltaX ** 2 + deltaY ** 2 + deltaZ ** 2 });
      }
      const nearestSamples = samples.sort((left, right) => left.distanceSquared - right.distanceSquared).slice(0, 8);
      let verticalVelocity = 0;
      let thermalIntensity = 0;
      let totalWeight = 0;
      nearestSamples.forEach(({ offset, distanceSquared }) => {
        const weight = 1 / (distanceSquared + 0.01);
        verticalVelocity += velocityData[offset + 1] * weight;
        thermalIntensity += velocityData[offset + 3] * weight;
        totalWeight += weight;
      });
      return [key, nearestSamples.length > 0 ? {
        flow: verticalVelocity / totalWeight,
        temperature: 60 + (thermalIntensity / totalWeight) * 50,
        count: nearestSamples.length
      } : { flow: null, temperature: null, count: 0 }];
    }));
    return { id: shaftIndex, label: SHAFT_LABELS[shaftIndex], x: shaftX, ...endpoints };
  });
}

export const STREET_VOLUME = {
  minX: -15.5,
  maxX: 33,
  minY: 10,
  maxY: 13,
  minZ: -4.8,
  maxZ: 4.8
};

export const STREET_LAYOUT = {
  sidewalkRoadEdgeZ: -0.55,
  shaftApertureSize: 1.5,
  sidewalkThickness: 0.2,
  surfaceParticleFloorY: 10.22
};

export const PASSENGER_POSITIONS = Array.from({ length: 18 }, (_, passengerIndex) => ({
  x: -6 + (passengerIndex * 37 % 120) / 10,
  y: -1.75,
  z: -2 - (passengerIndex * 17 % 15) / 10
}));

export function verticalLayout(stairHeight = STAIR_ROUTE.riseY) {
  const streetY = STAIR_ROUTE.baseY + stairHeight;
  return {
    stairHeight,
    streetY,
    streetMaxY: streetY + (STREET_VOLUME.maxY - STREET_VOLUME.minY),
    shaftOutletY: streetY + (SHAFT_ROUTE.outletY - SHAFT_ROUTE.streetY),
    surfaceParticleFloorY: streetY + (STREET_LAYOUT.surfaceParticleFloorY - STREET_VOLUME.minY)
  };
}

export function verticalLayoutFromSurfaceY(surfaceY = STAIR_ROUTE.baseY + STAIR_ROUTE.riseY) {
  return verticalLayout(surfaceY - STAIR_ROUTE.baseY);
}

export const TRAIN_ROUTE = {
  startX: 35,
  endX: -35,
  traversalSeconds: 8
};

export const TRACK_ROUTE = {
  minX: Math.min(TRAIN_ROUTE.startX, TRAIN_ROUTE.endX) - 8,
  maxX: Math.max(TRAIN_ROUTE.startX, TRAIN_ROUTE.endX) + 8,
  bedY: -3.8,
  centerZ: 2.5,
  width: 5,
  tunnelHeight: 5.4,
  tunnelWidth: 5.8
};

export const GROUND_LAYOUT = {
  trackFloorY: TRACK_ROUTE.bedY + 0.2,
  stairFloorY: STAIR_ROUTE.baseY,
  stairOuterZ: STAIR_ROUTE.z - STAIR_ROUTE.width / 2
};

export const FLOOD_GALLERY = {
  minX: TRACK_ROUTE.minX,
  maxX: TRACK_ROUTE.maxX,
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

export function roofCeilingAt(z, roofPitch, roofOffset, roofGapVertical = 0) {
  const ridgeY = 4 + Math.tan(roofPitch * Math.PI / 180) * 2.3;
  if (z <= roofOffset) {
    const progress = clamp01((z + 4.6) / (roofOffset + 4.6));
    return 4 + (ridgeY - 4) * progress;
  }
  const progress = clamp01((z - roofOffset) / (4.6 - roofOffset));
  return ridgeY + roofGapVertical + (4 - ridgeY) * progress;
}

export function roofPanelSegments(startX, endX, startZ, endZ, shaftPositions = SHAFT_POSITIONS, shaftZ = SHAFT_ROUTE.z, apertureSize = 1.5) {
  if (shaftZ <= startZ || shaftZ >= endZ) return [{ startX, endX, startZ, endZ }];
  const halfAperture = apertureSize / 2;
  const apertureStartZ = Math.max(startZ, shaftZ - halfAperture);
  const apertureEndZ = Math.min(endZ, shaftZ + halfAperture);
  const segments = [
    { startX, endX, startZ, endZ: apertureStartZ },
    { startX, endX, startZ: apertureEndZ, endZ }
  ];
  const sortedShafts = [...shaftPositions].sort((left, right) => left - right);
  let segmentStartX = startX;
  sortedShafts.forEach((shaftX) => {
    const apertureStartX = Math.max(startX, shaftX - halfAperture);
    const apertureEndX = Math.min(endX, shaftX + halfAperture);
    if (apertureStartX > segmentStartX) {
      segments.push({ startX: segmentStartX, endX: apertureStartX, startZ: apertureStartZ, endZ: apertureEndZ });
    }
    segmentStartX = Math.max(segmentStartX, apertureEndX);
  });
  if (segmentStartX < endX) {
    segments.push({ startX: segmentStartX, endX, startZ: apertureStartZ, endZ: apertureEndZ });
  }
  return segments.filter((segment) => segment.endX > segment.startX && segment.endZ > segment.startZ);
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

export function stairSurfaceY(
  x,
  undergroundY = STAIR_ROUTE.baseY,
  landingY = STAIR_ROUTE.landingY,
  surfaceY = STAIR_ROUTE.baseY + STAIR_ROUTE.riseY
) {
  if (x <= STAIR_ROUTE.startX) return undergroundY;
  if (x < STAIR_ROUTE.lowerFlightEndX) {
    const progress = (x - STAIR_ROUTE.startX) / (STAIR_ROUTE.lowerFlightEndX - STAIR_ROUTE.startX);
    return undergroundY + progress * (landingY - undergroundY);
  }
  if (x <= STAIR_ROUTE.upperFlightStartX) return landingY;
  if (x < STAIR_ROUTE.endX) {
    const progress = (x - STAIR_ROUTE.upperFlightStartX) / (STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX);
    return landingY + progress * (surfaceY - landingY);
  }
  return surfaceY;
}

export function constrainStairUnderfillPositionY(
  x,
  y,
  z,
  undergroundY = STAIR_ROUTE.baseY,
  landingY = STAIR_ROUTE.landingY,
  surfaceY = STAIR_ROUTE.baseY + STAIR_ROUTE.riseY
) {
  const insideRun = x >= STAIR_ROUTE.startX && x <= STAIR_ROUTE.endX;
  const insideWidth = Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2;
  return insideRun && insideWidth
    ? Math.max(y, stairSurfaceY(x, undergroundY, landingY, surfaceY) + 0.12)
    : y;
}

export function constrainTurnstilePositionX(x, y, z, velocityX) {
  const insideX = Math.abs(x - TURNSTILE_ROUTE.x) <= TURNSTILE_ROUTE.halfDepth;
  const insideY = y >= STAIR_ROUTE.baseY && y <= STAIR_ROUTE.baseY + TURNSTILE_ROUTE.pedestalHeight;
  const insidePedestal = TURNSTILE_ROUTE.pedestalZ.some((pedestalZ) => (
    Math.abs(z - pedestalZ) <= TURNSTILE_ROUTE.pedestalHalfWidth
  ));
  if (!insideX || !insideY || !insidePedestal) return x;
  return TURNSTILE_ROUTE.x + (velocityX >= 0 ? -TURNSTILE_ROUTE.halfDepth : TURNSTILE_ROUTE.halfDepth);
}

export function constrainPermanentGroundPosition(
  x,
  y,
  z,
  landingY = STAIR_ROUTE.landingY,
  surfaceY = STAIR_ROUTE.baseY + STAIR_ROUTE.riseY,
  tunnelHeight = STAIR_ROUTE.tunnelHeight
) {
  let constrainedY = y;
  let constrainedZ = z;
  const aboveTrack = x >= TRACK_ROUTE.minX && x <= TRACK_ROUTE.maxX
    && Math.abs(z - TRACK_ROUTE.centerZ) <= TRACK_ROUTE.tunnelWidth / 2;
  if (aboveTrack) constrainedY = Math.max(constrainedY, GROUND_LAYOUT.trackFloorY);

  const alongStairs = x >= STAIR_ROUTE.landingStartX && x <= STAIR_ROUTE.endX;
  const belowStairs = alongStairs && Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2;
  if (belowStairs) constrainedY = Math.max(constrainedY, GROUND_LAYOUT.stairFloorY);

  const stairCeilingY = stairSurfaceY(x, STAIR_ROUTE.baseY, landingY, surfaceY) + tunnelHeight;
  const insideOuterSoil = alongStairs && constrainedY >= STAIR_ROUTE.baseY
    && z >= FLUID_BOUNDS.minZ && z < GROUND_LAYOUT.stairOuterZ
    && constrainedY <= stairCeilingY;
  if (insideOuterSoil) constrainedZ = GROUND_LAYOUT.stairOuterZ + 0.02;
  return [x, constrainedY, constrainedZ];
}

export function stairStreetPortalX(
  landingY = STAIR_ROUTE.landingY,
  surfaceY = STAIR_ROUTE.baseY + STAIR_ROUTE.riseY,
  tunnelHeight = STAIR_ROUTE.tunnelHeight
) {
  const run = STAIR_ROUTE.endX - STAIR_ROUTE.upperFlightStartX;
  const rise = surfaceY - landingY;
  const angle = Math.atan2(rise, run);
  const centerX = (STAIR_ROUTE.upperFlightStartX + STAIR_ROUTE.endX) / 2;
  const centerY = landingY + rise / 2 + tunnelHeight / 2;
  const halfHeight = tunnelHeight / 2;
  const sidewalkBottomY = surfaceY - STREET_LAYOUT.sidewalkThickness / 2;
  const distanceAlongRun = (sidewalkBottomY - centerY - halfHeight * Math.cos(angle)) / Math.sin(angle);
  return centerX + distanceAlongRun * Math.cos(angle) - halfHeight * Math.sin(angle);
}

export function isInsideStairTunnel(x, y, z, margin = 0) {
  const inX = x >= STAIR_ROUTE.landingStartX - margin && x <= STAIR_ROUTE.endX + margin;
  const inZ = Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2 + margin;
  const floorY = stairSurfaceY(x);
  return inX && inZ && y >= floorY - margin && y <= floorY + STAIR_ROUTE.tunnelHeight + margin;
}

export function isInsideStreetVolume(x, y, z) {
  return x >= STREET_VOLUME.minX && x <= STREET_VOLUME.maxX
    && y >= STREET_VOLUME.minY && y <= STREET_VOLUME.maxY
    && z >= STREET_VOLUME.minZ && z <= STREET_VOLUME.maxZ;
}

export function isSurfaceOpening(x, z) {
  const shaftOpening = SHAFT_POSITIONS.some((shaftX) => (
    Math.abs(x - shaftX) <= 0.75 && Math.abs(z - SHAFT_ROUTE.z) <= 0.75
  ));
  const stairOpening = x >= STAIR_ROUTE.endX - 1.4
    && x <= STAIR_ROUTE.endX + STAIR_ROUTE.width / 2
    && Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2;
  return shaftOpening || stairOpening;
}

export function constrainSurfacePositionY(x, y, z, isSurfaceParticle) {
  if (!isSurfaceParticle || isSurfaceOpening(x, z)) return y;
  return Math.max(y, STREET_LAYOUT.surfaceParticleFloorY);
}

export function wrapSurfacePositionZ(z) {
  const span = FLUID_BOUNDS.maxZ - FLUID_BOUNDS.minZ;
  return ((z - FLUID_BOUNDS.minZ) % span + span) % span + FLUID_BOUNDS.minZ;
}

export function minimumImageSurfaceDelta(delta) {
  const span = FLUID_BOUNDS.maxZ - FLUID_BOUNDS.minZ;
  return delta - span * Math.floor(delta / span + 0.5);
}

export function surfacePressureAccelerations(zPositions, radius, restDensity, stiffness) {
  const kernelScale = 8 / (Math.PI * radius ** 3);
  return zPositions.map((position, particleIndex) => {
    const neighbors = [];
    let density = 0;
    zPositions.forEach((neighborPosition, neighborIndex) => {
      if (neighborIndex === particleIndex) return;
      const offset = minimumImageSurfaceDelta(position - neighborPosition);
      const distance = Math.abs(offset);
      if (distance <= 0.0001 || distance >= radius) return;
      const kernelPosition = distance / radius;
      const kernelWeight = kernelPosition <= 0.5
        ? kernelScale * (6 * (kernelPosition ** 3 - kernelPosition ** 2) + 1)
        : kernelScale * 2 * (1 - kernelPosition) ** 3;
      density += kernelWeight;
      neighbors.push({ offset, kernelPosition });
    });
    const pressure = Math.max(0, stiffness * (density - restDensity));
    return neighbors.reduce((force, neighbor) => (
      force + Math.sign(neighbor.offset) * pressure * (1 - neighbor.kernelPosition)
    ), 0);
  });
}

export function trainThermalSource(position, isSurfaceParticle, trainX, acActive, brakesActive) {
  if (isSurfaceParticle) return 0;
  const [x, y, z] = position;
  let heatRate = 0;
  if (acActive && Math.abs(x - trainX) < 5 && y > 1 && z > 0.5) heatRate += 0.45;
  if (brakesActive && Math.abs(x - trainX) < 8 && y < -2 && Math.abs(z - 2.5) < 1) heatRate += 0.6;
  return heatRate;
}

function passengerHeatInfluence(position) {
  return PASSENGER_POSITIONS.reduce((maximumInfluence, passenger) => {
    const horizontalDistance = Math.hypot(position[0] - passenger.x, position[2] - passenger.z);
    const verticalDistance = Math.abs(position[1] - passenger.y);
    const influence = (1 - smoothstep(0.25, 1.6, horizontalDistance))
      * (1 - smoothstep(0.4, 1.9, verticalDistance));
    return Math.max(maximumInfluence, influence);
  }, 0);
}

export function passengerHeatResponse(position, passengerHeat = 1) {
  const influence = passengerHeatInfluence(position);
  return {
    y: passengerHeat * influence * 0.8,
    thermal: passengerHeat * influence * 0.18
  };
}

export function roadThermalResponse(position, settings) {
  const streetY = verticalLayoutFromSurfaceY(settings.stairSurfaceOpeningHeight).streetY;
  const [x, y, z] = position;
  const roadBand = step(streetY, y)
    * (1 - smoothstep(0, 2.4, y - streetY))
    * step(STREET_VOLUME.minX, x)
    * step(x, STREET_VOLUME.maxX)
    * step(STREET_LAYOUT.sidewalkRoadEdgeZ, z)
    * step(z, STREET_VOLUME.maxZ);
  const thermalDelta = (settings.roadSurfaceTemperature - settings.ambientAirTemperature) / 40;
  return {
    y: Math.max(-1, Math.min(1, thermalDelta)) * roadBand * 1.15,
    thermal: thermalDelta * roadBand * 0.35
  };
}

export function ambientAirResponse(position, settings) {
  const streetY = verticalLayoutFromSurfaceY(settings.stairSurfaceOpeningHeight).streetY;
  const ambientBand = smoothstep(streetY + 0.8, streetY + 2.4, position[1]);
  const ambientHeat = clamp01((settings.ambientAirTemperature - 60) / 50);
  return {
    thermal: (ambientHeat - 0.42) * ambientBand * 0.12,
    y: (ambientHeat - 0.42) * ambientBand * 0.1
  };
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

function step(edge, value) {
  return value < edge ? 0 : 1;
}

function band(minimum, maximum, value) {
  return smoothstep(minimum, minimum + 0.4, value) * (1 - smoothstep(maximum - 0.4, maximum, value));
}

export function clerestoryOpeningStrength(z, { roofOffset, roofGapHorizontal, roofGapVertical, clerestoryOpen, clerestoryWindows = true }) {
  if (!clerestoryWindows) return 0;
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
  const [x, y, z, particleMixFraction] = position;
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
  if (control === 'passengerHeat') {
    const passengerResponse = passengerHeatResponse(position, settings.passengerHeat);
    response.y = passengerResponse.y;
    response.cooling = -passengerResponse.thermal;
  }
  if (control === 'roadTemperature') {
    const roadResponse = roadThermalResponse(position, settings);
    response.y = roadResponse.y;
    response.cooling = -roadResponse.thermal;
  }
  if (control === 'ambientAirTemperature') {
    const ambientResponse = ambientAirResponse(position, settings);
    response.y = ambientResponse.y;
    response.cooling = -ambientResponse.thermal;
  }
  if (control === 'surfaceCrosswind') {
    const surfaceWindBand = smoothstep(STREET_VOLUME.minY - 0.5, STREET_VOLUME.minY + 0.5, y);
    const surfaceMixFraction = particleMixFraction ?? clamp01(
      (x - FLUID_BOUNDS.minX) / (FLUID_BOUNDS.maxX - FLUID_BOUNDS.minX)
    );
    const surfaceMixTargetY = STREET_LAYOUT.surfaceParticleFloorY + SURFACE_MIXING.minimumHeight
      + surfaceMixFraction * (
        FLUID_BOUNDS.maxY - SURFACE_MIXING.ceilingMargin
        - STREET_LAYOUT.surfaceParticleFloorY - SURFACE_MIXING.minimumHeight
      );
    const shaftTargetX = SHAFT_POSITIONS.reduce((nearest, shaftX) => (
      Math.abs(x - shaftX) < Math.abs(x - nearest) ? shaftX : nearest
    ), SHAFT_POSITIONS[0]);
    const shaftControl = shaftControlAtX(x, settings.shaftControls);
    const shaftOutlet = (1 - smoothstep(0.55, 1.4, Math.abs(x - shaftTargetX)))
      * (1 - smoothstep(0.45, 1.25, Math.abs(z - SHAFT_ROUTE.z)))
      * band(SHAFT_ROUTE.outletY, STREET_VOLUME.maxY, y);
    const floorReturn = surfaceWindBand
      * (1 - smoothstep(STREET_LAYOUT.surfaceParticleFloorY, STREET_LAYOUT.surfaceParticleFloorY + 0.9, y));
    const ceilingReturn = smoothstep(FLUID_BOUNDS.maxY - 1.5, FLUID_BOUNDS.maxY - 0.2, y);
    response.y = floorReturn * 0.9
      + Math.abs(settings.surfaceCrosswind) * (
        shaftOutlet * shaftControl * 1.8 + (surfaceMixTargetY - y) * SURFACE_MIXING.strength * surfaceWindBand
      )
      - ceilingReturn * 4;
    response.z = settings.surfaceCrosswind * surfaceWindBand * 1.2 * (1 - shaftOutlet * shaftControl * 0.82);
  }
  if (control === 'ceilingFlow') {
    response.x = settings.ceilingFans * ceilingBand * 1.4;
  }
  if (control === 'passiveGrooves') {
    response.x = settings.grooves * ceilingBand * 0.5;
    response.z = -Math.sign(z - settings.roofOffset) * settings.grooves * smoothstep(3.2, 4, y) * 0.22;
  }
  if (control === 'roofUnderside') {
    const roofY = roofCeilingAt(z, settings.roofPitch, settings.roofOffset, settings.roofGapVertical);
    const distanceBelowRoof = roofY - y;
    const roofBand = 1 - smoothstep(0.15, 1.35, Math.abs(distanceBelowRoof - 0.25));
    const ridgeDirection = -Math.sign(z - settings.roofOffset);
    const roofSlope = Math.abs(Math.tan(settings.roofPitch * Math.PI / 180));
    response.y = (distanceBelowRoof - 0.25) * roofBand * 3.2
      + roofSlope * settings.grooves * roofBand * 0.9;
    response.z = ridgeDirection * settings.grooves * roofBand * 1.4;
  }
  if (control === 'shaftStack') {
    const shaftTargetX = SHAFT_POSITIONS.reduce((nearest, shaftX) => (
      Math.abs(x - shaftX) < Math.abs(x - nearest) ? shaftX : nearest
    ), SHAFT_POSITIONS[0]);
    const shaftControl = shaftControlAtX(x, settings.shaftControls);
    const shaftColumn = (1 - smoothstep(0.9, 1.8, Math.abs(x - shaftTargetX)))
        * (1 - smoothstep(0.0, 0.9, Math.abs(z - SHAFT_ROUTE.z)))
      * smoothstep(0.4, SHAFT_ROUTE.throatY, y)
      * (1 - smoothstep(STREET_VOLUME.minY, STREET_VOLUME.minY + 0.6, y));
    const poweredVelocity = settings.shaftFans ? settings.shaftFanVelocity : 0;
    const crosswindDraw = Math.abs(settings.surfaceCrosswind || 0) * 0.3;
    response.x = (shaftTargetX - x) * shaftColumn * shaftControl * 3.6;
    response.y = shaftColumn * shaftControl * (settings.stackEffect * 3.4 + poweredVelocity + crosswindDraw);
    response.z = (SHAFT_ROUTE.z - z) * shaftColumn * shaftControl * 4.4;
    response.cooling = shaftColumn * shaftControl * settings.stackEffect * 0.35;
  }
  if (control === 'sceneOcclusion') {
    if (!settings.windOcclusion) return response;
    const nearestColumnX = [-8, -4, 0, 4].reduce((nearest, columnX) => (
      Math.abs(x - columnX) < Math.abs(x - nearest) ? columnX : nearest
    ), -8);
    const columnDistance = Math.hypot(x - nearestColumnX, z + 0.6);
    const columnBand = (1 - smoothstep(0.25, 1.1, columnDistance)) * band(-3, 4, y);
    if (columnBand > 0) {
      const inverseDistance = 1 / Math.max(columnDistance, 0.05);
      response.x += (x - nearestColumnX) * inverseDistance * columnBand * 2.4;
      response.z += (z + 0.6) * inverseDistance * columnBand * 2.4;
    }
    const platformBand = band(-4, -2.45, y) * (1 - smoothstep(0.3, 1.2, Math.abs(z + 0.6)));
    response.z += platformBand * 1.6;
  }
  if (control === 'stairRoute') {
    const routeProgress = stairProgress(x);
    const floorY = stairSurfaceY(x);
    const inRoute = x >= STAIR_ROUTE.landingStartX && x <= STAIR_ROUTE.endX
      && Math.abs(z - STAIR_ROUTE.z) <= STAIR_ROUTE.width / 2
      && y >= floorY && y <= floorY + STAIR_ROUTE.tunnelHeight;
    if (inRoute) {
      const crosswindDraw = Math.abs(settings.surfaceCrosswind || 0) * (0.12 + routeProgress * 0.28);
      response.x = 0.45 + routeProgress * settings.stackEffect;
      response.y = 0.28 + settings.stackEffect * (0.5 + routeProgress * 2.8) + crosswindDraw;
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
