import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRailHarvestYield, calculateRailTieEconomics, estimateRailTieResponse, RAIL_TIE_FORMULATIONS } from './railTieModel.js';

test('formulation library exposes distinct reference and concept materials', () => {
  assert.equal(RAIL_TIE_FORMULATIONS.length, 8);
  assert.ok(RAIL_TIE_FORMULATIONS.some((material) => material.value === 'hybrid-lvh-lvcf'));
  assert.equal(RAIL_TIE_FORMULATIONS.find((material) => material.value === 'recycled-polyolefin').referenceCostPerTie, null);
});

test('beam screening response reduces deflection when modulus increases', () => {
  const oak = estimateRailTieResponse({ material: 'creosote-oak', grapheneLoadingWtPercent: 0 });
  const carbon = estimateRailTieResponse({ material: 'lvcf-carbon', grapheneLoadingWtPercent: 0 });
  assert.ok(carbon.deflectionMm < oak.deflectionMm);
  assert.ok(Math.abs(carbon.bendingStressMPa - oak.bendingStressMPa) < 1e-9);
  assert.equal(oak.status, 'screening estimate; not a design approval');
});

test('hybrid carbon skin fraction changes the screening modulus', () => {
  const hempCore = estimateRailTieResponse({ material: 'hybrid-lvh-lvcf', carbonSkinWtPercent: 0 });
  const hybrid = estimateRailTieResponse({ material: 'hybrid-lvh-lvcf', carbonSkinWtPercent: 15 });
  assert.ok(hybrid.effectiveModulusGPa > hempCore.effectiveModulusGPa);
});

test('graphene screening flags the assumed percolation boundary without inventing resistance', () => {
  const below = estimateRailTieResponse({ material: 'hybrid-lvh-lvcf', grapheneLoadingWtPercent: 0.249, percolationThresholdWtPercent: 0.25, measuredRailToRailResistanceOhm: 500000 });
  const atThreshold = estimateRailTieResponse({ material: 'hybrid-lvh-lvcf', grapheneLoadingWtPercent: 0.25, percolationThresholdWtPercent: 0.25, measuredRailToRailResistanceOhm: 500000 });
  const failedBarrier = estimateRailTieResponse({ material: 'hybrid-lvh-lvcf', grapheneLoadingWtPercent: 0, dielectricBarrierIntact: false });
  assert.equal(below.graphenePercolationRisk, false);
  assert.equal(below.isolationScreenPasses, true);
  assert.equal(atThreshold.graphenePercolationRisk, true);
  assert.equal(atThreshold.isolationScreenPasses, false);
  assert.equal(failedBarrier.isolationScreenPasses, false);
  assert.equal(atThreshold.resistancePassesScreen, true);
});

test('hybrid harvester reproduces transcript scenario inputs as arithmetic only', () => {
  const harvest = calculateRailHarvestYield({
    harvestingMode: 'hybrid',
    piezoJoulesPerAxleTie: 2,
    tengJoulesPerAxleTie: 0.5,
    axlesPerTrain: 424,
    trainsPerDay: 40,
    tiesPerMile: 3250
  });
  assert.equal(harvest.energyPerAxleTieJ, 2.5);
  assert.ok(Math.abs(harvest.grossKWhPerDayMile - 38.2777777778) < 1e-8);
  assert.equal(harvest.netKWhPerDayMile, 0);
});

test('battery storage and train-pass count follow entered density assumptions', () => {
  const harvest = calculateRailHarvestYield({
    harvestingMode: 'hybrid',
    batteryVolumeL: 10,
    batteryEnergyDensityWhPerL: 500,
    trainsPerDay: 40,
    axlesPerTrain: 424,
    tiesPerMile: 3250
  });
  assert.equal(harvest.batteryCapacityKWhPerTie, 5);
  assert.equal(harvest.storageMWhPerMile, 16.25);
  assert.ok(harvest.trainPassesToFillBattery > 1300);
});

test('cash-flow scenarios respond to grants, eligible production credits, and VPP assumptions', () => {
  const base = calculateRailTieEconomics({ storageMWhPerMile: 16.25, gridValuePerMWhYear: 0 });
  const supported = calculateRailTieEconomics({
    storageMWhPerMile: 16.25,
    gridValuePerMWhYear: 40000,
    grantShare: 0.5,
    productionCreditPerKWh: 45,
    creditTransferRate: 0.9
  });
  assert.ok(supported.configuredPremium < base.configuredPremium);
  assert.ok(supported.annualGridValue > 0);
  assert.ok(supported.configuredPaybackYears < base.configuredPaybackYears);
  assert.equal(base.annualWoodRotationValue, 23562.5);
  assert.equal(base.status, 'illustrative cash-flow scenario; excludes tax, financing, degradation, and verified market contracts');
});