import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBatteryOperatingPoint,
  calculateCoilgunStage,
  calculateElectromagneticMassDriver,
  calculateEdtTug,
  calculateHalbachAlignment,
  calculateHalbachQED,
  calculatePayloadEnergy,
  calculateRecoilHarvest,
  calculateSolarHarvest,
  calculateSpaceEnergyBudget,
  calculateSailRadiationPressure,
  calculateVortexBeamIntensity,
  calculateRotatingTracerAngle,
  createHelixNodes,
  evaluateSpaceTieOperator,
  sanitizeSpaceTieSettings,
  SPACE_TIE_DEFAULTS,
  SPACE_TIE_WIDGETS
} from './spaceTieModel.js';

test('space-tie workspace catalog covers every GenerateWidget workspace', () => {
  assert.equal(SPACE_TIE_WIDGETS.length, 14);
  assert.equal(new Set(SPACE_TIE_WIDGETS.map(({ value }) => value)).size, 14);
});

test('every workspace has a unique presentation and valid mode-specific parameters', () => {
  assert.equal(new Set(SPACE_TIE_WIDGETS.map(({ presentation }) => presentation)).size, 14);
  for (const workspace of SPACE_TIE_WIDGETS) {
    assert.ok(workspace.description.length > 0, `${workspace.value} needs a description`);
    assert.ok(workspace.parameters.length > 0, `${workspace.value} needs parameters`);
    assert.equal(new Set(workspace.parameters.map(({ key }) => key)).size, workspace.parameters.length);
    for (const parameter of workspace.parameters) {
      assert.ok(parameter.key in SPACE_TIE_DEFAULTS, `${workspace.value}.${parameter.key} needs a default`);
      if (parameter.type === 'select') assert.ok(parameter.options.length > 0, `${workspace.value}.${parameter.key} needs options`);
      else assert.ok(parameter.min <= parameter.max && parameter.step > 0, `${workspace.value}.${parameter.key} needs a valid range`);
    }
  }
});

test('electromagnetic mass driver predicts bounded Earth and lunar launch envelopes', () => {
  const earth = calculateElectromagneticMassDriver({ ...SPACE_TIE_DEFAULTS, massDriverLocation: 'earth' });
  const lunar = calculateElectromagneticMassDriver({ ...SPACE_TIE_DEFAULTS, massDriverLocation: 'moon', massDriverTrackLengthKm: 6 });
  const passenger = calculateElectromagneticMassDriver({ ...SPACE_TIE_DEFAULTS, massDriverPayloadType: 'passenger' });
  const weakField = calculateElectromagneticMassDriver({ ...SPACE_TIE_DEFAULTS, massDriverFluxT: 1 });
  assert.ok(earth.exitVelocityMS >= earth.requiredEscapeVelocityMS);
  assert.equal(earth.withinPayloadTolerance, true);
  assert.ok(lunar.exitVelocityMS >= lunar.requiredEscapeVelocityMS);
  assert.equal(passenger.withinPayloadTolerance, false);
  assert.ok(weakField.exitVelocityMS < earth.exitVelocityMS);
  assert.ok(earth.electricalEnergyRequiredJ <= earth.availableBatteryEnergyJ);
});

test('workspace parameter sanitization bounds logistics and enum inputs', () => {
  const settings = sanitizeSpaceTieSettings({ logisticsCartridgeMassKg: 0, logisticsTugFleetCount: 1000, logisticsTransferDays: 0, multipoleOrder: 99 });
  assert.equal(settings.logisticsCartridgeMassKg, 10);
  assert.equal(settings.logisticsTugFleetCount, 100);
  assert.equal(settings.logisticsTransferDays, 1);
  assert.equal(settings.multipoleOrder, 2);
  const defaults = sanitizeSpaceTieSettings();
  assert.equal(defaults.logisticsCartridgeMassKg, 500);
  assert.equal(defaults.batteryCapacityMWh, 16.25);
  assert.equal(defaults.halbachActiveAreaM2, 0.25);
  assert.equal(defaults.particleCount, 4096);
  assert.equal(defaults.particleAppearance.sizeScale, 1.5);
});

test('helix geometry preserves strand count and spacing controls rendered node population', () => {
  const sparse = createHelixNodes({ destination: 'moon', spacingKm: 50000, strands: 3 });
  const dense = createHelixNodes({ destination: 'moon', spacingKm: 5000, strands: 3 });
  assert.equal(sparse.nodes.length, sparse.renderCountPerStrand * 3);
  assert.equal(sparse.nodes[0].strand, 0);
  assert.equal(sparse.nodes.at(-1).strand, 2);
  assert.ok(dense.nodes.length > sparse.nodes.length);
  assert.ok(dense.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)));
});

test('solar power follows inverse-square irradiance and efficiency', () => {
  const oneAU = calculateSolarHarvest({ distanceAU: 1, areaM2: 10, conversionEfficiency: 0.3 });
  const twoAU = calculateSolarHarvest({ distanceAU: 2, areaM2: 10, conversionEfficiency: 0.3 });
  assert.equal(oneAU.irradianceWm2, 1361);
  assert.equal(twoAU.irradianceWm2, oneAU.irradianceWm2 / 4);
  assert.equal(oneAU.electricalPowerW, 4083);
});

test('radiation pressure, vortex beam, and sail annulus remain bounded', () => {
  const pressure = calculateSailRadiationPressure({ powerW: 3e8, sailAreaM2: 1e5, spacecraftMassKg: 1000 });
  assert.ok(pressure.forceN > 0);
  assert.ok(pressure.accelerationMS2 > 0);
  assert.equal(calculateVortexBeamIntensity({ radiusM: 0, beamWaistM: 10, topologicalCharge: 1 }), 0);
  assert.equal(calculateVortexBeamIntensity({ radiusM: 0, beamWaistM: 10, topologicalCharge: 0 }), 1);
  const annulus = calculateVortexBeamIntensity({ radiusM: 10, beamWaistM: 10, topologicalCharge: 1 });
  assert.ok(annulus > 0 && annulus <= 1);
});

test('rotating field tracers follow speed-scaled time and operator acceleration response', () => {
  assert.equal(calculateRotatingTracerAngle({ baseAngle: 0.4, simulationTime: 2, swirlRate: 0.5, accelerationScale: 0.5 }), 0.9);
  assert.equal(calculateRotatingTracerAngle({ baseAngle: 0.4, simulationTime: 2, swirlRate: 0.5, splatWeight: 0 }), 0.4);
  assert.equal(calculateRotatingTracerAngle({ baseAngle: 0.4, simulationTime: 2, swirlRate: 0.5, splatWeight: 0.5 }), 0.9);
  assert.equal(calculateRotatingTracerAngle({ baseAngle: 0.4, simulationTime: 0, swirlRate: 0.5, accelerationScale: 1 }), 0.4);
});

test('coilgun pulse cannot transfer more energy than its battery input', () => {
  const stage = calculateCoilgunStage({ payloadMassKg: 100, currentVelocityMS: 0, batteryEnergyJ: 1e9, pulseEnergyMJ: 100, pulseEfficiency: 0.8, payloadCoupling: 0.75 });
  assert.equal(stage.availablePulseJ, 100e6);
  assert.ok(Math.abs(stage.payloadEnergyJ - 60e6) < 1e-6);
  assert.equal(stage.energyConserved, true);
  assert.ok(Math.abs(0.5 * 100 * stage.nextVelocityMS ** 2 - stage.payloadEnergyJ) < 1e-6);
  const empty = calculateCoilgunStage({ payloadMassKg: 100, batteryEnergyJ: 0, pulseEnergyMJ: 100 });
  assert.equal(empty.payloadEnergyJ, 0);
  assert.equal(empty.nextVelocityMS, 0);
});

test('battery operating point respects charge level and pulse demand', () => {
  const full = calculateBatteryOperatingPoint({ settings: { ...SPACE_TIE_DEFAULTS, batteryChargePercent: 100 }, pulseCount: 2 });
  const low = calculateBatteryOperatingPoint({ settings: { ...SPACE_TIE_DEFAULTS, batteryChargePercent: 1 }, pulseCount: 2 });
  assert.equal(full.enoughEnergy, true);
  assert.equal(low.enoughEnergy, false);
});

test('recoil harvest remains below available mechanical energy', () => {
  const result = calculateRecoilHarvest({ internalMassKg: 600, hullMassKg: 400, recoilVelocityMS: 5 });
  assert.equal(result.reducedMassKg, 240);
  assert.equal(result.availableEnergyJ, 3000);
  assert.ok(Math.abs(result.piezoEnergyJ - 887.25) < 1e-9);
  assert.equal(result.tengEnergyJ, 135);
  assert.ok(result.harvestedEnergyJ <= result.availableEnergyJ);
});

test('EDT thrust follows Lorentz direction and remains power-budgeted', () => {
  const forward = calculateEdtTug({ currentA: 10, tetherLengthM: 1000, magneticFieldT: 35e-6, angleDeg: 90, solarPowerKW: 100, circuitResistanceOhm: 1 });
  const reverse = calculateEdtTug({ currentA: -10, tetherLengthM: 1000, magneticFieldT: 35e-6, angleDeg: 90, solarPowerKW: 100, circuitResistanceOhm: 1 });
  assert.ok(forward.thrustN > 0);
  assert.equal(reverse.thrustN, -forward.thrustN);
  assert.equal(forward.powerLimited, false);
});

test('Halbach profile has a zero center and weak-field QED shift stays tiny', () => {
  const center = calculateHalbachQED({ radiusM: 0, tunnelRadiusM: 25, edgeFluxT: 1000, multipoleOrder: 2 });
  const edge = calculateHalbachQED({ radiusM: 25, tunnelRadiusM: 25, edgeFluxT: 1000, multipoleOrder: 2 });
  assert.equal(center.fieldT, 0);
  assert.equal(center.deltaNApprox, 0);
  assert.equal(edge.fieldT, 1000);
  assert.ok(edge.deltaNApprox > 0 && edge.deltaNApprox < 1e-12);
  assert.ok(calculateHalbachAlignment({ fieldT: 2, activeAreaM2: 0.25, gapM: 1 }).forceN > 0);
});

test('operator variants reuse bounded DDF, tensor-Gaussian, and positive Grassmannian data', () => {
  const settings = { ...SPACE_TIE_DEFAULTS };
  const classical = evaluateSpaceTieOperator({ operator: 'classical', radiusM: 0, settings });
  const ddf = evaluateSpaceTieOperator({ operator: 'ddf', radiusM: 2, speedMS: 1200, settings });
  const grassmannian = evaluateSpaceTieOperator({ operator: 'grassmannian', radiusM: 2, settings });
  assert.equal(classical.accelerationScale, 1);
  assert.ok(ddf.accelerationScale > 0 && ddf.accelerationScale <= 1);
  assert.ok(ddf.splatWeight >= 0 && ddf.splatWeight <= 1);
  assert.equal(grassmannian.cell.positive, true);
  assert.ok(Math.abs(grassmannian.cell.pluckerResidual) < 1e-9);
  assert.equal(grassmannian.accelerationScale, 1);
  assert.equal(evaluateSpaceTieOperator({ operator: 'grassmannian', radiusM: 2, settings: { ...settings, geometryAccelerationCoupling: 0.2 } }).accelerationScale > 1, true);
});

test('space energy budget does not include speculative fracture gain', () => {
  const low = calculateSpaceEnergyBudget({ ...SPACE_TIE_DEFAULTS, solarDistanceAU: 1 });
  const far = calculateSpaceEnergyBudget({ ...SPACE_TIE_DEFAULTS, solarDistanceAU: 2 });
  assert.equal(far.solar.electricalPowerW, low.solar.electricalPowerW / 4);
  assert.equal(low.status, 'scenario accounting; beam fracture multiplier excluded from power balance');
  const payload = calculatePayloadEnergy({ massKg: 100, velocityKmS: 15, couplingEfficiency: 0.9 });
  assert.ok(payload.inputEnergyJ > payload.kineticEnergyJ);
});

test('space-tie settings clamp unsupported operator, coupling, particle count, and size inputs', () => {
  const settings = sanitizeSpaceTieSettings({ operator: 'not-a-model', geometryAccelerationCoupling: 5, particleCount: 99999, particleAppearance: { sizeScale: 20 } });
  assert.equal(settings.operator, 'classical');
  assert.equal(settings.geometryAccelerationCoupling, 0.25);
  assert.equal(settings.particleCount, 16384);
  assert.equal(settings.particleAppearance.sizeScale, 8);
});
