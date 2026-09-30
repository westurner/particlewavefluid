export const THERMAL_FLUIDS = {
  water: {
    label: 'Water', density: 997, specificHeat: 4182, viscosity: 0.00089, conductivity: 0.6,
    uncertainty: 0.02, status: 'reference', temperatureRangeC: [20, 30],
    citation: 'IAPWS, Revised Supplementary Release on Properties of Liquid Water at 0.1 MPa (2015).',
    source: 'Representative liquid-water properties near 25 C; verify against IAPWS data for design.'
  },
  glycol30: {
    label: '30% propylene glycol', density: 1025, specificHeat: 3850, viscosity: 0.0025, conductivity: 0.45,
    uncertainty: 0.08, status: 'reference', temperatureRangeC: [20, 30],
    citation: 'ASHRAE Handbook—Fundamentals, chapter on secondary coolants; representative 30% propylene-glycol solution.',
    source: 'Representative aqueous propylene-glycol mixture; supplier curve required for design temperature.'
  },
  user: {
    label: 'User-defined fluid', density: 950, specificHeat: 2400, viscosity: 0.004, conductivity: 0.2,
    uncertainty: 0.15, status: 'user', temperatureRangeC: null, citation: null,
    source: 'User-supplied assumptions without independent validation.'
  },
  hbnFarnesane: {
    label: 'h-BN farnesane hypothesis', density: 830, specificHeat: 2100, viscosity: 0.0035, conductivity: 0.32,
    uncertainty: 0.35, status: 'hypothesis', temperatureRangeC: null, citation: null,
    source: 'Exploratory values from the attached agent session; laboratory property curves are required.'
  }
};

export const THERMAL_FLUID_OPTIONS = Object.entries(THERMAL_FLUIDS).map(([value, fluid]) => ({ value, label: fluid.label }));

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizeThermalScenario(value = {}) {
  const fluidId = THERMAL_FLUIDS[value.fluidId] ? value.fluidId : 'water';
  const base = THERMAL_FLUIDS[fluidId];
  return {
    fluidId,
    itLoadMW: clamp(finiteOr(value.itLoadMW, 1), 0.01, 100),
    temperatureRiseC: clamp(finiteOr(value.temperatureRiseC, 10), 1, 40),
    pipeLengthM: clamp(finiteOr(value.pipeLengthM, 120), 1, 5000),
    pipeDiameterM: clamp(finiteOr(value.pipeDiameterM, 0.15), 0.02, 2),
    roughnessM: clamp(finiteOr(value.roughnessM, 0.000045), 1e-7, 0.01),
    pumpEfficiency: clamp(finiteOr(value.pumpEfficiency, 0.72), 0.1, 1),
    chillerCop: clamp(finiteOr(value.chillerCop, 5.5), 1, 15),
    facilityBasePue: clamp(finiteOr(value.facilityBasePue, 1.08), 1, 2),
    ambientC: clamp(finiteOr(value.ambientC, 20), -40, 60),
    supplyC: clamp(finiteOr(value.supplyC, 30), 5, 70),
    economizerApproachC: clamp(finiteOr(value.economizerApproachC, 5), 1, 20),
    economizerHoursFraction: clamp(finiteOr(value.economizerHoursFraction, 0.55), 0, 1),
    density: clamp(finiteOr(value.density, base.density), 100, 3000),
    specificHeat: clamp(finiteOr(value.specificHeat, base.specificHeat), 100, 10000),
    viscosity: clamp(finiteOr(value.viscosity, base.viscosity), 1e-5, 1),
    conductivity: clamp(finiteOr(value.conductivity, base.conductivity), 0.01, 20),
    uncertainty: clamp(finiteOr(value.uncertainty, base.uncertainty), 0, 1)
  };
}

function darcyFrictionFactor(reynolds, relativeRoughness) {
  if (reynolds <= 0) return 0;
  if (reynolds < 2300) return 64 / reynolds;
  return 0.25 / Math.log10(relativeRoughness / 3.7 + 5.74 / reynolds ** 0.9) ** 2;
}

export function calculateThermalLoop(input = {}) {
  const scenario = sanitizeThermalScenario(input);
  const thermalLoadW = scenario.itLoadMW * 1e6;
  const massFlowKgS = thermalLoadW / (scenario.specificHeat * scenario.temperatureRiseC);
  const volumeFlowM3S = massFlowKgS / scenario.density;
  const pipeAreaM2 = Math.PI * scenario.pipeDiameterM ** 2 / 4;
  const velocityMS = volumeFlowM3S / pipeAreaM2;
  const reynolds = scenario.density * velocityMS * scenario.pipeDiameterM / scenario.viscosity;
  const frictionFactor = darcyFrictionFactor(reynolds, scenario.roughnessM / scenario.pipeDiameterM);
  const pressureDropPa = frictionFactor * scenario.pipeLengthM / scenario.pipeDiameterM
    * scenario.density * velocityMS ** 2 / 2;
  const pumpPowerW = pressureDropPa * volumeFlowM3S / scenario.pumpEfficiency;
  const economizerAvailable = scenario.ambientC + scenario.economizerApproachC <= scenario.supplyC;
  const freeCoolingFraction = economizerAvailable ? scenario.economizerHoursFraction : 0;
  const annualChillerFraction = 1 - freeCoolingFraction;
  const chillerPowerW = thermalLoadW / scenario.chillerCop * annualChillerFraction;
  const coolingPowerW = pumpPowerW + chillerPowerW;
  const facilityBasePowerW = thermalLoadW * (scenario.facilityBasePue - 1);
  const totalFacilityPowerW = thermalLoadW + facilityBasePowerW + coolingPowerW;
  const pue = totalFacilityPowerW / thermalLoadW;
  const heatCapacityRateWPerK = massFlowKgS * scenario.specificHeat;
  const removedHeatW = heatCapacityRateWPerK * scenario.temperatureRiseC;
  const energyResidualW = removedHeatW - thermalLoadW;
  const uncertaintyPowerW = coolingPowerW * scenario.uncertainty;
  return {
    ...scenario,
    fluid: THERMAL_FLUIDS[scenario.fluidId],
    thermalLoadW,
    massFlowKgS,
    volumeFlowM3S,
    velocityMS,
    reynolds,
    frictionFactor,
    pressureDropPa,
    pumpPowerW,
    chillerPowerW,
    coolingPowerW,
    freeCoolingFraction,
    economizerAvailable,
    pue,
    removedHeatW,
    energyResidualW,
    uncertainty: {
      coolingPowerLowW: Math.max(0, coolingPowerW - uncertaintyPowerW),
      coolingPowerHighW: coolingPowerW + uncertaintyPowerW,
      pueLow: (thermalLoadW + facilityBasePowerW + Math.max(0, coolingPowerW - uncertaintyPowerW)) / thermalLoadW,
      pueHigh: (thermalLoadW + facilityBasePowerW + coolingPowerW + uncertaintyPowerW) / thermalLoadW
    }
  };
}

export function compareThermalFluids(input, firstFluidId, secondFluidId) {
  const firstFluid = THERMAL_FLUIDS[firstFluidId];
  const secondFluid = THERMAL_FLUIDS[secondFluidId];
  if (!firstFluid || !secondFluid) throw new Error('Unknown thermal fluid.');
  const first = calculateThermalLoop({ ...input, fluidId: firstFluidId, ...firstFluid });
  const second = calculateThermalLoop({ ...input, fluidId: secondFluidId, ...secondFluid });
  return {
    first,
    second,
    coolingPowerDifferenceW: second.coolingPowerW - first.coolingPowerW,
    pueDifference: second.pue - first.pue,
    pumpPowerRatio: second.pumpPowerW / Math.max(first.pumpPowerW, 1e-12)
  };
}