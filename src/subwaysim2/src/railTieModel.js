export const RAIL_TIE_FORMULATIONS = [
  { value: 'creosote-oak', label: 'Creosote-treated oak', modulusGPa: 12, tanDelta: 0.06, abrasion: 'Low', serviceLifeYears: 20, referenceCostPerTie: 75, endOfLifeCreditPerTie: -35, circularity: 0, confidence: 'reference estimate' },
  { value: 'prestressed-opc', label: 'Prestressed OPC concrete', modulusGPa: 45, tanDelta: 0.008, abrasion: 'High', serviceLifeYears: 40, referenceCostPerTie: 125, endOfLifeCreditPerTie: 0, circularity: 0.2, confidence: 'reference estimate' },
  { value: 'glass-lignin', label: 'E-glass / lignin vitrimer', modulusGPa: 14, tanDelta: 0.04, abrasion: 'High', serviceLifeYears: 50, referenceCostPerTie: 345, endOfLifeCreditPerTie: 60, circularity: 0.85, confidence: 'concept estimate' },
  { value: 'lvcf-carbon', label: 'LVCF / carbon fiber', modulusGPa: 40, tanDelta: 0.035, abrasion: 'High', serviceLifeYears: 60, referenceCostPerTie: 1315, endOfLifeCreditPerTie: 110, circularity: 0.75, confidence: 'concept estimate' },
  { value: 'lvh-hemp', label: 'LVH / hemp', modulusGPa: 9.5, tanDelta: 0.08, abrasion: 'Medium-high', serviceLifeYears: 35, referenceCostPerTie: 307, endOfLifeCreditPerTie: 45, circularity: 0.8, confidence: 'concept estimate' },
  { value: 'hybrid-lvh-lvcf', label: 'Hybrid LVH core / LVCF skin', modulusGPa: 15, tanDelta: 0.05, abrasion: 'High', serviceLifeYears: 60, referenceCostPerTie: 464.33, endOfLifeCreditPerTie: 110, circularity: 0.92, confidence: 'concept estimate' },
  { value: 'recycled-polyolefin', label: 'Recycled polyolefin / glass or basalt', modulusGPa: 8, tanDelta: 0.09, abrasion: 'Textured shell required', serviceLifeYears: null, referenceCostPerTie: null, endOfLifeCreditPerTie: null, circularity: null, confidence: 'properties not costed' },
  { value: 'basalt-geopolymer', label: 'Basalt geopolymer / rubber', modulusGPa: 37.5, tanDelta: 0.04, abrasion: 'High', serviceLifeYears: null, referenceCostPerTie: null, endOfLifeCreditPerTie: null, circularity: null, confidence: 'properties not costed' }
];

export const RAIL_HARVEST_MODES = [
  { value: 'none', label: 'No harvester' },
  { value: 'piezo', label: 'Piezoelectric' },
  { value: 'teng', label: 'TENG / LIG' },
  { value: 'hybrid', label: 'Piezo + TENG' }
];

export const RAIL_TIE_SCREENING_LIMITS = Object.freeze({
  railToRailResistanceOhm: 2,
  grapheneLoadingWtPercent: 0.25
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getRailTieFormulation(value) {
  return RAIL_TIE_FORMULATIONS.find((formulation) => formulation.value === value) ?? RAIL_TIE_FORMULATIONS[5];
}

export function estimateRailTieResponse({
  material = 'hybrid-lvh-lvcf',
  carbonSkinWtPercent = 15,
  loadKN = 30,
  supportSpanM = 1.2,
  widthM = 0.178,
  heightM = 0.229,
  bearingAreaM2 = 0.02,
  grapheneLoadingWtPercent = 0,
  percolationThresholdWtPercent = RAIL_TIE_SCREENING_LIMITS.grapheneLoadingWtPercent,
  measuredRailToRailResistanceOhm = 500000,
  dielectricBarrierIntact = true,
  bucklingLoadRatio = 1.15
} = {}) {
  const formulation = getRailTieFormulation(material);
  const baseModulusGPa = formulation.value === 'hybrid-lvh-lvcf'
    ? 9.5 + (40 - 9.5) * clamp(carbonSkinWtPercent / 100, 0, 1)
    : formulation.modulusGPa;
  const threshold = Math.max(0.001, percolationThresholdWtPercent);
  const normalizedLoading = clamp(grapheneLoadingWtPercent / threshold, 0, 1);
  const grapheneModulusGain = 0.3 * normalizedLoading;
  const effectiveModulusGPa = baseModulusGPa * (1 + grapheneModulusGain);
  const secondMomentM4 = widthM * heightM ** 3 / 12;
  const forceN = loadKN * 1000;
  const modulusPa = effectiveModulusGPa * 1e9;
  const deflectionMm = forceN * supportSpanM ** 3 / (48 * modulusPa * secondMomentM4) * 1000;
  const bendingStressMPa = forceN * supportSpanM * heightM / (8 * secondMomentM4) / 1e6;
  const railSeatPressureMPa = forceN / bearingAreaM2 / 1e6;
  const graphenePercolationRisk = grapheneLoadingWtPercent >= threshold;
  const resistancePassesScreen = measuredRailToRailResistanceOhm > RAIL_TIE_SCREENING_LIMITS.railToRailResistanceOhm;
  const isolationScreenPasses = dielectricBarrierIntact && resistancePassesScreen && !graphenePercolationRisk;
  const snapThresholdKN = 80 * Math.max(0, bucklingLoadRatio - 1) ** 1.5;

  return {
    material: formulation.value,
    formulation,
    effectiveModulusGPa,
    grapheneModulusGainPercent: grapheneModulusGain * 100,
    deflectionMm,
    bendingStressMPa,
    railSeatPressureMPa,
    dampingLossFactor: formulation.tanDelta,
    graphenePercolationRisk,
    resistancePassesScreen,
    isolationScreenPasses,
    snapThresholdKN,
    status: 'screening estimate; not a design approval'
  };
}

export function calculateRailHarvestYield({
  harvestingMode = 'hybrid',
  piezoJoulesPerAxleTie = 2,
  tengJoulesPerAxleTie = 0.5,
  axlesPerTrain = 424,
  trainsPerDay = 40,
  tiesPerMile = 3250,
  transferEfficiency = 0,
  electricityPricePerKWh = 0.1,
  batteryVolumeL = 10,
  batteryEnergyDensityWhPerL = 500
} = {}) {
  const usesPiezo = harvestingMode === 'piezo' || harvestingMode === 'hybrid';
  const usesTeng = harvestingMode === 'teng' || harvestingMode === 'hybrid';
  const energyPerAxleTieJ = (usesPiezo ? piezoJoulesPerAxleTie : 0) + (usesTeng ? tengJoulesPerAxleTie : 0);
  const wattHoursPerTrainTie = energyPerAxleTieJ * axlesPerTrain / 3600;
  const grossKWhPerDayMile = wattHoursPerTrainTie * tiesPerMile * trainsPerDay / 1000;
  const boundedTransferEfficiency = clamp(transferEfficiency, 0, 1);
  const netKWhPerDayMile = grossKWhPerDayMile * boundedTransferEfficiency;
  const batteryCapacityKWhPerTie = batteryVolumeL * batteryEnergyDensityWhPerL / 1000;
  const storageMWhPerMile = batteryCapacityKWhPerTie * tiesPerMile / 1000;

  return {
    energyPerAxleTieJ,
    wattHoursPerTrainTie,
    grossKWhPerDayMile,
    netKWhPerDayMile,
    averageNetPowerWPerMile: netKWhPerDayMile * 1000 / 24,
    annualHarvestValuePerMile: netKWhPerDayMile * 365 * electricityPricePerKWh,
    batteryCapacityKWhPerTie,
    storageMWhPerMile,
    trainPassesToFillBattery: wattHoursPerTrainTie > 0 ? batteryCapacityKWhPerTie * 1000 / wattHoursPerTrainTie : null,
    status: 'scenario estimate; energy, storage, and transfer inputs require measurement'
  };
}

export function calculateRailTieEconomics({
  tiesPerMile = 3250,
  structuralCostPerTie = 464.33,
  batteryCostPerTie = 250,
  batteryCapacityKWhPerTie = 5,
  harvesterCostPerTie = 45,
  wirelessTransferCostPerTie = 75,
  telemetryCostPerTie = 25,
  integrationCostPerTie = 60,
  woodCostPerTie = 75,
  woodInstallCostPerTie = 35,
  woodDisposalCostPerTie = 35,
  woodServiceLifeYears = 20,
  grantShare = 0,
  productionCreditPerKWh = 0,
  creditTransferRate = 0.9,
  gridValuePerMWhYear = 0,
  storageMWhPerMile = 0,
  annualMaintenanceSavings = 0,
  annualHarvestValue = 0,
  years = 20
} = {}) {
  const unitCost = structuralCostPerTie + batteryCostPerTie + harvesterCostPerTie + wirelessTransferCostPerTie + telemetryCostPerTie + integrationCostPerTie;
  const projectCost = unitCost * tiesPerMile;
  const woodBaseline = woodCostPerTie * tiesPerMile;
  const creditedBatteryCapacity = productionCreditPerKWh * batteryCapacityKWhPerTie * tiesPerMile * clamp(creditTransferRate, 0, 1);
  const annualGridValue = storageMWhPerMile * gridValuePerMWhYear;
  const annualWoodRotationValue = (woodCostPerTie + woodInstallCostPerTie + woodDisposalCostPerTie) * tiesPerMile / Math.max(1, woodServiceLifeYears);
  const annualBenefit = annualGridValue + annualMaintenanceSavings + annualHarvestValue + annualWoodRotationValue;
  const requestedGrantShare = clamp(grantShare, 0, 0.8);
  const initialPremium = projectCost - woodBaseline;
  const configuredPremium = Math.max(0, projectCost * (1 - requestedGrantShare) - creditedBatteryCapacity - woodBaseline);
  const maximumGrantPremium = Math.max(0, projectCost * 0.2 - creditedBatteryCapacity - woodBaseline);
  const gridDownsideAnnualBenefit = annualBenefit - annualGridValue * 0.3;
  const payback = (premium, benefit) => benefit > 0 ? premium / benefit : null;
  const projectionYears = Math.max(1, Math.floor(years));
  const cashflow = Array.from({ length: projectionYears + 1 }, (_, year) => ({
    year,
    reference: -initialPremium + annualBenefit * year,
    configured: -configuredPremium + annualBenefit * year,
    gridDownside: -configuredPremium + gridDownsideAnnualBenefit * year,
    maximumGrant: -maximumGrantPremium + annualBenefit * year
  }));

  return {
    unitCost,
    projectCost,
    woodBaseline,
    creditedBatteryCapacity,
    annualGridValue,
    annualWoodRotationValue,
    annualBenefit,
    initialPremium,
    configuredPremium,
    maximumGrantPremium,
    configuredPaybackYears: payback(configuredPremium, annualBenefit),
    referencePaybackYears: payback(initialPremium, annualBenefit),
    gridDownsidePaybackYears: payback(configuredPremium, gridDownsideAnnualBenefit),
    maximumGrantPaybackYears: payback(maximumGrantPremium, annualBenefit),
    cashflow,
    status: 'illustrative cash-flow scenario; excludes tax, financing, degradation, and verified market contracts'
  };
}